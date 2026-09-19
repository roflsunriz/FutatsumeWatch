# 更新手順

## 前提

BunとGitを用意し、リポジトリ直下で作業します。ブラウザ検証の起動補助はWindows用です。TypeScriptのバージョンや依存関係はpackage.jsonとbun.lockを正本とします。

## ビルドと検証

1. `git status --short` で他の未コミット変更を確認します。
2. `bun install --frozen-lockfile` で依存を揃えます。
3. `bun run lint`、`bun run format`、`bun run type-check`、`bun run build`、`bun run test`、`bun audit` を実行します。
4. `dist` に `FutatsumeWatch.user.js` だけがあることを確認します。ビルドはdist内の旧成果物を整理するため、手作業のファイルを置かないでください。
5. 初回は `bun run dev:setup`、以降は `bun run dev` で実際に配布物をインストールして検証します。無人実行では `bun scripts/dev-browser.ts start --headless` → `bun run dev:install` → `bun run dev:verify` を使います。
6. `bun run dev:verify:addons` を実行し、別ページ機能も確認します。結果は `dev-assets/verification/` に保存され、Gitには含めません。
7. `git diff --stat` と生成物の差分を確認します。生成物の手修正は行いません。

## 公開前

- プッシュ時は `src/version.ts` と `package.json`、READMEの版を更新します。ユーザースクリプトの版と説明はVite設定から生成します。
- CHANGELOGのUnreleasedを対象版へ整理し、ユーザースクリプトのdescriptionにも変更要点を反映します。
- 型検査・ビルドだけを動作確認の代わりにしません。未検証の認証操作やブラウザは明記します。
- プッシュを依頼された場合にmainとリリースタグを公開し、リリース本文にはCHANGELOGの対象版を掲載します。今回の作業ではプッシュ・タグ・リリース公開は行っていません。

## 復旧

更新前にユーザースクリプトマネージャから旧スクリプトをエクスポートします。設定を削除せず、問題のある版を無効化して保存した版を再導入します。Gitで旧版をビルドする場合は別ディレクトリのチェックアウトを使い、現在の未コミット変更を巻き戻さないでください。旧ZenzaWatchの設定キーは移行時に削除しません。
