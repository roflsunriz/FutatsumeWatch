# マイリストAPIの検証記録

2026-09-29、利用者が指定した9222番ポートのChromeに接続し、視聴ページと`https://www.nicovideo.jp/my/mylist`で読み込まれた公式JavaScriptをraw CDPの`Debugger.getScriptSource`で採取した。採取物はGit管理外の`dev-assets/official-mylist-2026-09-29/`と`dev-assets/official-mylist-2026-09-29--my-mylist/`に保存した。後者の`1-vendor.pretty.js`と`3-8303_76e93dea3e611f3bd791.pretty.js`をPrettierで整形して要求生成と実際の呼出し元を照合した。元の配信URLは[生成クライアント](https://resource.video.nimg.jp/web/scripts/bundle/vendor.js?1790648776)と[公式マイリスト画面](https://resource.video.nimg.jp/web/scripts/bundle/pages_user_UserPage.js?1790648776)。これらは2026-09-29の配信世代の証拠であり、将来の契約を保証しない。

書込み要求には`X-Frontend-Id: 6`、`X-Frontend-Version: 0`、`X-Request-With: https://www.nicovideo.jp`を付け、資格情報を含める。公式の生成クライアントは`frontendId`と`frontendVersion`をクエリに入れる分岐も持つが、今回の実装は既存の動作経路と同じヘッダー形式を使う。9222の画面内でGETした`/v1/users/me/mylists`と`/v1/users/me/watch-later`はHTTP 200・`meta.status: 200`だった。リストは空であり、本人データのIDや内容は保存していない。実書込みは行っていない。

| 操作                   | 公式要求                                       | 主要パラメータ                                                                                |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 一覧                   | `GET /v1/users/me/mylists`                     | 応答`data.mylists`                                                                            |
| リスト作成             | `POST /v1/users/me/mylists`                    | formの`name`、`description`、`isPublic`、`defaultSortKey`、`defaultSortOrder`                 |
| リスト更新             | `PUT /v1/users/me/mylists/<id>`                | 同じform。名前・説明・公開設定を含む                                                          |
| リスト削除             | `DELETE /v1/users/me/mylists/<id>`             | ID                                                                                            |
| 登録動画一覧           | `GET /v1/users/me/mylists/<id>`                | `page`、`pageSize`。`data.mylist.items`と`hasNext`                                            |
| 動画追加               | `POST /v1/users/me/mylists/<id>/items`         | クエリの`itemId=<動画ID>`、`description=<メモ>`。公式画面は201を新規、200を登録済みとして扱う |
| 動画削除               | `DELETE /v1/users/me/mylists/<id>/items`       | クエリの`itemIds=<登録項目ID>`                                                                |
| 動画メモ・コメント編集 | `PUT /v1/users/me/mylists/<id>/items/<itemId>` | formの`description`                                                                           |
| とりマイ取得           | `GET /v1/users/me/watch-later`                 | `page`、`pageSize`。`data.watchLater.items`と`hasNext`                                        |
| とりマイ追加           | `POST /v1/users/me/watch-later`                | formの`watchId`、`memo`                                                                       |
| とりマイ削除           | `DELETE /v1/users/me/watch-later`              | クエリの`itemIds=<登録項目ID>`                                                                |
| とりマイメモ編集       | `PUT /v1/users/me/watch-later/<itemId>`        | formの`memo`                                                                                  |

「コメント」は公式マイリスト画面の項目メモに対応する`description`／`memo`である。取得専用の旧`/mylistcomment/video/<id>`リンクを独立した書込みAPIとしては扱わない。通常マイリストへの追加は、とりマイからの削除を伴わない。移動は明示操作の場合に限る。

実装は`packages/lib/src/nico/mylist-management-api.ts`、UIは`src/mylist/mylist-manager.ts`。単体テストは要求形式・項目ID・失敗時の拒否を検査する。`bun run test:browser library --offline`は状態付きフィクスチャへ操作し、実アカウントへ書き込まない。実サイトでの作成・変更・削除・コメント編集の成功は未検証。以前の単発実測ルールと公開書込みの承認範囲は[単発検証記録](live-once-verification.md)に従う。
