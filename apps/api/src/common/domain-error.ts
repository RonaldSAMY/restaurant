import type { ErrorCode } from '@restaurant/shared';

/**
 * HTTP status for every {@link ErrorCode} (AD-13). Typed as a full `Record`,
 * so adding a code to the shared enum fails typecheck until it is mapped here.
 */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  MENU_ITEM_NOT_FOUND: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  ORDER_NOT_FOUND: 404,
  ORDER_ALREADY_OPEN: 409,
  INVALID_TRANSITION: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/**
 * Expected business failure. Thrown by services and turned into the error
 * envelope, with the status from {@link ERROR_STATUS}, by the global filter.
 */
export class DomainError extends Error {
  /**
   * Creates an error that maps to `code`'s HTTP status.
   * @param code - machine-readable code sent to the client.
   * @param message - human-readable message sent to the client.
   * @param details - optional client-safe context (e.g. an Order reference).
   */
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
