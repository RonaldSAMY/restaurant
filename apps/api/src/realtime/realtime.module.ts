import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SocketServerRefModule } from '../common/socket-server.ref';
import { OrdersModule } from '../orders/orders.module';
import { RealtimeGateway } from './realtime.gateway';

/** Socket.IO gateway only; events come from `OrdersService` via the publisher. */
@Module({
  imports: [AuthModule, OrdersModule, SocketServerRefModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
