import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { offlineSites } from './dev-offline';
import { clickVisible } from './dev-ui';
import { verifyMediaIdentity } from './verify-media-identity';
import type { MediaIdentityCheck } from './verify-media-identity';

export async function verifyDelayedMediaSwitch(page: CdpSession, check: MediaIdentityCheck): Promise<void> {
  const site = offlineSites.get(page)!;
  const reply = site.reply.bind(site);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let armed = false,
    blocked = false,
    delivered = false,
    requestId = '';
  const isA = (value: string): boolean => {
    const url = new URL(value);
    return (
      url.origin === 'https://www.nicovideo.jp' &&
      url.pathname === '/watch/sm9' &&
      url.searchParams.get('responseType') === 'json'
    );
  };
  const observe = (method: string, params: Record<string, unknown>): void => {
    if (method === 'Target.receivedMessageFromTarget') {
      const event = JSON.parse(String(params.message)) as { method?: string; params?: Record<string, unknown> };
      if (event.method) observe(event.method, event.params ?? {});
    }
    if (
      (method === 'Network.requestWillBeSent' || method === 'Fetch.requestPaused') &&
      armed &&
      isA(String((params.request as { url: string }).url))
    )
      requestId = String(params.networkId ?? params.requestId);
    if (method === 'Network.loadingFinished' && requestId && params.requestId === requestId) delivered = true;
  };
  page.onEvent(observe);
  site.reply = async (request) => {
    if (armed && !blocked && isA(request.url)) {
      blocked = true;
      await gate;
    }
    return reply(request);
  };
  const until = async (condition: () => boolean, label: string): Promise<void> => {
    const deadline = Date.now() + 10000;
    while (!condition() && Date.now() < deadline) await Bun.sleep(50);
    if (!condition()) throw Error(label);
  };
  const click = async (selector: string) => {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 180 });
    await clickVisible(page, selector);
  };
  try {
    for (const type of ['keyDown', 'keyUp'])
      await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    // List insertion creates the prerequisite. Navigation itself uses the real buttons.
    await evaluate(page, `window.FutatsumeWatch.external.execCommand('playlistAppend','sm2057168')`);
    await check(page, `window.FutatsumeWatch.debug.playlist.hasNext`, 'P1-04/race: 切替先をプレイリストへ用意', 15000);
    armed = true;
    await click('[data-shell-action="settings"]');
    if (!(await evaluate(page, `document.querySelector('.fw-settings>details').open`)))
      await click('.fw-settings>details>summary');
    await click('[data-shell-action="reload"]');
    await until(() => blocked, 'Aの要求が通信境界へ届きませんでした');
    armed = false;
    await check(page, `window.FutatsumeWatch.debug.dialog._state.isLoading`, 'P1-04/race: Aの再取得を遅延させる');
    for (const type of ['keyDown', 'keyUp'])
      await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await click('[data-shell-action="playNextVideo"]');
    await verifyMediaIdentity(page, 'sm2057168', check);
    release();
    await until(() => delivered, '遅延したA応答の受信完了を確認できませんでした');
    try {
      await check(
        page,
        `window.FutatsumeWatch.debug.videoInfo.watchId==='sm2057168' && document.querySelector('futatsume-video').currentTime>0`,
        'P1-04/race: 遅いA応答後もBの再生を保持'
      );
    } catch (error) {
      const state = await evaluate(
        page,
        `(()=>{const d=window.FutatsumeWatch.debug.dialog,v=document.querySelector('futatsume-video');return {id:d._watchId,model:window.FutatsumeWatch.debug.videoInfo.watchId,time:v.currentTime,duration:v.duration,paused:v.paused,loading:d._state.isLoading,error:d._state.isError,options:d._videoWatchOptions,reload:d.reloadPlayback,playlist:window.FutatsumeWatch.debug.playlist.model.items.map(i=>i.watchId)}})()`
      );
      throw new Error(`遅延切替の実状態: ${JSON.stringify(state)}`, { cause: error });
    }
    await verifyMediaIdentity(page, 'sm2057168', check);
    await click('[data-shell-action="playPreviousVideo"]');
    await verifyMediaIdentity(page, 'sm9', check);
  } finally {
    release();
    site.reply = reply;
  }
}
