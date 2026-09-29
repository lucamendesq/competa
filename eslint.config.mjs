import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/node_modules',
      '**/.angular',
      '**/coverage',
      '**/.astro',
      '**/.worktrees/**',
      'qa-suite/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],
    extends: [...tseslint.configs.recommended, prettier],
  },
);
