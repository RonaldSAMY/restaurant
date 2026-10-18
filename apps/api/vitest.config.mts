import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Unit test config. SWC compiles the sources so Nest decorator metadata
 * (`emitDecoratorMetadata`) works; unit tests need no infrastructure.
 */
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
