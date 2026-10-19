import { randomUUID } from 'node:crypto';
import type { PasswordHasher } from '../src/auth/ports/password-hasher';
import type { PrismaService } from '../src/common/prisma.module';
import type { MenuItem, StaffUser } from '../src/generated/prisma/client';

/** Fixture builder: inserts one Menu Item, defaults overridable per field. */
export function buildMenuItem(
  prisma: PrismaService,
  overrides: Partial<MenuItem> = {},
): Promise<MenuItem> {
  return prisma.menuItem.create({
    data: {
      id: randomUUID(),
      name: 'Test Dish',
      description: 'A dish for tests.',
      category: 'Mains',
      priceCents: 1000,
      ...overrides,
    },
  });
}

/**
 * Fixture builder: inserts one staff user whose `passwordHash` is `hasher`'s
 * hash of `password`. Returns the row and the plain password.
 */
export async function buildStaffUser(
  prisma: PrismaService,
  hasher: PasswordHasher,
  { email = 'chef@example.com', password = 'correct-horse-battery' } = {},
): Promise<{ user: StaffUser; password: string }> {
  const user = await prisma.staffUser.create({
    data: { email, passwordHash: await hasher.hash(password) },
  });
  return { user, password };
}
