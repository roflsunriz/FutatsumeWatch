import { attach, attachBrowser, cleanupCdp, evaluate, listTargets } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';
import { captureCommentPng } from './dev-verify-comment-exports';
import { verificationDirectory } from './dev-verification-output';

export type MenuCheck = (session: CdpSession, expression: string, label: string, timeout?: number) => Promise<void>;
interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
  browserContextId?: string;
}
const video = `document.querySelector('futatsume-video')`;
const native = `${video}?.shadowRoot?.querySelector('video')`;
const dialog = 'window.FutatsumeWatch.debug.dialog';

async function reveal(session: CdpSession): Promise<void> {
  const point = (await evaluate(
    session,
    `(()=>{const r=document.querySelector('.fw-player').getBoundingClientRect();return{x:r.left+Math.min(32,r.width/2),y:r.top+Math.min(32,r.height/2)}})()`
  )) as { x: number; y: number };
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
}
async function menu(session: CdpSession, more = false): Promise<void> {
  await reveal(session);
  if (await evaluate(session, `document.querySelector('.fw-player').dataset.panel==='details'`)) {
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
  }
  if (!(await evaluate(session, `document.querySelector('.fw-player').dataset.panel==='settings'`)))
    await clickVisible(session, '[data-shell-action="settings"]');
  if (more && !(await evaluate(session, `document.querySelector('.fw-settings > details').open`)))
    await clickVisible(session, '.fw-settings > details > summary');
}
async function waitForValue<T>(read: () => Promise<T | undefined>, label: string, timeout = 10000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await Bun.sleep(50);
  }
  throw new Error(label);
}

export async function openLink(session: CdpSession, selector: string, expectedUrl: string): Promise<object> {
  const browser = await attachBrowser();
  const source = (await session.send('Target.getTargetInfo')) as { targetInfo: TargetInfo };
  if (!source.targetInfo.browserContextId) {
    await browser.close();
    throw new Error('外部リンク検証には専用ブラウザコンテキストが必要です');
  }
  const initial = (await browser.send('Target.getTargets')) as { targetInfos: TargetInfo[] };
  const existing = new Set(initial.targetInfos.map((value) => value.targetId));
  const windowOpens: Array<{ url: string; userGesture: boolean }> = [];
  let active = true;
  session.onEvent((method, params) => {
    if (active && method === 'Page.windowOpen')
      windowOpens.push({ url: String(params.url), userGesture: params.userGesture === true });
  });
  let popup: CdpSession | undefined;
  try {
    await session.send('Page.enable');
    await clickVisible(session, selector);
    await waitForValue(
      () => Promise.resolve(windowOpens.length ? true : undefined),
      '外部リンクのwindowOpenがありません'
    );
    if (windowOpens.length !== 1 || windowOpens[0]?.url !== expectedUrl || !windowOpens[0].userGesture)
      throw new Error(`外部リンクのURL・回数・操作起点が不一致: ${JSON.stringify(windowOpens)}`);
    const created = await waitForValue(async () => {
      const result = (await browser.send('Target.getTargets')) as { targetInfos: TargetInfo[] };
      return result.targetInfos.find(
        (value) =>
          !existing.has(value.targetId) &&
          value.type === 'page' &&
          value.browserContextId === source.targetInfo.browserContextId &&
          value.url === expectedUrl
      );
    }, '要求したURLの専用タブが作成されませんでした');
    const target = await waitForValue(
      async () => (await listTargets()).find((value) => value.id === created.targetId),
      '新しいタブの接続先がありません'
    );
    popup = await attach(target);
    const connection = popup;
    const initialDocumentUrl = await evaluate(popup, 'location.href');
    const fixtureReplay = initialDocumentUrl !== expectedUrl;
    if (fixtureReplay)
      throw new Error(`初期要求を監査した新規タブが別URLへ遷移しました: ${String(initialDocumentUrl)}`);
    await waitForValue(
      async () => ((await evaluate(connection, `document.readyState==='complete'`)) ? true : undefined),
      '遷移先の固定文書が完了しません'
    );
    if ((await evaluate(popup, 'location.href')) !== expectedUrl) throw new Error('新規タブが別URLへ遷移しました');
    return { windowOpen: windowOpens[0], targetUrl: created.url, initialDocumentUrl, fixtureReplay };
  } finally {
    active = false;
    await cleanupCdp(
      () => popup?.close(),
      async () => {
        const result = (await browser.send('Target.getTargets')) as { targetInfos: TargetInfo[] };
        const created = result.targetInfos.filter(
          (value) =>
            !existing.has(value.targetId) &&
            value.type === 'page' &&
            value.browserContextId === source.targetInfo.browserContextId
        );
        await cleanupCdp(
          ...created.map((value) => () => browser.send('Target.closeTarget', { targetId: value.targetId }))
        );
      },
      () => browser.close(),
      () => session.send('Page.bringToFront')
    );
  }
}

/** 開いている専用オフラインプレイヤーから左メニューを実操作する。 */
export async function verifyMenuActions(session: CdpSession, check: MenuCheck): Promise<string[]> {
  if (process.env.FUTATSUME_TEST_OFFLINE !== '1') throw new Error('外部メニューの検証はオフライン専用です');
  const checks: string[] = [];
  const report: {
    completed: boolean;
    links: object[];
    captures: object[];
    reload?: object;
    diagnostic?: unknown;
    error?: string;
  } = {
    completed: false,
    links: [],
    captures: [],
  };
  const wasPaused = (await evaluate(session, `${video}.paused`)) as boolean;
  const wasCommentVisible = (await evaluate(
    session,
    `document.querySelector('[data-shell-action="toggle-showComment"]').getAttribute('aria-pressed')==='true'`
  )) as boolean;
  const wasFullscreen = (await evaluate(session, '!!document.fullscreenElement')) as boolean;
  const watchId = (await evaluate(session, 'window.FutatsumeWatch.debug.videoInfo.watchId')) as string;
  await evaluate(
    session,
    `(()=>{const video=${native},state=window.__menuMediaTrace={events:[],listeners:[],initial:{time:video.currentTime,start:${dialog}._videoWatchOptions.currentTime,last:${dialog}._lastCurrentTime,loading:${dialog}._state.isLoading}};for(const name of ['loadstart','loadedmetadata','seeking','seeked','pause','play']){const handler=()=>state.events.push({name,time:video.currentTime,start:${dialog}._videoWatchOptions.currentTime,last:${dialog}._lastCurrentTime,loading:${dialog}._state.isLoading,at:performance.now()});video.addEventListener(name,handler);state.listeners.push({name,handler});}state.video=video;})()`
  );
  try {
    await reveal(session);
    if (!wasPaused) await clickVisible(session, '[data-shell-action="togglePlay"]');
    await check(session, `${native}.readyState>=2 && ${video}.paused`, 'P2: メニュー操作中の実映像を停止');
    await menu(session);
    report.links.push(
      await openLink(
        session,
        '.fw-settings > a[href="https://github.com/roflsunriz/FutatsumeWatch"]',
        'https://github.com/roflsunriz/FutatsumeWatch'
      )
    );
    checks.push('P2-02: 実GitHubクリックが指定URLを1つの新規タブへ要求');
    await menu(session, true);
    report.links.push(
      await openLink(session, '[data-shell-action="openGinza"]', `https://www.nicovideo.jp/watch/${watchId}`)
    );
    await check(
      session,
      `window.FutatsumeWatch.debug.videoInfo.watchId===${JSON.stringify(watchId)} && ${video}.paused`,
      'P2-05: 公式ページを開いても元動画と停止状態を保持'
    );
    checks.push('P2-05: 現在の動画IDの公式視聴ページを別タブへ要求');

    const before = (await evaluate(
      session,
      `({requestId:${dialog}._requestId,time:${video}.currentTime,watchId:window.FutatsumeWatch.debug.videoInfo.watchId,volume:${video}.volume,rate:${video}.playbackRate})`
    )) as { requestId: string; time: number; watchId: string; volume: number; rate: number };
    let loadingRequests = 0,
      watchReload = false;
    session.onEvent((method, params) => {
      if (watchReload && method === 'Network.requestWillBeSent') {
        const request = params.request as { url?: string };
        if (request.url) {
          const url = new URL(request.url);
          if (
            url.origin === 'https://www.nicovideo.jp' &&
            url.pathname === `/watch/${watchId}` &&
            url.searchParams.get('responseType') === 'json'
          )
            loadingRequests++;
        }
      }
    });
    await menu(session, true);
    watchReload = true;
    try {
      await clickVisible(session, '[data-shell-action="reload"]');
      await check(
        session,
        `${dialog}._requestId!==${JSON.stringify(before.requestId)} && ${native}.readyState>=2 && !${dialog}._state.isLoading && ${dialog}._state.isCommentReady && window.FutatsumeWatch.debug.videoInfo.watchId===${JSON.stringify(before.watchId)} && Math.abs(${video}.currentTime-${before.time})<1 && ${video}.paused && ${video}.volume===${before.volume} && ${video}.playbackRate===${before.rate} && document.querySelectorAll('futatsume-video').length===1`,
        'P2-03: 再読み込みで動画・時刻・停止・音量・速度を維持',
        30000
      );
      if (loadingRequests !== 1) throw new Error(`再読み込みの動画再取得回数が不一致: ${loadingRequests}`);
      report.reload = {
        before,
        requests: loadingRequests,
        after: await evaluate(
          session,
          `({time:${video}.currentTime,watchId:window.FutatsumeWatch.debug.videoInfo.watchId})`
        ),
      };
      checks.push('P2-03: 実メニュー再読み込みで同じ動画を1回再取得');
    } finally {
      watchReload = false;
    }

    await reveal(session);
    if (!wasCommentVisible) await clickVisible(session, '[data-shell-action="toggle-showComment"]');
    await check(
      session,
      'window.FutatsumeWatch.debug.nicoCommentPlayer._view.renderer.activeComments.size>0',
      'P2-04: 保存対象のコメント画素を実描画'
    );
    const capture = async (name: string, expectComments: boolean): Promise<void> => {
      await menu(session, true);
      const png = await captureCommentPng(session, () =>
        clickVisible(session, '[data-shell-action="screenShotWithComment"]')
      );
      if (!png.fileName.includes(watchId) || !png.fileName.endsWith('C.png'))
        throw new Error('保存名の動画ID・コメント付き識別が不一致');
      if (expectComments ? png.changedPixels === 0 : png.changedPixels !== 0)
        throw new Error(`コメント表示状態と保存PNG画素が不一致: ${name}/${png.changedPixels}`);
      await Bun.write(new URL(`menu-${name}.png`, verificationDirectory), Buffer.from(png.pngBase64, 'base64'));
      const { pngBase64, ...evidence } = png;
      void pngBase64;
      report.captures.push({ name, ...evidence });
    };
    await capture('comments-paused', true);
    await reveal(session);
    await clickVisible(session, '[data-shell-action="toggle-showComment"]');
    await capture('comments-hidden', false);
    await reveal(session);
    await clickVisible(session, '[data-shell-action="toggle-showComment"]');
    if (!wasFullscreen) {
      await clickVisible(session, '[data-shell-action="fullscreen"]');
      await check(session, '!!document.fullscreenElement', 'P2-04: 全画面の実ボタン操作');
    }
    await capture('comments-fullscreen', true);
    if (!wasFullscreen) {
      await reveal(session);
      await clickVisible(session, '[data-shell-action="fullscreen"]');
    }
    checks.push('P2-04: 停止・コメントOFF・全画面で実保存PNGの画素を照合');

    await evaluate(
      session,
      `(()=>{const state=window.__menuCaptureFailure={original:HTMLCanvasElement.prototype.toDataURL,click:HTMLAnchorElement.prototype.click,alerts:[],downloads:0};state.observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element&&node.matches('.futatsumePopupMessage.alert'))state.alerts.push(node.textContent);});state.observer.observe(document.body,{childList:true,subtree:true});HTMLCanvasElement.prototype.toDataURL=function(){throw new DOMException('fixture-tainted','SecurityError');};HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.png')){state.downloads++;return;}state.click.call(this);};})()`
    );
    try {
      await menu(session, true);
      await clickVisible(session, '[data-shell-action="screenShotWithComment"]');
      await check(
        session,
        `window.__menuCaptureFailure.alerts.some(value=>value.includes('CORS')) && window.__menuCaptureFailure.downloads===0`,
        'P2-04: 画像生成失敗の理由を表示しダウンロードしない'
      );
    } finally {
      await evaluate(
        session,
        `(()=>{const state=window.__menuCaptureFailure;state.observer.disconnect();HTMLCanvasElement.prototype.toDataURL=state.original;HTMLAnchorElement.prototype.click=state.click;delete window.__menuCaptureFailure;})()`
      );
    }
    checks.push('P2-04: Canvas読み出し拒否の実メニュー失敗表示');
    report.completed = true;
    return checks;
  } catch (error) {
    report.error = String(error);
    report.diagnostic = await evaluate(
      session,
      `(()=>{const player=window.FutatsumeWatch.debug.nicoCommentPlayer,view=player?._view,r=view?.renderer,video=${native};return {media:{time:video?.currentTime,paused:video?.paused,ready:video?.readyState},view:{closed:view?.closed,shown:view?._isShow,clock:view?.clock?.currentTime,hidden:document.hidden},renderer:{time:r?.currentTime,duration:r?.duration,active:r?.activeComments.size,comments:r?.comments.map(c=>({text:c.text,vposMs:c.vposMs,start:c.startTime,end:c.endTime,layout:c.layout})),visible:r?.settings.isCommentVisible},model:player?._model?.currentTime,trace:window.__menuMediaTrace?.events,initial:window.__menuMediaTrace?.initial}})()`
    ).catch((diagnosticError) => ({ error: String(diagnosticError) }));
    throw error;
  } finally {
    await cleanupCdp(
      () =>
        evaluate(
          session,
          `(()=>{const state=window.__menuMediaTrace;if(state){for(const {name,handler} of state.listeners)state.video.removeEventListener(name,handler);delete window.__menuMediaTrace;}})()`
        ),
      async () => {
        await reveal(session);
        if (await evaluate(session, `document.querySelector('.fw-player').dataset.panel==='settings'`))
          await clickVisible(session, '[data-shell-action="dismiss"]');
      },
      async () => {
        if ((await evaluate(session, '!!document.fullscreenElement')) !== wasFullscreen)
          await clickVisible(session, '[data-shell-action="fullscreen"]');
      },
      async () => {
        if (
          (await evaluate(
            session,
            `document.querySelector('[data-shell-action="toggle-showComment"]').getAttribute('aria-pressed')==='true'`
          )) !== wasCommentVisible
        )
          await clickVisible(session, '[data-shell-action="toggle-showComment"]');
      },
      async () => {
        if ((await evaluate(session, `${video}.paused`)) !== wasPaused)
          await clickVisible(session, '[data-shell-action="togglePlay"]');
      },
      () => Bun.write(new URL('menu-actions-report.json', verificationDirectory), JSON.stringify(report, null, 2))
    ).catch(async (error: unknown) => {
      report.completed = false;
      report.error = [report.error, String(error)].filter(Boolean).join('\n');
      await Bun.write(new URL('menu-actions-report.json', verificationDirectory), JSON.stringify(report, null, 2));
      throw error;
    });
  }
}
