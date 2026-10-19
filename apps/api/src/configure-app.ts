import type { INestApplication } from '@nestjs/common';
import { API_PREFIX } from '@restaurant/shared';

/**
 * Applies the app-wide HTTP setup (the {@link API_PREFIX} prefix) shared by
 * `bootstrap()` and the integration tests, so tests run the real config.
 */
export function configureApp(app: INestApplication): void {
  // Nest mounts routes at `/` on an undefined prefix, so fail loudly on a stale shared build.
  if (!API_PREFIX) throw new Error('API_PREFIX missing: rebuild @restaurant/shared');
  app.setGlobalPrefix(API_PREFIX);
}
