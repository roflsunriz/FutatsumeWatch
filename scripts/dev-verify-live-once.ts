import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { monitorLiveRead } from './live-capture';
import type { CdpSession } from './dev-cdp';
import { scrubText } from './live-capture-policy';

const preflight = Bun.argv.includes('--preflight');
const attempt = preflight ? `preflight-${Date.now()}` : Bun.argv[Bun.argv.indexOf('--attempt') + 1];
if (!preflight && (!Bun.argv.includes('--attempt') || !attempt || !/^[a-z0-9-]{4,80}$/.test(attempt)))
  throw Error('--attemptに承認された試行IDが必要です');
const root = resolve(import.meta.dir, '../dev-assets/live-capture');
mkdirSync(root, { recursive: true });
const directory = resolve(root, attempt!);
mkdirSync(directory, { recursive: true });
if (await Bun.file(resolve(directory, 'attempt-started.json')).exists())
  throw Error('この試行IDは実行済みです。追加試行には利用者の承認が必要です');
const source = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
if (!(await Bun.file(new URL('../dev-assets/chrome-win64/chrome.exe', import.meta.url)).exists()))
  throw Error('ローカルChromeがありません。外部取得は自動実行しません');
process.env.FUTATSUME_DEV_PORT = '9334';
process.env.FUTATSUME_TEST_OFFLINE = '0';
const { attachBrowser, evaluate, cleanupCdp } = await import('./dev-cdp');
const { clickVisible } = await import('./dev-ui');
let owned = false;
const launch = async (action: string): Promise<void> => {
  const child = Bun.spawn([process.execPath, 'scripts/dev-browser.ts', action, '--test'], {
    cwd: resolve(import.meta.dir, '..'),
    env: { ...process.env, FUTATSUME_TEST_OFFLINE: '1' },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (await child.exited) throw Error(`専用Chromeの${action}に失敗しました`);
};
const hits: string[] = [];
const server = preflight
  ? Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        hits.push(request.method + ' ' + path);
        if (path === '/')
          return new Response(
            `<html><body><script>window.done=false;(async()=>{const read=await fetch('/data');window.first=await read.text();try{await fetch('/data')}catch{}try{await fetch('/write',{method:'POST',body:'x'})}catch{}try{await fetch('/v1/watch/sm9/access-rights/hls',{method:'POST',body:'{}'})}catch{}const bad=await fetch('/failure');window.failure={status:bad.status,body:await bad.text()};try{await fetch('/failure')}catch{}const w=new Worker(URL.createObjectURL(new Blob(["async function _createSession(){const r=await fetch("+JSON.stringify(location.origin+'/v1/watch/sm9/access-rights/hls')+",{method:'POST',body:'{}'});if(r.status!==201)throw Error('session failed');return fetch("+JSON.stringify(location.origin+'/worker-data')+").then(r=>r.text());}_createSession().then(postMessage)"] ,{type:'text/javascript'})));w.onmessage=e=>{window.worker=e.data;window.done=true};})();</script></body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
          );
        if (path === '/v1/watch/sm9/access-rights/hls')
          return new Response('{"meta":{"status":201}}', {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        if (path === '/failure')
          return new Response('{"reason":"fixture failure","token":"private"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
          });
        return new Response(path === '/data' ? 'first response' : 'worker response', {
          headers: { 'Content-Type': 'text/plain' },
        });
      },
    })
  : undefined;
let browser: Awaited<ReturnType<typeof attachBrowser>> | undefined;
let page: CdpSession | undefined;
let contextId: string | undefined;
let monitor: Awaited<ReturnType<typeof monitorLiveRead>> | undefined;
const result: {
  status: string;
  failure?: string;
  checks: string[];
  bundleSha256: string;
  attempt: string;
  externalOperation: boolean;
  network?: unknown;
  cleanupErrors?: string[];
} = {
  status: 'preparing',
  checks: [],
  bundleSha256: createHash('sha256').update(source).digest('hex'),
  attempt: attempt!,
  externalOperation: !preflight,
};
try {
  await launch('start');
  owned = true;
  browser = await attachBrowser();
  const context = (await browser.send('Target.createBrowserContext', {
    proxyServer: 'direct://',
    proxyBypassList: '<-loopback>',
  })) as { browserContextId: string };
  contextId = context.browserContextId;
  monitor = await monitorLiveRead(browser, contextId, directory, server ? server.url.origin : undefined);
  const created = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId })) as {
    targetId: string;
  };
  page = await monitor.page(created.targetId);
  const connection = page;
  const until = async (expression: string, label: string, timeout = 30000): Promise<void> => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(connection, expression)) {
        result.checks.push(label);
        return;
      }
      await Bun.sleep(100);
    }
    throw Error(label + ' が成立しませんでした（追加通信は試しません）');
  };
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (!preflight)
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `document.addEventListener('DOMContentLoaded',()=>{${source}\n},{once:true})`,
    });
  // Persist before the only navigation, even if the browser or tool dies afterwards.
  writeFileSync(
    resolve(directory, 'attempt-started.json'),
    JSON.stringify({
      attempt,
      url: server?.url.href ?? 'https://www.nicovideo.jp/watch/sm9',
      startedAt: new Date().toISOString(),
      maxNavigations: 1,
      maxOpenClicks: 1,
      retry: false,
    }),
    { flag: 'wx' }
  );
  result.status = 'running';
  const navigation = (await page.send('Page.navigate', {
    url: server?.url.href ?? 'https://www.nicovideo.jp/watch/sm9',
  })) as { errorText?: string };
  if (navigation.errorText) throw Error('初回ナビゲーション失敗: ' + navigation.errorText);
  await page.send('Page.bringToFront');
  if (preflight) {
    await until('window.done===true', 'ローカル採取の完了', 10000);
    if (
      hits.filter((x) => x === 'GET /data').length !== 1 ||
      hits.some((x) => x === 'POST /write') ||
      !hits.includes('GET /worker-data')
    )
      throw Error('ローカルの再試行/書込み遮断が不一致: ' + JSON.stringify(hits));
    if (await evaluate(page, `window.first!=='first response'||window.worker!=='worker response'`))
      throw Error('初回またはWorker応答を受け取れません');
    if (
      hits.filter((x) => x === 'GET /failure').length !== 1 ||
      (await evaluate(page, `window.failure.status!==503||!window.failure.body.includes('fixture failure')`))
    )
      throw Error('失敗応答と再送遮断が不一致');
    result.checks.push('HTTP503の応答本文を保存し再送を遮断');
    if (hits.filter((x) => x === 'POST /v1/watch/sm9/access-rights/hls').length !== 1)
      throw Error('ページ側を遮断し本体Workerだけ許可する分離が不一致');
    result.checks.push('公式相当の先行再生要求を遮断し本体Workerの1回だけ許可');
    result.checks.push('同一要求は1回だけ送信', '書込み0件', 'Workerの初回要求を記録');
  } else {
    await until(
      `!!window.FutatsumeWatch?.ready&&document.querySelector('[data-futatsume-open]')?.disabled===false`,
      '実ページの起動導線'
    );
    await clickVisible(page, '[data-futatsume-open]');
    await until(
      `(()=>{const v=document.querySelector('futatsume-video')?.shadowRoot.querySelector('video');return v&&v.videoWidth>0&&v.currentTime>1&&!v.paused&&!v.error})()`,
      '実HLSデコードと時間進行',
      30000
    );
    await until(
      `(()=>{const r=window.FutatsumeWatch.debug.nicoCommentPlayer?._view.renderer;return r?.comments.length>0&&r.canvas.getContext('2d').getImageData(0,0,r.canvas.width,r.canvas.height).data.some((v,i)=>i%4===3&&v>0)})()`,
      'コメントの実描画',
      10000
    );
  }
  result.status = 'passed';
  const shot = (await page.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
  writeFileSync(resolve(directory, 'result.png'), Buffer.from(shot.data, 'base64'));
} catch (error) {
  result.status = 'failed';
  result.failure = scrubText(String(error));
  if (page)
    try {
      const shot = (await page.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
      writeFileSync(resolve(directory, 'failure.png'), Buffer.from(shot.data, 'base64'));
    } catch (captureError) {
      result.failure += '; screenshot: ' + String(captureError);
    }
} finally {
  monitor?.seal();
  const failures: string[] = [];
  try {
    await monitor?.flush();
  } catch (error) {
    failures.push(String(error));
  }
  if (monitor) {
    result.network = monitor.summary();
    if (monitor.summary().errors.length) result.status = 'failed';
  }
  try {
    await cleanupCdp(
      () => (contextId ? browser?.send('Target.disposeBrowserContext', { browserContextId: contextId }) : undefined),
      () => browser?.close()
    );
  } catch (error) {
    failures.push(String(error));
  }
  try {
    if (owned) await launch('stop');
  } catch (error) {
    failures.push(String(error));
  }
  await server?.stop(true);
  await monitor?.flush();
  if (monitor) {
    result.network = monitor.summary();
    if (monitor.summary().errors.length) result.status = 'failed';
  }
  if (failures.length) {
    result.cleanupErrors = failures;
    result.status = 'failed';
  }
  writeFileSync(resolve(directory, 'report.json'), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ status: result.status, checks: result.checks, failure: result.failure, directory }));
if (result.status !== 'passed') process.exitCode = 1;
