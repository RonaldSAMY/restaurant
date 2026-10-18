import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma.module';
import { RedisModule } from '../common/redis.module';
import { MenuCache } from './menu.cache';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

/** Menu feature: owns `MenuItem` reads and the `menu:v1` cache. */
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [MenuController],
  providers: [MenuService, MenuCache],
  exports: [MenuService, MenuCache],
})
export class MenuModule {}
