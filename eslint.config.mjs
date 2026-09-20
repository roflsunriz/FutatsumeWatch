import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { basename } from 'node:path';

const fileNaming = {
  rules: {
    'kebab-case': {
      meta: {
        type: 'suggestion',
        schema: [],
        messages: { invalid: 'ソースファイル名はケバブケースにしてください: {{name}}' },
      },
      create(context) {
        return {
          Program(node) {
            const name = basename(context.filename);
            // .test.ts、.d.ts、.config.mtsなどの役割を示す接尾辞も許可する。
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(name)) {
              context.report({ node, messageId: 'invalid', data: { name } });
            }
          },
        };
      },
    },
  },
};

// 旧 .eslintrc / .eslintrc.js で宣言されていた実行環境を引き継ぐ。
// （ブラウザ拡張＝ユーザースクリプト、Node ビルド、mocha テスト）
const legacyGlobals = {
  ...globals.browser,
  ...globals.node,
  ...globals.mocha,
  jQuery: 'readonly',
  $: 'readonly',
  _: 'readonly',
  WatchApp: 'readonly',
  WatchJsApi: 'readonly',
  unsafeWindow: 'readonly',
  GM_setValue: 'readonly',
  GM_getValue: 'readonly',
  GM_xmlhttpRequest: 'readonly',
  PRODUCT: 'readonly',
  TOKEN: 'readonly',
  SharedArrayBuffer: 'readonly',
  Atomics: 'readonly',
  CSSUnitValue: 'readonly',
  CSSImageValue: 'readonly',
  CSSStyleValue: 'readonly',
  CSSKeywordValue: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '**/dist/**',
      'lib/**',
      'bun.lock',
      'subagents/**',
      'dev-extensions/**',
      'dev-assets/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    plugins: { 'file-naming': fileNaming },
    languageOptions: {
      globals: legacyGlobals,
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      'file-naming/kebab-case': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // transpile 分離方式のため、値 export と型 export の混在は
      // 実行時破綻の原因になる。型は export type / interface で出す。
      '@typescript-eslint/consistent-type-exports': 'error',
    },
  },
  { files: ['**/*.mjs'], extends: [tseslint.configs.disableTypeChecked] },
  eslintConfigPrettier
);
