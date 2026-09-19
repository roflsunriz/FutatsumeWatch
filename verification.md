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

## ブラウザでの動作確認（開発版＋Tampermonkey）

```powershell
bun run dev:setup   # 初回のみ（TM 5.5.0・Chrome for Testing 153.0.8010.52 を取得）
bun run dev         # ビルド→dev用Chrome起動（9333）→TMへ自動インストール→sm9で実測
```

- dev用Chromeは独自プロファイル（`Documents/.browser-debug/ChromeDev`）とポート9333を使い、`chrome-debug.ps1`（9222）と競合しない。
- Google Chrome ブランドでは `--load-extension` が無視されるため、自動化用の公式バイナリ（Chrome for Testing、同版）を使う。取得物は Git 管理外（`dev-extensions/`・`dev-assets/`）。
- TM 5.5（MV3）は初回のみ「ユーザー スクリプトを許可する」の手動有効化が要る（`bun scripts/dev-allow-userscripts.ts` が拡張ページを開く）。以降はプロファイルに保存される。
- TM確認ページ（ask.html）の承認と行トグルの有効化は `scripts/dev-install.ts` がCDPで自動化する。既登録時は確認を飛ばして登録確認へ進む。

## 既知の未解消事項（今回の検証では直さない）

- `bun run build` の生成物は FutatsumeWatch 名で正規規模を維持した（`dist/FutatsumeWatch.user.js` 約100万バイト、`dist/FutatsumeWatch-dev.user.js` 同規模、関連4種も新名で生成）。旧 `dist/Zenza*.user.js` 6件は削除済み。`src`/`dist` 差分比較とリリース手順（`how-to-update.md`）の確定は別途行う。
- CDP実ページ採取は sm9 で実測済みである（Chrome headless 153、`http://127.0.0.1:9222` の raw CDP、`test/fixtures/cdp/scenes/watch-sm9-cdp.json`）。生記録235件から静的資産・フォント・画像・映像セグメント・環境依存（`nicocachenl.test`）を除外し、署名クエリ（`session`・`Expires`・`Signature`・`Policy`・`actionTrackId` 等）を正規化した curated 17件（約243KB）として固定した。コメント取得は完全なコメント単位で打ち切り JSON 妥当に修復した（186件）。`thumbinfo`/`search` は本導線で呼ばれないため `watch-basic-sm9.json` で補う。
- `src/_hls.ts` の `preloadFragment` 内に束縛のない `stats` 参照があり、実行時に到達すると `ReferenceError` になる可能性がある。HLS ローダーの挙動変更になるため、別タスクで上流差分と実機検証のうえ修正する（`@ts-expect-error` で温存）。HLSシーンは構造固定の退行検出に留める。
- `src/boot.ts` が呼ぶ `GateAPI.exApi()` は上流3系統（segabito/kphrx/現行）いずれにも存在しないことを一次情報で確認済みのため別タスク化が確定した（`@ts-expect-error` で温存）。
- dev実測（`bun run dev:verify`）は未合格である。TM登録・有効化・User Scripts API許可までは自動確認済みで、export修正後は sm9 上で `window.ZenzaWatch` の出現まで前進したが、`ready` に至らずプレイヤー容器が出ない。`api`・`init`・`external` が空のまま止まり、製品由来の例外もない。`dev-verify.ts` のブラウザログ収集（Log.entryAdded・exceptionThrown）で切り分けを続けること。`verification.md` の未解消事項に記録する。
- 実ブラウザでの動作確認は上記のとおりdev実測まで進めたが合格に至っていない。`src`/`dist` 差分比較と実機検証は別途行う。

## 再開条件

- `dist` 再生成時は、生成物とコミット済み `dist` の差分比較を行い、型注釈除去・整形以外の差がないことを確認してからリリース手順（`how-to-update.md`）を確定する。
- 新規ファイルは最初から lint・format・型検査の対象にする。
