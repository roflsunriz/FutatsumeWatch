# ZenzaWatch

Ginzaから独立して単体で動くHTML5版ニコニコ動画プレイヤーです。
Greasemonkeyスクリプトとして動作します。

## ライセンス

`master` から分岐させたコードにライセンスするなら CC0 あるいは WTFPL あたり

## インストール

[dist](/dist) から `*.user.js` を開き raw ボタンを押すことでインストールできます

## フィードバック

雑にDiscussionsでコメントしたり、バグの原因がわかってたらIssue開いたり

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
