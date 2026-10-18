import { execFileSync } from 'node:child_process';

/**
 * Vitest globalSetup: applies all migrations to the test database once per
 * run. Prisma reads `DATABASE_URL`, so it is pointed at `TEST_DATABASE_URL`.
 */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
