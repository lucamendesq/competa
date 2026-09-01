import tseslint from 'typescript-eslint';
import base from '../../eslint.config.mjs';

export default tseslint.config(...base, {
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
});
