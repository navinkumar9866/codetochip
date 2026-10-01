import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/web/vite.config.ts',
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['packages/*/test/**/*.test.ts', 'services/*/test/**/*.test.ts'],
        },
      },
    ],
  },
});
