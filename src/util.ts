import _ from 'lodash';
import { Emitter } from './baselib';
import { Config } from './Config';
import { browser } from './browser';
import { FutatsumeWatch } from './FutatsumeWatchIndex';
import { StyleSwitcher } from '../packages/lib/src/css/StyleSwitcher';
import { dimport } from '../packages/lib/src/infra/dimport';
import { VideoItemObserver } from '../packages/lib/src/nico/VideoItemObserver';
import { NicoQuery } from '../packages/lib/src/nico/NicoQuery';
import { uQuery } from '../packages/lib/src/uQuery';
import { domUtil } from '../packages/lib/src/dom/domUtil';
import { textUtil } from '../packages/lib/src/text/textUtil';
import { nicoUtil } from '../packages/lib/src/nico/nicoUtil';
import { netUtil } from '../packages/lib/src/infra/netUtil';
import { messageUtil } from '../packages/lib/src/message/messageUtil';
import { sleep } from '../packages/lib/src/infra/sleep';
import { bounce } from '../packages/lib/src/infra/bounce';
import { css } from '../packages/lib/src/css/css';
import { reg } from '../packages/lib/src/text/reg';
import { Fullscreen } from '../packages/lib/src/dom/Fullscreen';
import { PopupMessage } from '../packages/lib/src/ui/PopupMessage';
import { RequestAnimationFrame } from '../packages/lib/src/infra/RequestAnimationFrame';
import { env } from '../packages/lib/src/infra/env';
import { Clipboard } from '../packages/lib/src/dom/Clipboard';
import { createVideoElement } from '../packages/futatsume/src/videoPlayer/createVideoElement';
import { domEvent } from '../packages/lib/src/dom/domEvent';
import { VideoCaptureUtil } from '../packages/lib/src/dom/VideoCaptureUtil';
import { speech } from '../packages/lib/src/infra/speech';
import { MylistPocketDetector } from '../packages/futatsume/src/init/MylistPocketDetector';
import { ShortcutKeyEmitter } from '../packages/futatsume/src/ShortcutKeyEmitter';
import { PlayerSession } from '../packages/futatsume/src/init/PlayerSession';
import { WatchPageHistory } from '../packages/futatsume/src/init/WatchPageHistory';
import { watchResize } from '../packages/lib/src/dom/watchResize';
import { BaseViewComponent } from '../packages/futatsume/src/parts/BaseViewComponent';
import { FrameLayer } from '../packages/futatsume/src/parts/FrameLayer';
import { saveMymemory } from '../packages/futatsume/src/parts/saveMymemory';

export interface UtilBrowserWindow {
  navigator: Navigator;
  location: Location;
  console: Console;
  history: History;
}

export interface UtilTable {
  [key: string]: unknown;
  sortedLastIndex(arr: number[], value: number): number;
  isGinzaWatchUrl(): boolean;
  StyleSwitcher: { update(...args: unknown[]): unknown };
}

const window = browser.window as UtilBrowserWindow;
let console: Console | Record<string, (...args: unknown[]) => void> = window.console;

Object.assign(window, {
  FutatsumeWatch,
});

const util = FutatsumeWatch.util as UtilTable;

//===BEGIN===
//@require reg
util.reg = reg;
//@require PopupMessage

const AsyncEmitter = (() => {
  // 過渡期の措置
  const emitter: { prototype: Record<string, unknown> } & (() => void) = function (): void {};
  emitter.prototype.on = (Emitter as unknown as { prototype: Record<string, unknown> }).prototype.on;
  emitter.prototype.once = (Emitter as unknown as { prototype: Record<string, unknown> }).prototype.once;
  emitter.prototype.off = (Emitter as unknown as { prototype: Record<string, unknown> }).prototype.off;
  emitter.prototype.clear = (Emitter as unknown as { prototype: Record<string, unknown> }).prototype.clear;
  emitter.prototype.emit = (Emitter as unknown as { prototype: Record<string, unknown> }).prototype.emit;
  emitter.prototype.emitAsync = (Emitter as unknown as { prototype: Record<string, unknown> }).prototype.emitAsync;
  return emitter;
})();
(FutatsumeWatch ? FutatsumeWatch.lib : ({} as Record<string, unknown>)).AsyncEmitter = AsyncEmitter;

//@require Fullscreen
util.fullscreen = Fullscreen;

const dummyConsole: Record<string, (...args: unknown[]) => void> = {};
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
window.console.timeLog || (window.console.timeLog = () => {});
for (const k of Object.keys(window.console)) {
  if (typeof (window.console as unknown as Record<string, unknown>)[k] !== 'function') {
    continue;
  }
  // eslint-disable-next-line @typescript-eslint/unbound-method
  dummyConsole[k] = _.noop;
}
['assert', 'error', 'warn', 'nicoru'].forEach(
  (k) =>
    (dummyConsole[k] = (window.console as unknown as Record<string, (...args: unknown[]) => void>)[k]!.bind(
      window.console
    ))
);

console = Config.props.debug ? window.console : dummyConsole;
Config.onkey('debug', (v) => (console = v ? window.console : dummyConsole));

//@require css
Object.assign(util, css);
//@require textUtil
Object.assign(util, textUtil);

//@require nicoUtil
Object.assign(util, nicoUtil);

//@require messageUtil
Object.assign(util, messageUtil);

//@require PlayerSession

//@require WatchPageHistory

//@require env
Object.assign(util, env);

//@require Clipboard
util.copyToClipBoard = (Clipboard as unknown as { copyText: unknown }).copyText;

//@require netUtil
Object.assign(util, netUtil);

//@require VideoCaptureUtil
util.videoCapture = (VideoCaptureUtil as unknown as { capture: unknown; capTube: unknown }).capture;
util.capTube = (VideoCaptureUtil as unknown as { capture: unknown; capTube: unknown }).capTube;

//@require saveMymemory
util.saveMymemory = saveMymemory;

//@require speech
util.speak = (speech as unknown as { speak: unknown }).speak;
//@require watchResize
util.watchResize = watchResize;

util.sortedLastIndex = (arr: number[], value: number): number => {
  let head = 0;
  let tail = arr.length;
  while (head < tail) {
    const p = Math.floor((head + tail) / 2);
    const v = arr[p] as number;
    if (v <= value) {
      head = p + 1;
    } else {
      tail = p;
    }
  }
  return tail;
};

//@require createVideoElement
util.createVideoElement = createVideoElement;

//@require domEvent
Object.assign(util, domEvent);

util.defineElement = (domUtil as unknown as { defineElement: unknown }).defineElement;
util.$ = uQuery;
util.createDom = (uQuery as unknown as { html: unknown }).html;
util.isTL = (uQuery as unknown as { isTL: unknown }).isTL;

//@require ShortcutKeyEmitter

//@require RequestAnimationFrame
util.RequestAnimationFrame = RequestAnimationFrame;

//@require FrameLayer

//@require MylistPocketDetector
//@require BaseViewComponent
//@require StyleSwitcher
util.StyleSwitcher = StyleSwitcher;
util.dimport = dimport;
//@require VideoItemObserver
util.VideoItemObserver = VideoItemObserver;
//@require NicoQuery
util.NicoQuery = NicoQuery;
//@require sleep
util.sleep = sleep;
//@require bounce
util.bounce = bounce;
//===END===
//

export {
  util,
  console,
  Config,
  Fullscreen,
  AsyncEmitter,
  ShortcutKeyEmitter,
  PopupMessage,
  PlayerSession,
  WatchPageHistory,
  RequestAnimationFrame,
  FrameLayer,
  MylistPocketDetector,
  VideoCaptureUtil,
  BaseViewComponent,
};
