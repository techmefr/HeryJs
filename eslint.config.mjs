// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // A module's dist/ is its published entry, compiled -- output, not source,
    // and outside every tsconfig here, so the typed rules can only report it
    // as a file they cannot place.
    ignores: ['eslint.config.mjs', 'packages/*/dist/**', 'packages/core/src/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        // One program for the whole repository. The project service opened one
        // per package tsconfig, and each of those loaded the kernel and the
        // Prisma client types again: some thirty copies, 14 GB to lint.
        project: [
          './tsconfig.eslint.json',
          './examples/hery-module-maintenance/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
