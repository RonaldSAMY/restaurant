import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { DefaultDenyGuard } from './common/default-deny.guard';
import { ErrorEnvelopeFilter } from './common/error-envelope.filter';
import { HealthController } from './health/health.controller';

/**
 * Root module of the api. Registers the global conventions once, so tests
 * and production share the same wiring: error envelope filter, default-deny
 * guard and Zod body validation.
 */
@Module({
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
    { provide: APP_GUARD, useClass: DefaultDenyGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
