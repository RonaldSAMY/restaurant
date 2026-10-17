import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

/** Root module of the api. */
@Module({
  controllers: [HealthController],
})
export class AppModule {}
