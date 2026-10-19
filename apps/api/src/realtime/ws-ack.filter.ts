import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';
import { FORBIDDEN_MESSAGE } from '@nestjs/core/guards/constants';
import { WsException } from '@nestjs/websockets';
import type { ErrorEnvelope } from '@restaurant/shared';
import { toEnvelope } from '../common/error-envelope.filter';

/**
 * Gateway-scoped filter: answers handler errors and guard denials with the
 * ack `{ error }`, using the HTTP filter's code mapping. A guard returning
 * `false` (Nest's ws `Forbidden resource`) becomes `FORBIDDEN`. Messages sent
 * without an ack callback get no answer.
 */
@Catch()
export class WsAckFilter implements ExceptionFilter {
  /** Calls the message's ack callback (handler arg 2) with the envelope. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const body: ErrorEnvelope =
      exception instanceof WsException &&
      exception.message === FORBIDDEN_MESSAGE
        ? { error: { code: 'FORBIDDEN', message: FORBIDDEN_MESSAGE } }
        : toEnvelope(exception)[1];
    const ack = host.getArgByIndex<unknown>(2);
    if (typeof ack === 'function') (ack as (body: ErrorEnvelope) => void)(body);
  }
}
