import _ from 'lodash';
import { Emitter } from './baselib';
import { Config } from './config';
import { browser } from './browser';
import { FutatsumeWatch } from './futatsume-watch-index';
import { StyleSwitcher } from '../packages/lib/src/css/style-switcher';
import { dimport } from '../packages/lib/src/infra/dimport';
import { VideoItemObserver } from '../packages/lib/src/nico/video-item-observer';
import { NicoQuery } from '../packages/lib/src/nico/nico-query';
import { uQuery } from '../packages/lib/src/u-query';
import { domUtil } from '../packages/lib/src/dom/dom-util';
import { textUtil } from '../packages/lib/src/text/text-util';
import { nicoUtil } from '../packages/lib/src/nico/nico-util';
import { netUtil } from '../packages/lib/src/infra/net-util';
import { messageUtil } from '../packages/lib/src/message/message-util';
import { sleep } from '../packages/lib/src/infra/sleep';
import { bounce } from '../packages/lib/src/infra/bounce';
import { css } from '../packages/lib/src/css/css';
import { reg } from '../packages/lib/src/text/reg';
import { Fullscreen } from '../packages/lib/src/dom/fullscreen';
import { PopupMessage } from '../packages/lib/src/ui/popup-message';
import { RequestAnimationFrame } from '../packages/lib/src/infra/request-animation-frame';
import { env } from '../packages/lib/src/infra/env';
import { Clipboard } from '../packages/lib/src/dom/clipboard';
import { createVideoElement } from '../packages/futatsume/src/videoPlayer/create-video-element';
import { domEvent } from '../packages/lib/src/dom/dom-event';
import { VideoCaptureUtil } from '../packages/lib/src/dom/video-capture-util';
import { speech } from '../packages/lib/src/infra/speech';
import { MylistPocketDetector } from '../packages/futatsume/src/init/mylist-pocket-detector';
import { ShortcutKeyEmitter } from '../packages/futatsume/src/shortcut-key-emitter';
import { PlayerSession } from '../packages/futatsume/src/init/player-session';
import { WatchPageHistory } from '../packages/futatsume/src/init/watch-page-history';
import { watchResize } from '../packages/lib/src/dom/watch-resize';
import { BaseViewComponent } from '../packages/futatsume/src/parts/base-view-component';
import { FrameLayer } from '../packages/futatsume/src/parts/frame-layer';
import { saveMymemory } from '../packages/futatsume/src/parts/save-mymemory';

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
//@require popup-message

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

//@require fullscreen
util.fullscreen = Fullscreen;

const dummyConsole: Record<string, (...args: unknown[]) => void> = {};
for (const k of Object.keys(window.console)) {
  if (typeof (window.console as unknown as Record<string, unknown>)[k] !== 'function') {
    continue;
  }
  // eslint-disable-next-line @typescript-eslint/unbound-method
  dummyConsole[k] = _.noop;
}
['assert', 'error', 'warn'].forEach(
  (k) =>
    (dummyConsole[k] = (window.console as unknown as Record<string, (...args: unknown[]) => void>)[k]!.bind(
      window.console
    ))
);

console = dummyConsole;

//@require css
Object.assign(util, css);
//@require text-util
Object.assign(util, textUtil);

//@require nico-util
Object.assign(util, nicoUtil);

//@require message-util
Object.assign(util, messageUtil);

//@require player-session

//@require watch-page-history

//@require env
Object.assign(util, env);

//@require clipboard
util.copyToClipBoard = (Clipboard as unknown as { copyText: unknown }).copyText;

//@require net-util
Object.assign(util, netUtil);

//@require video-capture-util
util.videoCapture = (VideoCaptureUtil as unknown as { capture: unknown; capTube: unknown }).capture;
util.capTube = (VideoCaptureUtil as unknown as { capture: unknown; capTube: unknown }).capTube;

//@require save-mymemory
util.saveMymemory = saveMymemory;

//@require speech
util.speak = (speech as unknown as { speak: unknown }).speak;
//@require watch-resize
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

//@require create-video-element
util.createVideoElement = createVideoElement;

//@require dom-event
Object.assign(util, domEvent);

util.defineElement = (domUtil as unknown as { defineElement: unknown }).defineElement;
util.$ = uQuery;
util.createDom = (uQuery as unknown as { html: unknown }).html;
util.isTL = (uQuery as unknown as { isTL: unknown }).isTL;

//@require shortcut-key-emitter

//@require request-animation-frame
util.RequestAnimationFrame = RequestAnimationFrame;

//@require frame-layer

//@require mylist-pocket-detector
//@require base-view-component
//@require style-switcher
util.StyleSwitcher = StyleSwitcher;
util.dimport = dimport;
//@require video-item-observer
util.VideoItemObserver = VideoItemObserver;
//@require nico-query
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
