import { Emitter, Handler } from './baselib';
import { Config } from './Config';
import type { ConfigStore } from './Config';
import { dll } from '../packages/components/src/dll';

export interface ZenzaWatchEmitter {
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

export interface ZenzaWatchModules {
  Emitter: new () => ZenzaWatchEmitter;
  Handler: new (...args: unknown[]) => object;
  [key: string]: unknown;
}

export interface ZenzaWatchRoot {
  config: ConfigStore | Record<string, unknown>;
  util: Record<string, unknown>;
  debug: Record<string, unknown>;
  api: Record<string, unknown>;
  external: Record<string, unknown>;
  dll: unknown;
  lib: Record<string, unknown>;
  modules: ZenzaWatchModules;
  init: Record<string, unknown>;
  emitter: ZenzaWatchEmitter;
  ready: boolean;
  state: { player?: unknown } & Record<string, unknown>;
  version: string;
  ENV: string;
}

const TOKEN = Math.random();

const PRODUCT = 'ZenzaWatch';
const ZenzaWatch: ZenzaWatchRoot = {
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
    Emitter: Emitter as unknown as new () => ZenzaWatchEmitter,
    Handler: Handler as unknown as new (...args: unknown[]) => object,
  },
  init: {},
  emitter: new (Emitter as unknown as new () => ZenzaWatchEmitter)(),
  ready: false,
  state: {},
  version: '1.0.0',
  ENV: 'DEV',
};
const global = {
  debug: ZenzaWatch.debug,
  emitter: ZenzaWatch.emitter,
  external: ZenzaWatch.external,
  PRODUCT,
  TOKEN,
  config: Config,
  api: ZenzaWatch.api,
  innerWidth: 100,
  innerHeight: 100,
  dll,
};
const Navi = Object.assign({}, ZenzaWatch);
const ENV = 'dev';
const VER = '2.0.0';

export { ZenzaWatch, Navi, PRODUCT, TOKEN, global, ENV, VER, dll };
