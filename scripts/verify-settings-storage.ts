import { evaluate, evaluateAsync } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { fileURLToPath } from 'node:url';
import { verificationDirectory } from './dev-verification-output';
import { clickVisible } from './dev-ui';

interface Helpers {
  open(session: CdpSession, name: string): Promise<void>;
  clickInside(session: CdpSession, name: string, selector: string): Promise<void>;
  check(session: CdpSession, expression: string, label: string, timeout?: number): Promise<void>;
}

export const settingsQuerySource = `window.__settingsQuery=function find(selector,root=document){const e=root.querySelector(selector);if(e)return e;for(const host of root.querySelectorAll('*')){if(host.shadowRoot){const e=find(selector,host.shadowRoot);if(e)return e;}}return null;}`;

/** Read the blob created by the actual export button while intercepting only
 * its browser download. Both the smoke check and roundtrip use these bytes. */
export async function captureSettingsExport(session: CdpSession, helpers: Helpers): Promise<string> {
  await evaluate(
    session,
    `window.__settingsAnchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.config.json')){window.__settingsExportUrl=this.href;window.__settingsExportResult=fetch(this.href).then(async response=>({json:await response.text(),mime:response.headers.get('content-type')}));return;}return window.__settingsAnchorClick.call(this);}`
  );
  try {
    await helpers.clickInside(session, 'general', '.export-config-button');
    await helpers.check(
      session,
      `!!window.__settingsExportUrl`,
      '入出力タブから設定書き出しを操作（ダウンロードは捕捉）'
    );
    const exported = (await evaluateAsync(session, `window.__settingsExportResult`)) as { json: string; mime: string };
    if (exported.mime !== 'application/json') throw new Error('設定ファイルのMIMEがJSONではありません');
    const json = exported.json;
    await helpers.check(
      session,
      `JSON.stringify(JSON.parse(${JSON.stringify(json)}))===JSON.stringify(JSON.parse(window.FutatsumeWatch.config.exportJson()))`,
      '設定書き出しのJSONが保存設定に一致'
    );
    return json;
  } finally {
    await evaluate(
      session,
      `HTMLAnchorElement.prototype.click=window.__settingsAnchorClick;URL.revokeObjectURL(window.__settingsExportUrl);delete window.__settingsExportUrl;delete window.__settingsExportResult;delete window.__settingsAnchorClick;`
    );
  }
}

export async function verifySettingsRoundtrip(session: CdpSession, helpers: Helpers): Promise<void> {
  await helpers.open(session, 'general');
  await helpers.clickInside(session, 'general', '[data-settings-tab="comments"]');
  const root = `window.__settingsQuery('[data-fw-settings="general"]')`;
  const scaleInput = `window.__settingsQuery('[data-setting-name="baseChatScale"]',${root})`;
  const boldInput = `window.__settingsQuery('[data-setting-name="baseFontBolder"]',${root})`;
  const before = (await evaluate(
    session,
    `(()=>{const c=window.FutatsumeWatch.config;const scaleKey=c.getStorageKey(c.getNativeKey('baseChatScale')),boldKey=c.getStorageKey(c.getNativeKey('baseFontBolder'));return {scale:c.props.baseChatScale,bold:c.props.baseFontBolder,defaultBold:c.default.baseFontBolder,heatMap:c.props.enableHeatMap,scaleKey,boldKey,scaleStored:localStorage.getItem(scaleKey),boldStored:localStorage.getItem(boldKey)}})()`
  )) as {
    scale: number;
    bold: boolean;
    defaultBold: boolean;
    heatMap: boolean;
    scaleKey: string;
    boldKey: string;
    scaleStored: string | null;
    boldStored: string | null;
  };
  const targetScale = before.scale === 1.2 ? 1.3 : 1.2;
  const targetBold = !before.defaultBold;
  const inputScale = async (value: number): Promise<void> => {
    await helpers.clickInside(session, 'general', '[data-setting-name="baseChatScale"]');
    for (const type of ['keyDown', 'keyUp'])
      await session.send('Input.dispatchKeyEvent', { type, key: 'a', windowsVirtualKeyCode: 65, modifiers: 2 });
    await session.send('Input.insertText', { text: String(value) });
    for (const type of ['keyDown', 'keyUp'])
      await session.send('Input.dispatchKeyEvent', { type, key: 'Tab', windowsVirtualKeyCode: 9 });
  };
  const inputBold = async (value: boolean): Promise<void> => {
    if ((await evaluate(session, `${boldInput}.checked`)) !== value)
      await helpers.clickInside(session, 'general', '[data-setting-name="baseFontBolder"]');
  };
  let active = false;
  let navigated = false;
  let loaded = false;
  const dialogs: string[] = [];
  const dialogCommands: Promise<unknown>[] = [];
  session.onEvent((method, params) => {
    if (!active) return;
    if (method === 'Page.javascriptDialogOpening') {
      dialogs.push(String(params.type));
      dialogCommands.push(session.send('Page.handleJavaScriptDialog', { accept: true }));
    } else if (method === 'Page.frameNavigated') {
      const frame = params.frame as { parentId?: string };
      if (!frame.parentId) navigated = true;
    } else if (method === 'Page.loadEventFired' && navigated) loaded = true;
  });
  let failure: Error | undefined;
  let cleanupFailure: Error | undefined;
  try {
    await inputScale(targetScale);
    await inputBold(targetBold);
    await helpers.check(
      session,
      `window.FutatsumeWatch.config.props.baseChatScale===${targetScale} && window.FutatsumeWatch.config.props.baseFontBolder===${targetBold} && JSON.parse(localStorage.getItem(${JSON.stringify(before.scaleKey)}))===${targetScale} && JSON.parse(localStorage.getItem(${JSON.stringify(before.boldKey)}))===${targetBold}`,
      'P2-06/roundtrip: 書き出し対象を実入力し数値・真偽値で保存'
    );
    await helpers.clickInside(session, 'general', '[data-settings-tab="data"]');
    const json = await captureSettingsExport(session, helpers);
    const exported = JSON.parse(json) as { baseChatScale?: number; baseFontBolder?: boolean };
    if (exported.baseChatScale !== targetScale || exported.baseFontBolder !== targetBold)
      throw Error('P2-06/roundtrip: 書き出しファイルに変更した型付き設定がありません');
    const file = new URL('settings-roundtrip.config.json', verificationDirectory);
    await Bun.write(file, json);
    await helpers.clickInside(session, 'general', '[data-settings-tab="comments"]');
    await inputScale(before.scale);
    await inputBold(!targetBold);
    await helpers.check(
      session,
      `window.FutatsumeWatch.config.props.baseChatScale!==${targetScale} && window.FutatsumeWatch.config.props.baseFontBolder!==${targetBold}`,
      'P2-06/roundtrip: 読み込み前に両設定を別の値へ実変更'
    );
    await helpers.clickInside(session, 'general', '[data-settings-tab="data"]');
    const oldTimeOrigin = (await evaluate(session, 'performance.timeOrigin')) as number;
    await session.send('Page.setInterceptFileChooserDialog', { enabled: true });
    await helpers.clickInside(session, 'general', '.import-config-file-select');
    const remote = (await session.send('Runtime.evaluate', {
      expression: `window.__settingsQuery('.import-config-file-select',${root})`,
    })) as { result: { objectId: string } };
    const node = (await session.send('DOM.describeNode', { objectId: remote.result.objectId })) as {
      node: { backendNodeId: number };
    };
    await session.send('Runtime.releaseObject', { objectId: remote.result.objectId });
    active = true;
    await session.send('DOM.setFileInputFiles', {
      files: [fileURLToPath(file)],
      backendNodeId: node.node.backendNodeId,
    });
    const deadline = Date.now() + 30000;
    while (!loaded && Date.now() < deadline) await Bun.sleep(50);
    await Promise.all(dialogCommands);
    if (!loaded || JSON.stringify(dialogs) !== JSON.stringify(['confirm']))
      throw Error(`P2-06/roundtrip: 正常読み込み後の再読み込みがありません (${dialogs.join(',')})`);
    await helpers.check(
      session,
      `performance.timeOrigin!==${oldTimeOrigin} && !!window.FutatsumeWatch?.ready`,
      'P2-06/roundtrip: 実ファイル読み込みの確認後に文書を再読み込み',
      30000
    );
    await evaluate(session, settingsQuerySource);
    if (
      await evaluate(session, `document.querySelector('#futatsumeVideoPlayerDialog')?.classList.contains('is-open')`)
    ) {
      await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 160 });
      await clickVisible(session, '[data-shell-action="close"]');
    }
    await clickVisible(session, '[data-futatsume-open]');
    await helpers.check(
      session,
      `document.querySelector('#futatsumeVideoPlayerDialog')?.classList.contains('is-open')`,
      'P2-06/roundtrip: 再読み込み後も起動アイコンから操作できる'
    );
    await helpers.open(session, 'general');
    await helpers.clickInside(session, 'general', '[data-settings-tab="comments"]');
    await helpers.check(
      session,
      `Number(${scaleInput}.value)===${targetScale} && ${boldInput}.checked===${targetBold} && typeof window.FutatsumeWatch.config.props.baseChatScale==='number' && typeof window.FutatsumeWatch.config.props.baseFontBolder==='boolean' && window.FutatsumeWatch.config.props.baseChatScale===${targetScale} && window.FutatsumeWatch.config.props.baseFontBolder===${targetBold} && JSON.parse(localStorage.getItem(${JSON.stringify(before.scaleKey)}))===${targetScale} && JSON.parse(localStorage.getItem(${JSON.stringify(before.boldKey)}))===${targetBold} && window.FutatsumeWatch.config.props.enableHeatMap===${before.heatMap}`,
      'P2-06/roundtrip: 再読み込み後に型付き設定と表示を復元し他項目を保持'
    );
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error), { cause: error });
  } finally {
    active = false;
    try {
      await session.send('Page.setInterceptFileChooserDialog', { enabled: false });
      await evaluate(
        session,
        `window.FutatsumeWatch.config.props.baseChatScale=${before.scale};window.FutatsumeWatch.config.props.baseFontBolder=${before.bold};for(const [key,value] of ${JSON.stringify(
          [
            [before.scaleKey, before.scaleStored],
            [before.boldKey, before.boldStored],
          ]
        )}){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}`
      );
      if (await evaluate(session, `window.__settingsQuery?.('[data-fw-settings="general"]')?.open`))
        await helpers.clickInside(session, 'general', '[data-settings-close]');
    } catch (error) {
      cleanupFailure = error instanceof Error ? error : new Error(String(error), { cause: error });
    }
  }
  if (failure && cleanupFailure)
    throw new AggregateError([failure, cleanupFailure], '設定往復検証と復元が失敗しました', { cause: failure });
  if (failure) throw failure;
  if (cleanupFailure) throw cleanupFailure;
}

/** Fail only this tab's lowest storage boundary; the real input/save/alert path runs. */
export async function verifySettingsStorage(session: CdpSession, helpers: Helpers): Promise<void> {
  const control = `window.__settingsQuery('[data-setting-name="autoPlay"]',window.__settingsQuery('[data-fw-settings="general"]'))`;
  await helpers.open(session, 'general');
  await helpers.clickInside(session, 'general', '[data-settings-tab="player"]');
  const before = await evaluate(session, `${control}.checked`);
  const storageKey = await evaluate(
    session,
    `window.FutatsumeWatch.config.getStorageKey(window.FutatsumeWatch.config.getNativeKey('autoPlay'))`
  );
  const stored = await evaluate(session, `localStorage.getItem(${JSON.stringify(storageKey)})`);
  let active = true;
  const alerts: string[] = [];
  const dialogCommands: Promise<unknown>[] = [];
  session.onEvent((method, params) => {
    if (active && method === 'Page.javascriptDialogOpening') {
      alerts.push(String(params.message));
      dialogCommands.push(session.send('Page.handleJavaScriptDialog', { accept: true }));
    }
  });
  await evaluate(
    session,
    `window.__settingsOriginalStorage=window.FutatsumeWatch.config.storage;window.FutatsumeWatch.config.storage=new Proxy(window.__settingsOriginalStorage,{set(){throw new DOMException('settings-fixture-quota','QuotaExceededError')},get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}});void 0;`
  );
  try {
    await helpers.clickInside(session, 'general', '[data-setting-name="autoPlay"]');
    await Promise.all(dialogCommands);
    if (alerts.length !== 1 || !alerts[0])
      throw Error(`P2-06/storage: 保存失敗通知が1件ではありません (${alerts.length})`);
    await helpers.check(
      session,
      `${control}.checked===${String(before)} && window.FutatsumeWatch.config.props.autoPlay===${String(before)} && localStorage.getItem(${JSON.stringify(storageKey)})===${JSON.stringify(stored)}`,
      'P2-06/storage: 容量不足を通知し、UI・モデル・保存値を維持'
    );
  } finally {
    active = false;
    await evaluate(
      session,
      `window.FutatsumeWatch.config.storage=window.__settingsOriginalStorage;delete window.__settingsOriginalStorage;`
    );
  }
  try {
    await helpers.clickInside(session, 'general', '[data-setting-name="autoPlay"]');
    await helpers.check(
      session,
      `${control}.checked===${String(!before)} && JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}))===${String(!before)}`,
      'P2-06/storage: 保存領域回復後の再試行'
    );
  } finally {
    if ((await evaluate(session, `${control}.checked`)) !== before)
      await helpers.clickInside(session, 'general', '[data-setting-name="autoPlay"]');
    await evaluate(
      session,
      stored === null
        ? `localStorage.removeItem(${JSON.stringify(storageKey)})`
        : `localStorage.setItem(${JSON.stringify(storageKey)},${JSON.stringify(stored)})`
    );
    await helpers.clickInside(session, 'general', '[data-settings-close]');
  }
}

export async function verifySettingsImportFailures(session: CdpSession, helpers: Helpers): Promise<void> {
  await helpers.open(session, 'general');
  await helpers.clickInside(session, 'general', '[data-settings-tab="data"]');
  const original = await evaluate(session, 'window.FutatsumeWatch.config.exportJson()');
  let active = true;
  const dialogs: string[] = [];
  const dialogCommands: Promise<unknown>[] = [];
  session.onEvent((method, params) => {
    if (!active || method !== 'Page.javascriptDialogOpening') return;
    dialogs.push(String(params.type));
    dialogCommands.push(session.send('Page.handleJavaScriptDialog', { accept: true }));
  });
  await session.send('Page.setInterceptFileChooserDialog', { enabled: true });
  try {
    for (const [name, content] of [
      ['malformed', '{broken'],
      ['array', '[]'],
      ['null', 'null'],
      ['invalid-type', '{"volume":"oops","autoPlay":false}'],
      ['invalid-range', '{"baseChatScale":0,"volume":0.7}'],
      ['invalid-enum', '{"sharedNgLevel":"BROKEN"}'],
    ] as const) {
      const file = new URL(`settings-${name}.config.json`, verificationDirectory);
      await Bun.write(file, content);
      const initialDialogs = dialogs.length;
      await helpers.clickInside(session, 'general', '.import-config-file-select');
      const remote = (await session.send('Runtime.evaluate', {
        expression: `window.__settingsQuery('.import-config-file-select',window.__settingsQuery('[data-fw-settings="general"]'))`,
      })) as { result: { objectId: string } };
      await session.send('DOM.setFileInputFiles', { files: [fileURLToPath(file)], objectId: remote.result.objectId });
      await session.send('Runtime.releaseObject', { objectId: remote.result.objectId });
      const deadline = Date.now() + 5000;
      while (dialogs.length < initialDialogs + 2 && Date.now() < deadline) await Bun.sleep(50);
      await Promise.all(dialogCommands);
      if (JSON.stringify(dialogs.slice(initialDialogs)) !== JSON.stringify(['confirm', 'alert']))
        throw Error(`P2-06/${name}: 確認後の失敗通知がありません`);
      await helpers.check(
        session,
        `window.FutatsumeWatch.config.exportJson()===${JSON.stringify(original)} && window.__settingsQuery('[data-fw-settings="general"]').open && window.__settingsQuery('.import-config-file-select',window.__settingsQuery('[data-fw-settings="general"]')).value===''`,
        `P2-06/${name}: ファイルの実選択で失敗を通知し、設定と画面を保持`
      );
    }
  } finally {
    active = false;
    await session.send('Page.setInterceptFileChooserDialog', { enabled: false });
    await helpers.clickInside(session, 'general', '[data-settings-close]');
  }
}
