import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../common/clock';
import { PrismaModule } from '../common/prisma.module';
import { RedisModule } from '../common/redis.module';
import { MenuModule } from '../menu/menu.module';
import { PrismaOrderRepository } from './adapters/prisma-order.repository';
import { GuestSessionGuard } from './guest-session.guard';
import { GuestSessionService } from './guest-session.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderRepository } from './ports/order-repository';

/** Orders feature: owns `Order`, `OrderItem` and `guest:session:{sid}`. */
@Module({
  imports: [MenuModule, PrismaModule, RedisModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    GuestSessionService,
    GuestSessionGuard,
    { provide: Clock, useClass: SystemClock },
    { provide: OrderRepository, useClass: PrismaOrderRepository },
  ],
})
export class OrdersModule {}
