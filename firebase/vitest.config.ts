import { defineConfig } from 'vitest/config';

// Runs only under `firebase emulators:exec` (see package.json), which sets the
// *_EMULATOR_HOST env vars that @firebase/rules-unit-testing reads.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
