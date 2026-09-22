import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';

interface Helpers {
  open(session: CdpSession, name: string): Promise<void>;
  clickInside(session: CdpSession, name: string, selector: string): Promise<void>;
  check(session: CdpSession, expression: string, label: string, timeout?: number): Promise<void>;
}
const video = `document.querySelector('futatsume-video')`;
const keys = ['enableTogglePlayOnClick', 'enableFullScreenOnDoubleClick', 'autoFullScreen'] as const;

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
}
