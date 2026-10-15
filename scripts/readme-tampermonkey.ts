import { attach, evaluate, listTargets, waitFor } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { tampermonkeyOrigin } from './dev-tampermonkey';
import { annotate, capture, clearAnnotations, preparePage, until } from './readme-capture';
import { clickVisible } from './dev-ui';
import { VERSION } from '../src/app/version';

export async function openCapturePage(browser: CdpSession, url: string): Promise<CdpSession> {
  const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
  const target = await waitFor(
    async () => (await listTargets()).find((t) => t.id === targetId) ?? null,
    10000,
    '撮影タブ'
  );
  const page = await attach(target);
  await preparePage(page);
  const version = (await browser.send('Browser.getVersion')) as { userAgent: string };
  await page.send('Network.setUserAgentOverride', {
    userAgent: version.userAgent.replace('HeadlessChrome/', 'Chrome/'),
    acceptLanguage: 'ja-JP,ja;q=0.9',
  });
  await page.send('Page.navigate', { url });
  await page.send('Page.bringToFront');
  return page;
}

export async function captureTampermonkey(browser: CdpSession, directory: string): Promise<void> {
  const store = await openCapturePage(
    browser,
    'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=ja'
  );
  try {
    await until(
      store,
      `document.readyState==='complete'&&document.body.innerText.includes('Tampermonkey')&&document.querySelectorAll('button').length>0`,
      'Tampermonkeyの配布ページ'
    );
    // 配布ページの製品欄を切り出す。ブラウザ固有の案内バナーは画像に含めない。
    const clip = (await evaluate(
      store,
      `(()=>{const r=document.querySelector('h1').getBoundingClientRect(),y=Math.max(0,r.top-24);return{x:0,y,width:innerWidth,height:innerHeight-y,scale:1}})()`
    )) as { x: number; y: number; width: number; height: number; scale: number };
    await capture(store, directory, 'tampermonkey', clip);
  } finally {
    await store.close();
  }
  const origin = await tampermonkeyOrigin();
  const source = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      return new URL(request.url).pathname === '/FutatsumeWatch.user.js'
        ? new Response(source, { headers: { 'Content-Type': 'text/javascript' } })
        : new Response('Not found', { status: 404 });
    },
  });
  try {
    const existing = new Set((await listTargets()).map((t) => t.id));
    const nav = await openCapturePage(browser, new URL('/FutatsumeWatch.user.js', server.url).href);
    await nav.close();
    const askTarget = await waitFor(
      async () =>
        (await listTargets()).find((t) => !existing.has(t.id) && t.url.startsWith(`${origin}/ask.html`)) ?? null,
      15000,
      'スクリプトのインストール確認'
    );
    const ask = await attach(askTarget);
    try {
      await preparePage(ask);
      await until(ask, `!!document.querySelector('input.button.install:not(:disabled)')`, 'インストールボタン');
      await Bun.sleep(500);
      await evaluate(
        ask,
        `(()=>{window.scrollTo(0,0);for(const e of document.querySelectorAll('*'))if(e.scrollTop)e.scrollTop=0})()`
      );
      await annotate(ask, [{ selector: 'input.button.install', text: '内容を確認して「インストール」' }]);
      await capture(ask, directory, 'install');
      await clearAnnotations(ask);
      await clickVisible(ask, 'input.button.install');
    } finally {
      await ask.close();
    }
    const dash = await openCapturePage(browser, `${origin}/options.html#nav=dashboard`);
    try {
      await until(
        dash,
        `Array.from(document.querySelectorAll('tr.scripttr')).some(r=>r.querySelector('.script_name')?.textContent.trim()==='FutatsumeWatch'&&r.querySelector('.script_version')?.textContent.trim()===${JSON.stringify(VERSION)})`,
        '登録された現行版'
      );
      // このプロファイルには撮影対象の1件だけを登録する。
      await clickVisible(dash, 'tr.scripttr input[type="checkbox"]');
      const select = 'select:has(option[value="5"]):has(option[value="8"])';
      await clickVisible(dash, select);
      // 表示名や生成IDではなく、採取済みTampermonkeyの操作値で選ぶ。更新そのものは実行しない。
      await evaluate(
        dash,
        `(()=>{const s=document.querySelector(${JSON.stringify(select)});s.value='5';s.dispatchEvent(new Event('change',{bubbles:true}));})()`
      );
      await dash.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      });
      await dash.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      });
      await until(dash, `document.querySelector(${JSON.stringify(select)}).value==='5'`, '更新確認の選択');
      await annotate(dash, [
        { selector: 'tr.scripttr input[type="checkbox"]', text: 'FutatsumeWatchの行にチェック' },
        { selector: select, text: '「更新を確認」を選び、右の「実行」' },
      ]);
      await capture(dash, directory, 'update');
      await clearAnnotations(dash);
    } finally {
      await dash.close();
    }
  } finally {
    await server.stop(true);
  }
}
