import type { INestApplication } from '@nestjs/common';
import { API_PREFIX } from '@restaurant/shared';

/**
 * Applies the app-wide HTTP setup (the {@link API_PREFIX} prefix) shared by
 * `bootstrap()` and the integration tests, so tests run the real config.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
}
