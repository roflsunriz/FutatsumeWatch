# 検証手順

## TypeScript 基盤の検証コマンド

```powershell
bun run lint
bun run format
bun run type-check
bun run build
bun run test
```

期待結果はすべて終了コード 0 である。

- `lint`: 新規 TypeScript は strict（error）、既存 JavaScript は段階移行の例外として warn 表示に留める。error が 0 件であること。
- `format`: prettier 準拠を確認する。既存資産の除外は `.prettierignore` に理由付きで記載する。
- `type-check`: `tsc --noEmit` が成功すること。
- `build`: `scripts/build.ts` が既存 `build.js` を実行し、`dist/FutatsumeWatch.user.js` の `==UserScript==` と `@version` を検証すること。加えて全 `dist/*.user.js` へ `node --check` 構文検証を行い、静的 `import`/`export` 宣言の混入を検出すること。`.ts` 連結対象は `typescript.transpileModule`（ES2020/ESNext）で型注釈のみ除去する。
- `test`: `bun test --preload ./test/setup.ts` が成功すること（116件 passing）。環境依存（`localStorage`・`location`・`_`・`CSS`・`console.nicoru`・`Config` の restore 待ち）は `test/setup.ts` と各テストの起動順序で吸収し、製品コード側は変えない。CDP系は `test/fixtures/cdp/scenes/*.json` を `offline.ts` で解決し、未登録・広告系は例外にして外部へ出ないことを検証する。

従来の mocha 基盤は退役済み（`test/setup.js`・`test/mocha.opts`・`test:mocha` スクリプトを削除）。

## 既知の未解消事項（今回の検証では直さない）

- `bun run build` の生成物は FutatsumeWatch 名で正規規模を維持した（`dist/FutatsumeWatch.user.js` 約100万バイト、`dist/FutatsumeWatch-dev.user.js` 同規模、関連4種も新名で生成）。旧 `dist/Zenza*.user.js` 6件は削除済み。`src`/`dist` 差分比較とリリース手順（`how-to-update.md`）の確定は別途行う。
- CDP実ページ採取は sm9 で実測済みである（Chrome headless 153、`http://127.0.0.1:9222` の raw CDP、`test/fixtures/cdp/scenes/watch-sm9-cdp.json`）。生記録235件から静的資産・フォント・画像・映像セグメント・環境依存（`nicocachenl.test`）を除外し、署名クエリ（`session`・`Expires`・`Signature`・`Policy`・`actionTrackId` 等）を正規化した curated 17件（約243KB）として固定した。コメント取得は完全なコメント単位で打ち切り JSON 妥当に修復した（186件）。`thumbinfo`/`search` は本導線で呼ばれないため `watch-basic-sm9.json` で補う。
- `src/_hls.ts` の `preloadFragment` 内に束縛のない `stats` 参照があり、実行時に到達すると `ReferenceError` になる可能性がある。HLS ローダーの挙動変更になるため、別タスクで上流差分と実機検証のうえ修正する（`@ts-expect-error` で温存）。HLSシーンは構造固定の退行検出に留める。
- `src/boot.ts` が呼ぶ `GateAPI.exApi()` は上流3系統（segabito/kphrx/現行）いずれにも存在しないことを一次情報で確認済みのため別タスク化が確定した（`@ts-expect-error` で温存）。
- 実ブラウザでの動作確認は未実施。理由は改名の互換層とフィクスチャ基盤の確立を優先し、生成物の構文検証（`node --check`）と単体テスト（113件）で担保しているため。`src`/`dist` 差分比較と実機検証は別途行う。

## 再開条件

- `dist` 再生成時は、生成物とコミット済み `dist` の差分比較を行い、型注釈除去・整形以外の差がないことを確認してからリリース手順（`how-to-update.md`）を確定する。
- 新規ファイルは最初から lint・format・型検査の対象にする。
