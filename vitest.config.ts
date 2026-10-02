import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/flasher/src/**'],
      // Phase 1 acceptance: every protocol path is tested against the mock device.
      thresholds: {
        lines: 95,
        branches: 85,
        'packages/flasher/src/protocols/**': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
    projects: [
      'apps/web/vite.config.ts',
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'packages/*/test/**/*.test.ts',
            'services/*/test/**/*.test.ts',
            'functions/test/**/*.test.ts',
            'apps/admin/test/**/*.test.ts',
          ],
        },
      },
    ],
  },
});
