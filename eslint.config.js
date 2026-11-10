import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  // node:test 의 test() 는 Promise를 돌려주지만 러너가 직접 기다린다.
  { files: ['test/**/*.ts'], rules: { '@typescript-eslint/no-floating-promises': 'off' } },
  { files: ['eslint.config.js'], extends: [tseslint.configs.disableTypeChecked] },
);
