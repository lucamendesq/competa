import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Shared base ESLint config. Apps extend this in their own eslint.config.mjs.
export default tseslint.config(
  {
    ignores: ['**/dist', '**/node_modules', '**/.nx', '**/.angular', '**/coverage'],
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],
    extends: [...tseslint.configs.recommended, prettier],
  },
);
