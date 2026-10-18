import { Client } from 'pg';
import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Tests run in order: the first leaves data behind, the second proves
// test/setup.ts wiped it in beforeEach.
describe('integration harness isolation', () => {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  const redis = createClient({ url: process.env.TEST_REDIS_URL });

  beforeAll(async () => {
    await db.connect();
    await redis.connect();
  });

  afterAll(async () => {
    await db.query('DROP TABLE IF EXISTS "HarnessProbe"');
    await db.end();
    await redis.close();
  });

  it('leaves a row and a Redis key behind', async () => {
    await db.query(
      'CREATE TABLE IF NOT EXISTS "HarnessProbe" (id serial PRIMARY KEY)',
    );
    await db.query('INSERT INTO "HarnessProbe" DEFAULT VALUES');
    await redis.set('harness:probe', '1');
  });

  it('starts the next test with empty tables and Redis', async () => {
    const { rows } = await db.query<{ count: string }>(
      'SELECT count(*) FROM "HarnessProbe"',
    );
    expect(rows[0].count).toBe('0');
    expect(await redis.exists('harness:probe')).toBe(0);
  });
});
