// 連結スコープ由来のグローバル宣言。
// ビルド時（CDN の @require・ビルダーの @version/@environment 注入）に提供される値の型を表す。
// このファイル自体は生成物に含まれない（requireFile の解決対象外の .d.ts）。
// $ / jQuery は @types/jquery、_ は @types/lodash の UMD グローバルを使い、
// モジュールからの値参照は tsconfig の allowUmdGlobalAccess で許容する。

/// <reference types="jquery" />
/// <reference types="lodash" />

declare const VER: string;
declare const ENV: 'DEV' | 'STABLE';

// Hls.js（CDN 由来グローバル）の最小宣言。src/_hls.ts の利用実態に合わせる。
// any 禁止のため unknown ベースとし、利用側で絞り込む。
interface HlsLevel {
  readonly bitrate?: number;
  readonly width?: number;
  readonly height?: number;
  readonly attrs: Record<string, string>;
}
interface HlsLoaderBase {
  load(context: unknown, config: unknown, callbacks: unknown): void;
  abort(): void;
  destroy(): void;
}
interface HlsLoaderClass {
  new (config: unknown): HlsLoaderBase;
}
interface HlsInstance {
  on<A extends Array<unknown>>(event: string, callback: (...args: A) => void): void;
  readonly levels: ReadonlyArray<HlsLevel>;
  currentLevel: number;
  autoLevelCapping: number;
  config: Record<string, unknown>;
  coreComponents: Array<Record<string, unknown>>;
  startLoad(startPosition?: number): void;
  loadSource(url: string): void;
  attachMedia(video: HTMLVideoElement): void;
  stopLoad(): void;
  detachMedia(): void;
  destroy(): void;
}
interface HlsStatic {
  readonly version: string;
  isSupported(): boolean;
  readonly Events: {
    readonly MANIFEST_PARSED: string;
    readonly LEVEL_LOADED: string;
    readonly LEVEL_SWITCHED: string;
    readonly ERROR: string;
    readonly FRAG_LOADED: string;
    readonly BUFFER_EOS: string;
    readonly MEDIA_ATTACHED: string;
  };
  readonly ErrorTypes: {
    readonly NETWORK_ERROR: string;
    readonly MEDIA_ERROR: string;
  };
  readonly ErrorDetails: {
    readonly BUFFER_STALLED_ERROR: string;
    readonly BUFFER_SEEK_OVER_HOLE: string;
  };
  readonly DefaultConfig: {
    readonly loader: HlsLoaderClass;
  };
  new (config?: unknown): HlsInstance;
}
declare const Hls: HlsStatic;
