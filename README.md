# FutatsumeWatch

ニコニコ動画を別のプレイヤーで再生するユーザースクリプトです。ZenzaWatch（segabito氏・kphrx氏）の後継として、再生・コメント・プレイリストと追加機能をまとめています。

## インストールと使い方

配布ファイルは **[FutatsumeWatch.user.js](https://github.com/roflsunriz/FutatsumeWatch/raw/main/dist/FutatsumeWatch.user.js)** だけです（**0.0.9**）。過去の配布物は[リリース一覧](https://github.com/roflsunriz/FutatsumeWatch/releases)から取得できます。

Tampermonkey / Violentmonkey / Greasemonkeyでこのリンクを開いて登録します。今回の実動作確認はTampermonkeyで実施しています。Violentmonkey・Greasemonkeyは未検証です。

1. 旧ZenzaWatch・FutatsumeWatch開発版や、以前に個別導入したHLS・GamePad・MylistPocketなどの同梱対象を無効にします。設定は削除しないでください。
2. 視聴ページでは、タイトル・いいねボタン・投稿者プロフィール・タグの間にある **四角形が二つ重なったアイコン** を押します。
3. キーワード検索・タグ検索では、各動画タイトルのそばにある **同じアイコン** を押します。右下のポップアップはありません。
4. 動画はブラウザの表示領域いっぱいに開きます。中央のボタンで前の動画・再生／一時停止・次の動画を操作します。操作UIはマウスを動かすと表示され、未操作3秒で消えます。入力中・パネル表示中は消えません。
5. 左上のメニューは「設定」「画質」「GitHub」「その他操作」の4項目です。「設定」からタブ付きの共通設定画面を開きます。右上の紙に「i」のアイコンから動画情報・関連動画・コメント・プレイリストを開きます。背景クリックまたはEscapeでパネルを閉じます。
6. 下部でリピート、ABリピート、速度、音量、コメント表示、全画面を操作します。最下部のシークバーにはコメントの盛り上がりを表示します。ABリピートは1回目で開始A、2回目で終了B、3回目で解除します。通常リピートとABリピートはボタンで切り替えます。動画切替・プレイヤー終了でもAB指定が解除されます。

音量バーの横でコメントを入力し、Enterまたは「投稿」で送信できます（75文字まで、Shift+Enterで改行）。パレットから色・サイズ・位置を選び、コマンドの自由入力や「入力時に一時停止」も設定できます。送信失敗時は本文とコマンドを保持します。狭い画面ではフォームが音量操作の下へ移ります。未ログイン時や過去ログ表示中は投稿できない理由を表示します。

設定画面は960×720pxを基本とした固定サイズです。左サイドバーでプレイヤー、コメント・フォント、NG・フィルター、設定の入出力、詳細設定、HLS、MaskedWatch、GamePad、HeatSyncを切り替えます。一般設定の折りたたみはなく、本文だけをスクロールできます。小さい画面では画面内に収まる寸法へ縮めます。

背景をぼかし、背景クリック・右上の×・Escapeで閉じられます。パネル内の操作では閉じず、全画面再生中も利用できます。タブは上下キーでも切り替えられます。HLSの保存ボタンなど、各設定の保存方法は従来どおりです。

ボタンの説明・準備状態は、マウスを重ねたときのツールチップと読み上げ用ラベルで確認できます。起動に失敗した場合はページを再読み込みしてください。アイコンが出ない場合は、マネージャで有効になっていることも確認してください。

旧ZenzaWatchと以前のFutatsumeWatchの設定は、新名称側に設定がない項目だけ自動で引き継ぎます。HLS・GamePad・プレイリスト・前回の再生状態・MylistPocketの同期設定も対象です。移行済みの設定をリセットしていた場合は旧値を復活させません。旧データは復旧用に残します。

外部スクリプトとの連携名もFutatsumeWatchに統一しました。旧名称のAPI・イベント・CSSに依存する連携は更新が必要です。YouTubeへの切替機能の名称はFutatsumeTubeです。

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

手動検証用のブラウザを起動：

```powershell
bun run dev       # 必要な環境の準備・ビルド・headed Chrome起動・TMとスクリプトの導入
bun run dev:stop  # 手動検証用Chromeを終了
```

`bun run dev`はTampermonkeyへの登録・有効化までで終了し、表示したブラウザをそのまま操作できます。動画ページへの移動、再生、設定変更、自動テスト、既存タブの再読み込みは行いません。更新前から開いているページは、必要なタイミングで手動で再読み込みしてください。音声を含めて手動検証できるよう、ブラウザの音声はミュートしません。

初回のTampermonkey「ユーザー スクリプトを許可する」は手動で有効化します。`bun scripts/dev-allow-userscripts.ts`で該当画面を開けます。導入後のページへの適用確認が必要な場合だけ`bun run dev:check`を実行してください。通常のVite開発サーバーは`bun run dev:server`です。ブラウザ・TMの取得済みファイルは再利用し、更新したい場合は`bun run dev:setup`を明示実行します。

自動テストは別のコマンドで実行します：

```powershell
bun run test:browser          # ビルド後、別のheadless Chromeですべてのブラウザテスト
bun run test:browser player   # 再生・コメント・保存
bun run test:browser settings # 設定の実入力・保存・復元
```

対象は`all`（既定）、`entry`、`player`、`ui`、`settings`、`migration`、`addons`から選べます。自動テストは手動用のタブ・設定・プロファイルを共有せず、成功・失敗のどちらでもテスト用Chromeを終了します。強制中断などで残った場合は`bun run test:browser:stop`で停止できます。従来の`dev:verify*`も、この分離した自動テストを呼び出します。

[更新手順](how-to-update.md) / [貢献手順](CONTRIBUTING.md) / [問い合わせ](SUPPORT.md) / [セキュリティ](SECURITY.md)

## ライセンス

プロジェクトの表記はMITです。同梱ライブラリと引き継いだソースに記載されたライセンス表示は保持します。
