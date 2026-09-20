import { attach, attachBrowser, cleanupCdp, evaluate, evaluateAsync, listTargets } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';
import { verificationDirectory } from './dev-verification-output';
import { settingsQuerySource } from './verify-settings-storage';

interface Helpers {
  open(session: CdpSession, name: string): Promise<void>;
  clickInside(session: CdpSession, name: string, selector: string): Promise<void>;
  check(session: CdpSession, expression: string, label: string, timeout?: number): Promise<void>;
}

/** Only the native detector boundary is fake. The shipped worker, bitmap,
 * config events, CSS painter and mask layer continue to execute. */
function detectorFixtureSource(fixture: string): string {
  return `(()=>{
  const NativeWorker=window.Worker;
  window.__settingsDetectorMessages=[];
  window.Worker=class extends NativeWorker{
    constructor(url,options){
      if(options?.name!=='Facelook'){super(url,options);return;}
      const fixture=${JSON.stringify(fixture)};
      const wrapped=URL.createObjectURL(new Blob([fixture,'importScripts('+JSON.stringify(String(url))+');'],{type:'text/javascript'}));
      super(wrapped,options);URL.revokeObjectURL(wrapped);
      this.addEventListener('message',event=>{if(event.data?.body?.command==='data')window.__settingsDetectorMessages.push(event.data.body.params.boxes);});
    }
  };
})();`;
}
export const settingsDetectorFixture = detectorFixtureSource(
  'self.FaceDetector=class{constructor(options){this.width=options.fastMode?200:100}detect(){return Promise.resolve([{boundingBox:{x:100,y:100,width:this.width,height:100},landmarks:[]}])}};self.TextDetector=class{detect(){return Promise.resolve([{boundingBox:{x:450,y:180,width:180,height:60}}])}};'
);
const unavailableDetectorFixture = detectorFixtureSource('self.FaceDetector=undefined;self.TextDetector=undefined;');

const video = `document.querySelector('futatsume-video')`;
const panel = (name: string): string => `window.__settingsQuery('[data-fw-settings="${name}"]')`;
async function press(session: CdpSession, key: string, code: number, modifiers = 0): Promise<void> {
  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: code, modifiers });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code, modifiers });
}
async function text(session: CdpSession, helpers: Helpers, name: string, key: string, value: string): Promise<void> {
  await helpers.clickInside(session, name, `[data-config-name="${key}"]`);
  await press(session, 'a', 65, 2);
  if (value) await session.send('Input.insertText', { text: value });
  else await press(session, 'Backspace', 8);
  await press(session, 'Tab', 9);
}
async function select(session: CdpSession, helpers: Helpers, name: string, key: string, value: string): Promise<void> {
  const index = (await evaluate(
    session,
    `[...${panel(name)}.querySelector('[data-config-name="${key}"]').options].findIndex(o=>o.value===${JSON.stringify(value)})`
  )) as number;
  if (index < 0) throw Error(`選択肢がありません: ${key}=${value}`);
  await helpers.clickInside(session, name, `[data-config-name="${key}"]`);
  await press(session, 'Home', 36);
  for (let i = 0; i < index; i++) await press(session, 'ArrowDown', 40);
  await press(session, 'Enter', 13);
  await press(session, 'Tab', 9);
}
async function checkbox(
  session: CdpSession,
  helpers: Helpers,
  name: string,
  key: string,
  value: boolean
): Promise<void> {
  if ((await evaluate(session, `${panel(name)}.querySelector('[data-config-name="${key}"]').checked`)) !== value)
    await helpers.clickInside(session, name, `[data-config-name="${key}"]`);
}
async function play(session: CdpSession, helpers: Helpers, playing: boolean): Promise<void> {
  if ((await evaluate(session, `${video}.paused`)) === playing) {
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 160 });
    await clickVisible(session, '[data-shell-action="togglePlay"]');
  }
  await helpers.check(
    session,
    `${video}.paused===${String(!playing)}`,
    `追加機能検証: ${playing ? '再生' : '停止'}状態を実ボタンで設定`
  );
}

export async function verifyGamepadEffects(session: CdpSession, helpers: Helpers): Promise<void> {
  await helpers.open(session, 'gamepad');
  const original = (await evaluate(
    session,
    `(()=>{const p=${panel('gamepad')};return {enabled:p.querySelector('[data-config-name="enabled"]').checked,needFocus:p.querySelector('[data-config-name="needFocus"]').checked,deviceIndex:p.querySelector('select').value}})()`
  )) as { enabled: boolean; needFocus: boolean; deviceIndex: string };
  await checkbox(session, helpers, 'gamepad', 'enabled', true);
  await checkbox(session, helpers, 'gamepad', 'needFocus', false);
  await select(session, helpers, 'gamepad', 'deviceIndex', '0');
  await helpers.clickInside(session, 'gamepad', '[data-settings-close]');
  await play(session, helpers, false);
  const muted = await evaluate(session, `${video}.muted`);
  const currentTime = await evaluate(session, `${video}.currentTime`);
  const initialRate = await evaluate(session, `${video}.playbackRate`);
  await evaluate(
    session,
    `(()=>{
    window.__settingsGamepadsDescriptor=Object.getOwnPropertyDescriptor(navigator,'getGamepads');
    window.__settingsPad={id:'Futatsume test standard controller',index:0,connected:true,timestamp:1,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},()=>({pressed:false,touched:false,value:0}))};
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{const pads=[];if(window.__settingsPad)pads[window.__settingsPad.index]=window.__settingsPad;return pads;}});
    window.__settingsPadEvents={};window.__settingsPadHandlers={};
    const addon=window.FutatsumeWatch.FutatsumeGamePad;
    for(const name of ['onDeviceConnect','onDeviceDisconnect','onButtonDown','onButtonUp','onButtonRepeat','onAxisChange','onAxisRepeat']){
      const handler=()=>window.__settingsPadEvents[name]=(window.__settingsPadEvents[name]||0)+1;
      window.__settingsPadHandlers[name]=handler;addon.on(name,handler);
    }
    const event=new Event('gamepadconnected');Object.defineProperty(event,'gamepad',{value:window.__settingsPad});window.dispatchEvent(event);
  })()`
  );
  const button = async (index: number, pressed: boolean): Promise<void> => {
    await evaluate(
      session,
      `window.__settingsPad.buttons[${index}]={pressed:${pressed},touched:${pressed},value:${pressed ? 1 : 0}};window.__settingsPad.timestamp++;`
    );
  };
  try {
    await helpers.check(
      session,
      `window.__settingsPadEvents.onDeviceConnect===1`,
      'P2-13: フェイク機器の接続を一度だけ検出'
    );
    await Bun.sleep(100);
    await helpers.check(
      session,
      `!window.__settingsPadEvents.onButtonDown && !window.__settingsPadEvents.onButtonUp`,
      'P2-13: 未操作の初回ポーリングで押下・解放を捏造しない'
    );
    await button(1, true);
    await helpers.check(session, `${video}.muted===${String(!muted)}`, 'P2-13: Bボタン入力から実ミュートへ到達');
    await helpers.check(
      session,
      `window.__settingsPadEvents.onButtonRepeat>=1 && ${video}.muted===${String(!muted)}`,
      'P2-13: 長押しは反復通知してもミュートを再反転しない'
    );
    await button(1, false);
    await helpers.check(session, `window.__settingsPadEvents.onButtonUp>=1`, 'P2-13: ボタン解放');
    await button(1, true);
    await helpers.check(session, `${video}.muted===${String(muted)}`, 'P2-13: 二度目の押下でミュート解除');
    await button(1, false);
    await button(0, true);
    await button(13, true);
    await helpers.check(session, `${video}.playbackRate<${Number(initialRate)}`, 'P2-13: Aと下ボタンで速度を下げる');
    await Bun.sleep(350);
    await helpers.check(
      session,
      `${video}.playbackRate<=${Math.max(0.1, Number(initialRate) - 0.2)}`,
      'P2-13: 下ボタンの長押しでも減速方向を保つ'
    );
    const releasedBefore = Number(await evaluate(session, 'window.__settingsPadEvents.onButtonUp||0'));
    await button(13, false);
    await button(0, false);
    await helpers.check(
      session,
      `window.__settingsPadEvents.onButtonUp>=${releasedBefore + 2}`,
      'P2-13: 長押しした両ボタンの解放を処理してから復元する'
    );
    await evaluate(session, `window.FutatsumeWatch.config.props.playbackRate=${Number(initialRate)};`);
    await helpers.check(
      session,
      `${video}.playbackRate===${Number(initialRate)} && window.FutatsumeWatch.config.props.playbackRate===${Number(initialRate)} && window.FutatsumeWatch.state.player.playbackRate===${Number(initialRate)}`,
      'P2-13: 長押し後の速度を設定・状態・実映像で復元'
    );
    await play(session, helpers, false);
    await evaluate(
      session,
      `${video}.currentTime=10;window.__settingsPad.axes[0]=0.05;window.__settingsPad.timestamp++;`
    );
    await Bun.sleep(250);
    await helpers.check(session, `Math.abs(${video}.currentTime-10)<0.3`, 'P2-13: 軸のデッドゾーンではシークしない');
    await evaluate(session, `window.__settingsPad.axes[0]=1;window.__settingsPad.timestamp++;`);
    await helpers.check(session, `${video}.currentTime>=14.5`, 'P2-13: 軸入力から実シークへ到達');
    await helpers.check(session, `window.__settingsPadEvents.onAxisRepeat>=1`, 'P2-13: 軸保持を反復入力として処理');
    await evaluate(session, `window.__settingsPad.axes[0]=0;window.__settingsPad.timestamp++;`);
    await helpers.open(session, 'gamepad');
    await checkbox(session, helpers, 'gamepad', 'enabled', false);
    await helpers.clickInside(session, 'gamepad', '[data-settings-close]');
    await button(1, true);
    await Bun.sleep(250);
    await helpers.check(session, `${video}.muted===${String(muted)}`, 'P2-13: UIで無効化すると機器入力が作用しない');
    await button(1, false);
    await helpers.open(session, 'gamepad');
    await checkbox(session, helpers, 'gamepad', 'enabled', true);
    await checkbox(session, helpers, 'gamepad', 'needFocus', true);
    await helpers.clickInside(session, 'gamepad', '[data-settings-close]');
    await evaluate(
      session,
      `window.__settingsFocusDescriptor=Object.getOwnPropertyDescriptor(document,'hasFocus');window.__settingsFocusOverridden=true;Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});`
    );
    await button(1, true);
    await Bun.sleep(250);
    await helpers.check(
      session,
      `${video}.muted===${String(muted)}`,
      'P2-13: フォーカス必須ONでは非フォーカス中の入力を抑止'
    );
    await evaluate(
      session,
      `if(window.__settingsFocusDescriptor)Object.defineProperty(document,'hasFocus',window.__settingsFocusDescriptor);else delete document.hasFocus;window.__settingsFocusOverridden=false;`
    );
    await helpers.check(session, `${video}.muted===${String(!muted)}`, 'P2-13: フォーカス復帰後に入力を再開');
    await button(1, false);
    await Bun.sleep(80);
    await helpers.open(session, 'gamepad');
    await checkbox(session, helpers, 'gamepad', 'needFocus', false);
    await select(session, helpers, 'gamepad', 'deviceIndex', '1');
    await helpers.clickInside(session, 'gamepad', '[data-settings-close]');
    await helpers.check(
      session,
      `window.__settingsPadEvents.onDeviceDisconnect===1`,
      'P2-13: 機器番号変更で以前の機器を解除'
    );
    await evaluate(
      session,
      `(()=>{window.__settingsPad.index=1;window.__settingsPad.timestamp++;const event=new Event('gamepadconnected');Object.defineProperty(event,'gamepad',{value:window.__settingsPad});window.dispatchEvent(event)})()`
    );
    await helpers.check(session, `window.__settingsPadEvents.onDeviceConnect===2`, 'P2-13: 新しい機器番号で再接続');
    await button(1, true);
    await helpers.check(session, `${video}.muted===${String(muted)}`, 'P2-13: 再接続した機器のボタンが作用');
    await button(1, false);
    await evaluate(
      session,
      `(()=>{window.__settingsPad.connected=false;const event=new Event('gamepaddisconnected');Object.defineProperty(event,'gamepad',{value:window.__settingsPad});window.dispatchEvent(event);window.dispatchEvent(event);})()`
    );
    await helpers.check(
      session,
      `window.__settingsPadEvents.onDeviceDisconnect===2`,
      'P2-13: 切断の重複通知で例外・二重解除なし'
    );
  } finally {
    await evaluate(
      session,
      `(()=>{const a=window.FutatsumeWatch.FutatsumeGamePad;for(const [name,handler] of Object.entries(window.__settingsPadHandlers))a.off(name,handler);if(window.__settingsGamepadsDescriptor)Object.defineProperty(navigator,'getGamepads',window.__settingsGamepadsDescriptor);else delete navigator.getGamepads;if(window.__settingsFocusOverridden){if(window.__settingsFocusDescriptor)Object.defineProperty(document,'hasFocus',window.__settingsFocusDescriptor);else delete document.hasFocus;}delete window.__settingsFocusDescriptor;delete window.__settingsFocusOverridden;delete window.__settingsPad;delete window.__settingsPadHandlers;delete window.__settingsPadEvents;delete window.__settingsGamepadsDescriptor;${video}.currentTime=${Number(currentTime)};${video}.muted=${String(muted)};window.FutatsumeWatch.config.props.playbackRate=${Number(initialRate)};})()`
    );
    await helpers.open(session, 'gamepad');
    await checkbox(session, helpers, 'gamepad', 'enabled', original.enabled);
    await checkbox(session, helpers, 'gamepad', 'needFocus', original.needFocus);
    await select(session, helpers, 'gamepad', 'deviceIndex', original.deviceIndex);
    await helpers.clickInside(session, 'gamepad', '[data-settings-close]');
  }
}

export async function verifyHeatSyncEffects(session: CdpSession, helpers: Helpers): Promise<void> {
  await helpers.open(session, 'heatsync');
  const original = (await evaluate(
    session,
    `Object.fromEntries(['turbo.red','turbo.blue','turbo.minDuration','turbo.ignoreTags','turbo.enabled'].map(key=>[key,window.HeatSync.config.getValue(key)]))`
  )) as Record<string, string | number | boolean>;
  const previousRate = await evaluate(session, `${video}.playbackRate`);
  const previousTime = await evaluate(session, `${video}.currentTime`);
  try {
    await select(session, helpers, 'heatsync', 'turbo.blue', '2');
    await select(session, helpers, 'heatsync', 'turbo.red', '1');
    await text(session, helpers, 'heatsync', 'turbo.minDuration', '0');
    await text(session, helpers, 'heatsync', 'turbo.ignoreTags', 'nonmatching-fixture-tag');
    await checkbox(session, helpers, 'heatsync', 'turbo.enabled', true);
    await helpers.clickInside(session, 'heatsync', '[data-settings-close]');
    await evaluate(
      session,
      `${video}.currentTime=1;window.FutatsumeWatch.emitter.emit('heatMapUpdate',{map:[0,0,255,255],duration:${video}.duration});`
    );
    await play(session, helpers, true);
    await helpers.check(
      session,
      `${video}.playbackRate>=1.9 && ${video}.playbackRate<=2`,
      'P2-14: 疎な区間はUI設定の上限速度へ加速',
      10000
    );
    await evaluate(session, `${video}.currentTime=${video}.duration*.75;`);
    await helpers.check(session, `${video}.playbackRate===1`, 'P2-14: 密な区間はUI設定の基準速度へ減速');
    await evaluate(session, `${video}.currentTime=1;`);
    await helpers.check(session, `${video}.playbackRate>=1.9`, 'P2-14: 疎な区間への復帰で再加速', 10000);
    await helpers.open(session, 'heatsync');
    await checkbox(session, helpers, 'heatsync', 'turbo.enabled', false);
    await helpers.clickInside(session, 'heatsync', '[data-settings-close]');
    await helpers.check(session, `${video}.playbackRate===1`, 'P2-14: UIでOFFにすると加速を残さない');
    await play(session, helpers, false);
  } catch (error) {
    try {
      const observed = await evaluate(
        session,
        `(()=>{const v=${video},s=window.HeatSync.external.syncer,c=window.HeatSync.config;return {time:v.currentTime,duration:v.duration,paused:v.paused,rate:v.playbackRate,configRate:window.FutatsumeWatch.config.props.playbackRate,stateRate:window.FutatsumeWatch.state.player.playbackRate,wrappedRate:window.FutatsumeWatch.debug.nicoVideoPlayer._videoPlayer.playbackRate,syncRate:s._rate,enabled:s._enabled,lastEnabled:s._lastEnabled,timer:s._timer,map:s._map,red:c.getValue('turbo.red'),blue:c.getValue('turbo.blue'),configuredEnabled:c.getValue('turbo.enabled')}})()`
      );
      await Bun.write(
        new URL('settings-heatsync-failure.json', verificationDirectory),
        JSON.stringify({ previousRate, previousTime, original, observed }, null, 2)
      );
    } catch (diagnosticError) {
      throw new AggregateError([error, diagnosticError], 'HeatSync検証と失敗状態の記録に失敗しました', {
        cause: diagnosticError,
      });
    }
    throw error;
  } finally {
    await helpers.open(session, 'heatsync');
    for (const key of ['turbo.red', 'turbo.blue'])
      await select(session, helpers, 'heatsync', key, String(original[key]));
    for (const key of ['turbo.minDuration', 'turbo.ignoreTags'])
      await text(session, helpers, 'heatsync', key, String(original[key]));
    await checkbox(session, helpers, 'heatsync', 'turbo.enabled', Boolean(original['turbo.enabled']));
    await helpers.clickInside(session, 'heatsync', '[data-settings-close]');
    await evaluate(
      session,
      `window.HeatSync.external.syncer.disable();window.FutatsumeWatch.config.props.playbackRate=${Number(previousRate)};${video}.currentTime=${Number(previousTime)};`
    );
    await play(session, helpers, false);
  }
}

async function sampleMask(
  session: CdpSession,
  points: [number, number][] = [
    [200, 150],
    [750, 150],
  ]
): Promise<number[]> {
  // CSS paint worklets update asynchronously after the config input changes.
  // Capture a rendered frame, not the old compositor frame from the click task.
  await evaluateAsync(session, `new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  const shot = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
  return (await evaluateAsync(
    session,
    `new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const r=document.querySelector('.commentLayerFrame').getBoundingClientRect();const ratio=Math.min(r.width/854,r.height/480),tx=r.x+(r.width-854*ratio)/2,ty=r.y+(r.height-480*ratio)/2;resolve(${JSON.stringify(points)}.map(([x,y])=>{const p=ctx.getImageData(Math.round(tx+x*ratio),Math.round(ty+y*ratio),1,1).data;return p[0]-Math.max(p[1],p[2]);}));};image.onerror=reject;image.src='data:image/png;base64,${shot.data}';})`
  )) as number[];
}
export async function verifyMaskedEffects(session: CdpSession, helpers: Helpers): Promise<void> {
  const previous = (await evaluate(
    session,
    `({enabled:window.MaskedWatch.config.enabled,face:window.MaskedWatch.config.faceDetection,text:window.MaskedWatch.config.textDetection,fast:window.MaskedWatch.config.fastMode,debug:window.MaskedWatch.config.debug,background:document.querySelector('.commentLayerFrame').style.backgroundColor})`
  )) as { enabled: boolean; face: boolean; text: boolean; fast: boolean; debug: boolean; background: string };
  try {
    await helpers.open(session, 'masked');
    await helpers.clickInside(session, 'masked', 'input[name="faceDetection"][value="true"]');
    await helpers.clickInside(session, 'masked', 'input[name="textDetection"][value="false"]');
    await helpers.clickInside(session, 'masked', 'input[name="fastMode"][value="true"]');
    await helpers.clickInside(session, 'masked', 'input[name="enabled"][value="true"]');
    await helpers.clickInside(session, 'masked', '[data-settings-close]');
    await evaluate(
      session,
      `${video}.currentTime=2;document.querySelector('.commentLayerFrame').style.backgroundColor='rgb(255,0,0)';window.__settingsMaskedCanvasStyles=[...document.querySelector('.commentLayerFrame').querySelectorAll('canvas')].map(e=>[e,e.style.visibility]);for(const [e] of window.__settingsMaskedCanvasStyles)e.style.visibility='hidden';`
    );
    await play(session, helpers, true);
    await helpers.check(
      session,
      `window.__settingsDetectorMessages.at(-1)?.length===1 && window.__settingsDetectorMessages.at(-1)[0].type==='face' && JSON.parse(document.querySelector('.commentLayerFrame').style.getPropertyValue('--json-args')||'{}').history?.length>0`,
      'P2-12: フェイク顔検出→実Worker応答→マスク用領域へ接続'
    );
    await play(session, helpers, false);
    const enabled = await sampleMask(session);
    if (!(enabled[0]! < 200 && enabled[1]! > 240))
      throw Error(`P2-12: 顔領域だけのマスク画素が不一致: ${enabled.join(',')}`);
    await helpers.open(session, 'masked');
    await helpers.clickInside(session, 'masked', 'input[name="faceDetection"][value="false"]');
    await helpers.clickInside(session, 'masked', 'input[name="textDetection"][value="true"]');
    await helpers.clickInside(session, 'masked', 'input[name="debug"][value="true"]');
    await helpers.clickInside(session, 'masked', '[data-settings-close]');
    await play(session, helpers, true);
    await helpers.check(
      session,
      `(()=>{const h=JSON.parse(document.querySelector('.commentLayerFrame').style.getPropertyValue('--json-args')||'{}').history;return h?.length===5&&h.every(boxes=>boxes.length===1&&boxes[0].type==='text')})()`,
      'P2-12: 顔OFF・テキストONで検出対象と履歴を切替'
    );
    await helpers.check(
      session,
      `document.querySelector('[data-type="FutatsumeWatch"]')?.getBoundingClientRect().width>0`,
      'P2-12: デバッグONで検出プレビューを表示'
    );
    await play(session, helpers, false);
    const textMask = await sampleMask(session, [
      [500, 190],
      [200, 150],
    ]);
    if (!(textMask[0]! < 200 && textMask[1]! > 240))
      throw Error(`P2-12: テキスト領域だけのマスク画素が不一致: ${textMask.join(',')}`);
    await helpers.open(session, 'masked');
    await helpers.clickInside(session, 'masked', 'input[name="textDetection"][value="false"]');
    await helpers.clickInside(session, 'masked', '[data-settings-close]');
    let noDetectors = await sampleMask(session, [
      [500, 190],
      [200, 150],
    ]);
    const paintDeadline = Date.now() + 2000;
    while (!noDetectors.every((value) => value > 240) && Date.now() < paintDeadline) {
      noDetectors = await sampleMask(session, [
        [500, 190],
        [200, 150],
      ]);
    }
    if (!noDetectors.every((value) => value > 240)) {
      const shot = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
      await Bun.write(new URL('masked-both-off-failure.png', verificationDirectory), Buffer.from(shot.data, 'base64'));
      throw Error(`P2-12: 両検出OFF後の実マスク画素が不一致: ${noDetectors.join(',')}`);
    }
    await helpers.check(
      session,
      `${video}.paused&&window.MaskedWatch.config.enabled&&!window.MaskedWatch.config.faceDetection&&!window.MaskedWatch.config.textDetection&&JSON.parse(document.querySelector('.commentLayerFrame').style.getPropertyValue('--json-args')).history.some(boxes=>boxes.length>0)`,
      'P2-12: 一時停止中に両検出OFFで履歴のマスクも即解除（実画素確認）'
    );
    await helpers.open(session, 'masked');
    await helpers.clickInside(session, 'masked', 'input[name="faceDetection"][value="true"]');
    await helpers.clickInside(session, 'masked', 'input[name="textDetection"][value="false"]');
    await helpers.clickInside(session, 'masked', 'input[name="fastMode"][value="false"]');
    await helpers.clickInside(session, 'masked', 'input[name="debug"][value="false"]');
    await helpers.clickInside(session, 'masked', '[data-settings-close]');
    await play(session, helpers, true);
    await helpers.check(
      session,
      `window.__settingsDetectorMessages.at(-1)?.[0]?.type==='face'&&window.__settingsDetectorMessages.at(-1)[0].width===100&&!document.querySelector('[data-type="FutatsumeWatch"]')`,
      'P2-12: 精度モードを検出API境界へ渡し、デバッグOFFでプレビューを除去'
    );
    await play(session, helpers, false);
    await helpers.open(session, 'masked');
    await helpers.clickInside(session, 'masked', 'input[name="enabled"][value="false"]');
    await helpers.clickInside(session, 'masked', '[data-settings-close]');
    const disabled = await sampleMask(session);
    if (!(disabled[0]! > 240 && disabled[1]! > 240))
      throw Error(`P2-12: OFF後の実マスク画素が不一致: ${disabled.join(',')}`);
    await helpers.check(
      session,
      `window.MaskedWatch.config.enabled===false`,
      'P2-12: UIでOFFにしてマスクを解除（実画素確認）'
    );
  } finally {
    await helpers.open(session, 'masked');
    await helpers.clickInside(session, 'masked', `input[name="faceDetection"][value="${previous.face}"]`);
    await helpers.clickInside(session, 'masked', `input[name="textDetection"][value="${previous.text}"]`);
    await helpers.clickInside(session, 'masked', `input[name="fastMode"][value="${previous.fast}"]`);
    await helpers.clickInside(session, 'masked', `input[name="debug"][value="${previous.debug}"]`);
    await helpers.clickInside(session, 'masked', `input[name="enabled"][value="${previous.enabled}"]`);
    await helpers.clickInside(session, 'masked', '[data-settings-close]');
    await evaluate(
      session,
      `document.querySelector('.commentLayerFrame').style.backgroundColor=${JSON.stringify(previous.background)};for(const [e,visibility] of window.__settingsMaskedCanvasStyles||[])e.style.visibility=visibility;delete window.__settingsMaskedCanvasStyles;`
    );
    await play(session, helpers, false);
  }
}

/** A separate context removes both native APIs at the worker boundary. */
export async function verifyMaskedUnavailable(parent: CdpSession, helpers: Helpers): Promise<void> {
  const browser = await attachBrowser();
  const { browserContextId } = (await browser.send('Target.createBrowserContext')) as { browserContextId: string };
  const { targetId } = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId })) as {
    targetId: string;
  };
  const session = await attach((await listTargets()).find((target) => target.id === targetId)!);
  const errors: string[] = [];
  session.onEvent((method, params) => {
    const message = (
      method === 'Target.receivedMessageFromTarget' ? JSON.parse(String(params.message)) : { method, params }
    ) as { method: string; params: { type?: string; exceptionDetails?: object } };
    if (
      message.method === 'Runtime.exceptionThrown' ||
      (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
    )
      errors.push(JSON.stringify(message.params));
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
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: unavailableDetectorFixture });
    await session.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `document.addEventListener('DOMContentLoaded',()=>{${source}\n},{once:true})`,
    });
    await session.send('Page.navigate', { url: 'https://www.nicovideo.jp/watch/sm9' });
    await session.send('Page.bringToFront');
    await helpers.check(session, '!!window.FutatsumeWatch?.ready', 'P2-12: 検出API不在の隔離文書で初期化', 30000);
    await clickVisible(session, '[data-futatsume-open]');
    await helpers.check(
      session,
      `${video}?.currentTime>0.5&&window.MaskedWatch?.support?.face===false&&window.MaskedWatch.support.text===false`,
      'P2-12: API不在でも実動画再生とWorker初期化を継続',
      30000
    );
    await evaluate(session, settingsQuerySource);
    const original = (await evaluate(
      session,
      '({enabled:window.MaskedWatch.config.enabled,face:window.MaskedWatch.config.faceDetection,text:window.MaskedWatch.config.textDetection,fast:window.MaskedWatch.config.fastMode})'
    )) as { enabled: boolean; face: boolean; text: boolean; fast: boolean };
    await helpers.open(session, 'masked');
    await helpers.check(
      session,
      `(()=>{const p=${panel('masked')},s=p.querySelector('[data-masked-support]'),r=s?.getBoundingClientRect();return p.open&&s?.dataset.state==='unavailable'&&s.dataset.reason==='detectors-unavailable'&&s.textContent.trim().length>0&&r.width>0&&r.height>0})()`,
      'P2-12: API不在の理由を設定画面へ可視表示'
    );
    const shot = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await Bun.write(
      new URL('settings-masked-unavailable.png', verificationDirectory),
      Buffer.from(shot.data, 'base64')
    );
    await helpers.clickInside(session, 'masked', `input[name="fastMode"][value="${!original.fast}"]`);
    await helpers.check(
      session,
      `window.MaskedWatch.config.fastMode===${!original.fast}&&window.MaskedWatch.config.enabled===${original.enabled}&&window.MaskedWatch.config.faceDetection===${original.face}&&window.MaskedWatch.config.textDetection===${original.text}&&${panel('masked')}.querySelector('[data-masked-support]').dataset.state==='unavailable'`,
      'P2-12: API不在でも設定を保持して変更可能'
    );
    await helpers.clickInside(session, 'masked', '[data-settings-close]');
    const time = Number(await evaluate(session, `${video}.currentTime`));
    await helpers.check(session, `${video}.currentTime>${time + 0.1}`, 'P2-12: 非対応表示後も動画の時刻が進む');
    if (errors.length) throw new Error(`API不在で例外またはerror出力: ${errors.join('\n')}`);
  } finally {
    await cleanupCdp(
      () => session.close(),
      () => browser.send('Target.disposeBrowserContext', { browserContextId }),
      () => browser.close(),
      () => parent.send('Page.bringToFront')
    );
  }
}
