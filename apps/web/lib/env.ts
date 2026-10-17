import { z } from 'zod';

/** Schema for the web server's environment. Every value is required. */
export const EnvSchema = z.object({
  API_INTERNAL_URL: z.url(),
});

/** Parsed, validated web environment. */
export type Env = z.infer<typeof EnvSchema>;

/**
 * Parses `process.env` with {@link EnvSchema}. On failure logs the Zod issues
 * and exits with code 1, because Next only logs errors thrown from
 * `register()` and keeps serving.
 */
export function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error(`Invalid environment:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data;
}
