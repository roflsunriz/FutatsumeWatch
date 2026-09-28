import type { EmitterCallback } from '../../packages/lib/src/emitter';
import type { ConfigStore } from '../config';
import type { UqFactory } from '../comment-panel';

import type { PlayerState } from '../state';
import type { NicoVideoPlayer } from '../nico-video-player';
import type { NicoVideoPlayerDialog } from './dialog-controller';

export interface DialogPlayerConfig extends ConfigStore {
  getNativeKey?(key: string): string;
  setValue(key: string, value: unknown): void;
}

export interface VideoWatchQuery {
  shuffle?: string;
  continuous?: string;
  playlist?: { type: string };
  from?: string;
  [key: string]: unknown;
}

export interface VideoWatchOptionBag {
  eventType?: string;
  query?: VideoWatchQuery;
  economy?: boolean;
  openNow?: boolean;
  autoCloseFullScreen?: boolean;
  reloadCount?: number;
  currentTime?: string | number;
  [key: string]: unknown;
}

export interface MylistLoadOptions {
  shuffle: boolean;
  watchId: string;
  append?: boolean;
  limit?: unknown;
}

export interface NicoVideoPlayerDialogViewParams {
  dialog: NicoVideoPlayerDialog;
  playerConfig: DialogPlayerConfig;
  nicoVideoPlayer: NicoVideoPlayer | undefined;
  playerState: PlayerState;
  currentTimeGetter: () => number;
}

export interface VideoHoverMenuParams {
  playerContainer: Element;
  playerState: PlayerState;
}

export interface VariablesMapperState {
  commentLayerOpacity: number;
  fullscreenControlBarMode: string;
  [key: string]: unknown;
}

export interface FutatsumeSettingPanelElement extends HTMLElement {
  config: unknown;
  toggle(): void;
  close(): void;
}

export interface DialogKeyEmitter {
  on(name: string, callback: EmitterCallback): unknown;
}

export interface NicoVideoPlayerDialogParams {
  config: DialogPlayerConfig;
  state: PlayerState;
  keyHandler?: DialogKeyEmitter;
}

export interface VideoSessionInfo {
  url: string;
  type: string;
  [key: string]: unknown;
}

export interface VideoSessionWorkerSession {
  connect(): Promise<VideoSessionInfo>;
  close(): void;
  getState(): Promise<VideoSessionState>;
}

export interface VideoSessionState {
  isDeleted: boolean;
  isAbnormallyClosed: boolean;
}

export interface VideoInfoOwner {
  id: string;
  name: string;
  linkId?: string;
  [key: string]: unknown;
}

export interface DialogThreadMsgInfo {
  videoId: string;
  userId?: unknown;
  threadId?: string;
  when?: number;
  frontendId: string | number;
  frontendVersion: string | number;
  threads?: Array<{ id: string | number; forkLabel?: string; fork?: string }>;
  defaultThread?: { is184Forced?: boolean; isThreadkeyRequired?: boolean };
  threadInfo?: DialogThreadInfoData;
  nvComment: {
    params: { language?: string; [key: string]: unknown };
    server: string;
    threadKey?: string;
  };
  [key: string]: unknown;
}

export interface DialogThreadInfoData {
  userId?: unknown;
  videoId: string;
  threadId?: string;
  is184Forced?: boolean;
  totalResCount: number;
  language?: string;
  when?: number;
  isWaybackMode: boolean;
}

export interface DialogCommentLoadResult {
  threadInfo: DialogThreadInfoData;
  body: unknown;
  format: string;
}

export interface DialogLoadError {
  reason?: string;
  message?: string;
  info?: { isPlayable: boolean; [key: string]: unknown };
  watchId?: string;
}

export interface DialogVideoError {
  type?: string;
  target?: { error?: { code?: number } | null } | null;
  description: string;
  fallback?: unknown;
}

export interface DialogVideoInfo {
  viewerInfo: unknown;
  watchId: string;
  videoId: string;
  title: string;
  thumbnail: string;
  duration: number;
  owner: VideoInfoOwner;
  tagList: { name?: string }[];
  msgInfo: DialogThreadMsgInfo;
  initialPlaybackTime: number;
  isChannel: boolean;
  isLiked: boolean;
  isCommunityVideo: boolean;
  isMymemory: boolean;
  setCurrentVideo(url: string): void;
  toJSON(): unknown;
  originalVideoId: string;
  contextWatchId: string;
  count: { comment: unknown; mylist: unknown; view: unknown };
  postedAt: string | number;
  csrfToken?: string;
  replacementWords: unknown;
  [key: string]: unknown;
}

export interface DialogUtilView {
  $: UqFactory;
  addStyle(css: string, options?: { className?: string; disabled?: boolean }): void;
  isLogin(): boolean;
  isGinzaWatchUrl(): boolean;
  fullscreen: { now(): boolean };
  StyleSwitcher: { update(options: { on?: string; off?: string }): void };
  openMylistWindow(watchId: string): void;
  capTube(options: { title: unknown; videoId: unknown; author: unknown }): void;
  saveMymemory(dialog: unknown, videoInfo: unknown): void;
  dispatchCommand(...args: unknown[]): void;
  escapeToZenkaku(text: string): string;
}
