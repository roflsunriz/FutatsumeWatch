import { Emitter, Handler } from './baselib';
import { Config } from './Config';
import type { ConfigStore } from './Config';
import { dll } from '../packages/components/src/dll';
import { CONSTANT } from './constant';
import { NICORU } from './nicoru-icon';
import { VERSION } from './version';

export interface FutatsumeWatchEmitter {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener?: (...args: unknown[]) => void): unknown;
  once(event: string, listener: (...args: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  emitAsync(event: string, ...args: unknown[]): Promise<unknown>;
  emitResolve(event: string, ...args: unknown[]): unknown;
  emitReject(event: string, ...args: unknown[]): unknown;
  promise(event: string, ...args: unknown[]): Promise<unknown>;
  hasPromise(event: string): boolean;
  clear(...args: unknown[]): void;
}

export interface FutatsumeWatchModules {
  Emitter: new () => FutatsumeWatchEmitter;
  Handler: new (...args: unknown[]) => object;
  [key: string]: unknown;
}

export interface FutatsumeWatchRoot {
  config: ConfigStore | Record<string, unknown>;
  util: Record<string, unknown>;
  debug: Record<string, unknown>;
  api: Record<string, unknown>;
  external: Record<string, unknown>;
  dll: unknown;
  lib: Record<string, unknown>;
  modules: FutatsumeWatchModules;
  init: Record<string, unknown>;
  emitter: FutatsumeWatchEmitter;
  ready: boolean;
  state: { player?: unknown } & Record<string, unknown>;
  version: string;
  ENV: string;
}

export type ZenzaWatchEmitter = FutatsumeWatchEmitter;
export type ZenzaWatchModules = FutatsumeWatchModules;
export type ZenzaWatchRoot = FutatsumeWatchRoot;

const TOKEN = Math.random();

export const PRODUCT = 'FutatsumeWatch';
export const LEGACY_PRODUCT = 'ZenzaWatch';
const FutatsumeWatch: FutatsumeWatchRoot = {
  config: Config || {},
  util: {},
  debug: {
    contextMenu: {},
    dialog: {},
    getInViewElements: () => {
      return [];
    },
    ping: () => {
      return Promise.resolve();
    },
    video: {},
    watchApiData: {},
  },
  api: {},
  external: {},
  dll,
  lib: {},
  modules: {
    Emitter: Emitter as unknown as new () => FutatsumeWatchEmitter,
    Handler: Handler as unknown as new (...args: unknown[]) => object,
  },
  init: {},
  emitter: new (Emitter as unknown as new () => FutatsumeWatchEmitter)(),
  ready: false,
  state: {},
  version: VERSION,
  ENV: 'STABLE',
};
// 旧連携（MylistPocket・外部スクリプト・window.ZenzaWatch参照）のため別名を維持する。
export const ZenzaWatch: FutatsumeWatchRoot = FutatsumeWatch;
const global = {
  debug: FutatsumeWatch.debug,
  emitter: FutatsumeWatch.emitter,
  external: FutatsumeWatch.external,
  PRODUCT,
  TOKEN,
  CONSTANT,
  NICORU,
  notify: (message: unknown) =>
    (FutatsumeWatch.external.execCommand as (command: string, value: unknown) => unknown)('notify', message),
  alert: (message: unknown) =>
    (FutatsumeWatch.external.execCommand as (command: string, value: unknown) => unknown)('alert', message),
  config: Config,
  api: FutatsumeWatch.api,
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  dll,
};
const Navi = Object.assign({}, FutatsumeWatch);
const ENV = 'STABLE';
const VER = VERSION;

export { FutatsumeWatch, Navi, TOKEN, global, ENV, VER, dll };
