# 機能検証台帳

[承認済み計画](plan-functionality-test.md)の親ケースと実装先。テストが存在することと実行に成功したことを分ける。実行結果は[verification.md](../verification.md)と各実行ディレクトリの`run.json`・スイートレポートを参照する。表は対応先の台帳であり、未実行のケースを合格と宣言するものではない。

## 判定と実行

2026-09-21の承認済み実測はP1-01（再生）、P4-07（投稿受理）、P3-04（通常マイリスト追加）を確認した。P4-02（タグ追加）はKEY_EXPIRED、個別項目削除は公式画面停止で未送信。P4-09の投稿後再取得は未実施。新配布物のP4-05はヘッダー不在もオフラインで回帰確認する。公開操作の再試行は追加承認後のみ。詳細は[単発検証記録](live-once-verification.md)を参照。

- 単体・結合: `bun run test`。テスト名に前提・操作・期待結果を記す。
- 配布物の実操作: `bun run test:browser all --offline`。既存のentry/player/ui/settings/migration/addonsと、新規functionality/library/guardを実行する。
- 実サイト: `bun run test:browser player --live`等。投稿やタグ変更を扱うfunctionality/libraryはlive指定を拒否する。
- 出力: `dev-assets/verification/<実行日時>-<モード>-<ID>/<スイート>/`。`run.json`に配布物ハッシュ、コミット・差分ファイル、ブラウザ版、スイート別件数と所要時間、失敗を記録する。0件や未完了レポートは失敗。
- `offline-*.json`はページ・iframe・Worker・新規タブの通信、遮断、製品例外を監査する。guardだけは故意の未登録通信5件（Service Workerを含む）と起動直後のWorker例外2件を発生させ、close時の失敗を照合する。

## 基本操作

| ID    | 操作／期待結果                                      | 対応する自動検証                                 |
| ----- | --------------------------------------------------- | ------------------------------------------------ |
| P1-01 | 視聴・検索・タグ検索の入口→対象動画再生、SPAと戻る  | entry、functionality、watch-entry単体            |
| P1-02 | close→停止・描画破棄→再起動、終了後の遅延応答を無視 | ui、functionality、comment-overlay単体           |
| P1-03 | 実HLSの再生・停止・時計／フレーム進行               | player、ui、functionality                        |
| P1-04 | 次・前、選択ID・順序・動画切替                      | ui、library、playlist-navigation単体             |
| P1-05 | 実終端から同じ動画へリピート                        | functionality                                    |
| P1-06 | AB指定・不正B・解除・動画切替時の解除               | ui、player-shell単体                             |
| P1-07 | 全速度選択肢→実mediaとコメント時計                  | functionality、player、ui                        |
| P1-08 | 音量・ミュートと実media値、端点                     | functionality、ui                                |
| P1-09 | シークの実入力→実時刻・コメント                     | functionality、ui、player                        |
| P1-10 | 時間表示と実mediaの秒数                             | functionality                                    |
| P1-11 | 既知分布の密度と画面上のヒートマップ、範囲外除外    | functionality、heat-map単体                      |
| P1-12 | 投稿プレビュー・取消・二重追加防止                  | player、ui、thread-post／comment-input-panel単体 |
| P1-13 | コメントON/OFF・復帰・比率・重なり                  | player、ui、comment-overlay単体                  |
| P1-14 | 全画面・Escape・寸法・設定パネル                    | player、ui、settings                             |
| P1-15 | 3秒非表示・入力／パネル中保持                       | ui                                               |

## 設定と左メニュー

全入力の子ケースIDは`P2-xx/<設定キー>`。`scripts/verify-settings-fields.ts`のカテゴリ別キー集合と実DOMを照合し、追加・消失・識別不能な入力を検出する。各キーは実入力→実保存キー／型／値→閉じる→再表示→復元を確認する。結果の`fields[].verifiedInputs`・`invalidInputs`・`saved`・`reopened`・`restored`で確認範囲を区別する。

`effect`欄は保存確認と別の観測である。利用側モデルへの到達だけを、実機入力・検出API・外部サービスとの連携まで確認したとは解釈しない。範囲や未確認事項はスイート結果とverification.mdに残す。

| ID    | 操作／期待結果                                                         | 対応する自動検証                                                                     |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| P2-01 | 利用可能な画質のみ表示、選択→実デコード寸法、時刻と停止状態保持        | functionality、video-info単体                                                        |
| P2-02 | GitHubの実クリック→正しい新規タブURL                                   | verify-menu-actions（functionalityから実行）                                         |
| P2-03 | 再読み込み→同じ動画・時刻・設定、連続変更も反映                        | functionality、verify-menu-actions                                                   |
| P2-04 | 実保存ボタン→映像・コメントPNG、未読込／CORS失敗                       | verify-menu-actions、player、video-capture単体                                       |
| P2-05 | 公式ページを開く→現在の動画ID                                          | verify-menu-actions                                                                  |
| P2-06 | 書き出し、読み込み、取消、不正形式、部分保存失敗と復旧                 | settings、settings-storage／settings-input／config-migration単体                     |
| P2-07 | 一般プレイヤー設定の全入力、再生・クリック・全画面・Storyboardへの接続 | settings、settings-autoplay／settings-playback-effects／settings-library-effects単体 |
| P2-08 | コメント設定の全入力・描画パラメータへの反映                           | settings、settings-comment-presentation単体                                          |
| P2-09 | NG全入力、対象別除外と解除、古い通知による上書き防止                   | settings、settings-filter等の単体                                                    |
| P2-10 | 詳細設定全入力・正規表現・ダブルクリック・複数指入力と取消             | settings、settings-input／settings-filter単体                                        |
| P2-11 | HLS全入力・明示保存・実HLS設定への到達                                 | settings                                                                             |
| P2-12 | MaskedWatch入力、固定検出結果と実描画                                  | settingsの追加機能検証                                                               |
| P2-13 | GamePad入力、フェイク機器の接続・押下・軸・切断                        | settingsの追加機能検証                                                               |
| P2-14 | HeatSync入力、既知密度と実速度、除外条件・手動速度保持・切替復帰       | settingsの追加機能検証、settings-heatsync単体                                        |
| P2-15 | 全パネル・カテゴリ、背景／内部クリック、Escape、フォーカス、各寸法     | settings、settings-dialog単体                                                        |

## 一覧・タグ・投稿

| ID    | 操作／期待結果                                             | 対応する自動検証                                              |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| P3-01 | 投稿者一覧→プレイリストのID・順序、複数ページ              | library、playlist-api単体                                     |
| P3-02 | プロフィールの正しいリンク先                               | library                                                       |
| P3-03 | 市場入口・空白枠・ローダー撤去、周辺UI維持                 | library、video-info-panel単体                                 |
| P3-04 | 関連から後で見る／通常マイリスト選択→再取得                | library、tag-mylist-picker／tag-mylist-api単体                |
| P3-05 | 詳細タブ・動画リンク・行と対象ID                           | library、ui                                                   |
| P3-06 | コメント自動スクロール切替                                 | library                                                       |
| P3-07 | 日時・過去ログ・再取得・通常表示への復帰                   | library、thread-post単体                                      |
| P3-08 | コメント行メニュー・詳細・コピー／NG等                     | library、settings-filter単体                                  |
| P3-09 | 全コメントソート・再取得要求・表示順                       | library                                                       |
| P3-10 | 連続再生・リストリピート                                   | library、playlist-navigation単体                              |
| P3-11 | 全ソート・逆順・シャッフル、選択ID保持                     | library、playlist-model単体                                   |
| P3-12 | 行再生・削除・未視聴・消去・保存／復元                     | library、playlist-model／playlist-session単体                 |
| P4-01 | タグ編集開始・終了・権限                                   | library、tag-edit単体                                         |
| P4-02 | 追加・削除・失敗保持・ロック・古い応答                     | library、tag-edit単体                                         |
| P4-03 | タグ更新→再取得、一貫した状態                              | library、tag-edit単体                                         |
| P4-04 | 大百科あり／なし・表示とリンク                             | library、tag-edit単体                                         |
| P4-05 | ゲスト／ログイン表示、投稿キー401・本文保持・回復後1回送信 | functionalityのverify-authentication、comment-input-panel単体 |
| P4-06 | 入力・パレット・IME・75/76文字・投稿不可状態               | ui、comment-input-panel単体                                   |
| P4-07 | フォーム→通信→受理→モデル／表示                            | functionality、thread-post単体                                |
| P4-08 | 1操作1要求、送信中重複・拒否後再送・受理不明               | functionality、thread-post／comment-input-panel単体           |
| P4-09 | 受理コメントをAPI境界から再取得して照合                    | functionality                                                 |
| P4-10 | 拒否・切断・遅延・close／動画切替との競合                  | functionality、thread-post／comment-input-panel単体           |

## 実環境と代替検証の境界

設定の入力・保存・再表示・復元は`verify-settings-fields.ts`の88子IDを正本とし、実DOMとのキー差分も検査する。機能効果は、次の補足ケースと組み合わせて判定する。レポートの`fields[].effect`はその入力直後に同じブラウザで観測した範囲だけであり、単体での効果まで一律に合格へ変更しない。

| 設定の効果                                                     | 追加の検証先と層                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 自動再生・途中再開・YouTube最高画質                            | `settings-autoplay`・`settings-playback-effects`単体、settingsの実media                                                        |
| クリック・ダブルクリック全画面・自動全画面・タッチ有効化／取消 | `verify-settings-player`の実入力と描画                                                                                         |
| 複数起動・リンク置換・公式プレイヤー置換・前回セッション       | `settings-entry-effects`の実分岐・DOM・Storage・Broadcast境界                                                                  |
| Storyboard・投稿者説明の付与                                   | `settings-library-effects`のWorker／HTTP境界・対象ID・世代検査                                                                 |
| 配信方式の選択・HLS必須条件・関連チャンネル                    | `settings-stream-effects`の実Loader／Model／Session生成経路。DMCは保存済み旧形式の選択条件であり、現サービスの配信成功ではない |
| 終端時の全画面解除・説明欄の自動YouTube切替                    | `settings-video-events`のイベント接続とON/OFF・動画別指定・遅延取消                                                            |
| NG・コメント表示・影・フォント                                 | `settings-filter`・`settings-filter-sync`・`settings-comment-presentation`と、playerのCanvas画素・NG・比率・保存検証           |
| HeatSyncの短動画／タグ除外・手動速度・切替                     | `settings-heatsync`の実制御タイマーと、settingsの密度別実速度                                                                  |
| MaskedWatchの対応API・マスク解除                               | settingsの別コンテキストによるAPI不在・理由表示と、固定検出結果を通す実Worker・マスク画素                                      |

生成HLSの再生は実mediaで確認するが、元動画の公開配信を再確認したことにはならない。状態付きフェイクAPIへの反映は実サービスへの公開投稿ではない。固定のGamePad入力・検出結果は実機器／実検出APIの確認ではない。専用Chromeへの配布物注入はTampermonkey・Violentmonkey・Greasemonkeyの導入確認ではない。

実サイト・マネージャ・Firefox・実機の条件が揃わない項目は、代替結果とともにverification.mdへ阻害要因・リスク・再開条件を残す。上の対応表だけを根拠に全機能確認済みとしない。
