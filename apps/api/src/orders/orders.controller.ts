import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiRoutes,
  type GuestOrderView,
  PlaceOrderRequestSchema,
} from '@restaurant/shared';
import { createZodDto } from 'nestjs-zod';
import { Public } from '../common/public.decorator';
import { OrdersService } from './orders.service';

/** Body DTO of `POST /api/v1/orders`. */
class PlaceOrderDto extends createZodDto(PlaceOrderRequestSchema) {}

/** Guest Order endpoints. */
@Controller(ApiRoutes.orders)
export class OrdersController {
  /** Receives the Orders service. */
  constructor(private readonly orders: OrdersService) {}

  /** Places an Order anonymously and returns its Guest view. */
  @Public()
  @Post()
  @HttpCode(201)
  place(@Body() body: PlaceOrderDto): Promise<GuestOrderView> {
    return this.orders.place(body);
  }
}
