// Tampermonkeyへの開発版ユーザースクリプト自動インストール。
// dist配信→.user.jsへ遷移→TM確認ページ（ask.html）の承認ボタン押下までを自動化する。
// 前提: bun run dev:setup 済み、bun run dev:browse でdev用Chrome起動中。
//
//   bun scripts/dev-install.ts [--file FutatsumeWatch.user.js]

import { attach, attachBrowser, evaluate, listTargets, waitFor } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { VERSION } from '../src/version';
import { tampermonkeyOrigin } from './dev-tampermonkey';

const DIST = `${import.meta.dir}/../dist`;
const SERVE_PORT = 9343;
const FILE = Bun.argv.includes('--file')
  ? (Bun.argv[Bun.argv.indexOf('--file') + 1] as string)
  : 'FutatsumeWatch.user.js';

if (!/^[\w.-]+\.user\.js$/.test(FILE)) {
  throw new Error(`不正なファイル名です: ${FILE}`);
}
if (!(await Bun.file(`${DIST}/${FILE}`).exists())) {
  throw new Error(`生成物がありません: dist/${FILE}（先に bun run build:dev を実行してください）`);
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: SERVE_PORT,
  fetch(req) {
    const name = new URL(req.url).pathname.replace(/^\//, '');
    if (!/^[\w.-]+\.user\.js$/.test(name)) {
      return new Response('not found', { status: 404 });
    }
    return new Response(Bun.file(`${DIST}/${name}`), { headers: { 'content-type': 'text/javascript' } });
  },
});

let browser: CdpSession | undefined;
let installTargetId: string | undefined;
try {
  browser = await attachBrowser();
  const extensionOrigin = await tampermonkeyOrigin();
  // 利用者の空タブ・確認画面を再利用せず、この実行のタブだけを操作する。
  const existingIds = new Set((await listTargets()).map((target) => target.id));
  const created = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
  installTargetId = created.targetId;
  const blank = await waitFor(
    async () => (await listTargets()).find((target) => target.id === installTargetId) ?? null,
    10000,
    '導入用タブの作成'
  );
  const nav = await attach(blank);
  await nav.send('Page.navigate', { url: `http://127.0.0.1:${SERVE_PORT}/${FILE}` });
  nav.close();

  // 既登録の場合は確認ページが出ないため、出現しなければ登録確認へ進む。
  let freshInstall = true;
  try {
    await waitFor(
      async () =>
        (await listTargets()).find((t) => !existingIds.has(t.id) && t.url.startsWith(`${extensionOrigin}/ask.html`)) ??
        null,
      15000,
      'TM確認ページ（ask.html）の出現'
    );
  } catch {
    freshInstall = false;
    console.log('確認ページが出ませんでした（登録済みとして確認へ進みます）');
  }
  if (freshInstall) {
    const ask = (await listTargets()).find(
      (t) => !existingIds.has(t.id) && t.url.startsWith(`${extensionOrigin}/ask.html`)
    );
    if (ask === undefined) {
      throw new Error('TM確認ページを見失いました');
    }
    const session = await attach(ask);
    try {
      let clicked = 'not-found';
      const deadline = Date.now() + 10000;
      while (clicked !== 'clicked' && Date.now() < deadline) {
        clicked = (await evaluate(
          session,
          `(() => { const b = [...document.querySelectorAll('input.button.install')].find(x => !x.disabled); if (!b) return 'not-found'; b.click(); return 'clicked'; })()`
        )) as string;
        if (clicked !== 'clicked') await Bun.sleep(250);
      }
      if (clicked !== 'clicked') {
        throw new Error('承認ボタンが見つかりませんでした');
      }
      console.log('承認ボタンを押下しました');
    } finally {
      session.close();
    }

    await waitFor(
      async () => {
        const targets = await listTargets();
        return targets.some((t) => t.id === ask.id) ? null : (targets[0] ?? null);
      },
      15000,
      'TM確認ページの終了'
    );
    console.log(`インストールしました: ${FILE}`);
  }

  // TM 5.5 では新規登録が無効で入る場合があるため、ダッシュボードで行トグルを有効化する。
  const dashboard = (await browser.send('Target.createTarget', {
    url: `${extensionOrigin}/options.html#nav=dashboard`,
  })) as { targetId: string };
  const dash = await waitFor(
    async () => (await listTargets()).find((t) => t.id === dashboard.targetId) ?? null,
    10000,
    'TMダッシュボードの表示'
  );
  const dashSession = await attach(dash);
  try {
    let enabled = 'not-found';
    const deadline = Date.now() + 10000;
    while (enabled !== 'enabled' && Date.now() < deadline) {
      enabled = (await evaluate(
        dashSession,
        `(() => {
        const row = [...document.querySelectorAll('tr.scripttr')].find(e => e.querySelector('.script_name')?.textContent?.trim() === 'FutatsumeWatch');
        if (!row) return 'not-found';
        if (row.querySelector('.script_version')?.textContent?.trim() !== ${JSON.stringify(VERSION)}) return 'version-mismatch';
        const toggle = row.querySelector('.enabler');
        if (!toggle) return 'no-toggle';
        if (!toggle.classList.contains('enabler_enabled')) toggle.click();
        return toggle.classList.contains('enabler_enabled') ? 'enabled' : 'toggle-pending';
      })()`
      )) as string;
      if (enabled !== 'enabled') await Bun.sleep(250);
    }
    console.log(`スクリプト有効化: ${enabled}`);
    if (enabled !== 'enabled') {
      throw new Error(`スクリプトを有効化できませんでした: ${enabled}`);
    }
  } finally {
    dashSession.close();
  }
  console.log(
    '登録・有効化が完了しました。開いているページは必要に応じて手動で再読み込みし、ブラウザで操作してください。'
  );
  console.log(
    '初回は拡張機能の「ユーザー スクリプトを許可する」を有効にしてください。自動テストは bun run test:browser で別途実行できます。'
  );
} finally {
  try {
    if (browser && installTargetId && (await listTargets()).some((target) => target.id === installTargetId)) {
      await browser.send('Target.closeTarget', { targetId: installTargetId });
    }
  } finally {
    browser?.close();
    await server.stop();
  }
}
