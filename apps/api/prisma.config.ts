import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration. `DATABASE_URL` comes from the environment
 * (compose `env_file: .env`); `prisma generate` runs without it at build time.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
});
