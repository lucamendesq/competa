import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import boundaries from 'eslint-plugin-boundaries';
import { fileURLToPath } from 'node:url';

const web = 'apps/web';

const restrictQueryClient = {
  group: ['@tanstack/react-query'],
  message:
    'Componentes não chamam o TanStack Query direto: use o hook de features/<feature>/queries (docs/react-standards.md).',
};

const restrictRadix = {
  group: ['@radix-ui/*', 'radix-ui'],
  message: 'Primitivos headless só dentro de shared/components/ui (o shadcn gerado).',
};

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/node_modules',
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

  {
    files: [`${web}/**/*.{ts,tsx}`],
    extends: [
      ...tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      jsxA11y.flatConfigs.recommended,
      prettier,
    ],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: `${web}/tsconfig.app.json` } },
      'boundaries/root-path': fileURLToPath(new URL(`./${web}`, import.meta.url)),
      'boundaries/files': [{ pattern: '**/*.spec.{ts,tsx}', category: 'test' }],
      'boundaries/elements': [
        { type: 'shared', pattern: 'src/shared' },
        { type: 'feature', pattern: 'src/features/*', capture: ['featureName'] },
        { type: 'app', pattern: 'src/app' },
        { type: 'testing', pattern: 'src/testing' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        2,
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'shared' } },
              allow: { to: { element: { type: 'shared' } } },
            },
            {
              from: { element: { type: 'feature' } },
              allow: {
                to: {
                  element: [
                    { type: 'shared' },
                    {
                      type: 'feature',
                      captured: { featureName: '{{ from.element.captured.featureName }}' },
                    },
                    {
                      type: 'feature',
                      captured: { featureName: 'catalog' },
                      fileInternalPath: 'index.ts',
                    },
                  ],
                },
              },
            },
            {
              from: { element: { types: ['app', 'testing'] } },
              allow: {
                to: {
                  element: [
                    { types: ['shared', 'app', 'testing'] },
                    { type: 'feature', fileInternalPath: 'index.ts' },
                  ],
                },
              },
            },
            {
              from: { file: { categories: 'test' } },
              allow: { to: { element: { types: ['shared', 'feature', 'app', 'testing'] } } },
            },
            {
              from: { element: { type: 'testing' } },
              allow: { to: { element: { type: 'feature' } } },
            },
          ],
          message:
            'Fora da direção shared → features → app (docs/react-standards.md): {{ from.element.types.[0] }} não importa {{ to.element.types.[0] }} {{ to.element.captured.featureName }} por este caminho; features só se veem pelo index.ts, e só a feature catalog é importável por outra.',
        },
      ],
      'no-restricted-imports': ['error', { patterns: [restrictQueryClient, restrictRadix] }],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'HTTP só pelo shared/lib/api-client.ts (PUT no storage: features/upload/api).',
        },
      ],
    },
  },
  {
    files: [
      `${web}/src/features/*/queries/**`,
      `${web}/src/shared/lib/query-client.ts`,
      `${web}/src/shared/session/**`,
      `${web}/src/shared/pwa/**`,
      `${web}/src/app/providers/**`,
      `${web}/src/testing/**`,
      `${web}/src/**/*.spec.{ts,tsx}`,
    ],
    rules: { 'no-restricted-imports': ['error', { patterns: [restrictRadix] }] },
  },
  {
    files: [`${web}/src/shared/components/ui/**`],
    rules: { 'no-restricted-imports': ['error', { patterns: [restrictQueryClient] }] },
  },
  {
    files: [
      `${web}/src/shared/lib/api-client.ts`,
      `${web}/src/shared/lib/auth-client.ts`,
      `${web}/src/features/upload/api/**`,
      `${web}/src/testing/**`,
      `${web}/src/**/*.spec.{ts,tsx}`,
    ],
    rules: { 'no-restricted-globals': 'off' },
  },

  /* Specs afirmam corpos JSON estruturalmente; o bloco vive aqui (e não numa diretiva
   * inline) porque o lint-staged roda com esta config. Scripts de verificação são
   * ferramentas internas com `any` legado anterior ao hook. */
  {
    files: ['apps/api/test/**/*.ts', 'apps/api/src/scripts/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
