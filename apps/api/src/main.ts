import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { parseEnv } from './common/env';
import { configureApp } from './configure-app';

/** Validates env, then starts the HTTP server under the `/api/v1` prefix. */
async function bootstrap(): Promise<void> {
  const env = parseEnv();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`Restaurant api listening on ${env.PORT}`);
}
void bootstrap();
