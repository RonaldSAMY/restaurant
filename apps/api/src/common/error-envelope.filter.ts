import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type {
  ErrorCode,
  ErrorEnvelope,
  ValidationIssue,
} from '@restaurant/shared';
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
 * Stack to log for an unexpected error. Prisma errors put the call arguments
 * (possibly secrets) in their message, so they log only name, code and frames.
 */
export function loggableStack(error: Error): string | undefined {
  if (!error.name.startsWith('PrismaClient')) return error.stack;
  const { code } = error as { code?: unknown };
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => line.startsWith('    at '));
  return [typeof code === 'string' ? `${error.name} ${code}` : error.name]
    .concat(frames)
    .join('\n');
}

/** Logger for unexpected (500) errors. */
const logger = new Logger('ErrorEnvelopeFilter');

/**
 * Maps an exception to its HTTP status and envelope body; logs unexpected
 * errors (stack only). Shared by the HTTP filter and the Socket.IO ack filter.
 */
export function toEnvelope(exception: unknown): [number, ErrorEnvelope] {
  if (exception instanceof DomainError) {
    const { code, message, details } = exception;
    return [ERROR_STATUS[code] ?? 500, { error: { code, message, details } }];
  }
  if (exception instanceof ZodValidationException) {
    const zodError = exception.getZodError();
    const details: ValidationIssue[] | undefined =
      zodError instanceof ZodError
        ? zodError.issues.map((i) => ({
            path: i.path.length ? i.path.map(String).join('.') : '(root)',
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
  logger.error(
    exception instanceof Error
      ? loggableStack(exception)
      : `Non-Error thrown: ${typeof exception}`,
  );
  return [
    status,
    { error: { code: 'INTERNAL', message: 'Internal server error' } },
  ];
}

/**
 * Global exception filter: turns every error into the AD-13 envelope
 * `{ error: { code, message, details? } }`. Unexpected errors become a generic
 * 500 (5xx HTTP errors keep their status); only their stack is logged, never request headers, cookies or bodies.
 * Non-HTTP hosts (the Socket.IO gateway) get no response from this filter.
 */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  /**
   * Writes the envelope for `exception` to the HTTP response, or only ends the
   * response when the handler already sent its headers. On a non-HTTP host it
   * only logs unexpected errors.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const [status, body] = toEnvelope(exception);
    if (host.getType() !== 'http') return;
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) {
      logger.error(`Error after headers were sent (${body.error.code})`);
      res.end();
      return;
    }
    res.status(status).json(body);
  }
}
