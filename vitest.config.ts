import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Ingestion/backfill tests use short real timers on purpose (they exercise
    // genuine backoff paths), so keep the per-test ceiling modest but sane.
    testTimeout: 15_000,
  },
});
