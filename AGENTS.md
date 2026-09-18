# AGENTS.md

## 作業開始前の必須手順（最優先・例外なし）

1. エージェントは、調査、計画、コマンド実行、スキル利用、ファイル編集、コミット、プッシュを始める前に、必ずリポジトリ直下の `.\COMMON-AGENTS.md` を開き、先頭から末尾まで全文を読む。
2. `COMMON-AGENTS.md` はGit管理外のシンボリックリンクである。`git`や既定のignore設定が有効な`rg --files`の検索結果だけで、ファイルが存在しないと判断してはならない。PowerShellでは最初に次を実行する。

```powershell
Get-Content -Raw -LiteralPath .\COMMON-AGENTS.md
```

3. 読み取りに失敗した場合、出力が省略された場合、または末尾まで読めたことを確認できない場合は、一切の作業を開始せず、パスとシンボリックリンク先を確認して全文を再取得する。必要なら分割して末尾まで読む。
4. 全文を読了するまで、ローカル `AGENTS.md` だけを根拠に作業を続けてはならない。読了後は `COMMON-AGENTS.md` を最優先の指針とし、読了直後の最初の進捗報告で全文を読了したことを明示する。
   このファイルでは `FutatsumeWatch` 固有の補足だけを記載する。

## 歴史的な説明
- https://github.com/segabito/ZenzaWatch の segabito 氏が開発していたニコニコ動画用 ZenzaWatch（外部HTML5プレーヤー）※実質開発終了
- フォーク版の https://github.com/kphrx/ZenzaWatch の kphrx 氏メンテナンスの ZenzaWatch ※コミットが活発でない
- その流れを引き継ぐのがこのFutatsumeWatchである。
- 落語に於いて、「前座見習い」「前座」「二つ目」「真打」というのがあり、真打に近いほどプロとして認められている、という階級がある。その「前座」と「二つ目」の関係性から命名した。

## 初期の方針、方向性
- Typescript, eslint, prettier, bunバンドラー使用にする
- 型安全（曖昧な型なし, anyなし, unknown極力なし）
- distフォルダにプッシュでリリースとする
- プッシュの度にバージョンを上げる
- リリースタグもプッシュし、リリースに変更点（CHANGELOG抜粋）を明記
- ユーザースクリプトのdescriptionに簡易な機能の説明、使い方説明、変更の要点（CHANGELOG抜粋）を明記
- READMEにTampermonkey, Violentmonkey, Greasemonkeyで購読できるようにリンクを置く（バージョンも併記し、プッシュの度更新）
- 自動テストで品質を確保（単体テスト、結合テスト、E2Eテスト、機能テスト）
- COMMON-AGENTS明記のドキュメント整備
- 後述の問題報告場所を監査して問題として吸い上げ修正

## 現在の問題の報告されている場所
- このリポジトリのIssue, PullRequest
- 各上流リポジトリのIssue, PullRequest
- https://dic.nicovideo.jp/a/zenzawatch の掲示板

## 最新のニコニコ動画に対する実装の基準点
- %LOCALAPPDATA%\NicoCache_nl (roflsunriz/NicoCache_nl) の src
- %HOMEDRIVE%\filter-matome (roflsunriz/filter-matome) の local/features/src または local/features/src/sandbox （公式資産キャプチャとドキュメント）
- またはChrome CDPによる公式資産キャプチャ、de-minify、実リクエストキャプチャ
- 公式資産の世代間の汎用性確保

## ZenzaWatch機能紹介(2016年)
- https://tonkuma.hatenablog.com/entry/2016/09/07/224758
