import { z } from 'zod';

/** Schema for the api's environment. Every value is required; no defaults. */
export const EnvSchema = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  PORT: z.coerce.number().int().positive(),
});

/** Parsed, validated api environment. */
export type Env = z.infer<typeof EnvSchema>;

/**
 * Parses `process.env` with {@link EnvSchema}. On failure logs the Zod issues
 * and exits the process with code 1 (fail fast).
 */
export function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error(`Invalid environment:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data;
}
