# 変更履歴

書式は Keep a Changelog に従う。日付は `YYYY-MM-DD` 形式で記載する。

## [Unreleased]

### Added

- TypeScript 移行の基盤を追加し、`bun run lint`、`bun run format`、`bun run type-check`、`bun run build`、`bun run test` を実行できるようにした
- 既存の連結ビルド（`build.js`）を Bun から呼び出して生成物を検証する TypeScript の入口（`scripts/build.ts`）を追加し、製品経路との接続を確保した
- ユーザースクリプトのヘッダー検証に使う型安全な版管理基盤（`src/version.ts`）と退行防止テスト（`test/unit/version.test.ts`）を追加した
- 新規 TypeScript には strict（`any` 禁止）な lint・型検査を適用し、既存 JavaScript は段階移行の例外として warn 表示に留める方針を `eslint.config.mjs` とローカル `AGENTS.md` に明記した
- 連結ビルド（`build.js`）に TypeScript 解決・トランスパイル対応を追加し、生成物全体へ `node --check` 構文検証を導入した（製品コードの挙動は不変）
- 参照のないデッドコード `src/yomi` を削除し、解決不能だった import 4件を実在パスへ修正した（`boot` の `GateAPI` など。挙動不変）
- `src`・`packages`・`test` の全ソースを TypeScript 化し（`any` ゼロ、strict 維持）、`bun:test` へ移行した退行防止テスト群を追加した（103件 passing）
- テスト環境 `test/setup.ts`（`bun test --preload`）を追加し、ブラウザー由来グローバル（`localStorage`・`location`・`_`・`CSS`・`console.nicoru`）の最小実装を与えた（製品コード側は不変）

### Changed

- 連結ビルドの import 解決を正規表現から TypeScript AST 方式へ強化し、複数行 import・`import type`・別名に対応した（transpile による型のみ import 除去で解決漏れが起きないよう、解決マップは原文から生成する）
- `packages/components/src/dll.ts` の `https://esm.run/lit` 静的 import を npm の `lit` へ切り替え、オフラインの `bun test` でも解決できるようにした（連結時は import 行自体が除去されるため製品出力は不変）
- `VideoSearch` の `dateFrom`/`dateTo` で `Date` 受領を型で明示した（実行時は従来どおり epoch 換算で同一）
- 陳腐化した `VideoInfo` テスト（2016年の flvInfo 判定）を現行の domand/dmc 判定仕様で書き直し、実スナップショット由来の入力組み立てに変えた（期待値の緩和なし）
- 旧スクリプト `test:mocha`・`build:legacy`・`test:browser` を削除し、`bun test --preload ./test/setup.ts` に一本化した

### Removed

- 存在しない API（`src/loader/Storyboard` 等）を参照し、当初から読み込めなかった `Storyboard` 系テストを削除した
- mocha 基盤（`test/setup.js`・`test/mocha.opts`）を退役させた
- 参照のない実験コード `src/yomi` を削除した（上記 Added と重複するが履歴として明記）
