import tseslint from 'typescript-eslint';
import base from '../../eslint.config.mjs';

const DB_INSTANCE_IMPORT = {
  group: ['**/infra/database/index', '**/infra/database/index.js'],
  importNames: ['db'],
  message:
    'A instância crua `db` do Drizzle só existe em src/infra/ e src/scripts/. Em src/modules/, use um repositório que exija FirmScope.',
};

const DB_SERVICE_IMPORT = {
  group: ['**/infra/database/effect', '**/infra/database/effect.js'],
  message:
    'O serviço Db só é usado em *.repo.ts, para que o FirmScope seja exigido por assinatura. Rota que precisa de unidade de trabalho usa `withTransaction` de infra/database/transaction.',
};

const SCOPE_CONSTRUCTOR_IMPORT = {
  selector: 'ImportSpecifier[imported.name=/^(toFirmScope|toUploadScope|toContactScope)$/]',
  message:
    'toFirmScope/toUploadScope/toContactScope só podem ser importados em src/http/middleware/auth.ts — o escopo nasce no perfil de auth.',
};

const SCOPE_CAST = {
  selector: 'TSAsExpression[typeAnnotation.typeName.name=/^(FirmScope|UploadScope|ContactScope)$/]',
  message:
    'Não force o tipo branded com `as`. FirmScope/UploadScope/ContactScope só são construídos pelos `to*Scope` de src/modules/auth/scope.ts.',
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
      'no-restricted-imports': ['error', { patterns: [DB_INSTANCE_IMPORT, DB_SERVICE_IMPORT] }],
      'no-restricted-syntax': ['error', SCOPE_CONSTRUCTOR_IMPORT, SCOPE_CAST],
    },
  },

  /* As raízes de composição montam a árvore de serviços e a sonda de saúde pinga o banco;
   * nenhum deles consulta dado de tenant. */
  {
    files: [
      '**/*.repo.ts',
      'src/effect/**/*.ts',
      'src/app.ts',
      'src/main.ts',
      'src/health.ts',
      'src/http/server.ts',
    ],
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

  /* `src/http/middleware/auth.ts` é o ÚNICO lugar onde o escopo nasce. */
  {
    files: ['src/http/middleware/auth.ts'],
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
    files: ['src/modules/auth/scope.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  /* Scripts de verificação montam fixture própria no banco: não há request nem guard de onde
   * o escopo possa nascer. Mesmo caso de `test/**`. A exceção vive aqui e não numa
   * diretiva `eslint-disable` no arquivo porque o `--fix` do lint-staged roda com a config
   * da raiz, que não tem este bloco, e apaga a diretiva por achá-la inútil. */
  {
    files: [
      'src/scripts/verify-com-148.ts',
      'src/scripts/verify-com-152.ts',
      'src/scripts/verify-clean-firm.ts',
      'src/scripts/verify-com-tickets.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  /* Testes de unidade dos serviços Effect montam fixture própria no banco — mesmo caso dos
   * scripts de verificação acima: não há request nem guard de onde o escopo possa nascer. */
  {
    files: ['test/unit/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
