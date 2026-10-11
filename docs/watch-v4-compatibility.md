# watchV4互換対応

## 根拠

2026-10-11に、NicoCache_nlの[watchV4対応コミット8f1954f](https://github.com/roflsunriz/NicoCache_nl/commit/8f1954f3b49eaa1f61d512c14a01c596363f5438)の`WatchVars.java`・`WatchRewriter.java`・`WatchV4UnitTest.java`と検証記録を読んだ。同実装は初期HTMLの`data.response.$watchV4.data`、直接`data`、`media.contents`の全グループ、`media.hls.url`を扱う。更新APIは動画IDを含まない`data.media`だけの応答があり、不透明なHLS値はURLとして利用しない。

公開sm9の匿名HTMLを1回だけ取得して、保存する値をフィールド名・型へ限定した。この応答は従来の`media.domand`形式だった。本文、Cookie、署名URL、編集キーを保存していない。今回のwatchV4実再生は行わず、上流で確認された構造を既存の人工メタデータ・生成HLSへ適用して検証する。

## 実装経路

- `packages/lib/src/nico/watch-response.ts`で新旧JSONとHTMLを共通化する。v4の値を優先し、外側に残るコメント・タグ等を保持する。HTTPとAPIのエラーを成功データとして扱わない。
- 動画情報のないmedia応答は、そのままモデルへ渡さず同じ動画の初期HTMLを1回だけ取得する。別動画や推測のv4更新APIへ再送しない。この読取りは本体とタグ編集キー更新で共有する。
- 全配信グループの画質をIDでまとめ、重複IDの可用性はORにする。解像度が明記されていない既知の品質IDは`720p`等の末尾からラベルを求める。利用不能な画質を選択肢へ出さない。
- 初期HLS URLを`DomandInfo`のシリアライズ経由でWorkerへ渡す。直接HLSでは旧`access-rights/hls`を呼ばず、指定画質と利用可能な最大解像度をプレイヤーへ渡してからsrcを設定する。`watch-hls-quality.ts`がHLSのレベルを選択する。直接URLの期限は推測せず、取得失敗時は既存の再読み込み経路で初期情報を取り直す。
- 従来の`media.domand`・アクセス権取得・Storyboardを維持する。新しい配信情報だけではStoryboardの旧アクセス権キーを発行できないため、キーのないv4へ旧Storyboard APIを要求しない。混在する応答が旧キーも提供した場合は既存経路を利用できる。v4独自のStoryboard更新契約は未確認。
- 視聴ページ判定とタグ編集キー更新にも同じ応答読取りを使う。キー期限切れ時の書込み再送は既存どおり1回に限定する。

## 回帰検証

`bun run test`で応答形式、品質グループの統合、旧フィールド保持、HTTP拒否、不透明なHLS値、視聴ページ判定、編集キー更新、HLSレベル選択を確認する。

`bun run test:browser functionality --offline`のwatchV4ケースは包み付きJSON・直接JSON・HTML・media応答・Nアニメ相当の外部ページを対象にする。実クリックによる起動、HLSのデコード画素、コメント描画、低／高／自動画質、停止状態・再生位置、旧配信権APIの不在、不正HLS値の拒否と再取得後の復帰を検証する。新旧全体は`bun run test:browser all --offline`で確認する。画像と通信監査は`dev-assets/verification/<実行ID>/`へ保存する。

実watchV4動画のログイン別動作、v4独自のStoryboard更新、Firefoxでの今回の新経路は未検証。これらをオフライン合格や上流の実測から保証したとは扱わない。
