import { Module } from '@nestjs/common';
import { PrismaModule, type PrismaService } from '../common/prisma.module';
import { RedisModule } from '../common/redis.module';
import type { MenuItem } from '../generated/prisma/client';
import type { MenuCache } from '../menu/menu.cache';
import { MenuModule } from '../menu/menu.module';

/** Application context for the seed: only the Menu and its infrastructure. */
@Module({ imports: [MenuModule, PrismaModule, RedisModule] })
export class SeedModule {}

/**
 * Upserts `items` by id in one transaction (never deletes), then invalidates
 * the Menu cache so the next read shows the new data.
 */
export async function seedMenu(
  prisma: PrismaService,
  cache: MenuCache,
  items: MenuItem[],
): Promise<void> {
  await prisma.$transaction(
    items.map((item) =>
      prisma.menuItem.upsert({
        where: { id: item.id },
        create: item,
        update: item,
      }),
    ),
  );
  await cache.invalidate();
}
