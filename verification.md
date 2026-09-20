# 検証記録

## 2026-09-20：設定前メニューの整理（0.0.8）

設定を開く前の左サイドバーを「設定」「画質」「GitHub」「その他操作」に集約した。詳細設定・HLS・MaskedWatch・GamePad・HeatSyncは設定画面内のタブから開く。削除した入口の有効化監視・click分岐・未使用文言も除去した。

- `dev:verify:ui`の76項目に成功し、4項目への集約、その他操作の開閉、設定→各設定タブの実クリックを確認した。設定パネル専用の検証スクリプトも同じ入口を通るよう更新した。
- 単体144件、type-check・format・build成功、lint error 0（198警告）。配布物は`bun run build`で再生成した。README・変更履歴・AGENTSを更新し、更新手順とその他の運用文書も照合した。
- 専用headless Chrome（ポート9338、`dev-assets/menu-profile`）で配布物を注入し、画像を`dev-assets/verification/shell-1280-settings.png`へ保存。実利用Firefoxには変更を加えていない。Firefoxとマネージャ再登録は未検証。プッシュ・タグ・リリース公開は行っていない。

## 2026-09-20：固定サイズと設定サイドバー（0.0.7）

アコーディオンを廃止し、960×720pxを基本にした設定画面と左サイドバーへ変更した。一般設定のプレイヤー・コメント／フォント・NG／フィルター・入出力を同じDOMのまま切り替え、詳細設定・HLS・MaskedWatch・GamePad・HeatSyncにも直接移動できる。画面が狭いときだけ外枠を縮め、本文とサイドバーを独立してスクロールする。背景ブラーと背景・Escape・×による終了は引き継ぐ。

- `dev:verify:settings`は209項目成功、製品例外0件。デスクトップと390px幅で9カテゴリを往復し、タブごとの外枠の位置・幅・高さの一致、一般設定の表示区画が一つであること、上下キー操作を確認した。6種類の設定内にdetailsがないことも確認する。
- 既存の`dev:verify:ui`も69項目に成功し、再生・シーク・コメント切替・ABリピート・設定導線・前後の動画切替を確認した。
- 従来の6設定の開閉・保存・再表示・復元・全画面・4種類の画面寸法の検証を継続した。画像は`dev-assets/verification/settings-tabs-*.png`および`settings-*.png`、結果は`settings-report.json`。
- 一般設定の入力DOMと値をタブ切替で保持するケースを追加し、単体144件に成功。型検査・整形・ビルド成功、lint error 0（198警告）、依存監査で脆弱性0件。
- 設定書き出しのclickが外側へ届かない経路を見つけ、form内でコマンドを処理するよう修正した。実ボタン操作でダウンロードを捕捉し、生成JSONと現在の設定が一致することを確認した。実ファイルのダウンロード・設定ファイルの読み込みによる上書きは行っていない。
- Chrome for Testingの専用headlessプロファイル`dev-assets/settings-tabs-profile`、ポート9337で配布物を注入して確認した。初回の公開ページ接続はTLSエラーで停止したが、接続を確認し再試行後に実ページで検証を完了した。実利用Firefox・開発ブラウザのプロファイルは変更しない。
- 依存追加なし。README・更新手順・AGENTS・変更履歴を更新し、その他の運用文書との整合も確認した。配布物は`bun run build`で再生成する。Firefox/Violentmonkey/Greasemonkeyとマネージャ再登録は未検証。プッシュ・タグ・リリース公開は実施していない。

## 2026-09-20：設定パネルの共通化（0.0.6）

一般設定・詳細設定・HLS・MaskedWatch・GamePad・HeatSyncを、共有の`SettingsDialog`とテーマへ接続した。見出し・右上の閉じるボタン・配色・入力欄・余白をそろえ、標準dialogの背景ぼかし、背景クリック、Escapeへ統一した。保存処理は各機能に保持し、HLSの保存ボタンも残す。

- 共通設定の実操作147項目、既存UIの69項目、再生・コメント・保存の55項目、単体142件に成功。type-check・format・build成功、lint error 0（未使用引数等198警告）、依存監査で脆弱性0件。共通設定の製品例外は0件。
- `bun run dev:verify:settings`で6種類すべての背景・Escape・閉じるボタン、パネル内クリック、設定変更・保存・再表示・復元、全画面を維持した開閉を確認する。390×844・844×390・1280×800・1920×1080の画像と寸法を確認し、スクロール可能な本文と常に表示される見出しを分けた。
- HLSの入力部品の固定幅で狭幅時に横スクロールが発生したため、各Shadow DOMにも共通の入力テーマを適用した。スライダーの値はoutputへ表示し、初期値0も明示的に反映する。
- 一般設定の自動再生は視聴ページで`:ginza`キーへ保存される。検証は実際の解決後キーと期待値を比較し、nullを保存成功にしないよう修正した。
- 既存の再生検証で、55項目終了後に監視用のWorker購読が完了する前にdetachし、`No session with given id`になる競合を検出した。終了時は新しい購読を止め、発行済み購読の完了後にdetachする。プロトコルエラーや製品例外の検出は維持する。
- 単体では背景クリック、内側の操作、内外をまたぐドラッグ、キャンセル、Escape後の再表示、設定間の切替を確認する。native dialogの背景クリックと全画面での表示は実ブラウザで確認する。
- 実行環境は専用Chrome for Testingのheadless、ポート9336、`dev-assets/settings-profile`。生成した配布物を新規タブへ注入し、実利用Firefoxや既存の開発Chromeは変更しない。結果は`dev-assets/verification/settings-report.json`、画像は`settings-*.png`。
- 依存追加なし。配布物は`bun run build`で再生成し、README・更新手順・変更履歴・AGENTSを更新した。マネージャ再登録・Firefox/Violentmonkey/Greasemonkey、実ゲームパッド入力、顔・文字検出APIは未検証。投稿・公開設定変更、プッシュ・タグ・リリース公開は実施していない。

## 2026-09-20：スケッチに基づくUI改修（0.0.5）

利用者が提示した2枚のスケッチを基準に、ブラウザ内全体の動画・コメント、上部のメタデータ、中央の前／再生・停止／次、下部の操作とヒートマップ付きシークバー、左設定メニュー、右の4タブを実装した。左右パネルの背景はぼかし、背景クリック・Escapeで閉じる。操作UIは未操作3秒で隠し、入力・ドラッグ・パネル操作中は保持する。既存の詳細、関連動画、コメント、プレイリスト、タグ編集のモデルと処理を再利用し、新しい依存は追加していない。

### 実操作と画面確認

- lintはerror 0（既存警告202件）、format・type-check・build成功。単体137件成功、依存監査で脆弱性0件。新UIの実操作検証は69項目成功、製品例外0件。既存の`dev:verify --bundle`も55項目成功し、コメント描画・NG・保存HTML・PNG・再生復帰を再確認した。
- `bun run dev:verify:ui`は専用のChrome for Testing（headless、ポート9335、`dev-assets/ui-shell-profile`）へビルド済み配布物を注入して検証する。実利用Firefoxや操作中の開発Chromeのプロファイルは変更していない。
- 公開動画sm9の起動アイコン、再生・停止、3秒非表示と再表示、シークバー、速度、音量、ミュート、通常リピート、AB指定・解除、コメント表示、左右パネル、タグ編集モードの開閉、4タブ、全画面への移行・復帰を実入力で確認する。プレイリストへsm2057168を加え、中央の前後ボタンで切替・再生・AB解除を確認する。
- 一般設定は実際のチェックボックス操作とlocalStorage保存・復元・閉じるボタンを確認する。詳細設定とHLS・MaskedWatch・GamePad・HeatSyncも新しい左メニューから開く。実ゲームパッド入力や検出APIの動作保証とは区別する。
- 390×844、640×480、1920×1080、844×390、3840×2160で画面内の寸法と操作を検証し、画像を確認する。入力欄の確認だけは専用タブ内でゲスト向け非表示クラスを一時的に外して行い、認証状態は変えない。コメント本文・コマンド・送信ボタンの画面内配置と、入力補助が下部操作へ重ならないことを確認する。コメントやタグ変更の送信は行っていない。
- 結果は`dev-assets/verification/shell-report.json`、画像は`dev-assets/verification/shell-*.png`。配布物の再生成は`bun run build`。再実行時は`FUTATSUME_DEV_PORT`を専用ブラウザのポートへ設定する。

### 検証中に修正した不具合と制約

- 一般設定はPromiseをlitへ直接渡しており、開いても`[object Promise]`のみを表示していた。解決を待って描画し、内容の実操作まで検証するよう変更した。以前の「本体設定を開く／閉じる」の状態確認だけでは検出できなかった。
- 詳細設定のz-indexがプレイヤーより小さく、body直下では背後に隠れていた。表示中のプレイヤー内へ配置し、画面上の閉じるボタンまで操作できるようにした。
- 動画・コメント一覧の隔離iframeへ配色を反映し、仮想スクロールの固定行高は維持した。いいね数は保存・復元まで保持し、取得されていない値はゼロとせず「—」で表示する。
- 0.0.5のマネージャ再登録・更新適用、Firefox/Violentmonkey/Greasemonkey、ログイン状態での実投稿・タグ変更は未検証。今回のブラウザ検証は配布物注入であり、登録検証の代わりにはしない。以前からの機能別制約は以下の記録を引き継ぐ。
- README、更新手順、AGENTS、変更履歴とその他の運用文書を確認した。プッシュ・タグ・リリース公開は実施していない。

## 2026-09-20：コメントエンジン移行（0.0.4）

npmの`comment-overlay@4.1.6`を配布物へ同梱し、旧CSS描画・計測iframe・配置Workerを除去した。NicoCommentの解析、NG、置換、投稿者命令、一覧は保持する。追加した依存は1件で実行時の推移依存はない。旧エンジン継続では新パッケージへ描画を移す目的を満たせないため、旧計測・配置の再利用ではなく公開APIへ接続した。

採用調査（2026-09-20）：[公式リポジトリ](https://github.com/roflsunriz/comment-overlay)と[npmメタデータ](https://registry.npmjs.org/comment-overlay)で配布元を照合。4.1.6は2026-08-20公開、リポジトリの最終更新も同日、open issue/PRは0件、starは0、直近月のnpmダウンロードは298件。利用実績は小さいが、利用者の指定、直近の更新、MITライセンス、TypeScript型の提供を確認して採用した。公開d.tsの未解決aliasはパッケージ内の実ファイルへ解決し、型の代用はしていない。GitHub既定ブランチの説明だけでnpm実装を推測しない。

### 自動・実ブラウザ検証

- lint：error 0（既存の未使用宣言等202警告）。format・type-check・build成功。単体131件成功、依存監査で脆弱性0件。
- Chrome for Testingの別プロファイル`dev-assets/comment-overlay-profile`、headless、ポート9334で、生成した配布物を文書生成時に注入して実動画を再生した。操作中の9333のChromeと実利用Firefoxは変更していない。
- `scripts/dev-verify.ts --bundle`でsm9とsm2057168を確認。新エンジンの画素、動画より前面の表示、NG追加・解除、投稿プレビューと取り消し、停止・再表示、再生速度、透明度、フォント倍率、シーク、投稿者の`@15`、全画面、PNG生成、閉じた後の解放を検証する。
- 640×480・390×844・1920×1080でコメントCanvasが動画の実際の比率と表示幅に一致することを測定し、画像を目視確認した。画像は`dev-assets/verification/comments-*.png`。
- 保存HTMLはHTTP/HTTPSを遮断した別タブで描画・再生・停止・シークを実行した。PNGのダウンロードクリックは捕捉し、利用者のダウンロード先へ書き込まない。プレビュー追加はローカルのデータモデルだけで、公開サーバーへコメントを投稿していない。
- 最終の機能検証は55項目。レポートは`dev-assets/verification/report.json`、保存HTMLは`comment-export.html`。URL変更時は同じファイルを更新する。

再実行（初回はChrome for Testingを`bun run dev:setup`で準備）：

```powershell
$profile = Join-Path $PWD 'dev-assets/comment-overlay-profile'
Start-Process -FilePath (Join-Path $PWD 'dev-assets/chrome-win64/chrome.exe') -WindowStyle Hidden -ArgumentList @('--headless=new', '--disable-gpu', '--remote-debugging-port=9334', "--user-data-dir=$profile", '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank')
$env:FUTATSUME_DEV_PORT = '9334'
bun run dev:verify --bundle
bun run dev:verify --bundle --url https://www.nicovideo.jp/watch/sm2057168
Remove-Item Env:FUTATSUME_DEV_PORT
```

### 調査で修正した点・制約

- VideoPlayerの比率通知はheight/widthであり、width/heightと取り違えるとコメントが画面中央の細い領域へ切り取られる。既存の重なり順・親の全画面サイズと分離した内側の描画面で修正した。
- `_live`とレイヤー透明度の二重適用を防ぎ、フォント・影・逆方向・投稿者秒数の表示補助を保存HTMLと共有した。通常配置・文字計測・衝突判定はnpmへ委譲する。
- 空のフィルター結果が元配列と同じ実体になり、投稿プレビューを2回追加していた。コピーを保持し、不在コメントの削除で末尾を消さないよう修正した。
- `NicoVideoPlayer.setPlaybackRate`が存在しないコメントプレイヤーのメソッドを呼んでいたため、プロパティと時計イベントへ接続した。
- 閉じた後の遅延NG通知でCanvasが再生成されないようにした。検証スクリプト自身もWorker購読要求の完了を待って接続を閉じる。
- 今回の実動画検証は配布物注入であり、0.0.4のTampermonkey再登録・マネージャ権限確認は実施していない。以前のマネージャ実測記録は以下に残す。Firefox/Violentmonkey/Greasemonkey、YouTube連携の実動画、ログインした公開コメント投稿は未検証。
- 新エンジンの配置規則と影の見え方は旧CSSエンジンと異なる。Flashスロット切替は廃止したが、保存済みキーは削除しない。公開npm版の横流れコメントは表示基準より2秒前から進入を準備し、終端3秒前への丸めとは区別してテストしている。
- README、AGENTS、更新手順、変更履歴、貢献・サポート・セキュリティ・行動規範を照合した。ビルドは`bun run build`で配布物とMIT表示を再生成する。プッシュ・タグ・リリース公開は未実施。

## 2026-09-20：0.0.3のアイコン配置

利用者の指定に従い、視聴ページの起動ボタンをタイトル・いいね・投稿者・タグに囲まれる情報行へ移した。検索結果も二つの四角形のアイコンのみとし、右下のポップアップを削除した。非表示の版・状態マーカーとアクセシブルなボタン説明は保持する。

実機の導線検証は10項目。文字がないこと、SVGがあること、読み上げラベル、視聴用アイコンの親にタイトルがあり隣に投稿者情報があること、body内にポップアップがないことを確認する。検索・視聴からの実クリック再生、ページ内遷移と戻った後の再生も確認する。1920px/1280pxの画像で位置を確認し、390pxでもアイコンのヒットテストを確認した。画像はdev-assets/verification/entry-watch.png、entry-search.png、icon-watch-1280.png、icon-watch-390.png。

## 2026-09-20：利用者からの「入口がない」報告（0.0.2の記録）

前回の35項目は視聴URLを直接開く経路を中心に検証し、入口の存在確認とDOMのclick()を使っていた。検索→視聴のSPA遷移、初めて使う人に入口が見えること、導入前から開いていたタブへの適用を確認していなかった。前回の結果を利用者の画面での動作保証として扱ったのは不十分だった。

利用者がbun run devで開いていたタグ検索ページでは、本体グローバルも起動マーカーもないことを実測。同じChromeの新規視聴ページでは実行され、元のタブも再読み込みで回復した。さらに、検索ページに固定の入口がないことと、検索→視聴へページ内遷移してもwatch-entryが再実行されない実装上の欠落を確認した。

0.0.2では起動中・準備完了・失敗を示すパネルを初期化の早い段階で作成し、検索結果へ明示的なボタンを追加した。起動操作は表示・寸法・ヒットテストを通った箇所へマウス入力を送る方式へ変更した。戻った検索ページが開いたままのプレイヤーに覆われる問題も修正した。

追加検証：

- 単体：初期化失敗表示、リンク差替え・重複防止、検索/視聴の履歴遷移、他ホスト拒否、戻る際のURL/state保持。
- 実機：bun run devのマネージャ導入と版確認、検索結果から再生、タグ検索から標準動画リンクでSPA遷移、視聴ページの入口から再生、戻った後に再度再生。scripts/dev-verify-entry.ts、結果はdev-assets/verification/entry-report.json、画像はentry-search.pngとentry-watch.png。
- 追加した導線の8項目と、以前の視聴ページ35項目を継続実行する。前回から引き継いだ未検証事項を以下に残す。

最終確認：`bun run dev` をそのまま実行し、導入・ページ適用確認・導線8項目・再生等35項目が連続して成功した。単体テスト125件、型検査・整形・ビルド成功、lint error 0件。

## 2026-09-19の確認結果（旧版の記録）

TypeScriptの拡張子変換だけでは起動できていませんでした。旧連結ビルドの例外を実ページで再現して修正し、Bunで実行するVite＋vite-plugin-monkeyへ移行しました。通常のimport依存から単一のdist/FutatsumeWatch.user.jsを生成します。Bun.buildへの移行ではなく、Vite内部はRolldownです。

### 自動検査

```powershell
bun run lint
bun run format
bun run type-check
bun run build
bun run test
bun audit
```

- TypeScript: strict、allowJs:false、allowUmdGlobalAccess:false。設定ファイルeslint.config.mjsと生成物を除き、製品・テスト・ビルドスクリプトはTypeScript。
- ビルド: 配布物1件、ヘッダーの版、classic script構文、外部@requireの不在を検査する。
- 単体テスト: 旧設定の移行・既存値の優先・破損値、空DOM配列、現行APIのdmcInfo:nullを含む119件。
- 依存監査: 旧Babel・webpack・mochaを除去し、jsdomを更新。bun auditで脆弱性0件。
- CI: .github/workflows/ci.ymlに同じ品質確認と生成物の一致検査を追加。リモートへプッシュしていないためGitHub Actions自体は未実行。

### 実際の配布物のブラウザ検証

環境はWindows、Bun 1.4.0、Chrome for Testing 153.0.8010.52、Tampermonkey 5.5.0。専用ChromeDevプロファイル、headless、raw CDPを使用。実利用Firefoxのプロファイルは操作していない。

```powershell
bun run build
bun scripts/dev-browser.ts start --headless
bun run dev:install
bun run dev:verify
bun run dev:verify -- --url https://www.nicovideo.jp/watch/sm2057168
bun run dev:verify:addons
```

実ページのsm9と、ページ上の実在リンクから選んだsm2057168で、それぞれ35項目を確認した。製品例外・Worker例外は0件。主な判定は以下。

| 対象         | 確認した挙動                                                                          |
| ------------ | ------------------------------------------------------------------------------------- |
| 起動         | TMによる実配布物の実行、ready、旧名との同一性、プレイヤー生成、動画ページの再生ボタン |
| HLS          | 動画の時間進行、readyState、メディアエラーの不在、一時停止、30秒へのシーク、再生復帰  |
| コメント     | 実サーバーから取得したコメントの解析、画面上の描画、非表示と再表示                    |
| 音声         | ミュートと復帰                                                                        |
| 設定         | 本体設定の開閉、詳細設定の変更、localStorage保存、元の値への復元、閉じる操作          |
| 追加設定     | HLS、GamePad、HeatSync、MaskedWatchの設定画面を開閉                                   |
| プレイリスト | 有効化と状態復元                                                                      |
| 表示         | 640×480、390×844、1920×1080でプレイヤーと動画領域が画面内に収まること（画像でも確認） |
| 復帰         | プレイヤーを閉じる、再生ボタンへ戻る、再度再生する                                    |

scripts/dev-verify.tsの結果はdev-assets/verification/report.json、画面はplayer.pngに保存する。成果物はGit管理外。URLを変えると同じファイルを更新する。

### 別ページの機能

scripts/dev-verify-addons.tsは隔離コンテキストで外部通信を遮断し、固定HTMLとブラウザでエンコードしたWebM映像を使う。実サイトでの確認と同一視しない。

- CapTube: 起動、映像描画、低速化・速度復帰、入力欄でのショートカット抑止、PNG生成・プレビュー・ダウンロード導線を確認。保存リンクのクリックをテスト内で捕捉し、利用者のダウンロードフォルダへ書き込まない。
- ブログパーツ: ボタン生成、通常クリックのopen、Shiftクリックのsendと動画IDを確認。親宛てメッセージの内容を捕捉する。
- 合計9項目。記録はdev-assets/verification/addons.json。

### 修正の根拠

- 旧_templateのconst consoleに連結されたutilが再代入し、TMでAssignment to constant variableを再現した。
- uQueryのArray.fromが引数なしの配列サブクラスを作ると、undefinedのSymbol.toStringTag参照で停止した。空生成とnullish判定を修正しテスト化した。
- ES2022のクラスフィールド生成が親の初期化済み_viewを消していた。useDefineForClassFields:falseで従来の生成規則を維持する。
- 未接続だったConfig・共有イベント・デバッグ情報を実モジュールへ接続し、ホストページのlodash/jQueryを上書きしない構成にした。
- 現行APIのdmcInfo:nullをVideoInfoModelが扱えず停止した。nullを含む退行テストを追加した。
- バンドルで匿名化されたStoryboardクラスを文字列だけでWorkerへ渡すとSyntaxErrorになる。factoryにEmitterを渡して生成する形へ修正し、Worker例外の収集を追加した。
- HLS先読みの未定義stats/context参照とバッファ長を修正した。配布HLSは固定したnpm依存を同梱する。
- TMのチェックボックスは行選択であり有効化ではなかった。.enablerの実状態を確認する。旧verifyはグローバルの存在だけで合格したが、現在は実操作で判定する。
- CapTubeは作者DOM不在で停止し、埋め込みサムネイルでPromiseを返していた。入力欄のキー横取りも含め修正した。

生成物の再ビルドでSHA-256が一致することも確認した。lintはerror 0件（既存の未使用宣言等のwarnは残る）、format・type-check・build・testは成功。

## 未確認・制約と再開条件

| 対象                 | 確認できない理由・次に必要な検証                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 認証操作             | 検証プロファイルのmylists APIは401 UNAUTHORIZED。ログイン済みの分離プロファイルで、マイリスト・あとで見る・コメント投稿・いいね等を別途検証する。投稿や削除を勝手に実行しない                       |
| MylistFilter         | 同梱・ページ条件による起動経路はあるが、旧MylistHelperと旧DOMへの依存が残る。認証済みの現行マイリストページを採取し、現在のデータと操作導線に合わせる必要がある。現行ページで動作確認済みとはしない |
| MylistPocket         | 初期化、連携、実動画情報の取得と表示・閉じる操作を確認。NG/Fav・マイリスト操作を含む全操作の網羅検証は未実施                                                                                        |
| ゲームパッド         | 設定画面と初期化を確認。実測接続数0のため実機入力・切断復帰は未確認                                                                                                                                 |
| MaskedWatch          | 設定画面は確認。検証ChromeでFaceDetector/TextDetectorはundefinedのため顔・文字検出自体は未確認。Firefoxを含めた代替検出方式の評価が必要                                                             |
| その他の詳細操作     | HLSキャッシュの全設定組合せ、投稿者コメントの全命令、YouTube実ページの全世代のDOM等は網羅していない                                                                                                 |
| ブラウザ・マネージャ | Firefox/Violentmonkey/Greasemonkeyは未検証。実利用プロファイルには触れていない                                                                                                                      |

全機能の完了宣言はしない。最低条件の「初期化から実再生まで動く配布物」と、それを固定する再現可能な検証を達成した段階である。

## フィクスチャと通信

test/fixtures/cdp/scenes/watch-sm9-cdp.jsonは以前採取した実ページのcurated記録。HTML・API・コメント・プレイリストを保持し、映像セグメント・広告・環境依存ホスト・署名は除去する。POSTメソッドとJSON妥当性を維持する。実環境にはNicoCache系プロキシや別スクリプトが混在するため、第三者の広告通信エラーと製品例外を分けて判定する。

## 採用したビルド依存

[Vite公式](https://vite.dev/guide/)と[vite-plugin-monkey公式](https://github.com/lisonge/vite-plugin-monkey)の構成に従う。npmメタデータでvite-plugin-monkey 8.1.1のpeerがVite 8、2026-08-30更新であることを確認して採用した。旧ビルダーをプラグインで包む案では連結スコープ問題が残るため、通常のモジュール依存へ移した。lockfileと全検証を更新し、実際のコード・Worker・マネージャ実行で互換性を判定した。
