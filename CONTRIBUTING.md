# 貢献手順

作業前にAGENTS.mdとCOMMON-AGENTS.mdを全文読みます。未コミット変更を保護し、TypeScriptのstrict設定とany禁止を維持してください。

ソースファイル名は小文字のケバブケースに統一します（例：`video-info-panel.ts`）。`.test.ts`、`.d.ts`、`.config.mts`などの役割を示す接尾辞は維持できます。lintで命名違反を検出します。改名時はimport・動的import・テストデータ参照・文書内のパスを同時に更新してください。

変更後はREADMEにある品質確認を実行し、UIや再生を変更した場合は実ブラウザで配布物を操作します。再現手順、期待結果、実際の結果と検証できなかった条件をverification.mdに記録し、CHANGELOG.mdを更新してください。

生成物は `bun run build` で更新します。コミットは日本語のConventional Commits形式とし、変更理由と検証結果を残してください。
