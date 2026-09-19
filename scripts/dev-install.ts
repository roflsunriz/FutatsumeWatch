// Tampermonkeyへの開発版ユーザースクリプト自動インストール。
// dist配信→.user.jsへ遷移→TM確認ページ（ask.html）の承認ボタン押下までを自動化する。
// 前提: bun run dev:setup 済み、bun run dev:browse でdev用Chrome起動中。
//
//   bun scripts/dev-install.ts [--file FutatsumeWatch-dev.user.js]

import { attach, attachBrowser, evaluate, listTargets, waitFor } from './dev-cdp';
import { checkInstallation, confirmAfterNavigation } from './dev-check-installation';
import { VERSION } from '../src/version';

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
  port: SERVE_PORT,
  fetch(req) {
    const name = new URL(req.url).pathname.replace(/^\//, '');
    if (!/^[\w.-]+\.user\.js$/.test(name)) {
      return new Response('not found', { status: 404 });
    }
    return new Response(Bun.file(`${DIST}/${name}`), { headers: { 'content-type': 'text/javascript' } });
  },
});

try {
  // 残存する前回の確認ページを閉じ、空タブを用意してから開始する。
  const browser = await attachBrowser();
  try {
    for (const stale of (await listTargets()).filter((t) => t.url.includes('/ask.html'))) {
      await browser.send('Target.closeTarget', { targetId: stale.id });
    }
    if ((await listTargets()).every((t) => !(t.type === 'page' && t.url === 'about:blank'))) {
      await browser.send('Target.createTarget', { url: 'about:blank' });
      await waitFor(
        async () => (await listTargets()).find((t) => t.type === 'page' && t.url === 'about:blank') ?? null,
        10000,
        '空タブの作成'
      );
    }
  } finally {
    browser.close();
  }
  const blank = (await listTargets()).find((t) => t.type === 'page' && t.url === 'about:blank');
  if (blank === undefined) {
    throw new Error('about:blank タブを用意できませんでした');
  }
  const nav = await attach(blank);
  await nav.send('Page.navigate', { url: `http://127.0.0.1:${SERVE_PORT}/${FILE}` });
  nav.close();

  // 既登録の場合は確認ページが出ないため、出現しなければ登録確認へ進む。
  let freshInstall = true;
  try {
    await waitFor(
      async () => (await listTargets()).find((t) => t.url.includes('/ask.html')) ?? null,
      15000,
      'TM確認ページ（ask.html）の出現'
    );
  } catch {
    freshInstall = false;
    console.log('確認ページが出ませんでした（登録済みとして確認へ進みます）');
  }
  if (freshInstall) {
    const ask = (await listTargets()).find((t) => t.url.includes('/ask.html'));
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
        return targets.some((t) => t.url.includes('/ask.html')) ? null : (targets[0] ?? null);
      },
      15000,
      'TM確認ページの終了'
    );
    console.log(`インストールしました: ${FILE}`);
  }

  // TM 5.5 では新規登録が無効で入る場合があるため、ダッシュボードで行トグルを有効化する。
  // 拡張IDは実行時に service_worker ターゲットから求める（unpacked のため固定できない）。
  const sw = (await listTargets()).find(
    (t) => t.url.startsWith('chrome-extension://') && t.url.includes('/background.js')
  );
  const extId = sw !== undefined ? (sw.url.split('/')[2] as string) : null;
  if (extId === null) {
    throw new Error('Tampermonkey の service_worker が見つかりません');
  }
  const browser2 = await attachBrowser();
  try {
    await browser2.send('Target.createTarget', {
      url: `chrome-extension://${extId}/options.html#nav=dashboard`,
    });
  } finally {
    browser2.close();
  }
  const dash = await waitFor(
    async () =>
      (await listTargets()).find((t) => t.url.includes('/options.html') && t.url.includes('dashboard')) ?? null,
    10000,
    'TMダッシュボードの表示'
  );
  const dashSession = await attach(dash);
  try {
    await Bun.sleep(3000);
    const enabled = (await evaluate(
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
    console.log(`スクリプト有効化: ${enabled}`);
    if (enabled !== 'enabled') {
      throw new Error(`スクリプトを有効化できませんでした: ${enabled}`);
    }
  } finally {
    dashSession.close();
  }
  await checkInstallation();
  for (const target of (await listTargets()).filter(
    (target) => target.type === 'page' && target.url.startsWith('https://www.nicovideo.jp/')
  )) {
    const page = await attach(target);
    try {
      const version = await evaluate(
        page,
        `document.querySelector('[data-futatsume-entry]')?.dataset.futatsumeVersion`
      );
      if (version === VERSION) continue;
      const editing = await evaluate(page, `document.activeElement?.matches('input,textarea,[contenteditable=true]')`);
      if (editing) {
        console.log('入力中のニコニコタブは保護しました。入力完了後に再読み込みしてください。');
      } else {
        await page.send('Page.reload');
      }
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/CDP connection closed|context.*destroyed|Cannot find context/i.test(error.message)
      )
        throw error;
      await confirmAfterNavigation(target.id);
    } finally {
      page.close();
    }
  }
} finally {
  await server.stop();
}
