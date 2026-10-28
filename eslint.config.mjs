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
   * inline) porque o lint-staged roda com esta config. Scripts de verificação são
   * ferramentas internas com `any` legado anterior ao hook. */
  {
    files: ['apps/api/test/**/*.ts', 'apps/api/src/scripts/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
