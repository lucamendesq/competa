import tseslint from 'typescript-eslint';
import base from '../../eslint.config.mjs';

/* Invariante de tenant (spec §6 e §13.1). Três rotas levam a uma query sem
 * escopo, e as três estão fechadas abaixo:
 *   1. injetar a abstract class `Database` fora de repositório/guard/use case
 *   2. importar a instância crua `db` do Drizzle, que ignora a DI inteira
 *   3. forjar o tipo branded com `x as FirmScope`, sem passar por guard algum
 * Exceções são por arquivo, nunca por categoria larga — ver os blocos no fim. */

const DATABASE_IMPORT = {
  group: ['**/infra/database/database', '**/infra/database/database.js'],
  message:
    'Database só pode ser injetado em *.repository.ts, *.guard.ts ou *.usecase.ts. Controller consulta via repositório, para que o FirmScope seja exigido por assinatura.',
};

const DB_INSTANCE_IMPORT = {
  // alvo estreito de propósito: `group: ['**']` faz o ESLint acusar qualquer
  // `import * as x from '...'`, porque não resolve os nomes estaticamente.
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

  // padrão: tudo proibido
  {
    files: ['**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DATABASE_IMPORT, DB_INSTANCE_IMPORT] }],
      'no-restricted-syntax': ['error', SCOPE_CONSTRUCTOR_IMPORT, SCOPE_CAST],
    },
  },

  // camada de acesso a dados: pode injetar Database, mas não a instância crua
  {
    files: ['**/*.repository.ts', '**/*.guard.ts', '**/*.usecase.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DB_INSTANCE_IMPORT] }],
    },
  },

  // composição (wiring do Drizzle e do Better Auth) e scripts CLI: fora da DI
  {
    files: ['src/infra/**/*.ts', 'src/scripts/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // modules/auth/ importa os construtores de escopo; forjar por `as` segue proibido
  {
    files: ['src/modules/auth/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', SCOPE_CAST],
    },
  },

  // os dois únicos arquivos onde um escopo pode nascer
  {
    files: ['src/modules/auth/scope.ts', 'src/modules/auth/current-scope.decorator.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
