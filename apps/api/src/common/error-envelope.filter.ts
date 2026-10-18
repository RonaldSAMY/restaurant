import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ErrorCode, ErrorEnvelope } from '@restaurant/shared';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { DomainError, ERROR_STATUS } from './domain-error';

/**
 * Codes for Nest HTTP errors that have an AD-13 equivalent; any other HTTP
 * status (404 unknown route, 405, 413 ...) keeps its status with `INTERNAL`.
 */
const HTTP_CODES: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  429: 'RATE_LIMITED',
};

/**
 * Global exception filter: turns every error into the AD-13 envelope
 * `{ error: { code, message, details? } }`. Unexpected errors become a generic
 * 500 (5xx HTTP errors keep their status); only their stack is logged, never request headers, cookies or bodies.
 */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  /** Logger for unexpected (500) errors. */
  private readonly logger = new Logger(ErrorEnvelopeFilter.name);

  /** Writes the envelope for `exception` to the HTTP response. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const [status, body] = this.toEnvelope(exception);
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }

  /** Maps an exception to its HTTP status and envelope body. */
  private toEnvelope(exception: unknown): [number, ErrorEnvelope] {
    if (exception instanceof DomainError) {
      const { code, message, details } = exception;
      return [ERROR_STATUS[code], { error: { code, message, details } }];
    }
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      const details =
        zodError instanceof ZodError
          ? zodError.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            }))
          : undefined;
      return [
        400,
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Validation failed',
            details,
          },
        },
      ];
    }
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    if (exception instanceof HttpException && status < 500) {
      const code = HTTP_CODES[status] ?? 'INTERNAL';
      return [status, { error: { code, message: exception.message } }];
    }
    this.logger.error(
      exception instanceof Error
        ? exception.stack
        : `Non-Error thrown: ${typeof exception}`,
    );
    return [
      status,
      { error: { code: 'INTERNAL', message: 'Internal server error' } },
    ];
  }
}
