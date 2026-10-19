import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { Clock, SystemClock } from '../common/clock';
import { PrismaModule } from '../common/prisma.module';
import { RedisModule } from '../common/redis.module';
import { SocketServerRefModule } from '../common/socket-server.ref';
import { MenuModule } from '../menu/menu.module';
import { PrismaOrderRepository } from './adapters/prisma-order.repository';
import { SocketIoOrderEventsPublisher } from './adapters/socket-io-order-events.publisher';
import { GuestSessionGuard } from './guest-session.guard';
import { GuestSessionService } from './guest-session.service';
import { KitchenController } from './kitchen.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderEventsPublisher } from './ports/order-events-publisher';
import { OrderRepository } from './ports/order-repository';

/**
 * Orders feature: owns `Order`, `OrderItem` and `guest:session:{sid}`.
 * Imports `AuthModule` for the kitchen routes' `StaffAuthGuard`. Exports the
 * service and Guest Sessions for the realtime gateway.
 */
@Module({
  imports: [
    AuthModule,
    MenuModule,
    PrismaModule,
    RedisModule,
    SocketServerRefModule,
  ],
  controllers: [OrdersController, KitchenController],
  providers: [
    OrdersService,
    GuestSessionService,
    GuestSessionGuard,
    { provide: Clock, useClass: SystemClock },
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    { provide: OrderEventsPublisher, useClass: SocketIoOrderEventsPublisher },
  ],
  exports: [OrdersService, GuestSessionService],
})
export class OrdersModule {}
