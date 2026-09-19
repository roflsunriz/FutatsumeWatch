# AGENTS.md

## 作業開始前の必須手順（最優先・例外なし）

1. エージェントは、調査、計画、コマンド実行、スキル利用、ファイル編集、コミット、プッシュを始める前に、必ずリポジトリ直下の `.\COMMON-AGENTS.md` を開き、先頭から末尾まで全文を読む。
2. `COMMON-AGENTS.md` はGit管理外のシンボリックリンクである。`git`や既定のignore設定が有効な`rg --files`の検索結果だけで、ファイルが存在しないと判断してはならない。PowerShellでは最初に次を実行する。

```powershell
Get-Content -Raw -LiteralPath .\COMMON-AGENTS.md
```

3. 読み取りに失敗した場合、出力が省略された場合、または末尾まで読めたことを確認できない場合は、一切の作業を開始せず、パスとシンボリックリンク先を確認して全文を再取得する。必要なら分割して末尾まで読む。
4. 全文を読了するまで、ローカル `AGENTS.md` だけを根拠に作業を続けてはならない。読了後は `COMMON-AGENTS.md` を最優先の指針とし、読了直後の最初の進捗報告で全文を読了したことを明示する。
   このファイルでは `FutatsumeWatch` 固有の補足だけを記載する。

## 歴史的な説明

- https://github.com/segabito/ZenzaWatch の segabito 氏が開発していたニコニコ動画用 ZenzaWatch（外部HTML5プレーヤー）※実質開発終了
- フォーク版の https://github.com/kphrx/ZenzaWatch の kphrx 氏メンテナンスの ZenzaWatch ※コミットが活発でない
- その流れを引き継ぐのがこのFutatsumeWatchである。
- 落語に於いて、「前座見習い」「前座」「二つ目」「真打」というのがあり、真打に近いほどプロとして認められている、という階級がある。その「前座」と「二つ目」の関係性から命名した。

## 初期の方針、方向性

- Typescript, eslint, prettier, bunバンドラー使用にする
- 型安全（曖昧な型なし, anyなし, unknown極力なし）
- distフォルダにプッシュでリリースとする
- プッシュの度にバージョンを上げる
- リリースタグもプッシュし、リリースに変更点（CHANGELOG抜粋）を明記
- ユーザースクリプトのdescriptionに簡易な機能の説明、使い方説明、変更の要点（CHANGELOG抜粋）を明記
- READMEにTampermonkey, Violentmonkey, Greasemonkeyで購読できるようにリンクを置く（バージョンも併記し、プッシュの度更新）
- 自動テストで品質を確保（単体テスト、結合テスト、E2Eテスト、機能テスト）
- COMMON-AGENTS明記のドキュメント整備
- 後述の問題報告場所を監査して問題として吸い上げ修正

## 現在の問題の報告されている場所

- このリポジトリのIssue, PullRequest
- 各上流リポジトリのIssue, PullRequest
- https://dic.nicovideo.jp/a/zenzawatch の掲示板

## 最新のニコニコ動画に対する実装の基準点

- %LOCALAPPDATA%\NicoCache_nl (roflsunriz/NicoCache_nl) の src
- %HOMEDRIVE%\filter-matome (roflsunriz/filter-matome) の local/features/src または local/features/src/sandbox （公式資産キャプチャとドキュメント）
- またはChrome CDPによる公式資産キャプチャ、de-minify、実リクエストキャプチャ
- 公式資産の世代間の汎用性確保

## ZenzaWatch機能紹介(2016年)

- https://tonkuma.hatenablog.com/entry/2016/09/07/224758

## TypeScript移行の記録（2026-09-18〜）

### 基盤（第1段階・完了）

- `tsconfig.json`（strict、`allowJs` 移行期、`checkJs: false`）、`eslint.config.mjs`（flat、新規TSはstrict、既存JSは段階移行の例外）、`.prettierrc.json`、5種のBunスクリプト（`lint`/`format`/`type-check`/`build`/`test`）を整備した。
- `scripts/build.ts` が既存 `build.js`（`//@require` 連結方式）へ委譲し、`dist` の `==UserScript==` と `@version` を検証する。製品経路への接続点である。
- `src/version.ts` と `test/unit/version.test.ts`（`bun test`）が退行防止の起点である。
- 従来の mocha テストは `bun run test:mocha` に退避した。
- `typescript` は5系に固定する。7系は `typescript-eslint` が未対応のため `--dev` 導入時に下げる判断をした（`package.json` 参照）。

### 段階移行の例外規定（共通ルール「ローカル AGENTS.md との関係」の条件を満たす範囲）

- 対象の共通ルール: strictなlint・formatの全面適用。
- 例外の理由: 2016年由来の連結スコープ資産（`//@require` 連結・CDN由来グローバル・ビルダー注入値）へ2026年の recommended を一括 error 適用すると、基盤整備と無関係な数百件改修が必要になる。
- 適用範囲: 既存 `.js` のみ。新規 `.ts` は strict（`any` 禁止）を維持する。
- 同等の品質を保つ代替手段・検証: 既存違反は warn 表示を維持し、ファイル単位のTS変換時に strict を適用して解消する。`bun run lint` は error 0件を門番とする。除外は `eslint.config.mjs` と `.prettierignore` に理由付きで記載する。

### 移行バックログ（次の作業者向け）

- `src` と `dist` の乖離は縮小した。`build.js` の import 解決を AST 方式に強化後は `dist/ZenzaWatch.user.js` が約35052行生成され、正規規模に回復した（以前の約300行は prettier 複数行 import への未対応が原因）。ただしコミット済み（約33652行）との差分比較は未実施のため、`dist` 再生成時は `git checkout -- dist/` で復元できる状態を保ち、差分比較を検証に加えること（`verification.md` 参照）。
- `src/_hls.ts` の束縛なし `stats` 参照（潜在 `ReferenceError`）は別タスクで上流差分と実機検証のうえ修正する。`@ts-expect-error` で温存している。
- `src/boot.ts` が呼ぶ `GateAPI.exApi()` は上流3系統（segabito/kphrx/現行）いずれにも存在しないことを一次情報で確認済みのため、別タスク化が確定した。`@ts-expect-error` で温存している。
- 1000行超ファイル（`_pocket`・`VideoInfoPanel`・`NicoVideoPlayerDialog` 等9件）は構造不変で TS 化した。責務分離は退行防止テストを先行させる必要があるため別タスクとする。
- `NetUtilLike` 等の波間で重複した最小 interface、`CommentPlayerParams` 等の不足型は、他波の型拡充で自然解消する見込み。無理な共通化はしない。
- `.eslintignore` は eslint 10 で無効（警告のみ）。旧 `.eslintrc` 系と `.babelrc` は Bun 移行完了時に削除する。
- `LICENSE` が未整備（`package.json` は MIT、`README.md` は CC0/WTFPL と記載が矛盾）。利用者の判断が必要なため独断で作成しない。
- リリース手順書（`how-to-update.md`）は未整備。`src`/`dist` 差分比較の検証が完了してから作成する。
- mocha は退役済み（`test/setup.js`・`test/mocha.opts`・`test:mocha`・`build:legacy`・`test:browser` スクリプトを削除）。babel/webpack/mocha の依存自体は将来の整理対象として残置する。

### 変換規約（TS化の作業者向け）

- ランタイムコードは同一に保ち、型注釈・interface・`import type` の追加に留める。`any` 禁止、`unknown` は境界のみ＋型ガードで絞り込む。
- `//==BEGIN==`/`//==END==` マーカーと `//@require` 解決を壊さない。import/export 文と型宣言はマーカー外に置く。
- transpile 分離方式のため `enum`・`namespace`・パラメータープロパティ・デコレーターは禁止。型の再 export は `export type` 形式にする。
- 連結由来グローバル（`$`・`_`・`VER`・`ENV` 等）は `src/concat-globals.d.ts` を使う。同ファイルの追記は競合回避のため `src` 波の担当に集約する。
- `build.js` の import 解決は原文ベースの AST 方式である。transpile は型のみ import を除去するため、解決マップの生成元とスキップ範囲の生成元を使い分けている。安易な正規表現に戻さないこと。
- テスト環境は `test/setup.ts`（`bun test --preload`）でブラウザー由来グローバル（`localStorage`・`location`・`_`・`CSS`・`console.nicoru`）の最小実装を与える。製品コード側をテスト用に変えないこと。`Config` の restore 待ちが必要なテストは製品の起動順序と同じく `await Config.promise('restore')` してから対象を動的 import する。

### 全面変換（第2段階・完了）

- 9波の並列作業で `src`・`packages/*/src`・`packages/components/mock`・`test` の `.js` を `.ts` 化した（lib-core / lib-nico / zenza / components / src-small / giant-a・b・c / test）。作業メモは `subagents/*/MEMO.md` に残し、要点を本文書へ統合後に整理する。
- 検証は `bun run lint`（error 0件）・`format`・`type-check`・`build`（`node --check` 付き）・`bun test`（103件 passing）で全通過。`any` はコード内にゼロ。
- 存在しない API を参照していたテスト（`Storyboard` 系）は削除し、陳腐化した期待値（`VideoInfo` の2016年判定）は現行仕様で書き直した。いずれも理由を `verification.md` とコミット文に記録している。

### FutatsumeWatch改名とCDP基盤（2026-09-19〜）

- `src/FutatsumeWatchIndex.ts` を正本化し `PRODUCT='FutatsumeWatch'` に切替えた。`src/ZenzaWatchIndex.ts` は互換シムとして残す。旧保存キー（`ZenzaWatchPlaylist`・`ZenzaWatch_PlayingStatus`）・旧メッセージ（`ZenzaWatch_`）・旧イベント（`ZenzaWatchInitialize`）・旧window名は読替互換を維持し、DOM ID・CSS・イベント名前空間（`ZenzaWatchVideoPlayerContainer` 等）は互換のため温存する（`verification.md` 参照）。
- `build.js` の出力と `src/_*.ts` の `==UserScript==` を新リポジトリ（`https://github.com/roflsunriz/FutatsumeWatch/`・`downloadURL .../raw/main/dist/...`）へ寄せた。`dist/Zenza*.user.js` 6件は削除し `FutatsumeWatch.user.js` 系へ置換した。`package.json` の `main` は `src/FutatsumeWatchIndex.ts` を指す。
- CDP基盤は `test/fixtures/cdp/`（`network-policy.ts`・`scene.ts`・`offline.ts`・`scenes/watch-basic-sm9.json`・`scenes/hls-playback-sm9.json`）と採取雛形 `scripts/cdp-capture.ts` で構成する。実ページ採取は `chrome-debug.ps1` 起動後の手動実行が前提で、現行シーンは最小再現に留める。`installOfflineScene` は未登録・広告系を例外にして外部へ出さない。
- 製品コードを直接 import するテストは `window` 前提の依存（`Observable.ts` 等）を引くため、改名固定は原文照合に留め静的 import を避けること（`test/unit/futatsume-branding.test.ts`）。
- 実ページのメディア配信は環境の NicoCache 系プロキシ（`nicocachenl.test`）経由になる場合がある。採取時は `nicocachenl.test`・映像セグメント（`.cmfv`・`playback-sessions/*/files/`）・静的資産（JS/CSS/フォント/画像）を除外し、`nvapi`・コメント・`m3u8` プレイリストに絞って curated 化すること（2026-09-19 実測、Chrome headless 153、sm9、生235件→17件）。
- `nvapi` の `access-rights` とコメント取得（`public.nvcomment`）は POST である。オフライン照合のテストは実測メソッドに合わせること（GET では `matchFixture` が当たらない）。
- コメント取得の body 打ち切りは完全なコメント単位で行い、末尾に `]}]}}` を補って JSON 妥当に修復すること。中途半端な切断は後のパース系テストを壊す。
- `bun run format` は改名前に既存2件（`packages/lib/src/css/css.ts`・`src/Config.ts`）で非準拠だった。改名で触れた `.ts` は `prettier --write` で準拠化した。`test/fixtures` と `packages/components/mock` は `.prettierignore` の対象外・対象を維持する。
