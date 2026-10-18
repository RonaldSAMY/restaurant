import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { parseEnv } from '../common/env';
import { PrismaService } from '../common/prisma.module';
import { MenuCache } from '../menu/menu.cache';
import { MENU_SEED_ITEMS } from './menu-seed-data';
import { SeedModule, seedMenu } from './seed.module';

/** Seed entry point: validates env, upserts the demo Menu, then closes. */
async function seed(): Promise<void> {
  parseEnv();
  const app = await NestFactory.createApplicationContext(SeedModule);
  try {
    await seedMenu(app.get(PrismaService), app.get(MenuCache), MENU_SEED_ITEMS);
    new Logger('Seed').log(`upserted ${MENU_SEED_ITEMS.length} Menu Items`);
  } finally {
    await app.close();
  }
}
void seed();
