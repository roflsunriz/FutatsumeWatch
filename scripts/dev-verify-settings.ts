import { attach, attachBrowser, evaluate, listTargets } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';

const output = new URL('../dev-assets/verification/', import.meta.url);
const checks: string[] = [];
const panels = [
  ['general', 'general'],
  ['advanced', 'advanced'],
  ['hls', 'toggleHLSDebug'],
  ['masked', 'masked'],
  ['gamepad', 'toggleZenzaGamePadConfig'],
  ['heatsync', 'toggleHeatSyncDialog'],
] as const;
const panel = (name: string): string => `window.__settingsQuery('[data-fw-settings="${name}"]')`;
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
async function mouse(session: CdpSession, x: number, y: number): Promise<void> {
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x, y });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x, y });
}
async function clickInside(session: CdpSession, name: string, selector: string): Promise<void> {
  const point = (await evaluate(
    session,
    `(()=>{const e=window.__settingsQuery(${JSON.stringify(selector)},${panel(name)});if(!e||e.disabled)throw Error('Missing control'); e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),s=getComputedStyle(e);const x=r.x+r.width/2,y=r.y+r.height/2;const hit=e.getRootNode().elementFromPoint(x,y);if(!r.width||!r.height||s.visibility!=='visible'||!hit||!e.contains(hit))throw Error('Control not visible');return{x,y}})()`
  )) as { x: number; y: number };
  await mouse(session, point.x, point.y);
}
async function open(session: CdpSession, name: string, action: string): Promise<void> {
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 150 });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 12, y: 150 });
  await Bun.sleep(180);
  await clickVisible(session, '[data-shell-action="settings"]');
  await clickVisible(session, `[data-shell-action="${action}"]`);
  await check(session, `${panel(name)}?.open && ${panel(name)}.matches(':modal')`, `${name}: 共通モーダルを開く`);
}
async function capture(session: CdpSession, name: string): Promise<void> {
  const shot = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
  await Bun.write(new URL(`settings-${name}.png`, output), Buffer.from(shot.data, 'base64'));
}
async function main(): Promise<void> {
  const browser = await attachBrowser();
  const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
  browser.close();
  const target = (await listTargets()).find((t) => t.id === targetId);
  if (!target) throw Error('検証タブなし');
  const session = await attach(target);
  const errors: string[] = [];
  session.onEvent((method, params) => {
    if (method === 'Runtime.exceptionThrown') {
      const detail = params.exceptionDetails as { exception?: { description?: string } };
      const message = detail.exception?.description ?? '';
      if (/FutatsumeWatch|blob:|settings-dialog/.test(message)) errors.push(message.slice(0, 600));
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
    await check(
      session,
      `!!window.FutatsumeWatch?.ready && !!document.querySelector('.fw-controls')`,
      '配布物の初期化',
      30000
    );
    await clickVisible(session, '[data-futatsume-open]');
    await check(session, `document.querySelector('zenza-video')?.currentTime>1`, '起動導線から動画再生', 30000);
    await evaluate(
      session,
      `window.__settingsQuery=function find(selector,root=document){const e=root.querySelector(selector);if(e)return e;for(const host of root.querySelectorAll('*')){if(host.shadowRoot){const e=find(selector,host.shadowRoot);if(e)return e;}}return null;}`
    );
    for (const [name, action] of panels) {
      await open(session, name, action);
      await check(
        session,
        `getComputedStyle(${panel(name)},'::backdrop').backdropFilter==='blur(12px)' && getComputedStyle(${panel(name)}.querySelector('.fw-modal-content')).backgroundColor==='rgb(19, 25, 35)'`,
        `${name}: 共通配色と背景ブラー`
      );
      await capture(session, `${name}-1280`);
      await clickInside(session, name, '.fw-modal-heading h2');
      await check(session, `${panel(name)}.open`, `${name}: パネル内クリックでは閉じない`);
      await mouse(session, 3, 3);
      await check(
        session,
        `!${panel(name)}.open && !document.querySelector('zenza-video').paused`,
        `${name}: 背景クリックで閉じ、動画へクリックを通さない`
      );
      await open(session, name, action);
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
        `!${panel(name)}.open && document.querySelector('#zenzaVideoPlayerDialog').classList.contains('is-open')`,
        `${name}: Escapeは設定だけを閉じる`
      );
      await open(session, name, action);
      await clickInside(session, name, '[data-settings-close]');
      await check(session, `!${panel(name)}.open`, `${name}: 共通の閉じるボタン`);
    }
    for (const [name, action, selector, storage] of [
      ['general', 'general', '[data-setting-name="autoPlay"]', 'FutatsumeWatch_autoPlay'],
      [
        'advanced',
        'advanced',
        '[data-setting-name="enableFullScreenOnDoubleClick"]',
        'FutatsumeWatch_enableFullScreenOnDoubleClick',
      ],
      ['hls', 'toggleHLSDebug', 'input[name="capLevelToPlayerSize"]', 'ZenzaWatch_video.hls.capLevelToPlayerSize'],
      ['gamepad', 'toggleZenzaGamePadConfig', '[data-config-name="needFocus"]', 'ZenzaGamePad_config_needFocus'],
      ['heatsync', 'toggleHeatSyncDialog', '[data-config-name="turbo.enabled"]', 'HeatSync_config_turbo.enabled'],
    ] as const) {
      await open(session, name, action);
      if (name === 'general') await clickInside(session, name, '.player-setting summary');
      const checked = `window.__settingsQuery(${JSON.stringify(selector)},${panel(name)}).checked`;
      const before = await evaluate(session, checked);
      const storageKey =
        name === 'general'
          ? await evaluate(
              session,
              `window.FutatsumeWatch.config.getStorageKey(window.FutatsumeWatch.config.getNativeKey('autoPlay'))`
            )
          : storage;
      await clickInside(session, name, selector);
      if (name === 'hls') await clickInside(session, name, 'button[data-command="save"]');
      await check(
        session,
        `${checked}!==${String(before)} && JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}))===${String(!before)}`,
        `${name}: 設定の実入力と保存`
      );
      await mouse(session, 3, 3);
      await open(session, name, action);
      if (name === 'general') await clickInside(session, name, '.player-setting summary');
      await check(session, `${checked}===${String(!before)}`, `${name}: 再表示後の保存値`);
      await clickInside(session, name, selector);
      if (name === 'hls') await clickInside(session, name, 'button[data-command="save"]');
      await check(session, `${checked}===${String(before)}`, `${name}: 設定値を復元`);
      await mouse(session, 3, 3);
    }
    await open(session, 'masked', 'masked');
    const fast = await evaluate(session, `${panel('masked')}.querySelector('input[name="fastMode"]:checked').value`);
    await clickInside(session, 'masked', `input[name="fastMode"][value="${fast === 'true' ? 'false' : 'true'}"]`);
    await mouse(session, 3, 3);
    await open(session, 'masked', 'masked');
    await check(
      session,
      `${panel('masked')}.querySelector('input[name="fastMode"]:checked').value!==${JSON.stringify(fast)}`,
      'masked: ラジオ設定の保存と再表示'
    );
    await clickInside(session, 'masked', `input[name="fastMode"][value="${String(fast)}"]`);
    await mouse(session, 3, 3);
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 160 });
    await Bun.sleep(180);
    await clickVisible(session, '[data-shell-action="fullscreen"]');
    await check(session, '!!document.fullscreenElement', '全画面へ移行');
    for (const [name, action] of panels) {
      await open(session, name, action);
      await mouse(session, 3, 3);
      await check(
        session,
        `!${panel(name)}.open && !!document.fullscreenElement`,
        `${name}: 全画面を保って背景クリックで閉じる`
      );
    }
    await clickVisible(session, '[data-shell-action="fullscreen"]');
    for (const [width, height] of [
      [390, 844],
      [844, 390],
      [1920, 1080],
    ]) {
      await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      for (const [name, action] of panels) {
        await open(session, name, action);
        await check(
          session,
          `(()=>{const p=${panel(name)}.querySelector('.fw-modal-content'),b=p.querySelector('.fw-modal-body'),r=p.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&b.scrollWidth<=b.clientWidth+1})()`,
          `${name}: ${width}×${height}で画面内表示・横はみ出しなし`
        );
        await capture(session, `${name}-${width}`);
        await mouse(session, 3, 3);
        await check(session, `!${panel(name)}.open`, `${name}: ${width}×${height}で背景から閉じる`);
      }
    }
    await open(session, 'heatsync', 'toggleHeatSyncDialog');
    await evaluate(session, `window.FutatsumeWatch.external.execCommand('close')`);
    await check(
      session,
      `!${panel('heatsync')}.open && !document.querySelector('#zenzaVideoPlayerDialog').classList.contains('is-open')`,
      'プレイヤー終了時に設定と背景も閉じる'
    );
    if (errors.length) throw Error(errors.join('\n'));
    await Bun.write(
      new URL('settings-report.json', output),
      JSON.stringify({ completed: true, checks, errors }, null, 2)
    );
  } catch (error) {
    await capture(session, 'failure');
    await Bun.write(
      new URL('settings-report.json', output),
      JSON.stringify({ completed: false, checks, errors, failure: String(error) }, null, 2)
    );
    throw error;
  } finally {
    session.close();
  }
}
await main();
