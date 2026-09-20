# 更新手順

## 前提

BunとGitを用意し、リポジトリ直下で作業します。ブラウザ検証の起動補助はWindows用です。TypeScriptのバージョンや依存関係はpackage.jsonとbun.lockを正本とします。

## ビルドと検証

1. `git status --short` で他の未コミット変更を確認します。
2. `bun install --frozen-lockfile` で依存を揃えます。
3. `bun run lint`、`bun run format`、`bun run type-check`、`bun run build`、`bun run test`、`bun audit` を実行します。
4. `dist` に `FutatsumeWatch.user.js` だけがあることを確認します。ビルドはdist内の旧成果物を整理するため、手作業のファイルを置かないでください。
5. 初回は `bun run dev:setup`、以降は `bun run dev` で実際に配布物をインストールして検証します。無人実行では `bun scripts/dev-browser.ts start --headless` → `bun run dev:install` → `bun run dev:verify:entry` → `bun run dev:verify` を使います。
6. `bun run dev:verify:addons` を実行し、別ページ機能も確認します。結果は `dev-assets/verification/` に保存され、Gitには含めません。
7. `git diff --stat` と生成物の差分を確認します。生成物の手修正は行いません。

UIを変更した場合は、専用ブラウザに対して`bun run dev:verify:ui`も実行します。生成済み配布物を新しいタブへ注入し、中央操作、左右パネル、一般設定の実入力、追加設定への導線、ABリピート、狭幅・低高さ・4Kを確認します。`FUTATSUME_DEV_PORT`で接続先を指定でき、画像と結果は`dev-assets/verification/shell-*`へ保存します。公開コメント投稿やタグ編集の送信は行いません。

設定パネルを変更した場合は`bun run dev:verify:settings`で、6種類すべての背景クリック・Escape・閉じるボタン、入力と保存・再表示、全画面、狭幅・低高さを確認します。保存先は`dev-assets/verification/settings-*`です。設定値は検証用プロファイル内だけで変更し、確認後に元の値へ戻します。

同じ検証で、サイドバーの9カテゴリを巡回し、外枠の位置・幅・高さが変わらないこととキーボード操作を確認します。一般設定の入力DOMの保持は単体テストでも確認します。設定書き出しのダウンロードは捕捉し、利用者の保存先へファイルを作りません。

## 公開前

- プッシュ時は `src/version.ts` と `package.json`、READMEの版を更新します。ユーザースクリプトの版と説明はVite設定から生成します。
- CHANGELOGのUnreleasedを対象版へ整理し、ユーザースクリプトのdescriptionにも変更要点を反映します。
- 型検査・ビルドだけを動作確認の代わりにしません。未検証の認証操作やブラウザは明記します。
- プッシュを依頼された場合にmainと`v<version>`形式のリリースタグを公開します。タグの品質検証が成功すると、CIがCHANGELOGの対象版を自動抽出し、配布物を添付したGitHubリリースを作成します。

## 復旧

更新前にユーザースクリプトマネージャから旧スクリプトをエクスポートします。設定を削除せず、問題のある版を無効化して保存した版を再導入します。Gitで旧版をビルドする場合は別ディレクトリのチェックアウトを使い、現在の未コミット変更を巻き戻さないでください。旧ZenzaWatchの設定キーは移行時に削除しません。

開発・配布にはREADMEにあるBunコマンドを使用します。旧バッチ・ローダー・デモ・未使用モックは0.0.9で整理しました。旧ブラウザテストのイベント検証は`test/unit/uquery.test.ts`へ移しています。`sample/`は旧コメントアートの比較資料として保持し、現行テストとしては扱いません。

## コメントエンジン更新時

`comment-overlay`はnpmの公開版を固定して導入し、`bun add --exact comment-overlay@<確認した版>`でpackage.jsonとbun.lockを同時に更新します。GitHubの既定ブランチとnpm版の挙動は同一と仮定せず、インストールした配布物・型定義・LICENSEを確認します。現行の公開型に必要なpaths設定はAGENTS.mdを参照してください。

`bun run build`で配布物と同梱ライセンスを再生成し、`bun run dev:verify`でコメントの画素、重なり、比率、NG、シーク、保存HTML、投稿プレビュー取り消しを確認します。公開サーバーへの投稿は行わず、プレビューをプレイヤー内だけで追加・削除します。

操作中の専用Chromeを再利用しない検証では、別のヘッドレスChromeとプロファイルを起動し、`$env:FUTATSUME_DEV_PORT='9334'`などで接続先を指定して`bun run dev:verify --bundle`を実行できます。`--bundle`は生成済み配布物を文書へ注入する検証であり、Tampermonkeyへの登録・権限・更新適用を確認する`dev:install`の代わりにはなりません。ポート指定を解除するときは`Remove-Item Env:FUTATSUME_DEV_PORT`を実行します。

旧版へ戻す場合も設定を削除せず配布物を差し戻します。旧Flashスロット設定の保存値は新エンジンでは参照せず残すため、旧版へ戻した際に利用できます。
