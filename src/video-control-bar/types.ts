import type { ConfigStore } from '../config';
import type { PlayerState, VideoControlState } from '../state';
import type { NicoVideoPlayer } from '../nico-video-player';
export interface VcbQuery {
  [index: number]: Element;
  readonly length: number;
  [Symbol.iterator](): IterableIterator<Element>;
  find(selector: string): VcbQuery;
  forEach<E extends Element = Element>(callback: (elm: E) => void): void;
  addClass(className: string): VcbQuery;
  removeClass(className: string): VcbQuery;
  on<E extends Event>(event: string, handler: (e: E) => void, options?: AddEventListenerOptions): VcbQuery;
  off(event?: string): VcbQuery;
  append(target: unknown): VcbQuery;
  mapQuery(map: Record<string, string>): { e: Record<string, Element>; $: Record<string, VcbQuery> };
  html(markup: string): VcbQuery;
  raf: {
    toggleClass(name: string, force?: boolean): VcbQuery;
    addClass(name: string): VcbQuery;
    removeClass(name: string): VcbQuery;
    text(value: unknown): VcbQuery;
  };
}
export interface VcbDollarStatic {
  (target: unknown): VcbQuery;
  html(markup: string): VcbQuery;
}
export interface VcbUtil {
  $: VcbDollarStatic;
  secToTime(sec: number): string;
  toRgba(color: string, alpha: number): string;
  dispatchCommand(target: unknown, command: string, param?: unknown): void;
  addStyle(css: string, options?: { className?: string; disabled?: boolean }): unknown;
  StyleSwitcher: { update(options: { on: string; off: string }): void };
}
export interface VcbPlayerParams {
  playerConfig: ConfigStore;
  playerState: PlayerState;
  $playerContainer?: unknown;
  currentTimeGetter?: () => number;
  player: NicoVideoPlayer;
}
export interface VcbControlState extends VideoControlState {
  isWheelSeeking: boolean;
  isDragging: boolean;
  isStoryboardAvailable: boolean;
}
export interface VcbHeatMap {
  reset(): void;
  duration: number;
  chatList: unknown;
}
export interface VcbRaf {
  enable(): void;
  disable(): void;
}
export interface VcbStoryboard {
  toggle(): void;
  reset(): void;
  onVideoCanPlay(watchId: unknown, videoInfo: unknown): void;
  setCurrentTime(sec: number, flag: boolean): void;
  currentTime: number;
  on<A extends Array<unknown>>(event: string, handler: (...args: A) => void): void;
}
export interface VcbSeekBarThumbnail {
  currentTime: number;
}
export interface VcbChat {
  vpos: number;
  uniqNo: unknown;
  no?: string | number;
  date?: number;
  userId?: string;
  text?: string;
  cmd?: string;
  fork?: string | number;
  color?: string;
  duration?: number;
}
export interface VcbChatList {
  top: Array<VcbChat>;
  naka: Array<VcbChat>;
  bottom: Array<VcbChat>;
}
export interface VcbChatTemplate {
  clone(): DocumentFragment;
  chat: HTMLElement;
  time: HTMLElement;
  text: HTMLElement;
}
export interface VcbTemplateInfo {
  env: string;
  version: string;
}
export interface VcbBaseViewParams {
  parentNode?: Element | null;
  name?: string;
  template?: string;
  shadow?: string;
  css?: string;
}
export interface VcbTextLabel {
  text: string | undefined;
}
export interface VcbVideoInfo {
  duration: number;
  resumePoints: Array<{ time: number; now: string }>;
}
