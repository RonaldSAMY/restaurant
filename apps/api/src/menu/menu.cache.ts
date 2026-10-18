import { Inject, Injectable } from '@nestjs/common';
import type { MenuResponse } from '@restaurant/shared';
import { REDIS, type RedisClient } from '../common/redis.module';

/** Redis key holding the whole grouped Menu as JSON (no TTL). */
const MENU_KEY = 'menu:v1';

/**
 * Sole owner of the Redis key `menu:v1`: the whole grouped Menu as JSON,
 * stored without TTL. Used by `MenuService` (cache-aside) and the seed.
 */
@Injectable()
export class MenuCache {
  /** Receives the shared Redis client. */
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  /** Returns the cached Menu, or `null` on a miss. */
  async get(): Promise<MenuResponse | null> {
    const raw = await this.redis.get(MENU_KEY);
    return raw === null ? null : (JSON.parse(raw) as MenuResponse);
  }

  /** Stores `menu` without TTL. */
  async set(menu: MenuResponse): Promise<void> {
    await this.redis.set(MENU_KEY, JSON.stringify(menu));
  }

  /** Drops the cached Menu so the next read reloads it from Postgres. */
  async invalidate(): Promise<void> {
    await this.redis.del(MENU_KEY);
  }
}
