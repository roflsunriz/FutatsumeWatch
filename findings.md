# 調査知見

- 開発依存の `minimatch` は GHSA-g3hv-75wg-m249 の修正版 11.0.1 を override で指定する。ESLint と typescript-eslint の検査に加え、postcss-url の filter が一致・不一致を判定できることを確認する。上流依存が修正版を許容したら固定を見直す。
- ライブラリーのブラウザー検証では再生開始を待つ間に操作バーが自動で隠れる場合がある。プレイヤーへ実ポインターを移動し、表示を確認してから操作する。
- Workerを `toString()` で埋め込む経路は関数名・構造が実行契約。通常minifyへ置換せず、classic scriptとして解析し、専用browserのoffline suiteで確認する。
- 自動browser testはsuiteごとに専用port/profile/outputを使う。終了前に動画を停止して保留HLSを未捕捉通信と誤認しない。作成したTarget/BrowserContextと非同期監査を必ず回収する。
- 実site検証の許可単位は「対象操作1回+関連通信」。試行IDは送信前に使い切り、失敗後の再試行・書込み・後片付けへ許可を拡張しない。
- 公式playerと本体の再生権要求はURLだけで同一視しない。initiator/Worker/requestIdを照合し、不明な所有元は短時間待ってから拒否する。heartbeat視聴logは再生権から除外する。
- 長押しmenuはpointerup/cancel/blurで反復を止め、既存menu close完了を待って次操作する。touch/pointerは離脱eventでも即非表示にせず、狭画面ではmenu全体をviewport内scrollにする。
- `PlayerState.videoInfo` とdebug側modelは別instanceになり得る。fixture変更時は実製品が参照するstate/dialog双方を揃え、debug値だけの変更を成功扱いしない。
- video取得失敗は正式error transitionへ渡し、`isError` だけ変えてloadingを残さない。旧requestの遅い失敗・応答はgenerationで捨てる。
- 外部pageの起動buttonは検証済みvideo URL pathnameからIDを取り、1 ID 1個、表示中thumbnailを優先する。透明click layerに覆われる場合はcapture段階で実tapを受け、live IDや偽hostへ接続しない。
- nv-commentは資格情報なしの直接XHRを使い、外部pageでもiframe bridgeへ迂回しない。API発行のparams/threadKeyを保ち、取得失敗を別threadKeyで自動retryしない。
- 公式asset由来のtag編集keyはwatch responseから取り、`KEY_EXPIRED` 時だけ1回更新・再送する。実tag/post/mylist書込みは明示許可なしで行わない。
- 設定は現行台帳の項目だけを扱い、削除済みHLS UI・multi-tab・gamepad等を旧保存値から復活させない。再生に必要な内部HLS処理の削除とは区別する。
- DataStorage通知はbatch/generationを分け、配送時の現行値を確認する。遅い通知やlistener内再入で保存値と実再生速度を食い違わせない。
- シリーズAPIは現行 `/v2/series/{id}` をpage付きで全件取得し、途中失敗で既存playlistを置換しない。古いpage応答はgenerationで破棄する。
- README画像生成はofflineが既定。live撮影は専用Chrome/port/profileと使い切りattemptを用い、環境変数設定後にcapture moduleを動的importする。全画像とbrowser終了が成功した場合だけ出力を更新する。
- file削除は静的importだけでなく `@require`、DOM文字列、bundle到達性を確認する。filenameはkebab-caseだが公開API名と配布物名へ機械適用しない。
