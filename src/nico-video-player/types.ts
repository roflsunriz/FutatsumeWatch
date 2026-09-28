import type { EmitterCallback } from '../../packages/lib/src/emitter';

export type NvpConfigValue = boolean | number | string;
export interface NvpPlayerConfig {
  props: Record<string, NvpConfigValue>;
}
export interface NvpPlayerState {
  onkey(event: string, handler: (info: unknown) => void): void;
  on<A extends Array<unknown>>(event: string, handler: (...args: A) => void): void;
  playbackRate: NvpConfigValue;
  videoInfo: { initialPlaybackTime: number };
}
export interface NvpPlayerParams {
  playerConfig: NvpPlayerConfig;
  playerState: NvpPlayerState;
  fullscreenNode?: Element | null;
  node?: unknown;
}
export interface NvpVideoInfo {
  title: string;
  watchId: string;
}
export interface NvpQuery {
  find(selector: string): NvpQuery;
  forEach<E extends Element = Element>(callback: (elm: E) => void): void;
  css(props: Record<string, string>): NvpQuery;
  css(name: string, value: string): NvpQuery;
  addClass(className: string): NvpQuery;
  removeClass(className: string): NvpQuery;
  attr(attrs: Record<string, unknown>): NvpQuery;
  on<E extends Event>(event: string, handler: (e: E) => void, options?: AddEventListenerOptions): NvpQuery;
  [index: number]: Element;
  readonly length: number;
}
export interface NvpUtil {
  $(target: unknown): NvpQuery;
  addStyle(css: string, id?: string): unknown;
  createVideoElement(): HTMLVideoElement;
  secToTime(sec: number): string;
}
export interface NvpVideoPlayerParams {
  autoPlay?: NvpConfigValue;
  loop?: NvpConfigValue;
  mute?: NvpConfigValue;
  volume?: NvpConfigValue;
  playbackRate?: NvpConfigValue;
  debug?: NvpConfigValue;
}
export interface NvpBoundHandlers extends Record<string, (e: Event) => void> {
  onBodyClick: EventListener;
}
export interface NvpYouTubePlayer {
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  src: string;
  currentTime: number;
  paused: boolean;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  setSrc(url: string, startSeconds?: number): Promise<unknown>;
  selectBestQuality(): void;
  play(): unknown;
  pause(): void;
  on(event: string, handler: EmitterCallback): unknown;
}
export interface NvpBaseViewParams {
  parentNode?: Element | null;
  name?: string;
  template?: string;
  shadow?: string;
  css?: string;
}
