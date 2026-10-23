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

  /* Specs afirmam corpos JSON estruturalmente; o bloco vive aqui (e não numa diretiva
   * inline) porque o lint-staged roda com esta config. */
  {
    files: ['apps/api/test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
