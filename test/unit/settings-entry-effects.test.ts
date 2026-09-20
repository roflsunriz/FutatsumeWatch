import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Config } from '../../src/config';
import { FutatsumeWatch } from '../../src/futatsume-watch-index';
import { BroadcastEmitter } from '../../packages/lib/src/message/message-util';
import { PlayerSession } from '../../packages/futatsume/src/init/player-session';
import { HoverMenu } from '../../packages/futatsume/src/menu/hover-menu';
import type { InitializerDialog, InitializerCommandBody } from '../../src/initializer';

await Config.promise('restore');
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
const originalSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const originalRoot = Object.getOwnPropertyDescriptor(window, 'FutatsumeWatch');
function locate(url: string): void {
  Object.defineProperty(globalThis, 'location', { configurable: true, writable: true, value: new URL(url) });
}
locate('https://www.nicovideo.jp/watch/sm9');
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  writable: true,
  value: window.sessionStorage,
});
Object.defineProperty(window, 'FutatsumeWatch', { configurable: true, writable: true, value: FutatsumeWatch });
Object.assign(globalThis, {
  HTMLElement: window.HTMLElement,
  HTMLVideoElement: window.HTMLVideoElement,
  HTMLCanvasElement: window.HTMLCanvasElement,
  Element: window.Element,
  Node: window.Node,
  Document: window.Document,
  MutationObserver: window.MutationObserver,
  customElements: window.customElements,
  HTMLCollection: window.HTMLCollection,
  NodeList: window.NodeList,
  Window: window.Window,
});
const { initializeExternal, initializeMessage, initializeLastSession, overrideGinza } =
  await import('../../src/initializer');

class DialogFixture implements InitializerDialog {
  isLastOpenedPlayer = false;
  isOpen = false;
  playingStatus: unknown = {
    playing: true,
    watchId: 'sm9',
    url: 'https://www.nicovideo.jp/watch/sm9',
    currentTime: 42,
  };
  opens: Array<{ watchId: string; options: unknown }> = [];
  commands: Array<{ command: string; params: unknown }> = [];
  closes = 0;
  listeners = new Map<string, Array<(command: string, param?: unknown) => unknown>>();
  on(event: string, listener: (command: string, param?: unknown) => unknown): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(listener);
    this.listeners.set(event, handlers);
  }
  execCommand(command: string, params?: unknown): { status: string } {
    this.commands.push({ command, params });
    return { status: 'ok' };
  }
  open(watchId: string, options?: unknown): void {
    this.opens.push({ watchId, options });
  }
  close(): void {
    this.closes++;
    this.isOpen = false;
  }
  refreshLastPlayerId(): void {}
  getId(): string {
    return 'fixture-player';
  }
}
const configKeys = ['enableSingleton', 'overrideWatchLink', 'overrideGinza', 'continueNextPage', 'screenMode'] as const;
const originalConfig = Object.fromEntries(configKeys.map((key) => [key, Config.getValue(key)]));
let previousBody: HTMLElement;
let external: Record<string, unknown>;
let debug: Record<string, unknown>;
let oldName: string;
const menus: HoverMenu[] = [];
let broadcastOn: ReturnType<typeof spyOn<typeof BroadcastEmitter, 'on'>>;
let globalOn: ReturnType<typeof spyOn<typeof FutatsumeWatch.emitter, 'on'>>;
let windowOn: ReturnType<typeof spyOn<typeof window, 'addEventListener'>>;
let timer: ReturnType<typeof spyOn<typeof window, 'setTimeout'>>;
const spies: Array<{ mockRestore(): void }> = [];
const sessionKey = 'FutatsumeWatch_PlayingStatus';
const previousSession = window.sessionStorage.getItem(sessionKey);
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
beforeEach(() => {
  previousBody = document.body;
  document.documentElement.replaceChild(document.createElement('body'), previousBody);
  external = { ...FutatsumeWatch.external };
  debug = { ...FutatsumeWatch.debug };
  oldName = window.name;
  locate('https://www.nicovideo.jp/watch/sm9');
  for (const key of configKeys) Config.setValue(key, originalConfig[key]);
  window.sessionStorage.removeItem(sessionKey);
  broadcastOn = spyOn(BroadcastEmitter, 'on');
  globalOn = spyOn(FutatsumeWatch.emitter, 'on');
  windowOn = spyOn(window, 'addEventListener');
  timer = spyOn(window, 'setTimeout');
});
afterEach(async () => {
  await flush();
  for (const menu of menus.splice(0))
    (menu._onHoverEnd as typeof menu._onHoverEnd & { cancel?: () => void }).cancel?.();
  for (const [event, listener] of broadcastOn.mock.calls) BroadcastEmitter.off(event, listener);
  for (const [event, listener] of globalOn.mock.calls) FutatsumeWatch.emitter.off(event, listener);
  for (const [event, listener, options] of windowOn.mock.calls) window.removeEventListener(event, listener, options);
  for (const result of timer.mock.results) {
    const value: unknown = result.value;
    if (result.type === 'return' && typeof value === 'number') window.clearTimeout(value);
  }
  for (const spy of spies.splice(0)) spy.mockRestore();
  timer.mockRestore();
  windowOn.mockRestore();
  globalOn.mockRestore();
  broadcastOn.mockRestore();
  for (const key of Object.keys(FutatsumeWatch.external)) delete FutatsumeWatch.external[key];
  Object.assign(FutatsumeWatch.external, external);
  for (const key of Object.keys(FutatsumeWatch.debug)) delete FutatsumeWatch.debug[key];
  Object.assign(FutatsumeWatch.debug, debug);
  for (const key of configKeys) Config.setValue(key, originalConfig[key]);
  window.sessionStorage.removeItem(sessionKey);
  window.name = oldName;
  document.documentElement.replaceChild(previousBody, document.body);
});
afterAll(() => {
  if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
  if (originalSession) Object.defineProperty(globalThis, 'sessionStorage', originalSession);
  if (originalRoot) Object.defineProperty(window, 'FutatsumeWatch', originalRoot);
  else Reflect.deleteProperty(window, 'FutatsumeWatch');
  if (previousSession !== null) window.sessionStorage.setItem(sessionKey, previousSession);
});
function createMenu(dialog: DialogFixture): HoverMenu {
  const menu = new HoverMenu({ playerConfig: Config });
  menu.setPlayer(dialog);
  menus.push(menu);
  return menu;
}

describe('起動先を選ぶ設定の実経路', () => {
  for (const route of ['disabled', 'last', 'remote', 'fallback'] as const) {
    test(`singleton ${route} は対象動画を一度だけ適切な起動先へ渡す`, async () => {
      const dialog = new DialogFixture();
      dialog.isLastOpenedPlayer = route === 'last';
      Config.setValue('enableSingleton', route !== 'disabled');
      const ping = spyOn(BroadcastEmitter, 'ping');
      if (route === 'fallback') ping.mockRejectedValue(new Error('no other player'));
      else ping.mockResolvedValue({ status: 'ok' });
      const send = spyOn(BroadcastEmitter, 'sendOpen').mockImplementation(() => {});
      spies.push(ping, send);
      initializeExternal(dialog);
      createMenu(dialog).open('sm123', { currentTime: 12 });
      await flush();
      if (route === 'remote') {
        expect(dialog.opens).toEqual([]);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0]).toEqual(['sm123', expect.objectContaining({ currentTime: 12, eventType: 'click' })]);
      } else {
        expect(dialog.opens).toEqual([
          { watchId: 'sm123', options: expect.objectContaining({ currentTime: 12, eventType: 'click' }) },
        ]);
        expect(send).not.toHaveBeenCalled();
      }
      expect(ping).toHaveBeenCalledTimes(route === 'remote' || route === 'fallback' ? 1 : 0);
    });
  }
  test('親子ウィンドウのopen要求もsingleton設定の変更に従う', async () => {
    const dialog = new DialogFixture();
    initializeExternal(dialog);
    initializeMessage(dialog);
    const ping = spyOn(BroadcastEmitter, 'ping').mockResolvedValue({ status: 'ok' });
    const send = spyOn(BroadcastEmitter, 'sendOpen').mockImplementation(() => {});
    spies.push(ping, send);
    const message: InitializerCommandBody = { command: 'open', params: { watchId: 'sm123' }, now: 0 };
    Config.setValue('enableSingleton', false);
    BroadcastEmitter.emit('message', message, 'window', 'fixture');
    await flush();
    expect(dialog.opens.map((call) => call.watchId)).toEqual(['sm123']);
    expect(send).not.toHaveBeenCalled();
    Config.setValue('enableSingleton', true);
    BroadcastEmitter.emit('message', message, 'window', 'fixture');
    await flush();
    expect(dialog.opens).toHaveLength(1);
    expect(send.mock.calls.map((args) => args[0])).toEqual(['sm123']);
  });
});

describe('動画リンクの置換', () => {
  for (const scenario of [
    { name: 'ON 検索', url: 'https://www.nicovideo.jp/search/test', enabled: true, ctrl: false, expected: true },
    { name: 'OFF 検索', url: 'https://www.nicovideo.jp/search/test', enabled: false, ctrl: false, expected: false },
    {
      name: 'ON 他ホスト',
      url: 'https://www.nicovideo.jp.example.com/search/test',
      enabled: true,
      ctrl: false,
      expected: false,
    },
    { name: 'ON 視聴ページ', url: 'https://www.nicovideo.jp/watch/sm9', enabled: true, ctrl: false, expected: false },
    { name: 'ON Ctrl操作', url: 'https://www.nicovideo.jp/search/test', enabled: true, ctrl: true, expected: false },
  ])
    test(scenario.name, async () => {
      locate(scenario.url);
      Config.setValue('overrideWatchLink', scenario.enabled);
      Config.setValue('enableSingleton', false);
      const dialog = new DialogFixture();
      createMenu(dialog);
      const anchor = document.createElement('a');
      anchor.href = 'https://www.nicovideo.jp/watch/sm123?from=12';
      anchor.textContent = 'fixture';
      document.body.append(anchor);
      anchor.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
      let prevented = false;
      const stopNativeNavigation = (event: Event) => {
        prevented = event.defaultPrevented;
        event.preventDefault();
      };
      document.addEventListener('click', stopNativeNavigation, { once: true });
      anchor.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: scenario.ctrl }));
      await flush();
      document.removeEventListener('click', stopNativeNavigation);
      expect(prevented).toBe(scenario.expected);
      expect(dialog.opens.map((call) => call.watchId)).toEqual(scenario.expected ? ['sm123'] : []);
      if (scenario.expected)
        expect(dialog.opens[0]?.options).toMatchObject({ eventType: 'click', query: { from: '12' } });
    });
});

describe('公式プレイヤーの置換', () => {
  test('OFFは維持、ONは指定動画を開いて通常表示中の公式videoだけを停止する', async () => {
    document.body.innerHTML =
      '<main id="root"><div class="grid-area_[player]" id="MainVideoPlayer"><video></video></div></main>';
    const video = document.querySelector('video')!;
    const pause = spyOn(video, 'pause').mockImplementation(() => {});
    spies.push(pause);
    const dialog = new DialogFixture();
    Config.setValue('overrideGinza', false);
    await overrideGinza(dialog, { from: '12' });
    expect(dialog.opens).toEqual([]);
    expect(pause).not.toHaveBeenCalled();
    Config.setValue('overrideGinza', true);
    await overrideGinza(dialog, { from: '12' });
    expect(dialog.opens).toEqual([{ watchId: 'sm9', options: { currentTime: 12 } }]);
    expect(pause.mock.calls.length).toBeGreaterThan(0);
    const before = pause.mock.calls.length;
    document.body.className = 'showNicoVideoPlayerDialog';
    video.dispatchEvent(new window.Event('play'));
    expect(pause).toHaveBeenCalledTimes(before + 1);
    for (const mode of ['small', 'sideView']) {
      document.body.className = `showNicoVideoPlayerDialog futatsumeScreenMode_${mode}`;
      video.dispatchEvent(new window.Event('play'));
    }
    expect(pause).toHaveBeenCalledTimes(before + 1);
  });
  test('公式で見る指定はONでも優先し、一回分の指定を消費する', async () => {
    const dialog = new DialogFixture();
    Config.setValue('overrideGinza', true);
    window.name = 'watchGinza';
    await overrideGinza(dialog, {});
    expect(dialog.opens).toEqual([]);
    expect(window.name).toBe('');
  });
});

describe('前回再生の保存とページ継続', () => {
  for (const scenario of [
    { name: 'ONで別ページへ継続', enabled: true, playing: true, same: false, mode: 'normal', open: true },
    { name: 'OFFで別ページへは継続しない', enabled: false, playing: true, same: false, mode: 'normal', open: false },
    { name: 'OFFでも同一ページの再読込は復元', enabled: false, playing: true, same: true, mode: 'normal', open: true },
    { name: '小画面は既存の継続契約を保持', enabled: false, playing: true, same: false, mode: 'small', open: true },
    { name: '停止済み記録では再開しない', enabled: true, playing: false, same: false, mode: 'normal', open: false },
  ])
    test(scenario.name, () => {
      Config.setValue('continueNextPage', scenario.enabled);
      Config.setValue('screenMode', scenario.mode);
      const session = PlayerSession as typeof PlayerSession & { storage: Storage; KEY: string };
      session.init(window.sessionStorage);
      session.save({
        playing: scenario.playing,
        url: scenario.same ? location.href : 'https://www.nicovideo.jp/search/previous',
        watchId: 'sm123',
        currentTime: 42,
      });
      const dialog = new DialogFixture();
      initializeLastSession(dialog);
      expect(dialog.opens.map((call) => call.watchId)).toEqual(scenario.open ? ['sm123'] : []);
      if (scenario.open) expect(dialog.opens[0]?.options).toMatchObject({ currentTime: 42, eventType: 'session' });
      expect(window.sessionStorage.getItem(sessionKey)).toBeNull();
    });
  test('開いたプレイヤーのbeforeunloadは再生状態だけを保存して閉じる', () => {
    const dialog = new DialogFixture();
    dialog.isOpen = true;
    initializeLastSession(dialog);
    window.sessionStorage.setItem('unrelated-session-value', 'keep');
    window.dispatchEvent(new window.Event('beforeunload'));
    expect(JSON.parse(window.sessionStorage.getItem(sessionKey)!)).toEqual(dialog.playingStatus);
    expect(dialog.closes).toBe(1);
    expect(window.sessionStorage.getItem('unrelated-session-value')).toBe('keep');
    window.sessionStorage.removeItem('unrelated-session-value');
  });
});
