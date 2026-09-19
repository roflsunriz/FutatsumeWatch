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
- CDP記録再生のオフライン基盤を追加し、不要通信の遮断と必要通信の固定を可能にした（`test/fixtures/cdp/network-policy.ts`・`scene.ts`・`offline.ts`、採取雛形 `scripts/cdp-capture.ts`、初期シーン `watch-basic-sm9.json`・`hls-playback-sm9.json`）
- 機能別テストにオフライン解決と改名退行防止を追加した（`test/unit/cdp-offline.test.ts`・`test/unit/futatsume-branding.test.ts`、116件 passing）
- CDP実測シーン `test/fixtures/cdp/scenes/watch-sm9-cdp.json` を追加し、sm9 の watch HTML・`nvapi`・コメント186件・HLSプレイリスト3件を署名除去のうえ固定した（静的資産・映像セグメント・環境依存は除外）
- 開発版のブラウザ実測基盤を追加し、`bun run dev` でビルドからdev用Chrome起動・Tampermonkey自動インストール・sm9実測まで行えるようにした（`scripts/dev-*.ts`、初回の User Scripts 許可のみ手動）

### Changed

- ZenzaWatch から FutatsumeWatch へ全面改名し、製品定数・版管理・ビルド定義・全ユーザースクリプトのメタデータを新リポジトリへ寄せた（`src/FutatsumeWatchIndex.ts` を正本化し `src/ZenzaWatchIndex.ts` は互換シムに、旧保存キー・旧メッセージ・旧イベント・旧window名は読替互換を維持、機能ID・DOM ID・CSS は互換のため温存）
- `dist/ZenzaWatch.user.js` 系を `dist/FutatsumeWatch.user.js` 系へ置き換え、関連4種を `FutatsumeHLS`・`FutatsumeGamePad`・`FutatsumeBlogPartsButton`・`FutatsumeAdvancedSettings` に改名した（旧 dist は削除）

- 連結ビルドの import 解決を正規表現から TypeScript AST 方式へ強化し、複数行 import・`import type`・別名に対応した（transpile による型のみ import 除去で解決漏れが起きないよう、解決マップは原文から生成する）
- `packages/components/src/dll.ts` の `https://esm.run/lit` 静的 import を npm の `lit` へ切り替え、オフラインの `bun test` でも解決できるようにした（連結時は import 行自体が除去されるため製品出力は不変）
- `VideoSearch` の `dateFrom`/`dateTo` で `Date` 受領を型で明示した（実行時は従来どおり epoch 換算で同一）
- 陳腐化した `VideoInfo` テスト（2016年の flvInfo 判定）を現行の domand/dmc 判定仕様で書き直し、実スナップショット由来の入力組み立てに変えた（期待値の緩和なし）
- 旧スクリプト `test:mocha`・`build:legacy`・`test:browser` を削除し、`bun test --preload ./test/setup.ts` に一本化した

### Fixed

- ユーザースクリプトの `description` に機能説明・使い方・変更要点を明記し、ローカル `AGENTS.md` の方針に沿わせた（安定版・DEV版とも。READMEの購読リンクもバージョン併記に更新）

- 生成物に混入していた静的 `export` 宣言3件を除去し、classic script として起動できるようにした（安定版・DEV版とも起動しない実害があった。原因は `requireFile` の `skipExports=false` 固定で、`node --check` はモジュール検出で通過するため検出できなかった。`scripts/build.ts` に AST 直接検出を追加し再発を防止する）
- ビルド書き込みの非同期消失を修正し、`dist` が確実に更新されるようにした（プロセス終了時に書き込みが失われることがあった）
- 連結範囲の抽出を原文の BEGIN/END 基準に修正し、transpile による先頭コメント消失や文移動での定義漏れを解消した（`AntiPrototypeJs` 未定義で起動しない実害があった）

### Removed

- 存在しない API（`src/loader/Storyboard` 等）を参照し、当初から読み込めなかった `Storyboard` 系テストを削除した
- mocha 基盤（`test/setup.js`・`test/mocha.opts`）を退役させた
- 参照のない実験コード `src/yomi` を削除した（上記 Added と重複するが履歴として明記）
