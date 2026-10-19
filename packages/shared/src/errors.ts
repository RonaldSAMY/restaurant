import { z } from 'zod';

/**
 * Closed set of machine-readable error codes (AD-13). Clients branch on the
 * code, never on the message.
 */
export const ErrorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'MENU_ITEM_NOT_FOUND',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'ORDER_NOT_FOUND',
  'ORDER_ALREADY_OPEN',
  'INVALID_TRANSITION',
  'RATE_LIMITED',
  'INTERNAL',
]);

/** One machine-readable error code (see {@link ErrorCodeSchema}). */
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * One field problem in `VALIDATION_FAILED` details (an array of these):
 * dotted field path (`(root)` for the body itself) and message.
 */
export const ValidationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});

/** One field problem (see {@link ValidationIssueSchema}). */
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/** Body of every api error response: `{ error: { code, message, details? } }`. */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

/** Parsed api error response (see {@link ErrorEnvelopeSchema}). */
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
