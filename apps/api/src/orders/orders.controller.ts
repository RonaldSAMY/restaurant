import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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

/**
 * Throttle of reference lookups: 30 per 60 s per client IP, failed lookups
 * included. Shared with `order.subscribe` (Epic 3), which validates
 * references the same way. `ThrottlerGuard` counts per handler, so sharing
 * the config does not share the budget.
 */
export const REFERENCE_LOOKUP_THROTTLE = {
  default: { limit: 30, ttl: 60_000 },
};

/**
 * Guest Order endpoints. No guest route takes an Order id; only the public,
 * throttled lookup takes a reference.
 */
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

  /**
   * Returns the Guest view of the Order with `reference` (any letter case)
   * within 24 h of placement. Unknown and expired references get the same 404.
   */
  @Public()
  @Get('by-reference/:reference')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  @Throttle(REFERENCE_LOOKUP_THROTTLE)
  byReference(@Param('reference') reference: string): Promise<GuestOrderView> {
    return this.orders.byReference(reference);
  }
}
