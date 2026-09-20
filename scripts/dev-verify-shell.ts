import { verificationDirectory } from './dev-verification-output';
import { verifyCommentInput } from './dev-verify-comment-input';
import { attach, attachBrowser, cleanupCdp, evaluate, listTargets } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';
import { verifyMediaIdentity } from './verify-media-identity';

const out = verificationDirectory;
const checks: string[] = [];
const root = 'window.FutatsumeWatch';
const container = `document.querySelector('.fw-player')`;
const video = `document.querySelector('#futatsumeVideoPlayerDialog futatsume-video')`;
async function check(session: CdpSession, expression: string, label: string, timeout = 8000): Promise<void> {
  const deadline = Date.now() + timeout;
  do {
    if (await evaluate(session, expression)) {
      checks.push(label);
      console.log(`合格: ${label}`);
      return;
    }
    await Bun.sleep(100);
  } while (Date.now() < deadline);
  throw new Error(`検証失敗: ${label}`);
}
async function reveal(session: CdpSession): Promise<void> {
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 160 });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 110, y: 160 });
  await Bun.sleep(200);
}
async function click(session: CdpSession, action: string): Promise<void> {
  await reveal(session);
  const settingsTabs: Record<string, string> = {
    advanced: 'advanced',
    masked: 'masked',
    toggleHLSDebug: 'hls',
    toggleFutatsumeGamePadConfig: 'gamepad',
    toggleHeatSyncDialog: 'heatsync',
  };
  const tab = settingsTabs[action];
  if (tab) {
    await clickVisible(session, '[data-shell-action="general"]');
    await check(
      session,
      `window.__fwQuery('[data-fw-settings="general"]')?.open && !!window.__fwQuery('[data-fw-settings="general"] [data-settings-tab="${tab}"]')`,
      `設定から${tab}タブへ進む`
    );
    await deepClick(session, `[data-fw-settings="general"] [data-settings-tab="${tab}"]`);
    return;
  }
  await clickVisible(session, `[data-shell-action="${action}"]`);
}
async function screenshot(session: CdpSession, name: string): Promise<void> {
  const capture = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
  await Bun.write(new URL(`shell-${name}.png`, out), Buffer.from(capture.data, 'base64'));
}
async function deepClick(session: CdpSession, selector: string, rootSelector?: string): Promise<void> {
  const point = (await evaluate(
    session,
    `(()=>{const e=window.__fwQuery(${JSON.stringify(selector)},${rootSelector ? `document.querySelector(${JSON.stringify(rootSelector)})` : 'document'});if(!e)throw Error('Missing shadow control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();if(!r.width||!r.height||getComputedStyle(e).visibility!=='visible')throw Error('Hidden shadow control');const x=r.x+r.width/2,y=r.y+r.height/2;const hit=e.getRootNode().elementFromPoint(x,y);if(!hit||!e.contains(hit))throw Error('Covered shadow control');return {x,y}})()`
  )) as { x: number; y: number };
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
async function main(): Promise<void> {
  const browser = await attachBrowser();
  const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
  const { targetInfo } = (await browser.send('Target.getTargetInfo', { targetId })) as {
    targetInfo: { browserContextId?: string };
  };
  const browserContextId = targetInfo.browserContextId;
  const target = (await listTargets()).find((t) => t.id === targetId);
  if (!target) throw new Error('検証タブがありません');
  const session = await attach(target);
  const errors: string[] = [];
  session.onEvent((method, params) => {
    if (method === 'Runtime.exceptionThrown') {
      const detail = params.exceptionDetails as { exception?: { description?: string } };
      const message = detail.exception?.description ?? '';
      if (/FutatsumeWatch|blob:|player-shell/.test(message)) errors.push(message.slice(0, 500));
    }
  });
  try {
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const source = await Bun.file(new URL('../dist/FutatsumeWatch.user.js', import.meta.url)).text();
    await session.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `document.addEventListener('DOMContentLoaded',()=>{${source}\n},{once:true})`,
    });
    await session.send('Page.navigate', { url: 'https://www.nicovideo.jp/watch/sm9' });
    await session.send('Page.bringToFront');
    await check(session, `!!${root}?.ready && !!document.querySelector('.fw-controls')`, '新操作UIの初期化', 30000);
    await clickVisible(session, '[data-futatsume-open]');
    await check(session, `${video}?.currentTime > 1 && !${video}.paused`, 'ページの起動アイコンから動画再生', 30000);
    await check(
      session,
      `document.querySelector('.fw-title').textContent.length > 0 && document.querySelectorAll('.fw-stats span').length===5`,
      'タイトル・投稿日時・4種類の件数'
    );
    await click(session, 'togglePlay');
    await check(session, `${video}.paused`, '中央ボタンで一時停止');
    await clickVisible(session, '.seekBar');
    await check(
      session,
      `${video}.currentTime > ${video}.duration * .4 && ${video}.currentTime < ${video}.duration * .6`,
      'ヒートマップ付きシークバーを実クリックで操作'
    );
    await evaluate(session, `document.querySelector('.seekRange').blur();${root}.external.execCommand('seek',1)`);
    await reveal(session);
    await screenshot(session, '1280-controls');
    await check(session, `${container}.dataset.controls==='hidden'`, '未操作3秒で操作部を隠す', 5000);
    await reveal(session);
    await check(session, `${container}.dataset.controls==='visible'`, 'マウス移動で再表示');
    await clickVisible(session, '[data-shell-speed]');
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'ArrowDown',
      code: 'ArrowDown',
      windowsVirtualKeyCode: 40,
    });
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'ArrowDown',
      code: 'ArrowDown',
      windowsVirtualKeyCode: 40,
    });
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await check(session, `${video}.playbackRate===1.25`, '速度メニューを実キーボード操作で変更');
    await evaluate(
      session,
      `document.querySelector('[data-shell-speed]').blur();${root}.external.execCommand('playbackRate',1)`
    );
    await click(session, 'toggle-loop');
    await check(
      session,
      `${root}.config.props.loop && document.querySelector('[data-shell-action="toggle-loop"]').getAttribute('aria-pressed')==='true'`,
      '通常リピートの設定と表示'
    );
    await click(session, 'toggle-loop');
    await click(session, 'toggle-mute');
    await check(session, `${video}.muted`, 'ミュート');
    await click(session, 'toggle-mute');
    await click(session, 'toggle-showComment');
    await check(session, `!${root}.debug.nicoCommentPlayer._view._isShow`, '新しいコメントボタンで非表示');
    await click(session, 'toggle-showComment');
    await check(session, `${root}.debug.nicoCommentPlayer._view._isShow`, '新しいコメントボタンで再表示');
    await clickVisible(session, '[data-shell-volume]');
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      windowsVirtualKeyCode: 37,
    });
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      windowsVirtualKeyCode: 37,
    });
    await check(
      session,
      `Math.abs(${video}.volume - Number(document.querySelector('[data-shell-volume]').value))<.02`,
      '音量スライダーを実入力で変更'
    );
    await evaluate(
      session,
      `document.querySelector('[data-shell-volume]').blur(); ${root}.external.execCommand('seek', 10)`
    );
    await check(session, `Math.abs(${video}.currentTime-10)<.3`, 'A指定前のシーク');
    await click(session, 'ab');
    await evaluate(session, `${root}.external.execCommand('seek',12)`);
    await check(session, `Math.abs(${video}.currentTime-12)<.3`, 'B指定前のシーク');
    await click(session, 'ab');
    await click(session, 'togglePlay');
    await check(session, `${video}.currentTime>=10 && ${video}.currentTime<11.5`, 'AB区間末尾からAへ戻る');
    await click(session, 'ab');
    await check(session, `document.querySelector('[data-shell-action="ab"]').dataset.repeat==='off'`, 'ABリピート解除');
    await click(session, 'toggle-loop');
    await click(session, 'ab');
    await check(
      session,
      `!${root}.config.props.loop && document.querySelector('[data-shell-action="ab"]').dataset.repeat==='start'`,
      'AB指定で動画全体のリピートを解除'
    );
    await click(session, 'toggle-loop');
    await check(
      session,
      `${root}.config.props.loop && document.querySelector('[data-shell-action="ab"]').dataset.repeat==='off'`,
      '通常リピートへの切替でAB指定を解除'
    );
    await click(session, 'toggle-loop');
    await click(session, 'settings');
    await check(
      session,
      `${container}.dataset.panel==='settings' && !document.querySelector('.fw-settings').inert`,
      '左メニューを開く'
    );
    await screenshot(session, '1280-settings');
    await check(
      session,
      `(()=>{const menu=document.querySelector('.fw-settings');return menu.querySelectorAll(':scope > button').length===1&&menu.querySelectorAll(':scope > .fw-quality').length===1&&menu.querySelectorAll(':scope > a').length===1&&menu.querySelectorAll(':scope > details').length===1&&menu.querySelectorAll('[data-shell-action="advanced"],[data-shell-action="masked"],[data-shell-action="toggleHLSDebug"],[data-shell-action="toggleFutatsumeGamePadConfig"],[data-shell-action="toggleHeatSyncDialog"]').length===0})()`,
      '設定前のメニューを4項目に集約'
    );
    await clickVisible(session, '.fw-settings > details > summary');
    await check(
      session,
      `document.querySelector('.fw-settings > details').open && document.querySelectorAll('.fw-settings > details [data-shell-action]').length===3`,
      'その他操作の既存3操作を開く'
    );
    await clickVisible(session, '.fw-settings > details > summary');
    await Bun.sleep(3300);
    await check(session, `${container}.dataset.controls==='visible'`, 'メニュー操作中は自動で隠さない');
    await clickVisible(session, '.fw-backdrop');
    await check(
      session,
      `${container}.dataset.panel==='' && document.querySelector('.fw-settings').inert`,
      '背景クリックで閉じる'
    );
    await evaluate(
      session,
      `window.__fwQuery = function find(selector, root=document) { const found=root.querySelector(selector); if(found)return found; for(const e of root.querySelectorAll('*')) {if(e.shadowRoot){const found=find(selector,e.shadowRoot);if(found)return found;}} return null; }`
    );
    await click(session, 'settings');
    await click(session, 'general');
    await check(
      session,
      `document.querySelector('futatsume-setting-panel')?.isOpen && !!window.__fwQuery('[data-fw-settings="general"] [data-settings-close]')`,
      '左メニューから一般設定を開く'
    );
    await screenshot(session, 'general');
    await deepClick(session, '[data-fw-settings="general"] [data-settings-tab="player"]');
    const oldAutoPlay = await evaluate(session, `${root}.config.props.autoPlay`);
    await deepClick(session, '[data-setting-name="autoPlay"]');
    await check(
      session,
      `${root}.config.props.autoPlay!==${String(oldAutoPlay)} && JSON.parse(localStorage.getItem(${root}.config.getStorageKey(${root}.config.getNativeKey('autoPlay'))))===${String(!oldAutoPlay)}`,
      '一般設定のチェックボックスを実クリックで保存'
    );
    await deepClick(session, '[data-setting-name="autoPlay"]');
    await deepClick(session, '[data-fw-settings="general"] [data-settings-close]');
    await check(session, `!document.querySelector('futatsume-setting-panel').isOpen`, '一般設定の閉じるボタン');
    await click(session, 'settings');
    await click(session, 'advanced');
    await check(
      session,
      `!!document.querySelector('.futatsumeAdvancedSettingPanel.show')`,
      '左メニューから詳細設定を開く'
    );
    await screenshot(session, 'advanced');
    await clickVisible(session, '.futatsumeAdvancedSetting-close');
    await check(session, `!document.querySelector('.futatsumeAdvancedSettingPanel.show')`, '詳細設定を閉じる');
    for (const [action, opened, close] of [
      [
        'toggleHLSDebug',
        `document.querySelector('video-debug-dialog')?.isOpen`,
        `${root}.external.execCommand('toggleHLSDebug')`,
      ],
      [
        'toggleFutatsumeGamePadConfig',
        `!!window.__fwQuery('.FutatsumeGamePadConfigPanel[open]')`,
        `${root}.external.execCommand('toggleFutatsumeGamePadConfig')`,
      ],
      [
        'toggleHeatSyncDialog',
        `!!window.__fwQuery('.HeatSyncConfigPanel.is-Visible')`,
        `${root}.external.execCommand('toggleHeatSyncDialog')`,
      ],
      [
        'masked',
        `!!document.querySelector('maskedwatch-dialog')?.shadowRoot.querySelector('dialog[open]')`,
        `document.querySelector('maskedwatch-dialog').shadowRoot.querySelector('.close-button').click()`,
      ],
    ]) {
      await click(session, 'settings');
      await click(session, action!);
      await check(session, opened!, `左メニューから${action}を開く`);
      await evaluate(session, close!);
      await check(session, `!(${opened})`, `${action}を閉じる`);
    }
    await click(session, 'details');
    await check(
      session,
      `${container}.dataset.panel==='details' && document.querySelectorAll('[data-shell-tab]').length===4`,
      '右の4タブを開く'
    );
    await screenshot(session, '1280-details');
    await deepClick(session, '[data-command="toggleEdit"]', '.fw-tags');
    await check(
      session,
      `document.querySelector('.fw-tags .TagListView').classList.contains('is-Editing')`,
      'タグ編集モードを開く（送信なし）'
    );
    await deepClick(session, '[data-command="toggleEdit"]', '.fw-tags');
    for (const name of ['relatedVideoTab', 'comment', 'playlist', 'videoInfoTab']) {
      await clickVisible(session, `[data-shell-tab="${name}"]`);
      await check(
        session,
        `document.querySelector('.tabs.${name}').classList.contains('activeTab')`,
        `${name}タブを実クリックで表示`
      );
      await screenshot(session, `1280-${name}`);
    }
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
    await check(
      session,
      `${container}.dataset.panel==='' && document.querySelector('#futatsumeVideoPlayerDialog').classList.contains('is-open')`,
      'Escapeは詳細だけを閉じる'
    );
    await click(session, 'fullscreen');
    await check(session, `!!document.fullscreenElement`, '全画面ボタンで全画面へ');
    await click(session, 'fullscreen');
    await check(session, `!document.fullscreenElement`, '全画面から復帰');
    await verifyCommentInput(session, check);
    for (const [width, height] of [
      [390, 844],
      [640, 480],
      [1200, 800],
      [1920, 1080],
      [844, 390],
      [3840, 2160],
    ]) {
      await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await reveal(session);
      await check(
        session,
        `(()=>{const p=${container}.getBoundingClientRect();return p.x===0&&p.y===0&&Math.abs(p.width-innerWidth)<2&&Math.abs(p.height-innerHeight)<2})()`,
        `${width}×${height}でブラウザ内全体に表示`
      );
      await screenshot(session, `${width}-controls`);
      await click(session, 'togglePlay');
      await click(session, 'togglePlay');
      await click(session, 'details');
      await check(
        session,
        `(()=>{const p=document.querySelector('#fw-details').getBoundingClientRect();return p.x>=0&&p.right<=innerWidth+1&&p.bottom<=innerHeight+1})()`,
        `${width}×${height}で詳細が画面内`
      );
      await screenshot(session, `${width}-details`);
      await clickVisible(session, '.fw-backdrop');
    }
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await reveal(session);
    await check(
      session,
      `(()=>{const c=document.querySelector('[data-futatsume-comment-canvas]'),r=c?.getBoundingClientRect();return devicePixelRatio===2&&r?.width>0&&Math.abs(c.width-r.width*2)<3&&Math.abs(c.height-r.height*2)<3;})()`,
      'DPR 2でコメントCanvasの画素数と表示寸法を一致'
    );
    await click(session, 'togglePlay');
    await click(session, 'togglePlay');
    await screenshot(session, 'dpr-2-controls');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate(session, `${root}.external.execCommand('playlistAppend','sm2057168')`);
    await check(session, `${root}.debug.playlist.hasNext`, 'プレイリストへ検証用の次動画を追加', 30000);
    await click(session, 'ab');
    await click(session, 'playNextVideo');
    await check(
      session,
      `${root}.debug.videoInfo.watchId==='sm2057168' && ${video}.currentTime>1`,
      '中央の次動画ボタンで切替と再生',
      30000
    );
    await check(
      session,
      `document.querySelector('[data-shell-action="ab"]').dataset.repeat==='off'`,
      '動画切替でAB指定を解除'
    );
    if (process.env.FUTATSUME_TEST_OFFLINE === '1') await verifyMediaIdentity(session, 'sm2057168', check);
    await click(session, 'playPreviousVideo');
    await check(
      session,
      `${root}.debug.videoInfo.watchId==='sm9' && ${video}.currentTime>1`,
      '中央の前動画ボタンで復帰',
      30000
    );
    await click(session, 'close');
    await check(
      session,
      `!document.querySelector('#futatsumeVideoPlayerDialog').classList.contains('is-open')`,
      '閉じるボタンで終了'
    );
    if (errors.length) throw new Error(errors.join('\n'));
    await Bun.write(
      new URL('shell-report.json', out),
      JSON.stringify({ completed: true, browserContextId, checks, errors }, null, 2)
    );
  } catch (error) {
    await screenshot(session, 'failure');
    await Bun.write(
      new URL('shell-report.json', out),
      JSON.stringify({ completed: false, browserContextId, checks, errors, failure: String(error) }, null, 2)
    );
    throw error;
  } finally {
    await cleanupCdp(
      () => session.close(),
      // Disposing an owned context already closes all of its pages.
      () =>
        process.env.FUTATSUME_TEST_OFFLINE === '1' && browserContextId
          ? browser.send('Target.disposeBrowserContext', { browserContextId })
          : browser.send('Target.closeTarget', { targetId }),
      () => browser.close()
    );
  }
}
await main();
