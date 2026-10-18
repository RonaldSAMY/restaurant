import { Client } from 'pg';
import { createClient } from 'redis';
import { afterAll, beforeAll, beforeEach } from 'vitest';

// Without these, pg/redis fall back to localhost and would wipe whatever runs there.
if (!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL) {
  throw new Error('TEST_DATABASE_URL and TEST_REDIS_URL must be set');
}

// The app under test reads its connections through parseEnv().
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.REDIS_URL = process.env.TEST_REDIS_URL;
process.env.PORT ??= '3000';

/** Connection to the test database, shared by every test in the file. */
const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });

/** Connection to the test Redis, shared by every test in the file. */
const redis = createClient({ url: process.env.TEST_REDIS_URL });

beforeAll(async () => {
  await db.connect();
  await redis.connect();
});

beforeEach(async () => {
  const { rows } = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length > 0) {
    const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
    await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  await redis.flushDb();
});

afterAll(async () => {
  await db.end();
  await redis.close();
});
