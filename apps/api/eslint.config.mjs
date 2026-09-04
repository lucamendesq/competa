import tseslint from 'typescript-eslint';
import base from '../../eslint.config.mjs';

const DATABASE_IMPORT = {
  group: ['**/infra/database/database', '**/infra/database/database.js'],
  message:
    'Database só pode ser injetado em *.repository.ts ou *.guard.ts. Controller consulta via repositório, para que o FirmScope seja exigido por assinatura.',
};

const DB_INSTANCE_IMPORT = {
  group: ['**/infra/database/index', '**/infra/database/index.js'],
  importNames: ['db'],
  message:
    'A instância crua `db` do Drizzle só existe em src/infra/ e src/scripts/. Em src/modules/, use um repositório que exija FirmScope.',
};

const SCOPE_CONSTRUCTOR_IMPORT = {
  selector: "ImportSpecifier[imported.name=/^(toFirmScope|toUploadScope)$/]",
  message:
    'toFirmScope/toUploadScope só podem ser importados dentro de src/modules/auth/ — o escopo nasce no guard.',
};

const SCOPE_CAST = {
  selector: "TSAsExpression[typeAnnotation.typeName.name=/^(FirmScope|UploadScope)$/]",
  message:
    'Não force o tipo branded com `as`. FirmScope/UploadScope só são construídos por toFirmScope/toUploadScope, dentro de src/modules/auth/.',
};

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
    files: ['**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DATABASE_IMPORT, DB_INSTANCE_IMPORT] }],
      'no-restricted-syntax': ['error', SCOPE_CONSTRUCTOR_IMPORT, SCOPE_CAST],
    },
  },

  {
    files: ['**/*.repository.ts', '**/*.guard.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DB_INSTANCE_IMPORT] }],
    },
  },

  {
    files: ['src/infra/**/*.ts', 'src/scripts/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  {
    files: ['src/modules/auth/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', SCOPE_CAST],
    },
  },

  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },

  /* Testes usam a instância crua para ARRANJAR estado que rota não cria (Empresa inativa,
   * convite expirado) e para AFIRMAR o que ficou no banco. Não é código de request — não há
   * sessão para escopar — e são justamente estes arquivos que provam a invariante de tenant.
   * Forjar o tipo branded com `as` segue proibido aqui também. */
  {
    files: ['test/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  {
    files: ['src/modules/auth/scope.ts', 'src/modules/auth/current-scope.decorator.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
