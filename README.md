# FutatsumeWatch

ニコニコ動画を別のプレイヤーで再生するユーザースクリプトです。ZenzaWatch（segabito氏・kphrx氏）の後継として、再生・コメント・プレイリストと追加機能をまとめています。

## インストールと使い方

配布ファイルは **[FutatsumeWatch.user.js](https://github.com/roflsunriz/FutatsumeWatch/raw/main/dist/FutatsumeWatch.user.js)** だけです（ローカル開発版 **0.0.7**。公開リンクへの反映はプッシュ後です）。

Tampermonkey / Violentmonkey / Greasemonkeyでこのリンクを開いて登録します。今回の実動作確認はTampermonkeyで実施しています。Violentmonkey・Greasemonkeyは未検証です。

1. 旧ZenzaWatch・FutatsumeWatch開発版や、以前に個別導入したHLS・GamePad・MylistPocketなどの同梱対象を無効にします。設定は削除しないでください。
2. 視聴ページでは、タイトル・いいねボタン・投稿者プロフィール・タグの間にある **四角形が二つ重なったアイコン** を押します。
3. キーワード検索・タグ検索では、各動画タイトルのそばにある **同じアイコン** を押します。右下のポップアップはありません。
4. 動画はブラウザの表示領域いっぱいに開きます。中央のボタンで前の動画・再生／一時停止・次の動画を操作します。操作UIはマウスを動かすと表示され、未操作3秒で消えます。入力中・パネル表示中は消えません。
5. 左上のメニューから一般設定、詳細設定、画質、HLS、MaskedWatch、GamePad、HeatSyncを開きます。右上の紙に「i」のアイコンから動画情報・関連動画・コメント・プレイリストを開きます。背景クリックまたはEscapeでパネルを閉じます。
6. 下部でリピート、ABリピート、速度、音量、コメント表示、全画面を操作します。最下部のシークバーにはコメントの盛り上がりを表示します。ABリピートは1回目で開始A、2回目で終了B、3回目で解除します。通常リピートとABリピートはボタンで切り替えます。動画切替・プレイヤー終了でもAB指定が解除されます。

設定画面は960×720pxを基本とした固定サイズです。左サイドバーでプレイヤー、コメント・フォント、NG・フィルター、設定の入出力、詳細設定、HLS、MaskedWatch、GamePad、HeatSyncを切り替えます。一般設定の折りたたみはなく、本文だけをスクロールできます。小さい画面では画面内に収まる寸法へ縮めます。

背景をぼかし、背景クリック・右上の×・Escapeで閉じられます。パネル内の操作では閉じず、全画面再生中も利用できます。タブは上下キーでも切り替えられます。HLSの保存ボタンなど、各設定の保存方法は従来どおりです。

ボタンの説明・準備状態は、マウスを重ねたときのツールチップと読み上げ用ラベルで確認できます。起動に失敗した場合はページを再読み込みしてください。アイコンが出ない場合は、マネージャで有効になっていることも確認してください。ZenzaWatchの操作を知っている必要はありません。

旧ZenzaWatchの設定は、新名称側に設定がない項目だけ自動で引き継ぎます。旧データは残します。

## 同梱機能

- HLS再生、コメント、プレイリスト、再生設定・詳細設定
- ゲームパッド操作、コメント密度に合わせた速度調整（HeatSync）
- コメント透過補助（MaskedWatch）、MylistPocket、マイリスト絞り込み
- ブログパーツの起動ボタン
- YouTubeでの画像保存（CapTube：Sで保存、Dを押している間は低速再生）
- 開発者向けのuQuery

コメント描画には[comment-overlay](https://github.com/roflsunriz/comment-overlay)を同梱しています。NG、フォント・速度・透明度の設定、投稿者コメントの秒数指定、コメント付き画像保存を引き継ぎます。コメントのHTML保存は、保存後も通信なしで再生・停止・シークできます。配置は新エンジンの規則に統一し、旧Flashスロットの切替は廃止しました。影の種類はCanvasで表現するため、旧版と外観が異なります。

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
bun run dev:verify:ui     # 新UIの実操作・左右パネル・設定・画面サイズ検証
bun run dev:verify:settings # 6種類の設定の開閉・保存・共通デザイン検証
```

`bun run dev` は登録・有効化だけで導入成功にせず、ページに埋め込んだ版情報まで確認します。専用Chromeの未適用・旧版のニコニコタブも再読み込みします（入力中のタブは保護します）。検索からの遷移検証だけなら `bun run dev:verify:entry` を実行できます。

初回のTampermonkey「ユーザー スクリプトを許可する」は手動で有効化します。`bun scripts/dev-allow-userscripts.ts` で該当画面を開けます。通常のVite開発サーバーは `bun run dev:server` です。

[更新手順](how-to-update.md) / [貢献手順](CONTRIBUTING.md) / [問い合わせ](SUPPORT.md) / [セキュリティ](SECURITY.md)

## ライセンス

プロジェクトの表記はMITです。同梱ライブラリと引き継いだソースに記載されたライセンス表示は保持します。
