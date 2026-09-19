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

## 現在のビルド・初期化（2026-09-19）

- 製品・テスト・スクリプトはTypeScript。tsconfigはstrict、allowJs:false、allowUmdGlobalAccess:false。any禁止を維持する。ただし既存の構造型キャストは残るため、型検査だけで実動作を保証しない。
- BunでVite 8＋vite-plugin-monkeyを実行する。Vite内部はRolldownでありBun.buildではない。設定はvite.config.mts、入口はsrc/main.ts、配線はsrc/runtime.ts。build.js・webpack・Babel・mochaは退役した。
- 配布物はdist/FutatsumeWatch.user.jsの1件のみ。開発用も同じファイルを使う。HLS・GamePad・詳細設定・MylistPocket・MaskedWatch・HeatSync・CapTube・ブログパーツ・マイリスト絞り込み・uQueryを同梱する。SystemJS・lodash・jQuery・lit・hls.jsも同梱し、外部@requireに依存しない。
- scripts/build.tsはvm.Scriptでclassic scriptとして解析し、配布件数・版・外部@requireの不在を確認する。node --checkはESM自動検出のため、この判定の代わりにならない。
- 初期化はAntiPrototypeJs→設定復元→runtimeのモジュール評価→API/Worker/描画依存の配線→HLS→initialize→追加機能。モジュール評価時にConfig.propsを読む既存箇所があるため、Configのrestore前にruntimeを静的importしない。
- useDefineForClassFields:falseは必須。ES2022既定では型用フィールド宣言が親の初期化済みDOM参照をundefinedで上書きする。型用宣言をdeclareへ統一するまで従来の生成規則を維持する。
- Workerへ関数・クラスのtoStringを渡す経路が残る。バンドル時の匿名化・名前変更・自由変数を実行検証すること。StoryboardInfoModelは明示的なfactoryとEmitter引数でWorkerへ渡す。minifyを有効化する前に全Worker経路を再検証する。
- lodash/jQueryは各モジュールからimportする。ホストページのwindow._/$/jQueryを上書きしない。旧window.ZenzaWatch・イベント・DOM名は連携互換のため維持し、window.FutatsumeWatchと同じ実体を公開する。
- 設定はsrc/config-migration.tsで旧ZenzaWatch_キーから既知の設定だけ移す。新キーの値を優先し旧キーは残す。プレイリスト保存失敗でsessionStorage.clear()してはならない。
- 旧連結版で実測した初期化停止はconsoleのconstへの再代入、uQueryの空生成時undefined参照。移行後は動画情報のdmcInfo:null、Workerクラスの文字列化、未接続のConfig/イベント/デバッグ情報も修正した。
- 動画ページにはdata-futatsume-openボタンから起動できる導線がある。検証はexternal.openだけで済ませず、この導線から行う。

## 動作検証

- scripts/dev-browser.tsはdev-assetsのChrome for Testingとdev-extensionsのTampermonkeyを使う。9333番ポートと専用ChromeDevプロファイルでchrome-debug.ps1（9222）や実利用Firefoxと分離する。
- devフローは利用者が操作するため既定headed。無人検証時はstart --headlessを指定する。Bunの子Chromeは親終了に追従するためStart-Processで分離する。停止は専用stateファイルのPIDだけを対象にする。
- TM 5.5の初回User Scripts許可は手動。ダッシュボードのinput[type=checkbox]は行選択であり、有効化ではない。.scripttr .enablerと.enabler_enabledで状態を確認する。
- scripts/dev-verify.tsは実際にインストールした配布物を操作し、ready・HLS時間進行・コメント描画・シーク・設定保存・追加画面・プレイリスト切替を検証する。存在するだけのグローバルを成功条件にしない。
- コメント描画はdocument.hidden時に止める仕様。ヘッドレスでもPage.bringToFrontで対象タブを可視状態にして確認する。zenza-videoの実videoはshadow DOM内であるため、通常のquerySelectorAll('video')だけでは検出できない。
- scripts/dev-verify-addons.tsは隔離コンテキスト・通信遮断・固定HTML・実際にエンコードした映像でCapTubeとブログパーツを検証する。公開サイトの実測とは区別する。
- CDPヘルパーはプロトコルエラーと評価中例外を失敗にし、15秒でタイムアウトする。Worker例外も収集する。結果・画像はdev-assets/verificationに保存し、認証情報や署名URLをGitへ含めない。
- 実ページはNicoCache系プロキシ経由で他の拡張コードが混在する場合がある。広告等の既知の第三者通信失敗と製品例外を分ける。動画・コメントは製品の状態とDOMから判定する。
- 認証操作（公開API実測で401）、実ゲームパッド、Firefox/Violentmonkey/Greasemonkey、MaskedWatchの顔・文字検出API、現行マイリストページの構造への追従は未検証としてverification.mdで追跡する。
- LICENSEファイルは未整備で、引き継いだソースのライセンス表記の確認が必要。利用者の判断なしに一律のLICENSEを作成しない。

## 記録再生フィクスチャ

- test/fixtures/cdpにはsm9から採取したHTML・API・コメント・m3u8を保持する。映像セグメント、広告、環境依存nicocachenl.test、署名クエリは含めない。
- access-rightsとpublic.nvcommentのコメント取得はPOST。GETへ置き換えると照合しない。コメントの打ち切りは完全なコメント単位としJSON妥当性を保つ。
- 未登録リクエストはoffline.tsで外部へ出さず失敗させる。実行済み検証・制約・再開条件はverification.md、配布と復旧はhow-to-update.mdを正本とする。

## 導線の確認漏れからの修正（2026-09-20）

- 利用者のbun run devで、既存タブの本体未実行を実測した。同じheaded Chromeの新規文書では実行され、既存タブも再読み込みで回復した。拡張の登録タイミングを原因と断定せず、登録/有効化と文書への適用を分けて検証する。dev-installは版表示を持つ起動パネルを新規文書で確認し、未適用・旧版のニコニコタブを再読み込みする（入力中は保護）。
- 旧watch-entryはinitialize完了時に一度だけ/watch/を判定していたため、検索→視聴のSPA遷移では入口が作られなかった。現在はmainの早い段階で状態パネルを作り、リンク・pushState/replaceState/popstateの変化に追従する。検索結果には明示的な再生ボタンを置く。
- DOMに入口があるだけ、JavaScriptのclick()が成功しただけを可視操作確認と呼ばない。dev-ui.tsで寸法・表示状態・ヒットテストを確認し、Input.dispatchMouseEventでクリックする。NicoCacheのサムネイルプレビュー等が重なる場合も覆われた点を強制クリックしない。
- scripts/dev-verify-entry.tsはキーワード検索・タグ検索・通常リンクによるSPA遷移・視聴ページの起動・戻る・戻った後の再生を実際の画面操作で検証する。
- WatchPageHistoryのpopstate時には遅延復元を取り消し、遷移先を保存してからプレイヤーを閉じる。history.stateをnullで壊さない。
