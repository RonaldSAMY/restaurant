import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  AdvanceStatusRequestSchema,
  ApiRoutes,
  type KitchenOrder,
} from '@restaurant/shared';
import { createZodDto } from 'nestjs-zod';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { OrdersService } from './orders.service';

/** Body DTO of `PATCH /api/v1/kitchen/orders/:id/status`. */
class AdvanceStatusDto extends createZodDto(AdvanceStatusRequestSchema) {}

/** Staff-only Kitchen Board endpoints. */
@Controller(ApiRoutes.kitchenOrders)
@UseGuards(StaffAuthGuard)
export class KitchenController {
  /** Receives the Orders service. */
  constructor(private readonly orders: OrdersService) {}

  /** Returns every non-Collected Order, oldest first. */
  @Get()
  @Header('Cache-Control', 'no-store')
  list(): Promise<KitchenOrder[]> {
    return this.orders.listOpen();
  }

  /** Moves the Order one step forward; `409 INVALID_TRANSITION` otherwise. */
  @Patch(':id/status')
  advance(
    @Param('id') id: string,
    @Body() { to }: AdvanceStatusDto,
  ): Promise<KitchenOrder> {
    return this.orders.advance(id, to);
  }
}
