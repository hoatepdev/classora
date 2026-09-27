import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    // Several HTTP suites replace process-wide modules and environment state;
    // serial files keep those deliberate test doubles isolated deterministically.
    fileParallelism: false,
  },
});
