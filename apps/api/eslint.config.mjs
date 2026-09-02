import tseslint from 'typescript-eslint';
import base from '../../eslint.config.mjs';

export default tseslint.config(
  ...base,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  {
    // Invariante de tenant (spec §13.1): só repositório/guard/use case/scripts
    // tocam o Database diretamente. Controller consulta via repositório —
    // nunca abrindo o próprio `Database` — para que o escopo seja exigido
    // por assinatura, não por disciplina.
    files: ['**/*.ts'],
    ignores: [
      '**/*.repository.ts',
      '**/*.guard.ts',
      '**/*.usecase.ts',
      'src/scripts/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infra/database/database', '**/infra/database/database.js'],
              message:
                'Database só pode ser importado em *.repository.ts, *.guard.ts, *.usecase.ts (ou src/scripts/*).',
            },
          ],
        },
      ],
    },
  },
  {
    // FirmScope/UploadScope só nascem em modules/auth/ (guards). Importar os
    // construtores em qualquer outro lugar é o bug de segurança que o tipo
    // branded existe para impedir.
    files: ['**/*.ts'],
    ignores: ['src/modules/auth/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportSpecifier[imported.name=/^(toFirmScope|toUploadScope)$/]",
          message: 'toFirmScope/toUploadScope só podem ser importados dentro de src/modules/auth/.',
        },
      ],
    },
  },
);
