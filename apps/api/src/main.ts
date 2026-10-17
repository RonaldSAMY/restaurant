import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { APP_NAME } from '@restaurant/shared';
import { AppModule } from './app.module';
import { parseEnv } from './common/env';

/** Validates env, then starts the HTTP server under the `/api/v1` prefix. */
async function bootstrap(): Promise<void> {
  const env = parseEnv();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`${APP_NAME} api listening on ${env.PORT}`);
}
void bootstrap();
