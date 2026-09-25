# FutatsumeWatch

ZenzaWatch 後継ユーザースクリプト。どこからでも動画をその場で再生。

## インストール

**Version 0.0.24**

**[FutatsumeWatch.user.js](https://github.com/roflsunriz/FutatsumeWatch/raw/main/dist/FutatsumeWatch.user.js)**

## 使い方

1. Tampermonkey ([Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=ja)) ([Firefox](https://addons.mozilla.org/ja/firefox/addon/tampermonkey/)) / Violentmonkey ([Chrome](https://chromewebstore.google.com/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag)) ([Firefox](https://addons.mozilla.org/ja/firefox/addon/violentmonkey/)) / Greasemonkey ([Firefox](https://addons.mozilla.org/ja/firefox/addon/greasemonkey/)) をブラウザにインストールする
2. 上記リンクを開くとユーザースクリプトマネージャが自動でユーザースクリプトをインストールする
3. ニコニコ動画・Nアニメ等の動画リンクや、ニコ百の埋め込みサムネイルに現れる起動ボタンをクリックし、再生
4. スクリプトマネージャでFutatsumeWatchを選択し、随時更新を手動チェック (自動チェックも可能)

## 同梱機能

- メンテナンスしやすい機能のみに限定。意図的に複雑な機能は削除。

## 特徴

- TypeScript製なので、論理エラー以外の実行時エラーは基本的にない。
- 豊富な結合テスト・単体テストで検証済み。
- 主要機能を手動テスト済み。（全部とは言っていない）
- 現代的なユーザーインターフェース。モバイル環境でも利用可能。
- comment-overlayエンジンによる高いコメントアート互換性。

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

## 依存更新の自動処理

Dependabot は対象の依存関係を毎週確認します。patch／minor 更新は PR のチェック（Quality）が成功した後に自動で squash merge されます。CI の失敗ジョブは 1 回だけ再実行します。再失敗した PR は残して手動で修正します。major 更新は手動で確認します。
