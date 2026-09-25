# 機能検証用フィクスチャ

実サーバーに書き込まず、配布物からの操作・通信・再生を検証するための加工済みデータ。現行サービスへの受理・認証成功を保証するものではない。

- `watch-row.html`: 2026-09-20、専用headless Chromeで `https://www.nicovideo.jp/watch/sm9` の描画後DOMから、h1と投稿者プロフィールを含む最も近い行を読み取り採取。画像を固定SVGへ、タイトルを検証用文言へ置換し、inline styleを除去した。生成クラスは資料として保持し、テストの選択には使用しない。
- `watch-response.json`: 既存 `../cdp/scenes/watch-sm9-cdp.json` の `meta[name=server-response]` に含まれるAPI構造を基礎とする。以前のマスキングで `0.[TOKEN]` になった音声メタデータの数値は0へ補正したうえで、不要な広告・追跡メタデータを除外。viewer・追跡ID・各キー・動画本文・画像をダミー化し、64秒の生成映像に合わせた2画質へ置換した。値は実動画の検証値として利用しない。
- 視聴HTMLは採取元の`server-response`の`meta.status=200`と`data.response.okReason=PURELY`も保持する。これを省くと製品が検索等のページとして初期化し、設定・前回状態の経路が実サイトと異なる。本文を含むAPI応答は別の登録済み要求から返す。
- 認証回帰の`auth.pageMetadata=false`だけは、2026-09-21の実測に合わせてCommonHeaderとserver-responseを省く。API viewerを取得後、投稿欄・一般会員・guest表示へ反映する経路を確認する。本人のIDや認証値は使わない。
- `nicodic-articles.json`: 2026-09-20に公開記事APIで確認した記事ID・URL・状態だけを保持する。記事本文は保存しない。watch情報の誤falseを記事照会で補正するケースと、404・取得失敗の区別に使用する。合成フィクスチャ専用のタグ（thumbinfoの`検証`等）は記事なしの404として記録し、実在の記事ID・URLは捏造しない。
- 動画IDはsm9・sm2057168・sm100の3件だけ登録。APIの書き込みと再取得は `scripts/offline-site.ts` / `offline-library.ts` の隔離した状態内で完結する。コメント本文・投稿者は生成データ。検索画面の簡略DOMとSPA履歴処理は人工的なページ側の再現であり、公式SPA実装そのものではない。
- `media/<動画ID>/`: FFmpegの `testsrc2` / `hue` / `drawbox` と `sine` から生成したH.264/AACのHLS。全10fpsで、IDごとの長さ・比率・模様・色マーカーを `media-spec.ts` に定義する。sm9は64秒・16:9・赤、sm2057168は40秒・4:3・緑、sm100は24秒・3:4・青。各IDに低画質と高画質を持ち、配信URLもIDを含む。実デコード寸法・長さと、映像内の20%/80%位置のマーカー画素を確認し、IDだけ切り替わって同じ映像が残る退行を検出する。MPEG-TSの拡張子はTypeScriptと混同しない `.mpegts`。公開動画の映像は含めない。

## 映像の再生成

FFmpeg（libx264/AACエンコーダ付き）を用意し、リポジトリ直下で実行する。

```powershell
$env:FFMPEG_PATH = '実際のffmpeg.exeの絶対パス'
bun scripts/generate-test-media.ts
```

初回生成はFFmpeg 9.0.1。通常の自動テストではチェックイン済み映像を読むため、FFmpegのインストールや外部通信は不要。再生成した場合は全ファイルの差分・容量・実HLS再生・画質切替を確認する。エンコーダ版によるバイナリ差分を自動的に正常と扱わない。

実行時はCDPで登録済みの応答を供給し、未登録要求を失敗させる。ブラウザの禁止プロキシも併用し、捕捉されない経路が公開ネットワークへ出ないようにする。実サイト採取用のプロファイルをオフラインテストと共有しない。
