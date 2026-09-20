import { attach, attachBrowser, evaluate, evaluateAsync, listTargets } from './dev-cdp';
import type { CdpSession } from './dev-cdp';

const source = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
const checks: string[] = [];
async function check(session: CdpSession, expression: string, label: string): Promise<void> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await evaluate(session, expression)) {
      checks.push(label);
      console.log(`合格: ${label}`);
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error(`別ページ機能の検証失敗: ${label}`);
}
async function withPage(
  url: string,
  html: string,
  run: (session: CdpSession) => Promise<void>,
  referrer?: string
): Promise<void> {
  const browser = await attachBrowser();
  const context = (await browser.send('Target.createBrowserContext')) as { browserContextId: string };
  let session: CdpSession | undefined;
  const errors: string[] = [];
  try {
    const created = (await browser.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: context.browserContextId,
    })) as { targetId: string };
    const target = (await listTargets()).find((t) => t.id === created.targetId)!;
    session = await attach(target);
    const page = session;
    page.onEvent((method, params) => {
      if (method === 'Fetch.requestPaused') {
        const request = params.request as { url: string };
        const action =
          request.url === url
            ? page.send('Fetch.fulfillRequest', {
                requestId: params.requestId,
                responseCode: 200,
                responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
                body: Buffer.from(html).toString('base64'),
              })
            : page.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'BlockedByClient' });
        void action.catch((error: unknown) => errors.push(String(error)));
      }
      if (method === 'Runtime.exceptionThrown') {
        const detail = params.exceptionDetails as { exception?: { description?: string } };
        errors.push(detail.exception?.description ?? 'ページ例外');
        console.error(errors.at(-1));
      }
    });
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `document.addEventListener('DOMContentLoaded',()=>{${source}\n});`,
    });
    await page.send('Page.navigate', { url, ...(referrer ? { referrer } : {}) });
    await page.send('Page.bringToFront');
    try {
      await run(page);
    } catch (error) {
      console.error('収集した例外', errors);
      throw error;
    }
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    session?.close();
    await browser.send('Target.disposeBrowserContext', { browserContextId: context.browserContextId });
    browser.close();
  }
}

await withPage(
  'https://www.youtube.com/watch?v=fixture',
  '<!doctype html><title>Capture fixture</title><input id="search"><video class="html5-main-video" muted width="320" height="180"></video>',
  async (page) => {
    await check(page, `!!document.querySelector('#CapTubePreviewContainer')`, 'YouTubeページでCapTubeを起動');
    await evaluateAsync(
      page,
      `(async()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,320,180);window.__fixtureTimer=setInterval(()=>ctx.fillRect(0,0,320,180),100);const stream=canvas.captureStream(10);const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});const chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);const recorded=new Promise(r=>recorder.onstop=r);recorder.start();await new Promise(r=>setTimeout(r,1000));recorder.stop();await recorded;stream.getTracks().forEach(t=>t.stop());const video=document.querySelector('video');video.src=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));video.muted=true;video.loop=true;await video.play();})()`
    );
    await check(page, `document.querySelector('video').readyState >= 2`, 'キャプチャ対象映像を描画');
    await evaluate(page, `window.dispatchEvent(new KeyboardEvent('keydown',{key:'d'}))`);
    await check(page, `document.querySelector('video').playbackRate===0.1`, 'CapTube低速再生');
    await evaluate(page, `window.dispatchEvent(new KeyboardEvent('keyup',{key:'d'}))`);
    await check(page, `document.querySelector('video').playbackRate===1`, 'CapTube速度復帰');
    await evaluate(
      page,
      `document.querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'d',bubbles:true}))`
    );
    await check(page, `document.querySelector('video').playbackRate===1`, '入力欄のキー操作を横取りしない');
    await evaluate(
      page,
      `document.addEventListener('click',e=>{const a=e.target.closest?.('a[download]');if(a){e.preventDefault();window.__capture={name:a.download,url:a.href};}},true);window.dispatchEvent(new KeyboardEvent('keydown',{key:'s'}));`
    );
    await check(
      page,
      `!!document.querySelector('#CapTubePreviewContainer canvas') && !!window.__capture?.name.endsWith('.png')`,
      'CapTube画像生成・プレビュー・保存導線'
    );
  }
);

await withPage(
  'https://ext.nicovideo.jp/thumb/sm9',
  '<!doctype html><title>Embed fixture</title><body></body>',
  async (page) => {
    await check(page, `!!document.querySelector('#futatsumeButton')`, 'ブログパーツの起動ボタン');
    await evaluate(
      page,
      `window.postMessage=(data,origin)=>{window.__packet={data:JSON.parse(data),origin};};document.querySelector('#futatsumeButton').click();`
    );
    await check(
      page,
      `window.__packet.data.body.message.command==='open' && window.__packet.data.body.message.watchId==='sm9'`,
      'ブログパーツから動画を開く要求'
    );
    await evaluate(
      page,
      `document.querySelector('#futatsumeButton').dispatchEvent(new MouseEvent('click',{shiftKey:true,bubbles:true}));`
    );
    await check(page, `window.__packet.data.body.message.command==='send'`, 'ブログパーツのShift操作で送る要求');
  },
  'https://www.nicovideo.jp/watch/sm9'
);

await Bun.write(
  new URL('../dev-assets/verification/addons.json', import.meta.url),
  JSON.stringify({ checks, completed: true }, null, 2) + '\n'
);
console.log(`別ページの検証に合格しました（${checks.length}項目、外部通信なし）`);
