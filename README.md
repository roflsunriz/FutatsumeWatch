# FutatsumeWatch

ZenzaWatch 後継ユーザースクリプト。どこからでも動画をその場で再生。

## インストール

**Version 0.0.19**

**[FutatsumeWatch.user.js](https://github.com/roflsunriz/FutatsumeWatch/raw/main/dist/FutatsumeWatch.user.js)**

## 使い方

1. Tampermonkey / Violentmonkey / Greasemonkeyで上記リンクを開き、ユーザースクリプトをインストールする
2. ニコニコ動画・Nアニメ等の動画リンクや、ニコ百の埋め込みサムネイルに現れる起動ボタンをクリックし、再生

## 同梱機能

- Domand HLS動画再生、コメント表示・投稿、プレイリスト、マイリスト操作、スクリーンショット、ブログ埋め込み起動を単一スクリプトに同梱
- 設定は実作用を検証できる36項目に限定。HLSの調整画面、MaskedWatch、GamePad、HeatSyncは搭載しない

## バグ報告・機能提案

[Issue](https://github.com/roflsunriz/FutatsumeWatch/issues)

## コード提案

[PullRequest](https://github.com/roflsunriz/FutatsumeWatch/pulls)

## 開発

BunでVite＋vite-plugin-monkeyを実行し、TypeScriptのimportから単一ファイルを生成。

```powershell
bun install --frozen-lockfile
bun run lint
bun run format
bun run type-check
bun run build
bun run test
bun audit
```

手動検証用のブラウザを起動：

```powershell
bun run dev       # 必要な環境の準備・ビルド・headed Chrome起動・TMとスクリプトの導入
bun run dev:stop  # 手動検証用Chromeを終了
```

`bun run dev`は手動検証用。

自動テスト：

```powershell
bun run test:browser          # ビルド後、別のheadless Chromeでオフラインのブラウザテスト
bun run test:browser player   # 再生・コメント・保存
bun run test:browser settings # 設定の実入力・保存・復元
bun run test:browser player --live # 実サイトの読み取り・再生検証を明示実行
```

[更新手順](how-to-update.md) / [貢献手順](CONTRIBUTING.md) / [問い合わせ](SUPPORT.md) / [セキュリティ](SECURITY.md)

## ライセンス

MIT LICENSE
