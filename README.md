# FutatsumeWatch

Ginzaから独立して単体で動くHTML5版ニコニコ動画プレイヤーです。
Greasemonkeyスクリプトとして動作します。
ZenzaWatch（segabito氏・kphrx氏）の流れを引き継ぐ後継です。

## インストール

[dist](/dist) から `FutatsumeWatch.user.js` を開き raw ボタンを押すことでインストールできます

- 安定版: `dist/FutatsumeWatch.user.js`
- 開発先行版: `dist/FutatsumeWatch-dev.user.js`
- 関連: `dist/FutatsumeHLS.user.js`、`dist/FutatsumeGamePad.user.js`、`dist/FutatsumeBlogPartsButton.user.js`、`dist/FutatsumeAdvancedSettings.user.js`

## フィードバック

雑にDiscussionsでコメントしたり、バグの原因がわかってたらIssue開いたり

## ライセンス

`LICENSE` は未整備（`package.json` は MIT、`README.md` の旧記載は CC0/WTFPL で矛盾）。利用者の判断が必要なため独断で作成しない（`AGENTS.md` 移行バックログ参照）。

## 開発者向け

Bun を使用する。検証は次のコマンドで行う（詳細は `verification.md`）。

```powershell
bun install
bun run lint
bun run format
bun run type-check
bun run build
bun run test
```

TypeScript 移行中のため、既存 JavaScript には段階移行の例外規定がある（`eslint.config.mjs`、`AGENTS.md` を参照）。

### ブラウザでの動作確認（開発版＋Tampermonkey）

初回のみ拡張機能と自動化バイナリを取得する。2回目以降は `bun run dev` だけで起動から実測まで行える。

```powershell
bun run dev:setup   # 初回のみ（TM取得・Chrome for Testing取得）
bun run dev         # ビルド→dev用Chrome起動（headed）→TMへ自動インストール→sm9で実測
```

個別実行もできる（`dev:browse` 起動、`dev:install` 導入、`dev:verify` 実測、`dev:stop` 停止）。初回は TM の「ユーザー スクリプトを許可する」有効化だけ手動で行う（`bun scripts/dev-allow-userscripts.ts` が拡張ページを開く）。詳細は `verification.md`。
