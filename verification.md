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
- `build`: `scripts/build.ts` が既存 `build.js` を実行し、`dist/ZenzaWatch.user.js` の `==UserScript==` と `@version` を検証すること。
- `test`: `bun test` が成功すること（`src/version.ts` の退行防止テスト）。

従来の mocha テストは `bun run test:mocha` に退避している。

## 既知の未解消事項（今回の検証では直さない）

- 現 `src` ツリーから `build.js` を実行すると `dist/ZenzaWatch.user.js` が約300行しか生成されず、コミット済みの生成物（約33652行）を再現できない。`_template.js` が参照する `packages/lib/src/Emitter` などが存在しないため。生成物の検証はヘッダー（`==UserScript==`・`@version`）の存在までに留める。コミット済み `dist` は復元済みで、今回の変更では製品コードと生成物に手を入れていない。
- `src/_hls.js` の `preloadFragment` 内に束縛のない `stats` 参照があり、実行時に到達すると `ReferenceError` になる可能性がある。HLS ローダーの挙動変更になるため、別タスクで上流差分と実機検証のうえ修正する。
- 実ブラウザでの動作確認は未実施。理由は製品コードと生成物を変更していないため。`src` 変換や `dist` 再生成を行う際は、対象操作の実ブラウザ確認が必要になる。

## 再開条件

- `src` と `dist` の乖離を解消した後は、`bun run build` の生成物とコミット済み `dist` の差分比較を検証に加える。
- 新規ファイルは最初から lint・format・型検査の対象にする。TS へ変換したファイルは例外規定から外す。
