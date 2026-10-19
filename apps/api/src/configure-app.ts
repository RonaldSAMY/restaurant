import type { INestApplication } from '@nestjs/common';
import { API_PREFIX } from '@restaurant/shared';
import type { Express } from 'express';

/**
 * Applies the app-wide HTTP setup (the {@link API_PREFIX} prefix, proxy
 * trust) shared by `bootstrap()` and the integration tests, so tests run the
 * real config.
 */
export function configureApp(app: INestApplication): void {
  // Nest mounts routes at `/` on an undefined prefix, so fail loudly on a stale shared build.
  if (!API_PREFIX)
    throw new Error('API_PREFIX missing: rebuild @restaurant/shared');
  app.setGlobalPrefix(API_PREFIX);
  // Caddy is the single proxy hop: `req.ip` is the client, so throttles are per client.
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
}
