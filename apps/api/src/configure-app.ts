import type { INestApplication } from '@nestjs/common';

/**
 * Applies the app-wide HTTP setup (the `/api/v1` prefix) shared by
 * `bootstrap()` and the integration tests, so tests run the real config.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
}
