# AGENTS.md

## 実サイトの単発検証（2026-09-20）

- 利用者の指定は「対象操作1回＋必要な関連通信の採取。再試行は追加承認後」。HTTP1件という意味ではない。`dev-verify-live-once.ts`の試行IDは開始前に消費し、別IDで無断再実行しない。失敗後は保存データとローカル検証を使う。
- 公式プレイヤーと本体の再生権取得をURLだけで同一視すると、本体の初回preflightを止める。採取済みinitiatorのBlob Worker `_createSession`とpreflightの元requestIdで区別する。`__retry=0`付きURLも重複キーへ正規化する。根拠・制約は`docs/live-once-verification.md`。
- 旧`cdp-capture.ts`はURLを仮値にし最終的に全件除外する雛形だったため退役。新しい採取はメソッド・URL・失敗・本文欠落を記録するが、CdpSceneへ自動変換したことにはしない。

## 外部サイトの起動導線（2026-09-21、0.0.12／0.0.15）

- ニコ百の記事内起動は親ページの`/v/<ID>`ではなく、`ext.nicovideo.jp/thumb/<ID>`の埋め込みサムネイルにある`blog.ts`のボタンを正本とする。子フレームからの`postMessage`は`document.referrer`全文をtargetOriginへ渡さず、検証したニコニコ配下の親originへ正規化する。動画IDはpathnameから取り、クエリを混ぜない。回帰は`blog-entry.test.ts`とaddonsスイート。
- `watch-entry.ts`は同一文書内で動画IDごとに起動ボタンを1個だけ持つ。タイトル等のテキストリンクを優先しつつ、非表示・覆われた候補より表示中の候補を選ぶ。Nアニメ等の本体を初期化する外部ホストにも適用し、外部ホストからの映像・コメントはentryスイートの固定ページで確認する。
- nv-commentの取得・投稿・削除・ニコるは`https://*.nvcomment.nicovideo.jp`の資格情報なしXMLHttpRequestを直接使い、外部ページでもiframeブリッジへ通さない。他ホストは既存ブリッジを維持する。通常取得はfilter-matomeの`{params,threadKey}`・`application/json`・frontend/client OSヘッダーに合わせ、過去ログ時だけ`additionals.when`を追加する。取得失敗を別threadKeyで自動再送しない。回帰は`net-util.test.ts`・`thread-post.test.ts`・entryスイート。
- `nvComment.params`は動画APIが発行した要求契約として、そのまま送る。保存設定`commentLanguage`を`params.language`へ上書きすると、例えばAPIが`ja-jp`・設定が`en-us`の動画でHTTP 400 `INVALID_PARAMETER`になる。取得時はAPI言語を表示設定と`threadInfo`へ同期し、過去ログでも変更するのは`additionals.when`だけとする。回帰は`comment-language.test.ts`と`thread-post.test.ts`。
- 0.0.16の実利用Tampermonkey再検証では、同じニコ百記事内の`sm9`で本文言語`ja-jp`・threadKeyあり・target 3件のPOSTがHTTP 200となり、コメント786件とHLS時間進行を確認した。失敗時の`sm11793256`は再読込後のDOMになく、同IDの再実行ではない。詳細は`docs/live-once-verification.md`。
- Nアニメのカード全体リンクとニコ百埋め込み内のリンクは、起動ボタンが見えていても透明なクリック層で覆うことがある。文書capture段階で起動ボタンの矩形内にある実クリック／タップを受け取り、元リンクへ到達する前に起動する。モバイルの埋め込みボタンは`hover:none`／`pointer:coarse`で常時表示し、44px以上を確保する。回帰は`watch-entry.test.ts`・entry・addonsスイート。
- 追加承認後の単発実測では、Nアニメ`so46805846`とニコ百`/v/sm9`の各起動・HLS・コメント描画まで成功した。両方ともnv-commentのOPTIONS／POSTはHTTP 200で、標準XMLHttpRequestの`Origin`も許可されたため、GM API未使用を400原因とは扱わない。旧要求の`text/plain`・常時空`additionals`等を現行契約へ直した0.0.13以後の結果である。詳細は`docs/live-once-verification.md`。

## オフライン検証の終了と設定効果（2026-09-20）

- オフラインのWorker監視は`dev-offline.ts`へ一元化する。`dev-verify.ts`からRuntime監視とautoAttachを重ねると、再読み込み直後の未完了Workerが残りコンテキスト破棄がタイムアウトした。再読み込みはloadイベントと新しいtimeOriginも確認する。startup pauseと15秒のプロトコルタイムアウトを維持し、起動直後のthrow・未処理Promise拒否をguardの負例で検査する。
- HeatSyncは動画切替の除外判定より前に適用済み速度を上書きしない。短動画・除外タグへ切替時は自分の加速だけ戻し、手動速度は残す。除外語・タグを同じ大文字化で照合する。回帰は`settings-heatsync.test.ts`。
- 動画情報パネルへ届くイベント名は`canPlay`。小文字の`canplay`では関連取得と説明欄の自動YouTube切替が接続されない。自動切替の遅延は、設定OFF・新動画・hideで古い応答を無効化する。`settings-video-events.test.ts`は実Emitterからの接続も確認する。提供者取得機能は0.0.15で削除した。
- Storyboardは`media.domand.isStoryboardAvailable`の会員別値をtrueへ正規化し、設定ONなら`access-rights/storyboard`を実際に要求して資産可否を判定する。UIからプレミアム表記を外し、OFF・動画切替・遅延応答の世代判定を維持する。オフライン環境はStoryboard access-rights・JSON・画像を登録する。
- 0.0.15では画面クリック再生・GamePad・HeatSyncの既定値をfalseへ変更した。既存の保存値は利用者の選択として保持する。削除した広告提供者・UI倍率・コメント速度／背面・影2種の設定と処理を復活させない。NG正規表現は`/パターン/フラグ`の1入力、NGタグ／投稿者は一般設定のNG・フィルターを正本とする。
- 映像配信は現行のDomand HLSだけを使用する。終了したDMC/HTTP方式の選択設定、フォールバック、Worker、ストーリーボード、HeatSync分岐を復活させず、画質設定と検証はDomandの利用可能な画質を対象にする。
- 新規タブとService Workerは専用BrowserContextに限定したbrowser-level監視で初回要求から捕捉する。初期化前popupではFetch・Runtime監視を先にキューへ送り、resumeと全応答を待つ。初回がchrome-errorになったリンクを再読み込みで成功へ変えない。guardはページ・専用Worker・iframe・popup・Service Workerの未登録5要求とWorker先頭例外2件を照合する。
- Service Workerのエントリーはtarget生成前に取得されるため、guardだけ専用loopbackサーバーの完全一致GETで供給する。別ポート・外部への禁止プロキシは維持する。映像は`test/fixtures/functionality/media-spec.ts`を正本にID別の長さ・比率・色を持ち、表示IDだけで切替成功にしない。
- 再読み込みの一時的な自動再生指定は、その再読み込みが完了する前に別動画を開いた場合にも解除する。`verify-media-switch.ts`は通信境界でA応答を保留→Bの実映像を確認→A応答の受信完了→Bを維持、という順序を固定する。

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
- lodash/jQueryは各モジュールからimportする。ホストページのwindow._/$/jQueryを上書きしない。現行の公開名はwindow.FutatsumeWatch。利用者の全面移行指示により、旧window名・イベント・DOM名の互換別名は廃止した。
- 設定はsrc/config-migration.tsで旧ZenzaWatch_キーから既知の設定だけ移す。新キーの値を優先し旧キーは残す。プレイリスト保存失敗でsessionStorage.clear()してはならない。
- 旧連結版で実測した初期化停止はconsoleのconstへの再代入、uQueryの空生成時undefined参照。移行後は動画情報のdmcInfo:null、Workerクラスの文字列化、未接続のConfig/イベント/デバッグ情報も修正した。
- 動画ページにはdata-futatsume-openボタンから起動できる導線がある。検証はexternal.openだけで済ませず、この導線から行う。

## 動作検証

- `bun run dev`は不足するChrome/TMの準備、ビルド、headed Chromeの起動、TMへのユーザースクリプト登録・有効化だけを行う。9333番ポートと既存ChromeDevプロファイルを使い、音声はミュートしない。再生テスト・動画ページへの自動遷移・既存タブの再読み込みを追加しない。
- 自動テストは`bun run test:browser [all|entry|player|ui|settings|migration|addons]`で実行する。9334番ポート・`dev-assets/browser-tests/profile`・別stateファイルのheadless Chromeを起動し、配布物注入で検証してfinallyで停止する。手動用のブラウザや継承されたFUTATSUME_DEV_PORTを使わない。従来のdev:verify系もこのランナーを通る。
- Bunの子Chromeは親終了に追従するためStart-Processで分離する。停止は各環境のstateファイルのPIDだけを対象にする。同時実行中のテスト用ブラウザは再利用・停止せず失敗する。ブラウザの直接操作用`dev-cdp.ts`はFUTATSUME_DEV_PORT指定を維持する。
- TM 5.5の初回User Scripts許可は手動。ダッシュボードのinput[type=checkbox]は行選択であり、有効化ではない。.scripttr .enablerと.enabler_enabledで状態を確認する。
- TMの識別は`dev-tampermonkey.ts`で実行中のmanifest名とruntime URLを照合する。他の拡張にもbackground.jsがあるため、ファイル名だけで拡張IDを選ばない。dev-installは自分で作った導入タブと新規確認画面・ダッシュボードだけを操作し、利用者の空タブや既存確認画面を再利用しない。
- scripts/dev-verify.tsは実際にインストールした配布物を操作し、ready・HLS時間進行・コメント描画・シーク・設定保存・追加画面・プレイリスト切替を検証する。存在するだけのグローバルを成功条件にしない。
- コメント描画はdocument.hidden時に止める仕様。ヘッドレスでもPage.bringToFrontで対象タブを可視状態にして確認する。futatsume-videoの実videoはshadow DOM内であるため、通常のquerySelectorAll('video')だけでは検出できない。
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

- 利用者のbun run devで、既存タブの本体未実行を実測した。同じheaded Chromeの新規文書では実行され、既存タブも再読み込みで回復した。拡張の登録タイミングを原因と断定せず、登録/有効化と文書への適用を分けて検証する。利用者の指定によりdev-installは登録・有効化までとし、起動マーカーの実適用確認は明示実行する`bun run dev:check`へ分離した。既存ページの再読み込みは利用者に任せる。
- 旧watch-entryはinitialize完了時に一度だけ/watch/を判定していたため、検索→視聴のSPA遷移では入口が作られなかった。0.0.2ではmainの早い段階で状態パネルを作り、リンク・pushState/replaceState/popstateの変化に追従する。検索結果には明示的な再生ボタンを置く。
- DOMに入口があるだけ、JavaScriptのclick()が成功しただけを可視操作確認と呼ばない。dev-ui.tsで寸法・表示状態・ヒットテストを確認し、Input.dispatchMouseEventでクリックする。NicoCacheのサムネイルプレビュー等が重なる場合も覆われた点を強制クリックしない。
- scripts/dev-verify-entry.tsはキーワード検索・タグ検索・通常リンクによるSPA遷移・視聴ページの起動・戻る・戻った後の再生を実際の画面操作で検証する。
- WatchPageHistoryのpopstate時には遅延復元を取り消し、遷移先を保存してからプレイヤーを閉じる。history.stateをnullで壊さない。

## アイコンの配置（2026-09-20、0.0.3）

- 起動用ポップアップは利用者の指定で廃止した。視聴ページはh1を含むタイトルの枝と、data-anchor-area=video_informationを持つ投稿者プロフィールの枝が分かれる最も近い行を探し、投稿者側の直前にアイコンを置く。生成クラスや固定座標を使わない。検索結果も同じ二つの四角形のSVGだけを表示する。
- 状態と版の導入確認用data-futatsume-entryはhead内の非表示metaへ移した。これを可視UIと判定しない。準備中・失敗はボタンのdisabled/data-state/title/aria-labelに反映する。検索ページに視聴用ボタンは残さない。
- TM確認タブは作成直後にボタンがないことがあるため、承認ボタンが操作可能になるまで上限10秒で待つ。

## コメントエンジン（2026-09-20、0.0.4）

- npm名は`comment-overlay`（roflsunriz/comment-overlay）、採用版はpackage.jsonとbun.lockを正本とする。4.1.6のd.tsに残る`@/*`をtsconfigでパッケージ内の型定義へ解決する。型の代用品やanyに置き換えない。公開型が修正されたらpathsを再確認する。
- NicoComment/NicoChat/NicoChatFilter/NicoScripterは解析・一覧・NG・投稿者命令用。旧CSS描画、文字計測iframe、レイアウトWorkerは除去済み。配置・衝突・文字計測は新エンジンに任せる。動画終端をNicoChat側で再補正しない。
- VideoPlayerのaspectRatioFixはheight/width。新描画面では逆数を使う。全画面の親要素へCanvasを拡大せず、動画の実際の比率で内側のsurfaceを縮める。重なりは既存commentLayerFrameのCSSに従う。Canvasの画素だけで可視表示を合格にしない。
- HTML5（shadow DOM内）とYouTubeの時計をCommentMediaで共有し、再生しないHTMLVideoElementへ時刻・イベントを橋渡しする。closeはdestroyし、保留中のモデル通知や設定変更で再生成しない。setCommentで再初期化する。
- comment-overlay-dataの表示補助とcomment-overlay-timingの投稿者秒数補助は、保存HTMLでも使う自己完結関数。toString後の自由変数を増やさず、scripts/dev-verify-comment-exports.tsで実ビルドの保存HTMLを通信遮断して検証する。パッケージのLICENSEは配布物・保存HTMLに同梱する。
- 空配列のフィルター結果が元配列と同じ実体だと、投稿時に二重追加される。NicoChatGroupはコピーを保持する。取得後の非フィルター一覧と描画用一覧を混同しない。
- scripts/dev-verify.tsはコメントCanvasの画素・重なり・比率・NG・投稿プレビュー取り消し・全画面・保存まで検証する。FUTATSUME_DEV_PORTで別ポートへ接続でき、--bundleは配布物を文書生成時に注入する（マネージャ導入検証とは区別する）。今回の環境・制約はverification.mdを参照する。
- buildはdistを一旦空にし、futatsume-branding.test.tsはdistの実ファイルを読むため、buildとtestを並列実行しない。ビルド完了後に単体テストを実行する。

## スケッチに基づくプレイヤーUI（2026-09-20）

- `src/player-shell.ts`は既存のDialogコマンド・Config・PlayerStateへ接続し、`src/player-layout.css`でブラウザ表示領域を使う。通常の動画・コメントの比率は既存プレイヤーに任せる。操作UIは未操作3秒で隠すが、パネル・入力・ドラッグ中は保持する。
- 右の動画情報・関連動画・コメント・プレイリストは既存のパネルとモデルを使う。タグは既存ヘッダーから同じDOMを移動する。関連動画とコメント一覧は隔離iframeなので、外側CSSだけで配色や表示を変更できない。仮想スクロールの固定行高は変えない。
- ABリピートは動画切替・closeで消す。Bが動画終端でもプレイリストの自動遷移に先行してAへ戻す。新規UIの実操作検証は`bun scripts/dev-verify-shell.ts`。配布物注入による検証で、マネージャへの登録確認とは区別する。
- 一般設定の`DialogElement.getContentsTemplate`はPromiseを返す。litへPromiseをそのまま渡すと`[object Promise]`だけが表示されるため、`getTemplate`でawaitする。`isOpen`だけの確認ではこの不具合を検出できない。設定項目の表示・実入力・保存・閉じるまで検証する。
- 0.0.5の詳細設定はbody直下のz-index 200000でプレイヤー（6000002）の背後になっていたためプレイヤー内へ移していた。0.0.6では標準dialogのtop layerへ統一し、この移動は廃止した。DOMのshow属性とJavaScriptのclickだけで検証せず、ヒットテストと実入力で確認する。

## 共通設定パネル（2026-09-20、0.0.6）

- 6種類の設定の開閉は`packages/components/src/settings-dialog.ts`、共通配色・寸法は`settings-dialog-theme.ts`を正本とする。標準dialogと`::backdrop`を使い、設定内容のDOM・保存処理は各機能に保持する。外側は画面全体、内側の`.fw-modal-content`が可視パネル。入力欄・パネル内の余白クリックや内側からのドラッグを背景クリックとして扱わない。
- Generalはlitのrender完了後に開く。GamePad/HeatSyncの遅延closeは撤去し、背景・Escapeでも各機能のisOpen/isVisibleを同期する。古いcloseイベントが再表示後の状態を壊さないようにし、プレイヤー終了時にも共通パネルを閉じる。
- HLSの各入力部品にもShadow DOMがあるため、外側テーマだけでは入力欄の固定幅・配色を変更できない。共有のfield themeを入力側へ入れる。スライダー値は疑似要素でなくoutputへ描画する。
- `bun run dev:verify:settings`は配布物注入による実入力検証。各設定の開閉・保存と復元・全画面・複数寸法を確認し、結果と画像を`dev-assets/verification/settings-*`へ残す。機器の入力や検出APIの実機能検証とは区別する。
- 自動再生など一部の設定は`PlayerConfig.wrapKey`で視聴ページ用の`:ginza`へ解決される。保存検証は`getStorageKey(getNativeKey(key))`で実際のキーを調べ、nullを「変更前と違う」だけで保存成功にしない。
- `dev-verify.ts`のWorker監視は終了時に新規購読を止め、発行済みのRuntime.enable要求を待ってからauto-attachを解除する。解除を先にすると購読対象sessionが消え、製品操作が成功しても検証自身がNo sessionエラーになる。

## 設定サイドバー（2026-09-20、0.0.7）

- 設定画面の内側は960×720pxを基本とし、小さい画面だけ利用可能な幅・高さへ収める。Shadow DOM内と通常DOM内のパネルで外枠寸法をそろえるため、共通テーマでbox-sizingを明示する。本文とサイドバーは別々にスクロールする。
- 一般設定の`data-settings-section`を持つ4区画は同じDOMを保持してhiddenを切り替える。ほかの5設定への移動は`configureSettingsNavigation`から既存の開閉処理へ接続する。タブ・区画の識別は表示文言に依存させない。
- Generalのコマンド付きボタンのclick処理はformに置く。共通ダイアログがclickの外部伝播を止めるため、外側の#rootへ置くと設定書き出しなどのコマンドが届かない。書き出し検証ではダウンロードを捕捉し、生成JSONと現在の設定を比較する。
- 0.0.8では設定前の左メニューを設定・画質・GitHub・その他操作の4項目に集約した。個別設定への実操作検証も「設定」→設定内タブを通る。削除した入口の有効化監視やclick分岐は残さず、`configureSettingsNavigation`の接続を使う。

## 不要ファイル整理（2026-09-20、0.0.9）

- 未使用判定はTypeScriptのモジュール解決で`.js`指定から`.ts`への解決も確認する。`components/src/index.ts`と`util/util.ts`、`like-api.ts`は現行製品から参照される。単純な拡張子一致やファイル名検索だけで削除しない。
- 旧`test/browser`のイベント検証は`test/unit/uquery.test.ts`へ移した。DOMは同じイベント・関数のリスナーを共有するため、uQueryの名前空間を一つ解除しても別の登録が残る間は実リスナーを消さない。`sample/`は旧コメントアートの比較資料で、実行済みのテストと混同しない。
- `v<version>`タグでは`.github/workflows/ci.yml`が品質検証後にCHANGELOGの対象版と配布物をリリースへ掲載する。mainの通常プッシュではリリースしない。
- 既定の`minify: true`はWorker内で`ReferenceError: e/t is not defined`を生み再生を止めた。`rolldownOptions.output.minify`で`mangle:false`・`compress:false`・`codegen.removeWhitespace:true`を指定し、名前と関数構造を保持する。変更時は実配布物の再生・Worker・保存HTMLを再検証する。

## 名称の全面移行とlint（2026-09-20、未リリース）

- 現行コード・DOM・イベント・追加機能はFutatsumeWatch / Futatsume系、プレイヤーのパッケージは`packages/futatsume`へ統一した。旧ブランド文字列は`src/config-migration.ts`の読み込み境界と移行テスト、由来・上流URL・過去の記録だけに残す。`escapeToZenkaku`、`frozen`、資料内の全角空白`zen_space`はブランド名ではない。
- `main.ts`で共有保存値・プレイリスト・前回再生状態を移し、Configの復元前に本体設定を、HLS/GamePadの初期化時に各既定キーを移す。本体の移行版は2。マーカー1では名称変更したTube設定だけをFutatsumeWatchの旧キーから移し、リセットした値を旧ブランドのバックアップから復活させない。旧値は保持し、新キーを優先する。旧設定JSONは`Config.import`でキーを変換する。
- GamePadの公開オブジェクトはプレイヤーを開いてから設定される。起動前の移行確認では保存キーを確認し、操作は起動後に検証する。`dev:verify:migration`は隔離コンテキストで移行とHLSエラー種別を検証する。
- lintは`--max-warnings 0`・未使用宣言error。継承・公開契約に必要な未使用引数だけ意図を明示し、未使用の代入を外す際は初期化や入力検証の副作用を残す。
- Bun 1.4.0の`install --lockfile-only --ignore-scripts`は`--force`付きでも既存lockfileのルートnameを更新しなかった。今回だけルートnameをpackage.jsonへ合わせ、依存解決情報を変えず`--frozen-lockfile`で整合性を確認する。

## ソースファイル名

- 製品・テスト・開発スクリプトのファイル名は小文字のケバブケースを使う。`.test.ts`・`.d.ts`・`.config.mts`の接尾辞は維持する。ESLintの`file-naming/kebab-case`で違反をエラーにする。
- 改名では静的/動的import、`.js`指定から`.ts`へ解決する参照、ファイル読み込み、文書のパスを更新する。Windowsで大文字小文字だけを変える際は一時名を経由した`git mv`でGitにも新しい綴りを記録する。識別子・公開API名と配布物`dist/FutatsumeWatch.user.js`の購読先はファイル名規則とは分ける。

## 音量バー横のコメント投稿（2026-09-20、未リリース）

- `CommentInputPanel`は通常DOMのformで、`PlayerShell`が音量スライダー直後へ同じDOMを移す。旧絶対配置CSS・uQuery用フォーム処理は廃止し、`comment-input-panel.css`をruntimeから同梱する。狭幅では下段へ折り返す。
- filter-matomeの`video-player/ui/comment-post-form.ts`を参考にパレット・文字数・送信状態を実装した。既存`post`→`postChat`→`addChat`へ接続し、rejectの理由をフォームへ返す。本文は成功後だけ消し、動画切替・closeで世代を更新して古い送信結果の干渉を防ぐ。
- ブラウザ検証は`dev-verify-comment-input.ts`を`test:browser ui`から呼ぶ。専用タブのaddChat境界だけを一時的に置換し、送信成功・失敗を制御する。公開APIへの投稿成功や認証検証とは区別する。IME・重複・文字数境界・投稿不可状態は`test/unit/comment-input-panel.test.ts`で確認する。
- フォーム内のfocusoutはrelatedTargetで判定する。実Chromeではblur/focusout後のmicrotask時点でもactiveElementがbodyのことがあり、microtaskだけで外へ移動したと判断するとパレットの次ボタンをクリックする前に閉じる。移動先不明時はsetTimeout後に判定する。

## シリーズ全体のプレイリスト追加（2026-09-21、0.0.14）

- シリーズ一覧は`https://nvapi.nicovideo.jp/v2/series/{id}`を`pageSize`・`page`付きで取得する。応答の`data.items[].video`を既存プレイリストの`content`形式へ正規化し、サムネイルURLの候補も統一する。旧`/v1/playlist/series/{id}`と直下項目を前提に戻さない。
- シリーズの再生アイコンを実クリックし、全動画の順序、再生中動画の選択位置、要求が1回だけであることを`dev-verify-library.ts`で確認する。途中失敗時に既存プレイリストを置換しない共通規則は維持する。

## 実認証と単発採取（2026-09-21、未リリース）

- 実視聴ページで初期化時にCommonHeader・server-responseがない例を確認した。ログイン判定をDOMだけで固定しない。`nicoUtil`は現在の要求IDに対応するAPI viewerを優先し、VideoInfoModelの`watchApiData.viewerInfo`から表示へ接続する。guestクラスはplayerContainerではなく外側のdialogにある。切替・closeで状態を破棄する。`verify-authentication.ts`のヘッダー不在シーンで実配布物を確認する。
- 実通信の「1回」は対象操作1回と関連通信。失敗後の再試行は承認なしで実行しない。`live-write-permit.ts`の許可は送信前に消費し、同種の再登録を拒否する。作成・追加の成功IDだけを削除対象へ束縛する。キー期限切れでも自動で許可を補充しない。
- 公式マイリスト作成formはname・description・isPublic・defaultSortKey・defaultSortOrderが必要。製品の追加はqueryとformにitemId・descriptionを送る。実測の成功・失敗・後片付けは`docs/live-once-verification.md`を参照する。製品のaddMylistItemには「後で見る」からの除去経路もあるため、採取許可をその副作用へ広げない。
- 採取を再開すると連番本文名が衝突したため、`live-capture.ts`は採取単位のUUIDを含める。実記録の移動・欠損はindexへ残し、再取得で隠さない。CDPのpostDataEntriesは認証本文のbase64副本なので全体をマスクする。関連GETの明示更新にはOPTIONSも1回必要。広告・アイコン失敗と再生の致命的失敗を分ける。

## 機能テスト計画の調査と実装（2026-09-20、承認済み）

- `test/fixtures/cdp/offline.ts`はBun内のfetch/XHR差し替え。要求照合はURLの意味あるクエリと本文を比較し、パスだけのフォールバックを撤去した。無視するクエリはフィクスチャ側で明示する。本文未記録は空本文だけに一致する。
- `test:browser`はオフラインが既定。`dev-offline.ts`でページ・iframe・Worker通信を監査し、専用Chromeの禁止プロキシを併用する。配布物の通信境界で`offline-site.ts`と`offline-library.ts`が固定応答を返す。実サイトは`--live`を明示し、投稿・タグ・マイリストの書き込みスイートではliveを拒否する。
- WorkerはFetch/Target domainを持たない場合がある。親ページでFetchとauto-attach、子でRuntime/Networkを監視し、子を必ずresumeする。CdpSession.closeはPromiseを返し、未完了の監査を回収してから閉じるため必ずawaitする。通信遮断の負例は`guard`スイートで確認する。
- 短命なWorkerはRuntime/Network購読の開始中に終了し、`Target.sendMessageToTarget: No session with given id`になることがある。対象子セッションの消滅だけは正常終了として未完了要求を解放し、それ以外のCDPエラー・未捕捉通信・製品例外は失敗のまま維持する。回帰は`offline-site.test.ts`。
- ページ終了でFetch interceptionが無効になる競合は、監査のclose開始後かつChromeの厳密な`Invalid InterceptionId`だけを正常終了として扱う。実行中または別内容のFetchエラーは失敗にし、`offline-site.test.ts`の正負例を維持する。
- スイート終了はWebSocketを閉じるだけで済ませず、自分が作成したTargetとBrowserContextも破棄する。`cleanupCdp`で一つの後始末が失敗しても残りを実行する。guardで異なるContext間のlocalStorageとBroadcastChannel隔離も確認する。
- 生成HLSは`test/fixtures/functionality/media`に置く。MPEG-TSを`.ts`にすると型検査でTypeScriptと誤認するため`.mpegts`を使う。生成手順と採取・加工根拠は同ディレクトリのREADMEを参照する。
- 設定の全項目検証は`verify-settings-fields.ts`。描画エンジンはコメントdurationを整数msに正規化するため、速度変更の期待値は導入版の公開実装と照合する。全入力の保存成功を、実機・外部サービスを含む全機能効果の保証としない。
- `datetime-local`の表示・実キー入力順は実行環境のロケールで変わる。`dev-verify-library-comments.ts`はブラウザの`Intl.DateTimeFormat.formatToParts`と12/24時間制からセグメント順を決め、年→月→日を固定しない。回帰は`library-date-input.test.ts`。
- コメント行メニューの`.menuButton`はiframeへ注入する共通CSSと衝突して実寸法が潰れたため`.comment-row-action`に変更した。新しい標準dialogも、ホストページの背景操作抑止CSSに巻き込まれないよう`futatsume-family`へ所属させる。
- 一覧のソート描画と関連動画追加には遅延処理がある。内部ソートキーの変化や開始前の`isUpdating=false`を完了判定に使わず、表示行ID／開始から終了への遷移と再取得結果を確認する。
- 計画と親ケースの対応は`docs/plan-functionality-test.md`・`docs/functionality-test-matrix.md`、実行済み結果は`verification.md`と実行ごとの`run.json`を正本にする。
- 視聴フィクスチャは採取元の`server-response`と`okReason`も保持する。これがないと視聴ページを検索等として初期化し、前回状態・視聴用設定の検証が実サイトと異なる経路を通る。
- DataStorageとBaseStateの変更通知はbatchを分離し、配送時の現行値を確認する。遅い旧通知やリスナー内の再入更新で、保存値が1なのに実速度だけ0.4という不整合を生まない。`Config`のimport前検査は`config-validation.ts`、永続化と失敗時復元はDataStorageが担当する。
- 大百科はwatchの`isNicodicArticleExists=false`だけで不存在を確定しない。`api.dic.nicovideo.jp/v1/articles/article/<タグ>`の404と通信失敗を区別し、成功した有無だけを共有キャッシュする。根拠は2026-09-12公式資産採取と2026-09-20公開GET実測。記事本文はフィクスチャに保存しない。
- 投稿者一覧は`totalCount`と`page`/`pageSize`で全件取得を判定し、途中失敗や古い動画への応答では現在の一覧を置換しない。マイリスト選択画面の再取得はキャッシュを越える明示経路を使う。
- `setNextAutoPlay`は次の実srcだけに適用し、空映像への切替で消費しない。最新の明示シーク位置はloadingフラグだけに依存せず保持し、close後のmetadata・接続応答・エラー再試行を破棄する。
- Firefoxの代表検証は`dev-verify-firefox.ts`でraw BiDi、9340、毎回新しい専用プロファイルを使う。既存`firefox-debug.ps1`は利用者プロファイルを編集するためこの用途で使わない。launcher PIDと実Browser PIDが異なる場合があり、listenerの実PID・起動時刻・実行ファイル・専用profileを照合して停止する。マネージャ導入の保証とは区別する。
