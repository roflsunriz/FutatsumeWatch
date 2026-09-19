# FutatsumeWatch

ニコニコ動画を別のプレイヤーで再生するユーザースクリプトです。ZenzaWatch（segabito氏・kphrx氏）の後継として、再生・コメント・プレイリストと追加機能をまとめています。

## インストールと使い方

配布ファイルは **[FutatsumeWatch.user.js](https://github.com/roflsunriz/FutatsumeWatch/raw/main/dist/FutatsumeWatch.user.js)** だけです（バージョン **0.0.2**）。

Tampermonkey / Violentmonkey / Greasemonkeyでこのリンクを開いて登録します。今回の実動作確認はTampermonkeyで実施しています。Violentmonkey・Greasemonkeyは未検証です。

1. 旧ZenzaWatch・FutatsumeWatch開発版や、以前に個別導入したHLS・GamePad・MylistPocketなどの同梱対象を無効にします。設定は削除しないでください。
2. 視聴ページ右下の **FutatsumeWatch 0.0.2** パネルで「この動画をFutatsumeWatchで再生」を押します。
3. キーワード検索・タグ検索では、動画タイトルの横にある **「FWで再生」** を押します。元の動画リンクから視聴ページへ移った場合も、右下のパネルから再生できます。
4. 再生バーから再生・一時停止・シーク・ミュート・コメント表示を操作します。設定、HLS、ゲームパッド、HeatSync、MaskedWatch、詳細設定も同じプレイヤーから開けます。

「プレイヤーを準備しています…」は初期化中です。「起動できませんでした」と表示された場合は、パネルの「再読み込み」を押してください。パネル自体がない場合はスクリプトが適用されていません。マネージャで有効になっていることを確認してページを再読み込みしてください。ZenzaWatchの操作を知っている必要はありません。

旧ZenzaWatchの設定は、新名称側に設定がない項目だけ自動で引き継ぎます。旧データは残します。

## 同梱機能

- HLS再生、コメント、プレイリスト、再生設定・詳細設定
- ゲームパッド操作、コメント密度に合わせた速度調整（HeatSync）
- コメント透過補助（MaskedWatch）、MylistPocket、マイリスト絞り込み
- ブログパーツの起動ボタン
- YouTubeでの画像保存（CapTube：Sで保存、Dを押している間は低速再生）
- 開発者向けのuQuery

ログインが必要な操作、接続したゲームパッドでの入力、ブラウザの顔・文字検出機能への依存は、環境によって確認が必要です。マイリスト絞り込みは旧ページ構造への依存が残っています。機能ごとの確認範囲は[検証記録](verification.md)を参照してください。全機能の動作確認が完了したリリースとはしていません。

## 開発

BunでVite＋vite-plugin-monkeyを実行し、TypeScriptのimportから単一ファイルを生成します。旧連結ビルダー・Babel・webpackは使いません。Vite内部のバンドラーはRolldownであり、Bun.buildを使う構成ではありません。

```powershell
bun install --frozen-lockfile
bun run lint
bun run format
bun run type-check
bun run build
bun run test
bun audit
```

ブラウザ検証用の準備と起動：

```powershell
bun run dev:setup   # 初回のみ
bun run dev         # ビルド・導入・ページ適用確認・検索/視聴からの実操作検証
bun run dev:verify:addons # 別ページ機能の通信を遮断した検証
```

`bun run dev` は登録・有効化だけで導入成功にせず、ページ上の版表示まで確認します。専用Chromeの未適用・旧版のニコニコタブも再読み込みします（入力中のタブは保護します）。検索からの遷移検証だけなら `bun run dev:verify:entry` を実行できます。

初回のTampermonkey「ユーザー スクリプトを許可する」は手動で有効化します。`bun scripts/dev-allow-userscripts.ts` で該当画面を開けます。通常のVite開発サーバーは `bun run dev:server` です。

[更新手順](how-to-update.md) / [貢献手順](CONTRIBUTING.md) / [問い合わせ](SUPPORT.md) / [セキュリティ](SECURITY.md)

## ライセンス

プロジェクトの表記はMITです。同梱ライブラリと引き継いだソースに記載されたライセンス表示は保持します。
