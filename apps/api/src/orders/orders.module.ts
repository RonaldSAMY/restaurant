import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../common/clock';
import { PrismaModule } from '../common/prisma.module';
import { MenuModule } from '../menu/menu.module';
import { PrismaOrderRepository } from './adapters/prisma-order.repository';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderRepository } from './ports/order-repository';

/** Orders feature: owns `Order` and `OrderItem`. */
@Module({
  imports: [MenuModule, PrismaModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    { provide: Clock, useClass: SystemClock },
    { provide: OrderRepository, useClass: PrismaOrderRepository },
  ],
})
export class OrdersModule {}
