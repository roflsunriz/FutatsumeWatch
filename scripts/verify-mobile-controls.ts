import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { verificationDirectory } from './dev-verification-output';
import { captureCommentPng } from './dev-verify-comment-exports';

type Check = (session: CdpSession, expression: string, label: string, timeout?: number) => Promise<void>;
export async function touchAt(session: CdpSession, x: number, y: number, hold = 0): Promise<void> {
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  if (hold) await Bun.sleep(hold);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
export async function tapControl(session: CdpSession, selector: string): Promise<void> {
  await evaluate(
    session,
    `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',behavior:'instant'})`
  );
  const deadline = Date.now() + 5000;
  let last: unknown;
  do {
    const point = (await evaluate(
      session,
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return{error:'missing'};const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,visible:r.width>0&&r.height>0&&getComputedStyle(e).visibility==='visible'&&e.contains(hit),hit:hit?.className,width:r.width,height:r.height}})()`
    )) as { x: number; y: number; visible?: boolean };
    if (point.visible) {
      await touchAt(session, point.x, point.y);
      return;
    }
    last = point;
    await Bun.sleep(50);
  } while (Date.now() < deadline);
  throw Error(`操作できないタッチ対象: ${selector}: ${JSON.stringify(last)}`);
}
export async function verifyMobileControls(session: CdpSession, check: Check): Promise<void> {
  const root = 'window.FutatsumeWatch';
  const video = `document.querySelector('futatsume-video')`;
  const menu = '.futatsumePlayerContextMenu';
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 700,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await touchAt(session, 30, 300);
  await Bun.sleep(3200);
  await check(
    session,
    `document.querySelector('.fw-player').dataset.controls==='visible'`,
    'タップ終了後も3秒を超えて操作部を表示'
  );
  await Bun.sleep(2100);
  await check(session, `document.querySelector('.fw-player').dataset.controls==='hidden'`, 'タップ後5秒で操作部を隠す');
  const open = async (): Promise<void> => {
    await check(session, `!${root}.debug.contextMenu.isOpen`, '前のメニューが閉じてから次の長押しを開始');
    const point = (await evaluate(
      session,
      `(()=>{const surface=document.querySelector('.touchWrapper'),r=surface.getBoundingClientRect();for(const fx of [.1,.9,.25,.75])for(const fy of [.45,.35,.6]){const x=r.x+r.width*fx,y=r.y+r.height*fy,hit=document.elementFromPoint(x,y);if(surface.contains(hit))return{x,y};}throw Error('映像面が操作部に覆われています')})()`
    )) as { x: number; y: number };
    await touchAt(session, point.x, point.y, 800);
    await check(session, `${root}.debug.contextMenu.isOpen`, '映像の実長押しで既存メニューを開く');
  };
  await open();
  await check(
    session,
    `[...document.querySelectorAll('${menu} [data-command="playbackRate"]')].every(e=>e.innerText.includes(Number(e.dataset.param)+'×'))`,
    '長押しメニューの全速度をホバーせず数値で確認'
  );
  await check(
    session,
    `(()=>{const r=document.querySelector('${menu}').getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})()`,
    '長押しメニューを390pxの画面内に収める'
  );
  await tapControl(session, `${menu} [data-command="playbackRate"][data-param="0.5"]`);
  await check(session, `${video}.playbackRate===0.5`, '長押しメニューの速度ボタンをタップ');
  await check(session, `${root}.debug.contextMenu._repeatTimer===null`, 'タップ終了で長押しメニューの反復を停止');
  await tapControl(session, `${menu} [data-command="playbackRate"][data-param="1.0"]`);
  await check(session, `${video}.playbackRate===1`, '長押しメニューから標準速度へ復帰');
  await evaluate(session, `${root}.external.execCommand('pause');${root}.external.execCommand('seek',20)`);
  await tapControl(session, `${menu} [data-command="seekBy"][data-param="5"]`);
  await check(
    session,
    `${root}.debug.nicoVideoPlayer.currentTime>=24.9&&${root}.debug.nicoVideoPlayer.currentTime<26`,
    '長押しメニューのシークボタンをタップ'
  );
  await evaluate(session, `${root}.debug.contextMenu.hide()`);
  await open();
  const shot = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
  await Bun.write(new URL('shell-mobile-context-menu.png', verificationDirectory), Buffer.from(shot.data, 'base64'));
  await tapControl(session, `${menu} [data-command="toggle-showComment"]`);
  await check(session, `!${root}.debug.contextMenu.isOpen`, '長押しメニューの項目選択で閉じる');
  await check(session, `!${root}.state.player.isShowComment`, '長押しメニューのコメント表示切替を反映');
  await evaluate(session, `${root}.external.execCommand('toggle-showComment')`);
  for (const rate of [0.1, 0.5, 0.75, 1, 1.25, 1.5, 2]) {
    await open();
    await tapControl(
      session,
      `${menu} [data-command="playbackRate"][data-param="${rate === 1 ? '1.0' : rate === 2 ? '2.0' : rate}"]`
    );
    await check(session, `${video}.playbackRate===${rate}`, `長押しメニューの${rate}倍速を反映`);
    await evaluate(session, `${root}.debug.contextMenu.hide()`);
  }
  for (const delta of [-5, -15, 15, 5]) {
    await evaluate(session, `${root}.external.execCommand('pause');${root}.external.execCommand('seek',30)`);
    await open();
    await tapControl(session, `${menu} [data-command="seekBy"][data-param="${delta}"]`);
    await check(session, `Math.abs(${video}.currentTime-${30 + delta})<1`, `長押しメニューの${delta}秒シークを反映`);
    await evaluate(session, `${root}.debug.contextMenu.hide()`);
  }
  await evaluate(session, `${root}.external.execCommand('playbackRate',1)`);
  // 会員別UIの両分岐を確認する。外部APIの権限は変更しない。
  await check(
    session,
    `getComputedStyle(document.querySelector('${menu} [data-command="toggle-flipH"]')).display==='none'`,
    '一般会員では長押しメニューの会員限定項目を隠す'
  );
  await evaluate(
    session,
    `window.__fwMobileRegular=[...document.querySelectorAll('.is-regularUser')];window.__fwMobileRegular.forEach(e=>e.classList.remove('is-regularUser'))`
  );
  for (const [action, state] of [
    ['toggle-loop', `${root}.state.player.isLoop`],
    ['togglePlaylist', `${root}.state.player.isPlaylistEnable`],
    ['toggle-flipH', `document.querySelector('.fw-player').classList.contains('is-flipH')`],
    ['toggle-flipV', `document.querySelector('.fw-player').classList.contains('is-flipV')`],
  ] as const) {
    const before = await evaluate(session, state);
    if (typeof before !== 'boolean') throw Error(`切替前の状態が不明です: ${action}`);
    await open();
    await tapControl(session, `${menu} [data-command="${action}"]`);
    await check(session, `${state}!==${before}`, `長押しメニューの${action}を反映`);
    await open();
    await tapControl(session, `${menu} [data-command="${action}"]`);
    await check(session, `${state}===${before}`, `長押しメニューの${action}を復元`);
  }
  await evaluate(
    session,
    `window.__fwMobileRegular.forEach(e=>e.classList.add('is-regularUser'));delete window.__fwMobileRegular`
  );
  await open();
  await tapControl(session, `${menu} [data-command="seekTo"]`);
  await check(session, `${video}.currentTime<1`, '長押しメニューから先頭へ戻る');
  await open();
  await tapControl(session, `${menu} [data-command="togglePlay"]`);
  await check(session, `!${video}.paused`, '長押しメニューから再生を再開');
  await open();
  const png = await captureCommentPng(session, () => tapControl(session, `${menu} [data-command="screenShot"]`));
  if (png.width <= 0 || png.height <= 0) throw Error('メニューの画像保存が空です');
  await check(session, `${root}.debug.contextMenu.isOpen`, '長押しメニューの画像保存を捕捉しメニューを維持');
  await evaluate(session, `${root}.debug.contextMenu.hide()`);
  await evaluate(
    session,
    `(()=>{const video=document.querySelector('futatsume-video').shadowRoot.querySelector('video');window.__fwMobileBoundary={click:HTMLAnchorElement.prototype.click,copy:navigator.clipboard.writeText,pip:video.requestPictureInPicture};navigator.clipboard.writeText=async text=>{window.__fwMobileBoundary.copied=text};video.requestPictureInPicture=async function(){window.__fwMobileBoundary.pipTarget=this===video;return {}};HTMLAnchorElement.prototype.click=function(){if(!this.download.endsWith('.html'))return window.__fwMobileBoundary.click.call(this);window.__fwMobileBoundary.htmlName=this.download;fetch(this.href).then(r=>r.text()).then(text=>window.__fwMobileBoundary.html=text);};})()`
  );
  try {
    await open();
    await tapControl(session, `${menu} [data-command="copy-video-watch-url"]`);
    await check(
      session,
      `window.__fwMobileBoundary.copied?.includes('/watch/sm9')`,
      '長押しメニューの動画URLをクリップボード境界へ渡す'
    );
    await open();
    await tapControl(session, `${menu} [data-command="saveMymemory"]`);
    await check(
      session,
      `/<!doctype html/i.test(window.__fwMobileBoundary.html??'')&&window.__fwMobileBoundary.htmlName?.endsWith('.html')`,
      '長押しメニューのコメント保存でHTMLを生成'
    );
    if (await evaluate(session, `document.pictureInPictureEnabled`)) {
      await open();
      await tapControl(session, `${menu} [data-command="picture-in-picture"]`);
      await check(session, `window.__fwMobileBoundary.pipTarget===true`, '長押しメニューのPIPを実映像のAPIへ渡す');
    }
  } finally {
    await evaluate(
      session,
      `(()=>{const state=window.__fwMobileBoundary;HTMLAnchorElement.prototype.click=state.click;navigator.clipboard.writeText=state.copy;document.querySelector('futatsume-video').shadowRoot.querySelector('video').requestPictureInPicture=state.pip;delete window.__fwMobileBoundary;})()`
    );
  }
  await evaluate(
    session,
    `window.FutatsumeWatch.external.execCommand('pause');window.__fwMobileResume=[...new Set([window.FutatsumeWatch.state.player.videoInfo,window.FutatsumeWatch.debug.dialog._videoInfo])].map(model=>({model,resume:model._resumeInfo}));window.__fwMobileResume.forEach(({model})=>model._resumeInfo={initialPlaybackPosition:12})`
  );
  await open();
  await tapControl(session, `${menu} [data-command="seekToResumePoint"]`);
  await check(session, `Math.abs(${video}.currentTime-12)<1`, '長押しメニューの再開位置へシーク');
  await evaluate(
    session,
    `${root}.debug.contextMenu.hide();window.__fwMobileResume.forEach(({model,resume})=>model._resumeInfo=resume);delete window.__fwMobileResume`
  );
  await open();
  await tapControl(session, `${menu} [data-command="reload"]`);
  await check(
    session,
    `!${root}.debug.dialog._state.isLoading&&${video}.readyState>=3`,
    '長押しメニューの再読込で映像へ復帰',
    30000
  );
  await open();
  await touchAt(session, 380, 350);
  await check(session, `!${root}.debug.contextMenu.isOpen`, '長押しメニューの外をタップして閉じる');
  await open();
  for (const type of ['keyDown', 'keyUp'])
    await session.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await check(session, `!${root}.debug.contextMenu.isOpen`, '長押しメニューをEscapeで閉じる');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await open();
  await check(
    session,
    `(()=>{const r=document.querySelector('${menu}').getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight+1})()`,
    '長押しメニューを横向きの低い画面内に収める'
  );
  await evaluate(session, `${root}.debug.contextMenu.hide()`);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
}
