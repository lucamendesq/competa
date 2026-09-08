import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';
import base from '../../eslint.config.mjs';

export default tseslint.config(
  // Vendored spartan-ng components (`ng g @spartan-ng/cli:ui`) — upstream source,
  // uses hlm/brn selector prefixes and is not ours to lint.
  { ignores: ['src/ui/**'] },
  ...base,
  {
    files: ['**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
