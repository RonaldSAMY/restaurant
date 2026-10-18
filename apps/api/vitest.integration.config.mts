import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Integration test config: real Postgres and Redis from `compose.test.yaml`.
 * Files run one at a time because they share the test database.
 */
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['test/**/*.int-spec.ts'],
    fileParallelism: false,
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
  },
});
