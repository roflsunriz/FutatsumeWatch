# 検証記録

## 2026-09-19の確認結果

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
