import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';
import { offlineSites } from './dev-offline';

interface Helpers {
  open(session: CdpSession, name: string): Promise<void>;
  clickInside(session: CdpSession, name: string, selector: string): Promise<void>;
  check(session: CdpSession, expression: string, label: string, timeout?: number): Promise<void>;
}
const video = `document.querySelector('futatsume-video')`;
const keys = [
  'enableTogglePlayOnClick',
  'enableFullScreenOnDoubleClick',
  'autoFullScreen',
  'touch.enable',
  'uaa.enable',
] as const;

export async function verifyPlayerSettingEffects(session: CdpSession, helpers: Helpers): Promise<void> {
  const previous = (await evaluate(
    session,
    `Object.fromEntries(${JSON.stringify(keys)}.map(key=>[key,window.FutatsumeWatch.config.getValue(key)]))`
  )) as Record<(typeof keys)[number], boolean>;
  const oldPaused = (await evaluate(session, `${video}.paused`)) as boolean;
  async function setting(key: (typeof keys)[number], value: boolean): Promise<void> {
    const name = key === 'enableFullScreenOnDoubleClick' ? 'advanced' : 'general';
    await helpers.open(session, name);
    if (name === 'general') await helpers.clickInside(session, name, '[data-settings-tab="player"]');
    const input = `[data-setting-name="${key}"]`;
    const checked = await evaluate(
      session,
      `window.__settingsQuery(${JSON.stringify(input)},window.__settingsQuery('[data-fw-settings="${name}"]')).checked`
    );
    if (checked !== value) await helpers.clickInside(session, name, input);
    await helpers.check(
      session,
      `window.FutatsumeWatch.config.getValue(${JSON.stringify(key)})===${value}`,
      `P2-07/10: ${key}=${value}を操作で設定`
    );
    await helpers.clickInside(session, name, '[data-settings-close]');
  }
  async function surfaceClick(clickCount: number): Promise<void> {
    const point = (await evaluate(
      session,
      `(()=>{const e=document.querySelector('.futatsumePlayerContainer .touchWrapper');if(!e)throw Error('動画操作面なし');const r=e.getBoundingClientRect();for(const [px,py] of [[.25,.4],[.75,.4],[.25,.65]]){const x=r.x+r.width*px,y=r.y+r.height*py;if(r.width&&r.height&&document.elementFromPoint(x,y)===e)return{x,y};}throw Error('動画操作面が覆われています')})()`
    )) as { x: number; y: number };
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    for (let count = 1; count <= clickCount; count++) {
      await session.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button: 'left',
        clickCount: count,
        ...point,
      });
      await session.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'left',
        clickCount: count,
        ...point,
      });
    }
  }
  async function reopen(): Promise<void> {
    await clickVisible(session, '[data-shell-action="close"]');
    await helpers.check(
      session,
      `!document.querySelector('#futatsumeVideoPlayerDialog').classList.contains('is-open')`,
      'P2-07: 起動設定確認のため閉じる'
    );
    await clickVisible(session, '[data-futatsume-open]');
    await helpers.check(session, `${video}.readyState>=3`, 'P2-07: 設定変更後に実映像を開く');
  }
  try {
    await setting('enableTogglePlayOnClick', true);
    const paused = (await evaluate(session, `${video}.paused`)) as boolean;
    await surfaceClick(1);
    await helpers.check(session, `${video}.paused!==${paused}`, 'P2-07: 画面クリックONで実mediaの再生状態が切り替わる');
    await setting('enableTogglePlayOnClick', false);
    const disabledPaused = (await evaluate(session, `${video}.paused`)) as boolean;
    await surfaceClick(1);
    await helpers.check(session, `${video}.paused===${disabledPaused}`, 'P2-07: 画面クリックOFFで再生状態を保持する');

    await setting('enableFullScreenOnDoubleClick', true);
    await surfaceClick(2);
    await helpers.check(session, '!!document.fullscreenElement', 'P2-10: ダブルクリックONで実全画面に入る');
    await surfaceClick(2);
    await helpers.check(session, '!document.fullscreenElement', 'P2-10: 再度ダブルクリックで全画面を抜ける');
    await setting('enableFullScreenOnDoubleClick', false);
    await surfaceClick(2);
    await helpers.check(session, '!document.fullscreenElement', 'P2-10: ダブルクリックOFFでは全画面に入らない');

    await pageTouch(false);
    await pageTouch(true);
    if (offlineSites.has(session)) await sponsors();

    await setting('autoFullScreen', true);
    await reopen();
    await helpers.check(session, '!!document.fullscreenElement', 'P2-07: 自動全画面ONで起動アイコンから全画面に入る');
    await clickVisible(session, '[data-shell-action="fullscreen"]');
    await helpers.check(session, '!document.fullscreenElement', 'P2-07: 全画面操作から通常表示へ戻る');
    await setting('autoFullScreen', false);
    await reopen();
    await helpers.check(session, '!document.fullscreenElement', 'P2-07: 自動全画面OFFでは通常表示で起動する');
  } finally {
    if (await evaluate(session, '!!document.fullscreenElement'))
      await clickVisible(session, '[data-shell-action="fullscreen"]');
    for (const key of keys) await setting(key, previous[key]);
    if ((await evaluate(session, `${video}.paused`)) !== oldPaused)
      await clickVisible(session, '[data-shell-action="togglePlay"]');
    await helpers.check(session, `${video}.paused===${oldPaused}`, 'P2-07/10: 元の再生状態を復元');
  }

  async function pageTouch(enabled: boolean): Promise<void> {
    await setting('touch.enable', enabled);
    const muted = (await evaluate(session, `${video}.muted`)) as boolean;
    const points = (await evaluate(
      session,
      `(()=>{const e=document.querySelector('.touchWrapper'),r=e.getBoundingClientRect();return [0,1,2].map(id=>({id,x:r.x+r.width*.25+id*25,y:r.y+r.height*.35,radiusX:4,radiusY:4,force:1})).map(p=>{if(document.elementFromPoint(p.x,p.y)!==e)throw Error('タッチ操作面が覆われています');return p;})})()`
    )) as Array<{ id: number; x: number; y: number; radiusX: number; radiusY: number; force: number }>;
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    try {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await helpers.check(
        session,
        `${video}.muted===${enabled ? !muted : muted}`,
        `P2-07/10: タッチ${enabled ? 'ONは3本指でミュート切替' : 'OFFは3本指でも状態を保持'}`
      );
      if (enabled) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await helpers.check(session, `${video}.muted===${muted}`, 'P2-10: 3本指の再操作で音声状態を復元');
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
        await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await helpers.check(session, `${video}.muted===${muted}`, 'P2-10: 複数指の取消後に1本指へ操作が漏れない');
      }
    } finally {
      await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    }
  }

  async function sponsors(): Promise<void> {
    const site = offlineSites.get(session)!;
    const reply = site.reply.bind(site);
    site.reply = async (request) =>
      new URL(request.url).pathname === '/v1/contents/video/sm9/thanks'
        ? {
            status: 200,
            mime: 'application/json',
            body: JSON.stringify({
              data: { sponsors: [{ advertiserName: '検証提供者', message: '検証', auxiliary: {} }] },
            }),
          }
        : reply(request);
    try {
      await setting('uaa.enable', false);
      await helpers.check(
        session,
        `!window.FutatsumeWatch.debug.uaa._state.isExist`,
        'P2-07: 提供者表示OFFで既存の表示を消す'
      );
      await setting('uaa.enable', true);
      await clickVisible(session, '[data-shell-action="details"]');
      await clickVisible(session, '[data-shell-tab="videoInfoTab"]');
      await helpers.check(
        session,
        `window.FutatsumeWatch.debug.uaa._state.isExist && window.FutatsumeWatch.debug.uaa._elm.body.textContent.includes('検証提供者')`,
        'P2-07: 提供者表示ONで取得結果を描画',
        10000
      );
      const summary = `window.FutatsumeWatch.debug.uaa._shadow.querySelector('summary')`;
      const point = (await evaluate(
        session,
        `(()=>{const e=${summary};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!r.width||!r.height||e.getRootNode().elementFromPoint(x,y)!==e)throw Error('提供者の表示が覆われています');return{x,y}})()`
      )) as { x: number; y: number };
      for (const type of ['mousePressed', 'mouseReleased'])
        await session.send('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...point });
      await helpers.check(
        session,
        `window.FutatsumeWatch.debug.uaa._elm.body.querySelector('.contact').getBoundingClientRect().height>0`,
        'P2-07: 提供者欄を実クリックして名前を可視表示'
      );
      for (const type of ['keyDown', 'keyUp'])
        await session.send('Input.dispatchKeyEvent', {
          type,
          key: 'Escape',
          code: 'Escape',
          windowsVirtualKeyCode: 27,
        });
      await helpers.check(
        session,
        `document.querySelector('.futatsumePlayerContainer').dataset.panel===''`,
        'P2-07: 提供者欄からEscapeで動画へ戻る'
      );
      await setting('uaa.enable', false);
      await helpers.check(
        session,
        `!window.FutatsumeWatch.debug.uaa._state.isExist && window.FutatsumeWatch.debug.uaa._elm.body.textContent===''`,
        'P2-07: 提供者表示の再OFFでDOMと表示状態を消す'
      );
    } finally {
      site.reply = reply;
    }
  }
}
