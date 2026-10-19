import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import type { PasswordHasher } from '../auth/ports/password-hasher';
import { PrismaModule, type PrismaService } from '../common/prisma.module';
import { RedisModule } from '../common/redis.module';
import type { MenuItem } from '../generated/prisma/client';
import type { MenuCache } from '../menu/menu.cache';
import { MenuModule } from '../menu/menu.module';

/** Application context for the seed: the Menu, staff auth and their infrastructure. */
@Module({ imports: [AuthModule, MenuModule, PrismaModule, RedisModule] })
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

/**
 * Upserts the staff account `email` (normalized) with a fresh hash of
 * `password` from `hasher`. Never deletes.
 */
export async function seedStaff(
  prisma: PrismaService,
  hasher: PasswordHasher,
  email: string,
  password: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const passwordHash = await hasher.hash(password);
  await prisma.staffUser.upsert({
    where: { email: normalized },
    create: { email: normalized, passwordHash },
    update: { passwordHash },
  });
}
