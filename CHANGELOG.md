# 変更履歴

書式は Keep a Changelog に従う。日付は `YYYY-MM-DD` 形式で記載する。

## [Unreleased]

### Added

- TypeScript 移行の基盤を追加し、`bun run lint`、`bun run format`、`bun run type-check`、`bun run build`、`bun run test` を実行できるようにした
- 既存の連結ビルド（`build.js`）を Bun から呼び出して生成物を検証する TypeScript の入口（`scripts/build.ts`）を追加し、製品経路との接続を確保した
- ユーザースクリプトのヘッダー検証に使う型安全な版管理基盤（`src/version.ts`）と退行防止テスト（`test/unit/version.test.ts`）を追加した
- 新規 TypeScript には strict（`any` 禁止）な lint・型検査を適用し、既存 JavaScript は段階移行の例外として warn 表示に留める方針を `eslint.config.mjs` とローカル `AGENTS.md` に明記した
