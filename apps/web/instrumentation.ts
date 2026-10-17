/**
 * Runs once at server start (never during `next build`). On the Node runtime
 * it validates the web env; the check lives in its own module so the Edge
 * bundle never sees `process.exit`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { parseEnv } = await import('./lib/env');
    parseEnv();
  }
}
