import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';

type Panel = 'general' | 'advanced' | 'hls' | 'masked' | 'gamepad' | 'heatsync';
interface Field {
  key: string;
  type: string;
  dataType: string;
  value: string;
  checked: boolean;
  min: string;
  max: string;
  step: string;
  options: string[];
}
export interface SettingsFieldResult {
  id: string;
  category: string;
  key: string;
  storageKey: string;
  inputs: (string | boolean)[];
  verifiedInputs: (string | boolean)[];
  invalidInputs: string[];
  saved: boolean;
  reopened: boolean;
  restored: boolean;
  effect: '未検証' | '描画・利用側モデルを確認';
}
interface Helpers {
  open(session: CdpSession, name: string): Promise<void>;
  clickInside(session: CdpSession, name: string, selector: string): Promise<void>;
  check(session: CdpSession, expression: string, label: string, timeout?: number): Promise<void>;
}
export const settingsCategories: { name: string; panel: Panel; id: string; keys: string[] }[] = [
  {
    name: 'player',
    panel: 'general',
    id: 'P2-07',
    keys: 'autoPlay enableResume enableTogglePlayOnClick autoFullScreen enableSingleton enableHeatMap overrideGinza overrideWatchLink enableStoryboard uaa.enable enableAutoMylistComment enableNicosJumpVideo touch.enable bestFutatsumeTube loadLinkedChannelVideo menuScale'.split(
      ' '
    ),
  },
  {
    name: 'comments',
    panel: 'general',
    id: 'P2-08',
    keys: 'autoCommentSpeedRate backComment baseFontBolder commentSpeedRate baseFontFamily commentLayer.ownerCommentShadowColor baseChatScale commentLayerOpacity commentLayer.easyCommentOpacity commentLayer.aiCommentOpacity commentLayer.textShadowType'.split(
      ' '
    ),
  },
  {
    name: 'filters',
    panel: 'general',
    id: 'P2-09',
    keys: 'enableFilter removeNgMatchedUser sharedNgLevel filter.fork0 filter.fork1 filter.fork2 filter.fork3 filter.defaultThread filter.ownerThread filter.communityThread filter.nicosThread filter.easyThread filter.aiThread filter.extraCommunityThread filter.extraEasyThread wordFilter commandFilter userIdFilter'.split(
      ' '
    ),
  },
  {
    name: 'advanced',
    panel: 'advanced',
    id: 'P2-10',
    keys: 'enableFullScreenOnDoubleClick autoCloseFullScreen continueNextPage enableDblclickClose autoFutatsumeTube touch.tap2command touch.tap3command touch.tap4command touch.tap5command wordRegFilter wordRegFilterFlags videoTagFilter videoOwnerFilter debug'.split(
      ' '
    ),
  },
  {
    name: 'hls',
    panel: 'hls',
    id: 'P2-11',
    keys: 'maxBufferLength maxBufferSize maxMaxBufferLength minAutoBitrate startLevel abrEwmaDefaultEstimate autoAbrEwmaDefaultEstimate capLevelOnFPSDrop capLevelToPlayerSize show_video_label enable_db_cache debug'.split(
      ' '
    ),
  },
  {
    name: 'masked',
    panel: 'masked',
    id: 'P2-12',
    keys: 'faceDetection textDetection fastMode debug enabled'.split(' '),
  },
  { name: 'gamepad', panel: 'gamepad', id: 'P2-13', keys: 'enabled needFocus deviceIndex'.split(' ') },
  {
    name: 'heatsync',
    panel: 'heatsync',
    id: 'P2-14',
    keys: 'turbo.blue turbo.red turbo.minDuration turbo.ignoreTags turbo.enabled'.split(' '),
  },
];

const panelRoot = (panel: Panel): string => `window.__settingsQuery('[data-fw-settings="${panel}"]')`;
function control(panel: Panel, field: Field, radio?: string): string {
  const root = panelRoot(panel);
  if (panel === 'hls')
    return `window.__settingsQuery('input',${root}.querySelector('[name=${JSON.stringify(field.key)}]').shadowRoot)`;
  const attribute =
    panel === 'masked'
      ? 'name'
      : panel === 'gamepad' || panel === 'heatsync'
        ? 'data-config-name'
        : 'data-setting-name';
  const selector = `[${attribute}=${JSON.stringify(field.key)}]${radio === undefined ? '' : `[value=${JSON.stringify(radio)}]`}`;
  return `window.__settingsQuery(${JSON.stringify(selector)},${root})`;
}
async function key(session: CdpSession, key: string, code: number, modifiers = 0): Promise<void> {
  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: code, modifiers });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code, modifiers });
}
async function clickControl(session: CdpSession, expression: string, focusOnly = false): Promise<void> {
  const { x, y } = (await evaluate(
    session,
    `(()=>{const e=${expression};if(!e||e.disabled)throw Error('設定入力がありません');e.scrollIntoView({block:'center',inline:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;const hit=e.getRootNode().elementFromPoint(x,y);if(!r.width||!r.height||x<0||y<0||x>innerWidth||y>innerHeight||getComputedStyle(e).visibility!=='visible'||!hit||!e.contains(hit))throw Error('設定入力が覆われています');return{x,y}})()`
  )) as { x: number; y: number };
  if (focusOnly) {
    // Focusing is setup only. Value changes still come exclusively from CDP keys.
    await evaluate(session, `${expression}.focus()`);
    return;
  }
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x, y });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x, y });
}
async function enter(session: CdpSession, panel: Panel, field: Field, value: string | boolean): Promise<void> {
  const expression = control(panel, field, field.type === 'radio' ? String(value) : undefined);
  if (field.type === 'checkbox') {
    if ((await evaluate(session, `${expression}.checked`)) !== value) await clickControl(session, expression);
  } else if (field.type === 'radio') {
    await clickControl(session, expression);
  } else if (field.type === 'select-one') {
    await clickControl(session, expression);
    await key(session, 'Home', 36);
    for (let index = 0; index < field.options.indexOf(String(value)); index++) await key(session, 'ArrowDown', 40);
    await key(session, 'Enter', 13);
  } else if (field.type === 'range') {
    await clickControl(session, expression, true);
    // Arrow keys exercise the native range control; End/Home cover exact bounds.
    const current = Number(await evaluate(session, `${expression}.value`));
    const step = Number(field.step) || 1;
    const diff = Math.round((Number(value) - current) / step);
    if (Number(value) === Number(field.min)) await key(session, 'Home', 36);
    else if (Number(value) === Number(field.max)) await key(session, 'End', 35);
    else {
      // HLS byte ranges can have millions of steps. Move to the nearest endpoint
      // first so the tested neighbour requires at most two key presses.
      if (Math.abs(diff) > 30) {
        await key(session, 'Home', 36);
        const steps = Math.round((Number(value) - Number(field.min)) / step);
        if (steps > 30) throw Error(`復元できないrange値: ${field.key}=${value}`);
        for (let index = 0; index < steps; index++) await key(session, 'ArrowRight', 39);
      } else
        for (let index = 0; index < Math.abs(diff); index++)
          await key(session, diff > 0 ? 'ArrowRight' : 'ArrowLeft', diff > 0 ? 39 : 37);
    }
  } else {
    await clickControl(session, expression);
    await key(session, 'a', 65, 2);
    if (value === '') await key(session, 'Backspace', 8);
    else await session.send('Input.insertText', { text: String(value) });
  }
  await key(session, 'Tab', 9);
}
async function inventory(session: CdpSession, panel: Panel, category: string): Promise<Field[]> {
  const root =
    panel === 'general'
      ? `${panelRoot(panel)}.querySelector('[data-settings-section="${category}"]')`
      : panelRoot(panel);
  return (await evaluate(
    session,
    `(()=>{
    const root=${root};
    const controls=${panel === 'hls' ? "[...root.querySelectorAll('video-debug-slider,video-debug-checkbox')].map(host=>({e:host.shadowRoot.querySelector('input'),key:host.getAttribute('name')}))" : "[...root.querySelectorAll('input,select,textarea')].filter(e=>!e.matches('.futatsumeAdvancedSetting-rawData,.futatsumeAdvancedSetting-playlistData')).map(e=>({e,key:e.dataset.settingName||e.dataset.configName||e.name}))"};
    const groups=new Map();
    for(const {e,key} of controls){
      if(!key)throw Error('台帳の識別キーを持たない設定入力があります');
      if(e.type==='radio'&&groups.has(key)){groups.get(key).options.push(e.value);if(e.checked)groups.get(key).value=e.value;continue;}
      groups.set(key,{key,type:e.type,dataType:e.dataset.type||'',value:e.value,checked:e.checked||false,min:e.min||'',max:e.max||'',step:e.step||'',options:e.options?[...e.options].map(o=>o.value):e.type==='radio'?[e.value]:[]});
    }
    return [...groups.values()];
  })()`
  )) as Field[];
}
function candidates(field: Field): (string | boolean)[] {
  if (field.type === 'checkbox') return [!field.checked];
  if (field.options.length) return field.options.filter((value) => value !== field.value);
  if (field.type === 'range')
    return [
      String(
        Math.round(
          (Number(field.value) +
            (Number(field.value) + (Number(field.step) || 1) <= Number(field.max)
              ? Number(field.step) || 1
              : -(Number(field.step) || 1))) *
            1e9
        ) / 1e9
      ),
    ];
  if (field.type === 'number')
    return field.min && field.max
      ? [field.min, field.max].filter((v) => v !== field.value)
      : [String(Number(field.value) + 1)];
  if (field.key === 'wordRegFilterFlags') return [field.value === 'i' ? 'g' : 'i'];
  if (field.key.includes('ShadowColor')) return ['#123456'];
  if (field.key === 'baseFontFamily') return ['monospace'];
  if (field.key === 'videoOwnerFilter' || field.key === 'userIdFilter') return ['99999999'];
  if (field.key === 'commandFilter') return ['invisible'];
  return ['futatsume-settings-fixture'];
}
function expected(field: Field, value: string | boolean, panel: Panel): string {
  return JSON.stringify(
    panel === 'masked'
      ? value === 'true'
      : field.dataType === 'array'
        ? String(value).split('\n')
        : field.dataType === 'number' || field.type === 'range'
          ? Number(value)
          : value
  );
}
function valueMatches(field: Field, expression: string, value: string | boolean): string {
  if (field.type === 'checkbox' || field.type === 'radio')
    return `${expression}.checked===${field.type === 'radio' ? 'true' : String(value)}`;
  if (field.type === 'number' || field.type === 'range') return `Number(${expression}.value)===${Number(value)}`;
  return `${expression}.value===${JSON.stringify(String(value))}`;
}
async function verifyEffect(
  session: CdpSession,
  helpers: Helpers,
  field: Field,
  value: string | boolean,
  panel: Panel
): Promise<boolean> {
  const renderer = 'window.FutatsumeWatch.debug.nicoCommentPlayer._view.renderer';
  if (panel === 'hls') {
    const json = expected(field, value, panel);
    await helpers.check(
      session,
      `(()=>{const v=document.querySelector('futatsume-video'),key=${JSON.stringify(field.key)},expected=${json};return window.FutatsumeWatch.debug.hlsConfig[key]===expected && v.hlsConfig[key]===expected && (!(key in v.hls.config)||v.hls.config[key]===expected)})()`,
      `${field.key}: 保存内容を実HLS構成へ反映`
    );
    return true;
  }
  if (panel === 'heatsync') {
    await helpers.check(
      session,
      `window.HeatSync.config.getValue(${JSON.stringify(field.key)})===${expected(field, value, panel)}`,
      `${field.key}: 速度制御が参照する設定へ反映`
    );
    return true;
  }
  if (panel === 'gamepad' && field.key === 'enabled') {
    await helpers.check(
      session,
      `document.querySelector('.FutatsumeGamePadToggleButtonContainer')?.classList.contains('is-Enabled')===${String(value)}`,
      'enabled: GamePadの有効状態を操作ボタンへ反映'
    );
    return true;
  }
  const checks: Record<string, string> = {
    autoPlay: `document.querySelector('futatsume-video').autoplay===${String(value)} && window.FutatsumeWatch.debug.nicoVideoPlayer.isAutoPlay===${String(value)} && window.FutatsumeWatch.state.player.isAutoPlay===${String(value)}`,
    enableHeatMap: `document.querySelector('.seekBarContainer')?.classList.contains('noHeatMap')===${String(!value)}`,
    menuScale: `Number(getComputedStyle(document.querySelector('#futatsumeVideoPlayerDialog')).getPropertyValue('--futatsume-ui-scale'))===${Number(value)}`,
    backComment: `document.querySelector('.futatsumePlayerContainer')?.classList.contains('is-backComment')===${String(value)}`,
    commentLayerOpacity: `${renderer}.settings.commentOpacity===${Number(value)} && getComputedStyle(window.FutatsumeWatch.debug.nicoCommentPlayer._view.element).opacity==='1'`,
    'commentLayer.textShadowType': `${renderer}.settings.shadowIntensity===${JSON.stringify(value === 'shadow-type3' ? 'strong' : 'medium')}`,
    // comment-overlay normalizes durations to integer milliseconds (floor).
    commentSpeedRate: `(()=>{const rate=${Number(value)}/(window.FutatsumeWatch.config.props.autoCommentSpeedRate?Math.max(document.querySelector('futatsume-video').playbackRate,1):1);return ${renderer}.settings.scrollVisibleDurationMs===(rate===1?null:Math.max(1,Math.floor(4000/rate)))})()`,
  };
  const check = checks[field.key];
  if (!check) return false;
  await helpers.check(session, check, `${field.key}: 設定を描画状態へ反映`);
  return true;
}
async function storageKey(session: CdpSession, panel: Panel, name: string): Promise<string> {
  if (panel === 'general' || panel === 'advanced')
    return (await evaluate(
      session,
      `window.FutatsumeWatch.config.getStorageKey(window.FutatsumeWatch.config.getNativeKey(${JSON.stringify(name)}))`
    )) as string;
  return `${{ hls: 'FutatsumeWatch_video.hls.', masked: 'MaskedWatch_', gamepad: 'FutatsumeGamePad_config_', heatsync: 'HeatSync_config_' }[panel]}${name}`;
}

/** Every rendered setting must have a case; newly added keys fail inventory parity. */
export async function verifySettingsFields(
  session: CdpSession,
  helpers: Helpers,
  results: SettingsFieldResult[]
): Promise<void> {
  for (const category of settingsCategories) {
    const panel = category.panel;
    const show = async (): Promise<void> => {
      await helpers.open(session, panel);
      if (panel === 'general') await helpers.clickInside(session, panel, `[data-settings-tab="${category.name}"]`);
    };
    await show();
    const fields = await inventory(session, panel, category.name);
    if (JSON.stringify(fields.map((f) => f.key).sort()) !== JSON.stringify([...category.keys].sort()))
      throw Error(`${category.id}: 設定台帳と実入力が不一致: ${fields.map((f) => f.key).join(', ')}`);
    for (const field of fields) {
      const original = field.type === 'checkbox' ? field.checked : field.value;
      const storage = await storageKey(session, panel, field.key);
      const initialStorage = await evaluate(session, `localStorage.getItem(${JSON.stringify(storage)})`);
      const values = candidates(field);
      const result: SettingsFieldResult = {
        id: `${category.id}/${field.key}`,
        category: category.name,
        key: field.key,
        storageKey: storage,
        inputs: values,
        verifiedInputs: [],
        invalidInputs: [],
        saved: false,
        reopened: false,
        restored: false,
        effect: '未検証',
      };
      results.push(result);
      let failure: Error | undefined;
      let cleanupFailure: Error | undefined;
      try {
        const invalid: Record<string, string[]> = {
          baseChatScale: ['', '0.4', '2.1', '0.55'],
          'commentLayer.ownerCommentShadowColor': ['#xyz'],
          wordRegFilter: ['['],
          wordRegFilterFlags: ['ii'],
        };
        for (const value of invalid[field.key] ?? []) {
          await enter(session, panel, field, value);
          await helpers.check(
            session,
            `localStorage.getItem(${JSON.stringify(storage)})===${JSON.stringify(initialStorage)}`,
            `${result.id}: 不正入力 ${JSON.stringify(value)} で保存値を維持`
          );
          result.invalidInputs.push(value);
        }
        if (result.invalidInputs.length) await enter(session, panel, field, original);
        for (const value of values) {
          await enter(session, panel, field, value);
          if (panel === 'hls') await helpers.clickInside(session, panel, '[data-command="save"]');
          const expectedJson = expected(field, value, panel);
          const stored = `localStorage.getItem(${JSON.stringify(storage)})`;
          // MaskedWatch deliberately removes default values. Its public getter
          // resolves that contract; absence is never accepted for another panel.
          const persistence =
            panel === 'masked'
              ? `JSON.stringify(window.MaskedWatch.config[${JSON.stringify(field.key)}])===${JSON.stringify(expectedJson)} && (${stored}===null || ${stored}===${JSON.stringify(expectedJson)})`
              : `${stored}!==null && JSON.stringify(JSON.parse(${stored}))===${JSON.stringify(expectedJson)}`;
          await helpers.check(session, persistence, `${result.id}: ${String(value)}を正しい型で保存`);
          if (await verifyEffect(session, helpers, field, value, panel)) result.effect = '描画・利用側モデルを確認';
          await helpers.clickInside(session, panel, '[data-settings-close]');
          await show();
          const expression = control(panel, field, field.type === 'radio' ? String(value) : undefined);
          await helpers.check(
            session,
            valueMatches(field, expression, value),
            `${result.id}: ${String(value)}を再表示`
          );
          result.verifiedInputs.push(value);
        }
        result.saved = true;
        result.reopened = true;
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error), { cause: error });
      } finally {
        try {
          await enter(session, panel, field, original);
          if (panel === 'hls') await helpers.clickInside(session, panel, '[data-command="save"]');
          const expression = control(panel, field, field.type === 'radio' ? String(original) : undefined);
          await helpers.check(session, valueMatches(field, expression, original), `${result.id}: 入力値を復元`);
          result.restored = true;
          // Restore key absence too, after exercising the product's own restore path.
          await evaluate(
            session,
            initialStorage === null
              ? `localStorage.removeItem(${JSON.stringify(storage)})`
              : `localStorage.setItem(${JSON.stringify(storage)},${JSON.stringify(initialStorage)})`
          );
        } catch (cleanupError) {
          cleanupFailure =
            cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError), { cause: cleanupError });
        }
      }
      if (failure && cleanupFailure)
        throw new AggregateError([failure, cleanupFailure], `${result.id}: 検証と復元が失敗しました`, {
          cause: failure,
        });
      if (failure) throw failure;
      if (cleanupFailure) throw cleanupFailure;
    }
    await helpers.clickInside(session, panel, '[data-settings-close]');
  }
}
