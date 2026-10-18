import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ErrorEnvelopeSchema, MenuResponseSchema } from '@restaurant/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.module';
import { REDIS, type RedisClient } from '../src/common/redis.module';
import { configureApp } from '../src/configure-app';
import { MenuCache } from '../src/menu/menu.cache';
import { MENU_SEED_ITEMS } from '../src/seed/menu-seed-data';
import { SeedModule, seedMenu } from '../src/seed/seed.module';
import { buildMenuItem } from './fixtures';

describe('GET /api/v1/menu', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let redis: RedisClient;
  let cache: MenuCache;

  /** Fetches the Menu anonymously (no cookie). */
  const getMenu = () => request(app.getHttpServer()).get('/api/v1/menu');

  /** Boots the real app, as production does, without logs. */
  const bootApp = async (): Promise<INestApplication<Server>> => {
    const created = await NestFactory.create<INestApplication<Server>>(
      AppModule,
      { logger: false },
    );
    configureApp(created);
    await created.init();
    return created;
  };

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    redis = app.get<RedisClient>(REDIS);
    cache = app.get(MenuCache);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves the Menu anonymously, grouped by category', async () => {
    const pizza = await buildMenuItem(prisma, {
      name: 'Pizza',
      priceCents: 1200,
    });
    const burger = await buildMenuItem(prisma, { name: 'Burger' });
    const cake = await buildMenuItem(prisma, {
      name: 'Cake',
      category: 'Desserts',
      priceCents: 0,
    });
    const strip = ({ id, name, description, priceCents }: typeof pizza) => ({
      id,
      name,
      description,
      priceCents,
    });

    const res = await getMenu();

    expect(res.status).toBe(200);
    expect(MenuResponseSchema.parse(res.body)).toEqual({
      categories: [
        { name: 'Desserts', items: [strip(cake)] },
        { name: 'Mains', items: [strip(burger), strip(pizza)] },
      ],
    });
  });

  it('on a miss caches the Menu in menu:v1 without TTL', async () => {
    await buildMenuItem(prisma);
    expect(await redis.exists('menu:v1')).toBe(0);

    const res = await getMenu();

    expect(JSON.parse((await redis.get('menu:v1')) ?? 'null')).toEqual(
      res.body,
    );
    expect(await redis.ttl('menu:v1')).toBe(-1);
  });

  it('on a hit serves the cached Menu without reading the DB', async () => {
    await buildMenuItem(prisma);
    const first = await getMenu();
    await prisma.$executeRaw`DELETE FROM "MenuItem"`;

    const second = await getMenu();

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(first.body).not.toEqual({ categories: [] });
  });

  it('returns an empty Menu and does not cache it', async () => {
    const res = await getMenu();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categories: [] });
    expect(await redis.exists('menu:v1')).toBe(0);
  });

  it('shows a newly seeded item after re-seeding a primed cache', async () => {
    await seedMenu(prisma, cache, MENU_SEED_ITEMS);
    await getMenu();
    expect(await redis.exists('menu:v1')).toBe(1);
    const extra = {
      id: 'ffffffff-0000-4000-8000-000000000001',
      category: 'Drinks',
      name: 'Lemonade',
      description: 'Fresh lemons.',
      priceCents: 400,
    };

    await seedMenu(prisma, cache, [...MENU_SEED_ITEMS, extra]);
    const res = await getMenu();

    const items = MenuResponseSchema.parse(res.body).categories.flatMap(
      (c) => c.items,
    );
    expect(items).toHaveLength(MENU_SEED_ITEMS.length + 1);
    expect(items).toContainEqual({
      id: extra.id,
      name: extra.name,
      description: extra.description,
      priceCents: extra.priceCents,
    });
  });

  it('seeds idempotently: updates existing rows, deletes none', async () => {
    const other = await buildMenuItem(prisma, { name: 'Not seeded' });
    await seedMenu(prisma, cache, MENU_SEED_ITEMS);
    const [first] = MENU_SEED_ITEMS;
    await prisma.menuItem.update({
      where: { id: first.id },
      data: { priceCents: 1 },
    });

    await seedMenu(prisma, cache, MENU_SEED_ITEMS);

    expect(await prisma.menuItem.count()).toBe(MENU_SEED_ITEMS.length + 1);
    expect(
      await prisma.menuItem.findUnique({ where: { id: first.id } }),
    ).toEqual(first);
    expect(
      await prisma.menuItem.findUnique({ where: { id: other.id } }),
    ).toEqual(other);
  });

  it('returns the 500 INTERNAL envelope when Redis is down', async () => {
    const downApp = await bootApp();
    downApp.get<RedisClient>(REDIS).destroy();

    const res = await request(downApp.getHttpServer()).get('/api/v1/menu');

    expect(res.status).toBe(500);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe('INTERNAL');
    await expect(downApp.close()).resolves.toBeUndefined();
  });

  it('seeds through SeedModule and leaves menu:v1 absent', async () => {
    const ctx = await NestFactory.createApplicationContext(SeedModule, {
      logger: false,
    });
    await seedMenu(ctx.get(PrismaService), ctx.get(MenuCache), MENU_SEED_ITEMS);
    await ctx.close();

    expect(await prisma.menuItem.count()).toBe(MENU_SEED_ITEMS.length);
    expect(await redis.exists('menu:v1')).toBe(0);
  });
});
