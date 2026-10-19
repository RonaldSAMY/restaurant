import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiRoutes,
  type GuestOrderView,
  PlaceOrderRequestSchema,
} from '@restaurant/shared';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { readCookie } from '../common/cookies';
import type { PrincipalRequest } from '../common/default-deny.guard';
import { DomainError } from '../common/domain-error';
import { Public } from '../common/public.decorator';
import { GUEST_SESSION_COOKIE, GuestSessionGuard } from './guest-session.guard';
import { OrdersService } from './orders.service';

/** Body DTO of `POST /api/v1/orders`. */
class PlaceOrderDto extends createZodDto(PlaceOrderRequestSchema) {}

/** Guest Order endpoints. No guest route takes an Order id or reference. */
@Controller(ApiRoutes.orders)
export class OrdersController {
  /** Receives the Orders service. */
  constructor(private readonly orders: OrdersService) {}

  /**
   * Places an Order anonymously, sets the `guest_session` cookie and returns
   * the Guest view. `409 ORDER_ALREADY_OPEN` while the caller's session is open.
   */
  @Public()
  @Post()
  @HttpCode(201)
  async place(
    @Body() body: PlaceOrderDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GuestOrderView> {
    const { view, sid, expiresAt } = await this.orders.place(
      body,
      readCookie(req.headers.cookie, GUEST_SESSION_COOKIE),
    );
    res.cookie(GUEST_SESSION_COOKIE, sid, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      expires: expiresAt,
    });
    return view;
  }

  /** Returns the Guest view of the caller's open-session Order. */
  @Get('current')
  @Header('Cache-Control', 'no-store')
  @UseGuards(GuestSessionGuard)
  current(@Req() { principal }: PrincipalRequest): Promise<GuestOrderView> {
    if (principal?.kind !== 'guest') {
      throw new DomainError('UNAUTHENTICATED', 'Authentication required');
    }
    return this.orders.current(principal.orderId);
  }
}
