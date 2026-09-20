import { attach, attachBrowser, cleanupCdp, evaluateAsync, listTargets } from './dev-cdp';
import { offlineReports, offlineSites, offlineTargetSessions } from './dev-offline';
import { verificationDirectory } from './dev-verification-output';

if (process.env.FUTATSUME_TEST_OFFLINE !== '1') throw new Error('通信遮断の負例検証はオフライン専用です');
const browser = await attachBrowser();
const { browserContextId } = (await browser.send('Target.createBrowserContext')) as { browserContextId: string };
const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId })) as {
  targetId: string;
};
const target = (await listTargets()).find((value) => value.id === targetId);
if (!target) throw new Error('遮断検証用のタブを取得できませんでした');
const page = await attach(target);
const pageUrl = 'https://fixture.invalid/unregistered-page';
const workerUrl = 'https://fixture.invalid/unregistered-worker';
async function verifyAdditionalTargets(): Promise<{
  closeRejected: boolean;
  failures: string[];
  observations: object[];
}> {
  const expected = [
    'https://fixture.invalid/unregistered-frame',
    'https://fixture.invalid/unregistered-popup',
    'https://fixture.invalid/unregistered-service-worker',
  ];
  const workerSource = `self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('message',event=>{event.waitUntil(fetch(${JSON.stringify(expected[2])}).then(()=>event.source.postMessage({marker:'guard-sw',blocked:false}),error=>event.source.postMessage({marker:'guard-sw',blocked:true,name:error.name})));});`;
  // Chrome fetches a Service Worker's entry script before its target can be
  // paused. This owned loopback server serves that exact script only; external
  // origins still use the denying proxy and the shared Fetch audit.
  const served: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      served.push(`${request.method} ${new URL(request.url).pathname}`);
      if (request.method === 'GET' && request.url === `${origin}/worker.js`)
        return new Response(workerSource, { headers: { 'Content-Type': 'application/javascript' } });
      return new Response('unregistered loopback request', { status: 403 });
    },
  });
  const origin = `http://127.0.0.1:${server.port}`;
  const targetBrowser = await attachBrowser({ offlineLoopbackOrigin: origin });
  const { browserContextId: contextId } = (await targetBrowser.send('Target.createBrowserContext')) as {
    browserContextId: string;
  };
  const { targetId: id } = (await targetBrowser.send('Target.createTarget', {
    url: 'about:blank',
    browserContextId: contextId,
  })) as { targetId: string };
  const targetPage = await attach((await listTargets()).find((value) => value.id === id)!);
  const site = offlineSites.get(targetPage)!;
  site.documents.set(
    `${origin}/`,
    '<!doctype html><html><head><link rel="icon" href="data:,"></head><body>guard</body></html>'
  );
  site.resources.set(`${origin}/worker.js`, {
    status: 200,
    mime: 'application/javascript',
    body: workerSource,
  });
  let closed = false;
  try {
    await targetPage.send('Page.enable');
    await targetPage.send('Page.navigate', { url: `${origin}/` });
    await evaluateAsync(
      targetPage,
      `new Promise((resolve,reject)=>{const frame=document.createElement('iframe');const timer=setTimeout(()=>reject(Error('iframe要求の完了待機')),10000);frame.onload=()=>{clearTimeout(timer);resolve(true);};frame.onerror=()=>{clearTimeout(timer);resolve(true);};frame.src=${JSON.stringify(expected[0])};document.body.append(frame);})`
    );
    const opened = (await targetPage.send('Runtime.evaluate', {
      expression: `!!window.open(${JSON.stringify(expected[1])},'_blank')`,
      userGesture: true,
      returnByValue: true,
    })) as { result?: { value?: boolean }; exceptionDetails?: object };
    if (!opened.result?.value || opened.exceptionDetails) throw new Error('未登録URLのpopupを作成できませんでした');
    const deadline = Date.now() + 10000;
    let popupId: string | undefined;
    while (!popupId && Date.now() < deadline) {
      popupId = (await listTargets()).find((value) => value.url === expected[1])?.id;
      if (!popupId) await Bun.sleep(50);
    }
    if (!popupId || !offlineTargetSessions.has(popupId))
      throw new Error('popup初期要求より前に共有監査へ接続されませんでした');
    const popup = await offlineTargetSessions.get(popupId)!;
    await evaluateAsync(
      popup,
      `new Promise(resolve=>{if(document.readyState==='complete')resolve(true);else addEventListener('load',()=>resolve(true),{once:true});})`
    );
    const sw = (await evaluateAsync(
      targetPage,
      `(async()=>{const registration=await navigator.serviceWorker.register('/worker.js');window.__guardRegistration=registration;const worker=registration.installing||registration.waiting||registration.active;if(worker.state!=='activated')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Service Worker activation timeout')),10000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(Error('Service Worker became redundant'));}});});return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Service Worker fetch timeout')),10000);const listener=event=>{if(event.data?.marker==='guard-sw'){clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',listener);resolve(event.data);}};navigator.serviceWorker.addEventListener('message',listener);worker.postMessage('probe');});})()`
    )) as { blocked?: boolean; name?: string };
    if (!sw.blocked || sw.name !== 'TypeError') throw new Error('Service Workerの外部要求を遮断できませんでした');
    if (served.length !== 1 || served[0] !== 'GET /worker.js')
      throw new Error(`専用loopbackへ想定外要求: ${JSON.stringify(served)}`);
    await evaluateAsync(targetPage, 'window.__guardRegistration.unregister()');
    let closeRejected = false;
    try {
      await targetPage.close();
    } catch {
      closeRejected = true;
    } finally {
      closed = true;
    }
    const audit = offlineReports.get(targetPage);
    const unknown = audit?.requests.filter((value) => !value.matched) ?? [];
    if (
      !closeRejected ||
      !audit ||
      audit.completed ||
      unknown.length !== 3 ||
      audit.errors.length !== 3 ||
      expected.some(
        (url) =>
          unknown.filter((value) => value.url === url).length !== 1 ||
          audit.errors.filter((error) => error.includes(url)).length !== 1
      )
    )
      throw new Error(`追加ターゲットの遮断監査が不一致: ${JSON.stringify(audit)}`);
    return { closeRejected, failures: audit.errors, observations: unknown };
  } catch (error) {
    console.error('追加ターゲット検証失敗', error);
    throw error;
  } finally {
    await cleanupCdp(
      () => (closed ? undefined : targetPage.close()),
      () => targetBrowser.send('Target.disposeBrowserContext', { browserContextId: contextId }),
      () => targetBrowser.close(),
      () => server.stop(true)
    );
  }
}
async function verifyStartupErrors(): Promise<{ closeRejected: boolean; failures: string[] }> {
  const { browserContextId: contextId } = (await browser.send('Target.createBrowserContext')) as {
    browserContextId: string;
  };
  const { targetId: id } = (await browser.send('Target.createTarget', {
    url: 'about:blank',
    browserContextId: contextId,
  })) as { targetId: string };
  const startup = await attach((await listTargets()).find((value) => value.id === id)!);
  const markers = ['guard-worker-startup-throw', 'guard-worker-startup-rejection'];
  const observed = new Set<string>();
  startup.onEvent((method, params) => {
    const message = (
      method === 'Runtime.exceptionThrown'
        ? { method, params }
        : method === 'Target.receivedMessageFromTarget'
          ? JSON.parse(String(params.message))
          : null
    ) as {
      method?: string;
      params?: { exceptionDetails?: { exception?: { description?: string } } };
    } | null;
    if (!message) return;
    if (message.method !== 'Runtime.exceptionThrown') return;
    const description = message.params?.exceptionDetails?.exception?.description ?? '';
    for (const marker of markers) if (description.includes(marker)) observed.add(marker);
  });
  let closed = false;
  try {
    await startup.send('Page.enable');
    await startup.send('Page.navigate', { url: 'https://www.nicovideo.jp/watch/sm9' });
    // The first statements throw/reject. Await their observed exceptions before
    // ending the case; an unstarted worker is not evidence of error detection.
    await evaluateAsync(
      startup,
      `(()=>{window.__guardWorkers=[];for(const source of ['throw new Error("guard-worker-startup-throw")','Promise.reject(new Error("guard-worker-startup-rejection"))']){const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const worker=new Worker(url);window.__guardWorkers.push(worker);URL.revokeObjectURL(url);}})()`
    );
    const deadline = Date.now() + 10000;
    while (observed.size !== 2 && Date.now() < deadline) await Bun.sleep(50);
    if (observed.size !== 2) throw Error(`起動直後Worker例外を捕捉できませんでした: ${[...observed].join(',')}`);
    let closeRejected = false;
    try {
      await startup.close();
    } catch {
      closeRejected = true;
    } finally {
      closed = true;
    }
    const audit = offlineReports.get(startup);
    if (!audit || audit.completed || !closeRejected) throw Error('起動直後Worker例外を終了時監査が拒否しませんでした');
    if (
      audit.errors.length !== 2 ||
      markers.some((marker) => audit.errors.filter((error) => error.includes(marker)).length !== 1)
    )
      throw Error(`起動直後Worker例外の監査件数が不一致: ${audit.errors.join('\n')}`);
    if (audit.requests.some((request) => !request.matched)) throw Error('Worker例外の負例へ想定外通信が混入しました');
    return { closeRejected, failures: audit.errors };
  } finally {
    await cleanupCdp(
      () => (closed ? undefined : startup.close()),
      () => browser.send('Target.disposeBrowserContext', { browserContextId: contextId })
    );
  }
}
let finalized = false;
const report: {
  completed: boolean;
  failures: string[];
  observations?: object[];
  isolatedContexts?: boolean;
  workerStartup?: { closeRejected: boolean; failures: string[] };
  additionalTargets?: { closeRejected: boolean; failures: string[]; observations: object[] };
  error?: string;
} = {
  completed: false,
  failures: [],
};
try {
  await page.send('Page.enable');
  await page.send('Page.navigate', { url: 'https://www.nicovideo.jp/watch/sm9' });
  const { browserContextId: secondContext } = (await browser.send('Target.createBrowserContext')) as {
    browserContextId: string;
  };
  const { targetId: secondId } = (await browser.send('Target.createTarget', {
    url: 'about:blank',
    browserContextId: secondContext,
  })) as { targetId: string };
  const second = await attach((await listTargets()).find((value) => value.id === secondId)!);
  try {
    await evaluateAsync(
      page,
      `localStorage.setItem('FutatsumeWatch_testIsolation','first');window.__isolationChannel=new BroadcastChannel('futatsume-isolation');`
    );
    await second.send('Page.navigate', { url: 'https://www.nicovideo.jp/watch/sm9' });
    if (await evaluateAsync(second, `localStorage.getItem('FutatsumeWatch_testIsolation')!==null`))
      throw new Error('別コンテキストへ保存値が漏れています');
    const firstInfo = (await page.send('Target.getTargetInfo')) as { targetInfo: { browserContextId?: string } };
    const secondInfo = (await second.send('Target.getTargetInfo')) as { targetInfo: { browserContextId?: string } };
    if (
      !firstInfo.targetInfo.browserContextId ||
      firstInfo.targetInfo.browserContextId === secondInfo.targetInfo.browserContextId
    )
      throw new Error('検証コンテキストが分離されていません');
    await evaluateAsync(
      second,
      `window.__isolationMessages=[];window.__isolationChannel=new BroadcastChannel('futatsume-isolation');window.__isolationChannel.onmessage=e=>window.__isolationMessages.push(e.data);`
    );
    await evaluateAsync(page, `window.__isolationChannel.postMessage('first')`);
    await Bun.sleep(200);
    if (await evaluateAsync(second, `window.__isolationMessages.length!==0`))
      throw new Error('別コンテキストへBroadcastChannelが漏れています');
    await evaluateAsync(
      page,
      `localStorage.removeItem('FutatsumeWatch_testIsolation');window.__isolationChannel.close();`
    );
    await evaluateAsync(second, `window.__isolationChannel.close();`);
    report.isolatedContexts = true;
  } finally {
    await cleanupCdp(
      () => second.close(),
      () => browser.send('Target.disposeBrowserContext', { browserContextId: secondContext })
    );
    await page.send('Page.bringToFront');
  }
  report.workerStartup = await verifyStartupErrors();
  report.additionalTargets = await verifyAdditionalTargets();
  await page.send('Page.bringToFront');
  const pageFailure = (await evaluateAsync(
    page,
    `(async()=>{try{await fetch(${JSON.stringify(pageUrl)});return {blocked:false};}catch(error){return {blocked:true,name:error.name,message:error.message};}})()`
  )) as { blocked: boolean; name?: string };
  if (!pageFailure.blocked || pageFailure.name !== 'TypeError')
    throw new Error('未登録ページfetchを遮断できませんでした');
  const workerFailure = (await evaluateAsync(
    page,
    `new Promise((resolve,reject)=>{
    const source=${JSON.stringify(`fetch(${JSON.stringify(workerUrl)}).then(()=>postMessage({blocked:false}),error=>postMessage({blocked:true,name:error.name,message:error.message}));`)};
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    const worker=new Worker(url);
    const finish=()=>{clearTimeout(timer);URL.revokeObjectURL(url);};
    const timer=setTimeout(()=>{finish();reject(new Error('Worker fetchの遮断結果が返りません'));},10000);
    worker.onmessage=event=>{finish();resolve(event.data);};
    worker.onerror=event=>{finish();reject(new Error(event.message));};
  })`
  )) as { blocked: boolean; name?: string };
  if (!workerFailure.blocked || workerFailure.name !== 'TypeError')
    throw new Error('未登録Worker fetchを遮断できませんでした');
  let closeRejected = false;
  try {
    await page.close();
  } catch {
    closeRejected = true;
  }
  finalized = true;
  const audit = offlineReports.get(page);
  if (!closeRejected || !audit || audit.completed) throw new Error('未登録通信が終了時の失敗に反映されませんでした');
  const unmatched = audit.requests.filter((value) => !value.matched);
  if (unmatched.length !== 2 || ![pageUrl, workerUrl].every((url) => unmatched.some((value) => value.url === url))) {
    throw new Error(`想定と異なる未登録通信: ${JSON.stringify(unmatched)}`);
  }
  if (
    audit.errors.length !== 2 ||
    !audit.errors.every(
      (error) => /未登録通信|未捕捉通信/.test(error) && [pageUrl, workerUrl].some((url) => error.includes(url))
    )
  ) {
    throw new Error(`想定した遮断以外の失敗: ${audit.errors.join('\n')}`);
  }
  for (const value of unmatched) {
    if (!value.intercepted && !value.failure?.includes('ERR_PROXY_CONNECTION_FAILED'))
      throw new Error(`外部遮断の根拠が不足: ${value.url}`);
  }
  report.failures = audit.errors;
  report.observations = unmatched;
  report.completed = true;
  console.log('通信遮断と例外監査の負例に合格しました（未登録要求5件・起動直後Worker例外2件）');
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  await cleanupCdp(
    () => Bun.write(new URL('offline-guard-report.json', verificationDirectory), JSON.stringify(report, null, 2)),
    () => (finalized ? undefined : page.close()),
    () => browser.send('Target.disposeBrowserContext', { browserContextId }),
    () => browser.close()
  );
}
