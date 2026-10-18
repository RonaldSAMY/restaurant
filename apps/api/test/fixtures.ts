import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/common/prisma.module';
import type { MenuItem } from '../src/generated/prisma/client';

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
