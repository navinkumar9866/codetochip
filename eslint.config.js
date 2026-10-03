import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'functions/lib/**',
      'functions/dist/**',
      'docs/scratch/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['apps/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: [
      'services/**/*.ts',
      'firebase/**/*.ts',
      'functions/**/*.{ts,mjs}',
      '**/scripts/**/*.{js,mjs,ts}',
      '*.config.{js,ts}',
      '**/*.config.{js,ts}',
    ],
    languageOptions: { globals: globals.node },
  },

  // CLAUDE.md rule 6: board-specific facts live only in packages/boards,
  // protocol modules and bridge drivers. Extend the manifest schema instead.
  {
    files: ['apps/**/*.{ts,tsx}', 'services/**/*.ts'],
    ignores: ['**/test/**', '**/e2e/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/aries|thejas|vega|10c4|ea60/i]',
          message: 'Board-specific value outside packages/boards. Read it from the board manifest.',
        },
      ],
    },
  },

  // ADR 0001: the web app reaches the backend only through @codetochip/data interfaces.
  // main.tsx is the one place that picks the Firebase implementation.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/main.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['firebase', 'firebase/*', '@codetochip/data/firebase'],
              message:
                'Use the services from useServices() instead of Firebase directly (ADR 0001).',
            },
          ],
        },
      ],
    },
  },

  // CLAUDE.md: packages/flasher is framework-free and has no DOM beyond Web Serial/WebUSB.
  {
    files: ['packages/flasher/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'sessionStorage',
        'indexedDB',
      ],
      'no-restricted-imports': ['error', { patterns: ['react', 'react-*', 'react/*'] }],
    },
  },

  prettier,
);
