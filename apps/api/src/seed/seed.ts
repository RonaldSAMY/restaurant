import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PasswordHasher } from '../auth/ports/password-hasher';
import { parseEnv, SeedEnvSchema } from '../common/env';
import { PrismaService } from '../common/prisma.module';
import { MenuCache } from '../menu/menu.cache';
import { MENU_SEED_ITEMS } from './menu-seed-data';
import { SeedModule, seedMenu, seedStaff } from './seed.module';

/** Seed entry point: validates env, upserts the demo Menu and staff user, then closes. */
async function seed(): Promise<void> {
  const env = parseEnv(SeedEnvSchema);
  const app = await NestFactory.createApplicationContext(SeedModule);
  try {
    const prisma = app.get(PrismaService);
    await seedMenu(prisma, app.get(MenuCache), MENU_SEED_ITEMS);
    new Logger('Seed').log(`upserted ${MENU_SEED_ITEMS.length} Menu Items`);
    await seedStaff(
      prisma,
      app.get(PasswordHasher),
      env.SEED_STAFF_EMAIL,
      env.SEED_STAFF_PASSWORD,
    );
    new Logger('Seed').log('upserted the staff user');
  } finally {
    await app.close();
  }
}
void seed();
