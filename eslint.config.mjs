import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

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
    ignores: ['node_modules/**', 'dist/**', '**/dist/**', 'lib/**', '**/lib/**', 'bun.lock', 'subagents/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: legacyGlobals,
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // 段階移行の例外（範囲: 既存 .js のみ。新規 .ts は上記の strict を適用）。
    // 理由: 2016年由来の連結スコープ（//@require 連結・CDN由來グローバル・
    // ビルダー注入値）を前提とした資産へ、2026年の recommended を一括で
    // error 適用すると基盤整備とは無関係な数百件の改修が必要になる。
    // 代替手段: 既存違反は warn として表示し続け、ファイル単位の TS 変換時に
    // strict を適用して解消する（AGENTS.md の移行バックログで追跡）。
    // 既知の潜在バグ `_hls.js` の `stats`（束縛なし参照）も warn として残し、
    // 別タスクで修正＋実機検証する。無断で error を握りつぶさない。
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      // 連結スコープ由来の未宣言参照を許容（warn 表示は維持）。
      'no-undef': 'warn',
      // 旧資産の `a && b()` 制御フロー等の既存様式。TS 新規 code は error 維持。
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-useless-assignment': 'warn',
      'no-prototype-builtins': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-self-assign': 'warn',
      'no-setter-return': 'warn',
      'no-dupe-class-members': 'warn',
      'no-async-promise-executor': 'warn',
      'no-misleading-character-class': 'warn',
      'no-extra-boolean-cast': 'warn',
      'no-empty': 'warn',
      'getter-return': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      'no-useless-escape': 'warn',
      'no-irregular-whitespace': 'warn',
    },
  },
  eslintConfigPrettier
);
