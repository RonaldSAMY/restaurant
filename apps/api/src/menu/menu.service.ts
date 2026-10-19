import { Injectable } from '@nestjs/common';
import type { MenuCategory, MenuResponse } from '@restaurant/shared';
import { PrismaService } from '../common/prisma.module';
import { MenuCache } from './menu.cache';

/** Serves the Menu grouped by category, cache-aside over {@link MenuCache}. */
@Injectable()
export class MenuService {
  /** Receives the database client and the Menu cache. */
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: MenuCache,
  ) {}

  /**
   * Returns the cached Menu on a hit. On a miss loads all Menu Items
   * (categories and items alphabetical), caches the result unless the Menu is
   * empty, and returns it.
   */
  async getMenu(): Promise<MenuResponse> {
    const cached = await this.cache.get();
    if (cached) return cached;

    const rows = await this.prisma.menuItem.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    const categories: MenuCategory[] = [];
    for (const { category, id, name, description, priceCents } of rows) {
      let group = categories.at(-1);
      if (group?.name !== category) {
        group = { name: category, items: [] };
        categories.push(group);
      }
      group.items.push({ id, name, description, priceCents });
    }
    const menu = { categories };
    if (categories.length > 0) await this.cache.set(menu);
    return menu;
  }

  /**
   * Returns the Menu Items with the given ids, read from Postgres (not the
   * cache). Unknown ids are simply absent from the result.
   */
  findItems(
    ids: string[],
  ): Promise<{ id: string; name: string; priceCents: number }[]> {
    return this.prisma.menuItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, priceCents: true },
    });
  }
}
