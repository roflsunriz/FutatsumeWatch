# 更新手順

## 前提

BunとGitを用意し、リポジトリ直下で作業します。ブラウザ検証の起動補助はWindows用です。TypeScriptのバージョンや依存関係はpackage.jsonとbun.lockを正本とします。

## ビルドと検証

実サイトへの通信回数を制限する検証では、通常の`--live`スイートをそのまま実行しません。[1操作だけの採取手順](docs/live-once-verification.md)に従い、開始前に監視と再試行遮断を用意します。失敗後に新しい試行IDで再実行するには利用者の追加承認が必要です。

公開操作は対象と内容を承認済みの場合だけ、専用の本人ログイン済み環境と使い切り許可で実施します。キー期限切れや画面停止でも自動再送しません。2026-09-21に再生・投稿受理・通常マイリスト追加を確認しましたが、タグ成功・個別削除・投稿再取得等は未確認です。ログイン判定を変更した場合は`bun run test:browser functionality --offline`のヘッダー不在シーンも通します。

1. `git status --short` で他の未コミット変更を確認します。
2. `bun install --frozen-lockfile` で依存を揃えます。
3. `bun run lint`、`bun run format`、`bun run type-check`、`bun run build`、`bun run test`、`bun audit` を実行します。
4. `dist` に `FutatsumeWatch.user.js` だけがあることを確認します。ビルドはdist内の旧成果物を整理するため、手作業のファイルを置かないでください。
5. 手動検証は`bun run dev`で準備します。不足するChrome/TMの取得、ビルド、headed Chrome起動、スクリプト登録・有効化までを自動化し、その後は利用者が操作します。既存タブは自動再読み込みしません。初回のユーザースクリプト許可は手動で行います。
6. 自動検証は`bun run test:browser all --offline`で別途実行します（モード省略時もオフライン）。ビルド後、手動環境と異なるheadless Chromeで生成HLS・固定APIを使ったブラウザテストを実行し、成功・失敗時ともに停止します。結果は`dev-assets/verification/<実行日時>-<モード>-<ID>/<スイート>/`と`run.json`に保存され、Gitには含めません。
7. `git diff --stat` と生成物の差分を確認します。生成物の手修正は行いません。

UIだけを確認する場合は`bun run test:browser ui`を実行します。配布物を注入し、中央操作、設定ボタンから直接開く5カテゴリの左レール／右設定内容、画質・GitHub・平置きした3操作、金属調トグルの灰／緑状態、ABリピート、動画詳細4タブの固定／解除、固定中のぼかし不在と映像・コメントCanvasの非重複、狭幅・低高さ・4Kを確認します。画像と結果は`dev-assets/verification/shell-*`へ保存します。コメント投稿フォームも、音量バー横の配置、パレット、実入力、Enter・投稿ボタン、失敗時の本文保持と再送、全画面・各寸法を確認します。送信結果は専用タブ内で制御します。タグは閲覧専用で、libraryスイートが編集系要素とタグAPI要求の不在を確認します。

設定パネルは`bun run test:browser settings`で、一般設定と詳細設定の背景クリック・Escape・閉じるボタン、左カテゴリを維持した右項目の切り替え、金属調トグル、利用可能フォントだけを出すプルダウン、36項目の入力と保存・再表示、390px幅でも左右配置を維持すること、低高さを確認します。フォント候補はCanvasの実描画幅で照合し、選択後はコメント描画データへの反映も確認します。保存先は`dev-assets/verification/settings-*`です。設定値は自動テスト用プロファイル内だけで変更し、確認後に元の値へ戻します。

同じ検証で、サイドバーの5カテゴリを巡回し、外枠の位置・幅・高さが変わらないこととキーボード操作を確認します。一般設定の入力DOMの保持は単体テストでも確認します。設定書き出しのダウンロードは捕捉し、利用者の保存先へファイルを作りません。

自動テストは`all`・`entry`・`player`・`ui`・`settings`・`migration`・`addons`・`functionality`・`library`・`guard`を選択できます。手動用は9333と既存ChromeDev、自動用は9334と`dev-assets/browser-tests/profile`です。ランナーは接続先を自動用へ固定し、継承された`FUTATSUME_DEV_PORT`で手動環境へ接続しません。同時実行は拒否します。強制中断後にブラウザが残った場合は`bun run test:browser:stop`で回復します。

`functionality`は実フォームからの投稿・再取得と再生の境界、`library`はタグ・一覧・マイリスト等、`guard`はページとWorkerの未登録通信の遮断を確認します。いずれもオフライン専用です。実サイトの検証は`bun run test:browser player --live`、別動画なら`bun run test:browser player --live --url https://www.nicovideo.jp/watch/sm2057168`のように指定します。`--live all`はオフライン専用の3スイートを含めません。

通常検証はチェックイン済みの生成映像を使用します。映像の変更時だけ[フィクスチャの再生成手順](test/fixtures/functionality/README.md)に従い、実HLS再生と画質切替を再確認してください。Chromeの初回準備に必要なダウンロードと、オフラインケース実行中の外部通信禁止は区別します。CIは従来のUbuntu品質検査に加え、Windowsでオフラインブラウザ検証を行い、失敗時も結果を保存します。

Firefoxの代表確認は、ビルド後に`bun scripts/dev-verify-firefox.ts`を実行します。WindowsのProgram Files配下のFirefoxと9340番ポートを使用し、実行ごとに`dev-assets/firefox-verification/<実行ID>/profile`を作ります。ポートの使用中は失敗し、実プロファイルを変更しません。起動PIDだけでなく、実ブラウザのPID・起動時刻・実行ファイル・プロファイルを照合して終了します。結果と画像は同じ実行ディレクトリへ保存します。今回の通常サンドボックスではFirefoxのタブ子プロセスが起動できず、同じ専用構成での昇格実行が必要でした。

TMで登録したスクリプトのページへの適用だけを確認したい場合は、手動環境に対して`bun run dev:check`を明示実行します。これは専用の確認タブを開き、起動マーカーを確認して閉じます。`dev`の導入完了は登録・有効化の確認であり、再生やページへの適用を検証したという意味ではありません。

## 公開前

ソースファイルを改名するときはケバブケースにそろえ、静的/動的import・テストデータ・文書の参照も更新します。Windowsの大文字小文字だけの改名は、一時名を経由した`git mv`で記録してください。型検査に加えてGit上のファイル名も確認し、`bun run build`で配布物を再生成します。lintはファイル名の規則も検査します。

名称移行後の連携先は`window.FutatsumeWatch`、初期化イベントは`BeforeFutatsumeWatchInitialize` / `FutatsumeWatchInitialize`です。DOMの`zenza` / `zen`接頭辞は`futatsume`へ変更済みです。旧名を使う外部連携も同時に更新してください。lintは警告を含めて0件を必須にします。

設定の移行元キーは`src/config-migration.ts`だけで管理します。既存の新名称側の値を優先し、復旧用の旧値は削除しません。削除済みの設定キーは読み込み時に無視します。配布物は`bun run build`で再生成します。

名称や保存キーの変更時は`bun run test:browser migration`で隔離したブラウザコンテキストへ旧設定フィクスチャを読み込み、初期化イベント・実設定モデル・保存キー・旧データ保持を確認します。

- プッシュ時は `src/version.ts` と `package.json`、READMEの版を更新します。ユーザースクリプトの版と説明はVite設定から生成します。
- CHANGELOGのUnreleasedを対象版へ整理し、ユーザースクリプトのdescriptionにも変更要点を反映します。
- 型検査・ビルドだけを動作確認の代わりにしません。未検証の認証操作やブラウザは明記します。
- プッシュを依頼された場合にmainと`v<version>`形式のリリースタグを公開します。タグの品質検証が成功すると、CIがCHANGELOGの対象版を自動抽出し、配布物を添付したGitHubリリースを作成します。

## 復旧

更新前にユーザースクリプトマネージャから旧スクリプトをエクスポートします。設定を削除せず、問題のある版を無効化して保存した版を再導入します。Gitで旧版をビルドする場合は別ディレクトリのチェックアウトを使い、現在の未コミット変更を巻き戻さないでください。旧ZenzaWatchの設定キーは移行時に削除しません。

開発・配布にはREADMEにあるBunコマンドを使用します。旧バッチ・ローダー・デモ・未使用モックは0.0.9で整理しました。旧ブラウザテストのイベント検証は`test/unit/uquery.test.ts`へ移しています。`sample/`は旧コメントアートの比較資料として保持し、現行テストとしては扱いません。

## コメントエンジン更新時

`comment-overlay`はnpmの公開版を固定して導入し、`bun add --exact comment-overlay@<確認した版>`でpackage.jsonとbun.lockを同時に更新します。GitHubの既定ブランチとnpm版の挙動は同一と仮定せず、インストールした配布物・型定義・LICENSEを確認します。現行の公開型に必要なpaths設定はAGENTS.mdを参照してください。

`bun run test:browser player`で配布物と同梱ライセンスを再生成し、コメントの画素、重なり、比率、NG、シーク、保存HTML、投稿プレビュー取り消しを確認します。公開サーバーへの投稿は行わず、プレビューをプレイヤー内だけで追加・削除します。

`test:browser`は自動用のheadless Chromeを準備し、配布物を文書へ注入して検証します。TMの登録・権限を確認する検証とは区別します。低レベルの`bun scripts/dev-verify.ts --bundle`などを直接実行する場合に限り`FUTATSUME_DEV_PORT`で別の接続先を指定できるため、手動操作中のブラウザを指定しないでください。

旧版へ戻す場合も設定を削除せず配布物を差し戻します。旧Flashスロット設定の保存値は新エンジンでは参照せず残すため、旧版へ戻した際に利用できます。
