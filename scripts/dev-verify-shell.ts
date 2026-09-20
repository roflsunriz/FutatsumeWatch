import { attach, attachBrowser, evaluate, listTargets } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';

const out = new URL('../dev-assets/verification/', import.meta.url);
const checks: string[] = [];
const root = 'window.FutatsumeWatch';
const container = `document.querySelector('.fw-player')`;
const video = `document.querySelector('#zenzaVideoPlayerDialog zenza-video')`;
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
  browser.close();
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
      `document.querySelector('zenza-setting-panel')?.isOpen && !!window.__fwQuery('[data-fw-settings="general"] [data-settings-close]')`,
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
    await check(session, `!document.querySelector('zenza-setting-panel').isOpen`, '一般設定の閉じるボタン');
    await click(session, 'settings');
    await click(session, 'advanced');
    await check(session, `!!document.querySelector('.zenzaAdvancedSettingPanel.show')`, '左メニューから詳細設定を開く');
    await screenshot(session, 'advanced');
    await clickVisible(session, '.zenzaAdvancedSetting-close');
    await check(session, `!document.querySelector('.zenzaAdvancedSettingPanel.show')`, '詳細設定を閉じる');
    for (const [action, opened, close] of [
      [
        'toggleHLSDebug',
        `document.querySelector('video-debug-dialog')?.isOpen`,
        `${root}.external.execCommand('toggleHLSDebug')`,
      ],
      [
        'toggleZenzaGamePadConfig',
        `!!window.__fwQuery('.ZenzaGamePadConfigPanel[open]')`,
        `${root}.external.execCommand('toggleZenzaGamePadConfig')`,
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
      `${container}.dataset.panel==='' && document.querySelector('#zenzaVideoPlayerDialog').classList.contains('is-open')`,
      'Escapeは詳細だけを閉じる'
    );
    await click(session, 'fullscreen');
    await check(session, `!!document.fullscreenElement`, '全画面ボタンで全画面へ');
    await click(session, 'fullscreen');
    await check(session, `!document.fullscreenElement`, '全画面から復帰');
    for (const [width, height] of [
      [390, 844],
      [640, 480],
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
      // Guest page: expose only the local input layout; do not submit or alter authentication.
      await evaluate(session, `document.querySelector('.commentInputPanel').classList.remove('forMember')`);
      await reveal(session);
      await clickVisible(session, '.commentInput');
      await session.send('Input.insertText', { text: '表示確認（送信しません）' });
      await check(
        session,
        `['.commentInput','.commandInput','.commentSubmit'].every(s=>{const r=document.querySelector(s).getBoundingClientRect();return r.width>0&&r.x>=0&&r.right<=innerWidth+1&&r.y>=0&&r.bottom<innerHeight})`,
        `${width}×${height}でコメント入力・コマンド・送信が画面内（送信なし）`
      );
      await check(
        session,
        `document.querySelector('.autoPauseLabel').getBoundingClientRect().bottom < document.querySelector('.fw-bottom').getBoundingClientRect().top`,
        `${width}×${height}で入力補助が再生操作に重ならない`
      );
      await screenshot(session, `${width}-input`);
      await evaluate(
        session,
        `document.querySelector('.commentInput').value='';document.querySelector('.commentInput').blur();document.querySelector('.commentInputPanel').classList.add('forMember')`
      );
      await Bun.sleep(600);
    }
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
      `!document.querySelector('#zenzaVideoPlayerDialog').classList.contains('is-open')`,
      '閉じるボタンで終了'
    );
    if (errors.length) throw new Error(errors.join('\n'));
    await Bun.write(new URL('shell-report.json', out), JSON.stringify({ completed: true, checks, errors }, null, 2));
  } catch (error) {
    await screenshot(session, 'failure');
    await Bun.write(
      new URL('shell-report.json', out),
      JSON.stringify({ completed: false, checks, errors, failure: String(error) }, null, 2)
    );
    throw error;
  } finally {
    session.close();
  }
}
await main();
