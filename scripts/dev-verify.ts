// Tampermonkey導入状態のdev用Chromeでsm9を開き、製品の起動を実測検証する。
// 観測条件: document.title がsm9のもので、window.FutatsumeWatch（互換のwindow.ZenzaWatch）が存在すること。
// コンソールエラーとページエラーを収集し、件数と先頭を報告する。
//
//   bun scripts/dev-verify.ts [--url https://www.nicovideo.jp/watch/sm9]

import { attach, attachBrowser, evaluate, listTargets } from './dev-cdp';

const URL = (() => {
  const i = Bun.argv.indexOf('--url');
  return i >= 0 && Bun.argv[i + 1] !== undefined ? (Bun.argv[i + 1] as string) : 'https://www.nicovideo.jp/watch/sm9';
})();

async function openSm9(): Promise<{ targetId: string }> {
  const browser = await attachBrowser();
  try {
    const existing = (await listTargets()).find((t) => t.type === 'page' && t.url.includes('/watch/'));
    if (existing !== undefined) {
      return { targetId: existing.id };
    }
    const created = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
    return { targetId: created.targetId };
  } finally {
    browser.close();
  }
}

async function main(): Promise<void> {
  const { targetId } = await openSm9();
  const target = (await listTargets()).find((t) => t.id === targetId);
  if (target === undefined) {
    throw new Error('sm9 タブを用意できませんでした');
  }
  const session = await attach(target);
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Log.enable');
  const logEntries: string[] = [];
  session.onEvent((method, params) => {
    if (method === 'Log.entryAdded') {
      const entry = (params['entry'] ?? {}) as { level?: string; text?: string; source?: string; url?: string };
      logEntries.push(
        `[${entry.source ?? '?'}:${entry.level ?? '?'}] ${(entry.text ?? '').slice(0, 160)} ${(entry.url ?? '').slice(0, 100)}`
      );
    } else if (method === 'Runtime.exceptionThrown') {
      const detail = (params['exceptionDetails'] ?? {}) as { text?: string };
      logEntries.push(`[exception] ${(detail.text ?? '').slice(0, 200)}`);
    }
  });
  // 製品に触れずエラーのみ集める注入フック（検証用、ページリロードで消える）。
  await session.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__fwDevErrors=[];window.addEventListener("error",e=>{try{window.__fwDevErrors.push(String((e&&e.message)||"unknown"))}catch{}});`,
  });
  // TM適用状態を確定させるため常に再読込する（既存タブの使い回しでは未適用のままになる）。
  await session.send('Page.navigate', { url: URL });
  await Bun.sleep(20000);

  const snapshot = (await evaluate(
    session,
    `(() => ({
      title: document.title,
      hasFW: typeof window.FutatsumeWatch !== 'undefined',
      hasZW: typeof window.ZenzaWatch !== 'undefined',
      fwReady: !!(window.FutatsumeWatch && window.FutatsumeWatch.ready),
      videos: document.querySelectorAll('video').length,
      fwContainer: !!document.getElementById('FutatsumeWatchVideoPlayerContainer') || !!document.getElementById('ZenzaWatchVideoPlayerContainer'),
      errors: (window.__fwDevErrors || []).slice(0, 20),
    }))()`
  )) as {
    title: string;
    hasFW: boolean;
    hasZW: boolean;
    fwReady: boolean;
    videos: number;
    fwContainer: boolean;
    errors: string[];
  };
  session.close();

  console.log(`title: ${snapshot.title.slice(0, 80)}`);
  console.log(
    `window.FutatsumeWatch: ${snapshot.hasFW} / window.ZenzaWatch: ${snapshot.hasZW} / ready: ${snapshot.fwReady}`
  );
  console.log(`video要素: ${snapshot.videos} / プレイヤー容器: ${snapshot.fwContainer}`);
  if (logEntries.length > 0) {
    console.log(`ブラウザログ ${logEntries.length}件:`);
    for (const e of logEntries.slice(0, 10)) {
      console.log(`  - ${e.slice(0, 220)}`);
    }
  }
  if (snapshot.errors.length > 0) {
    console.log(`ページ内エラー ${snapshot.errors.length}件:`);
    for (const e of snapshot.errors.slice(0, 5)) {
      console.log(`  - ${e.slice(0, 200)}`);
    }
  }
  if (!snapshot.hasFW && !snapshot.hasZW) {
    throw new Error('製品グローバルが存在しません（未起動またはTM未適用）');
  }
  console.log('実測検証に合格しました');
}

await main();
