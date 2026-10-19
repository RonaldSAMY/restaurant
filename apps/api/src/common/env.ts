import { z } from 'zod';

/** Schema for the api's environment. Every value is required; no defaults. */
export const EnvSchema = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  PORT: z.coerce.number().int().positive(),
  /** HS256 key for staff access and refresh JWTs. */
  AUTH_JWT_SECRET: z.string().min(32),
});

/** Parsed, validated api environment. */
export type Env = z.infer<typeof EnvSchema>;

/** Seed-only environment: the api's plus the seeded staff account. */
export const SeedEnvSchema = EnvSchema.extend({
  SEED_STAFF_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  SEED_STAFF_PASSWORD: z.string().min(12),
});

/** Parsed, validated seed environment. */
export type SeedEnv = z.infer<typeof SeedEnvSchema>;

/**
 * Parses `process.env` with `schema` ({@link EnvSchema} by default). On
 * failure logs the Zod issues and exits the process with code 1 (fail fast).
 */
export function parseEnv<S extends z.ZodType = typeof EnvSchema>(
  schema: S = EnvSchema as unknown as S,
): z.infer<S> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    console.error(`Invalid environment:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data;
}
