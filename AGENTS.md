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

- `src` と `dist` の乖離解消が最優先。現 `src` から `build.js` を実行すると `dist/ZenzaWatch.user.js` が約300行しか生成されず、コミット済み（約33652行）を再現できない。`_template.js` が参照する `packages/lib/src/Emitter` などが存在しない。検証は `verification.md` の既知事項を参照し、`dist` を壊したら `git checkout -- dist/` で復元する。
- `src/_hls.js:773` の束縛なし `stats` 参照（潜在 `ReferenceError`）は別タスクで上流差分と実機検証のうえ修正する。`bun run lint` では warn として残る。
- `.eslintignore` は eslint 10 で無効（警告のみ）。旧 `.eslintrc` 系と `.babelrc` は Bun 移行完了時に削除する。
- `LICENSE` が未整備（`package.json` は MIT、`README.md` は CC0/WTFPL と記載が矛盾）。利用者の判断が必要なため独断で作成しない。
- リリース手順書（`how-to-update.md`）は未整備。`src`/`dist` 乖離がある現状で手順を確定できないため、乖離解消後に作成する。
