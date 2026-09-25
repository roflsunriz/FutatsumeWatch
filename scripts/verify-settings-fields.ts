import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';

type Panel = 'general' | 'advanced';
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
    keys: 'autoPlay enableResume enableTogglePlayOnClick autoFullScreen enableHeatMap enableStoryboard'.split(' '),
  },
  {
    name: 'comments',
    panel: 'general',
    id: 'P2-08',
    keys: 'baseFontBolder baseFontFamily commentLayer.ownerCommentShadowColor baseChatScale commentLayerOpacity commentLayer.easyCommentOpacity commentLayer.aiCommentOpacity commentLayer.textShadowType'.split(
      ' '
    ),
  },
  {
    name: 'filters',
    panel: 'general',
    id: 'P2-09',
    keys: 'enableFilter removeNgMatchedUser sharedNgLevel filter.fork0 filter.fork1 filter.fork2 filter.fork3 filter.defaultThread filter.ownerThread filter.communityThread filter.nicosThread filter.easyThread filter.aiThread filter.extraCommunityThread filter.extraEasyThread wordRegFilter commandFilter userIdFilter'.split(
      ' '
    ),
  },
  {
    name: 'advanced',
    panel: 'advanced',
    id: 'P2-10',
    keys: 'enableFullScreenOnDoubleClick autoCloseFullScreen'.split(' '),
  },
];

const panelRoot = (panel: Panel): string => `window.__settingsQuery('[data-fw-settings="${panel}"]')`;
function control(panel: Panel, field: Field, radio?: string): string {
  const root = panelRoot(panel);
  const attribute = 'data-setting-name';
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
      : `${panelRoot(panel)}.querySelector('.fw-modal-body')`;
  return (await evaluate(
    session,
    `(()=>{
    const root=${root};
    const controls=[...root.querySelectorAll('input,select,textarea')].map(e=>({e,key:e.dataset.settingName||e.name}));
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
  if (field.key === 'wordRegFilter') return ['/futatsume-settings-fixture/g\n/^second$/i'];
  if (field.key.includes('ShadowColor')) return ['#123456'];
  if (field.key === 'baseFontFamily') return ['monospace'];
  if (field.key === 'userIdFilter') return ['99999999'];
  if (field.key === 'commandFilter') return ['invisible'];
  return ['futatsume-settings-fixture'];
}
function expected(field: Field, value: string | boolean): string {
  if (field.key === 'wordRegFilter') return JSON.stringify(String(value).split('\n'));
  return JSON.stringify(
    field.dataType === 'array'
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
  value: string | boolean
): Promise<boolean> {
  const renderer = 'window.FutatsumeWatch.debug.nicoCommentPlayer._view.renderer';
  const checks: Record<string, string> = {
    autoPlay: `document.querySelector('futatsume-video').autoplay===${String(value)} && window.FutatsumeWatch.debug.nicoVideoPlayer.isAutoPlay===${String(value)} && window.FutatsumeWatch.state.player.isAutoPlay===${String(value)}`,
    enableHeatMap: `document.querySelector('.seekBarContainer')?.classList.contains('noHeatMap')===${String(!value)}`,
    baseFontFamily: `${renderer}.comments.some(comment=>comment.fontFamily===${JSON.stringify(String(value))})`,
    commentLayerOpacity: `${renderer}.settings.commentOpacity===${Number(value)} && getComputedStyle(window.FutatsumeWatch.debug.nicoCommentPlayer._view.element).opacity==='1'`,
    'commentLayer.textShadowType': `${renderer}.settings.shadowIntensity===${JSON.stringify(value === 'shadow-type3' ? 'strong' : 'medium')}`,
  };
  const check = checks[field.key];
  if (!check) return false;
  await helpers.check(session, check, `${field.key}: 設定を描画状態へ反映`);
  return true;
}
async function storageKey(session: CdpSession, name: string): Promise<string> {
  return (await evaluate(
    session,
    `window.FutatsumeWatch.config.getStorageKey(window.FutatsumeWatch.config.getNativeKey(${JSON.stringify(name)}))`
  )) as string;
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
      const storage = await storageKey(session, field.key);
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
          wordRegFilter: ['/[/i', '/ok/ii'],
        };
        for (const value of invalid[field.key] ?? []) {
          const preserved = await evaluate(
            session,
            field.key === 'wordRegFilter'
              ? `({value:window.FutatsumeWatch.config.props.wordRegFilter,stored:localStorage.getItem(${JSON.stringify(storage)})})`
              : `({value:window.FutatsumeWatch.config.props[${JSON.stringify(field.key)}],stored:localStorage.getItem(${JSON.stringify(storage)})})`
          );
          await enter(session, panel, field, value);
          const current = await evaluate(
            session,
            field.key === 'wordRegFilter'
              ? `({value:window.FutatsumeWatch.config.props.wordRegFilter,stored:localStorage.getItem(${JSON.stringify(storage)})})`
              : `({value:window.FutatsumeWatch.config.props[${JSON.stringify(field.key)}],stored:localStorage.getItem(${JSON.stringify(storage)})})`
          );
          if (JSON.stringify(current) !== JSON.stringify(preserved))
            throw Error(
              `${result.id}: 不正入力 ${JSON.stringify(value)} が設定を変更しました: ${JSON.stringify({ preserved, current })}`
            );
          result.invalidInputs.push(value);
          await helpers.check(session, 'true', `${result.id}: 不正入力 ${JSON.stringify(value)} で保存値を維持`);
        }
        if (result.invalidInputs.length) await enter(session, panel, field, original);
        for (const value of values) {
          await enter(session, panel, field, value);
          const expectedJson = expected(field, value);
          const stored = `localStorage.getItem(${JSON.stringify(storage)})`;
          const persistence =
            field.key === 'wordRegFilter'
              ? `JSON.stringify(window.FutatsumeWatch.config.props.wordRegFilter)===${JSON.stringify(JSON.stringify(String(value).split('\n')))}&&${stored}===JSON.stringify(window.FutatsumeWatch.config.props.wordRegFilter)`
              : `${stored}!==null && JSON.stringify(JSON.parse(${stored}))===${JSON.stringify(expectedJson)}`;
          if (field.key === 'wordRegFilter') {
            const deadline = Date.now() + 5000;
            let snapshot: unknown;
            do {
              snapshot = await evaluate(
                session,
                `({value:window.FutatsumeWatch.config.props.wordRegFilter,stored:${stored}})`
              );
              if (await evaluate(session, persistence)) break;
              await Bun.sleep(100);
            } while (Date.now() < deadline);
            if (!(await evaluate(session, persistence)))
              throw Error(`${result.id}: ${String(value)}の保存が不一致: ${JSON.stringify(snapshot)}`);
            await helpers.check(session, 'true', `${result.id}: ${String(value)}を正しい型で保存`);
          } else await helpers.check(session, persistence, `${result.id}: ${String(value)}を正しい型で保存`);
          if (await verifyEffect(session, helpers, field, value)) result.effect = '描画・利用側モデルを確認';
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
