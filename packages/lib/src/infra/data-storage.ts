interface DataStorageOptions {
  prefix?: string;
  storage?: Storage;
  ignoreExportKeys?: string[];
  readonly?: boolean;
  dbStorage?: DataStorage;
}

type LooseStorage = Storage & Record<string, string | undefined>;

import { Emitter } from '../emitter';
import type { AnyEmitter, AnyPromiseHandler, EmitterCallback, PromiseHandlerCallback } from '../emitter';
import { objUtil } from './obj-util';
import { Observable } from './observable';
import type { AnySubscription, SubscriberCallback, SubscriberParams } from './observable';
import { bounce } from './bounce';

// objUtil.bridge で Emitter のメソッドが束縛コピーされる。実行時の姿を型で表す。
interface DataStorageEmitter {
  on: (name: string, callback: EmitterCallback) => AnyEmitter;
  off: (name: string, callback?: EmitterCallback) => AnyEmitter | undefined;
  once: (name: string, func: EmitterCallback) => AnyEmitter;
  clear: (name?: string) => AnyEmitter | undefined;
  emit: (name: string, ...args: unknown[]) => AnyEmitter | undefined;
  emitAsync: (...args: [string, ...unknown[]]) => AnyEmitter | undefined;
  promise: (name: string, callback?: EmitterCallback) => AnyPromiseHandler;
  emitResolve: (name: string, ...args: unknown[]) => AnyPromiseHandler;
  emitReject: (name: string, ...args: unknown[]) => AnyPromiseHandler;
  resetPromise: (name: string) => void;
  hasPromise: (name: string) => boolean | undefined;
}
//===BEGIN===
//@require observable
//@require bounce
class DataStorage implements DataStorageEmitter {
  on!: (name: string, callback: EmitterCallback) => AnyEmitter;
  off!: (name: string, callback?: EmitterCallback) => AnyEmitter | undefined;
  once!: (name: string, func: EmitterCallback) => AnyEmitter;
  clear!: (name?: string) => AnyEmitter | undefined;
  emit!: (name: string, ...args: unknown[]) => AnyEmitter | undefined;
  emitAsync!: (...args: [string, ...unknown[]]) => AnyEmitter | undefined;
  promise!: (name: string, callback?: PromiseHandlerCallback) => AnyPromiseHandler;
  emitResolve!: (name: string, ...args: unknown[]) => AnyPromiseHandler;
  emitReject!: (name: string, ...args: unknown[]) => AnyPromiseHandler;
  resetPromise!: (name: string) => void;
  hasPromise!: (name: string) => boolean | undefined;
  options: DataStorageOptions;
  default: Record<string, unknown>;
  _data: Record<string, unknown>;
  prefix: string;
  storage: Storage;
  _ignoreExportKeys: string[];
  readonly readonly: boolean | undefined;
  silently: boolean;
  _changed: Map<string, unknown>;
  props!: Record<string, unknown>;
  logger!: Console;
  consoleSubscriber!: {
    next: (v: unknown, ...args: unknown[]) => void;
    error: (e: unknown, ...args: unknown[]) => void;
    complete: (c: unknown, ...args: unknown[]) => void;
  };
  consoleSubscription?: { unsubscribe: () => void } | null;

  static create(defaultData: Record<string, unknown>, options: DataStorageOptions = {}): DataStorage {
    return new DataStorage(defaultData, options);
    // const {StorageArea} = dimport('std:kv-storage').catch(() => null);
    // if (!StorageArea) {
    //   return new DataStorage(defaultData, options);
    // } else {
    //   options.dbStorage = new DataStorage(defaultData, {...options});
    //   options.storage = new StorageArea(options.PREFIX || global.PRODUCT);
    //   return new DataStorage(defaultData, options);
    // }
  }
  static clone(dataStorage: DataStorage): DataStorage {
    const options: DataStorageOptions = {
      prefix: dataStorage.prefix,
      storage: dataStorage.storage,
      ignoreExportKeys: dataStorage.options.ignoreExportKeys,
      readonly: dataStorage.readonly,
    };
    return DataStorage.create(dataStorage.default, options);
  }

  constructor(defaultData: Record<string, unknown>, options: DataStorageOptions = {}) {
    this.options = options;
    this.default = defaultData;
    this._data = Object.assign({}, defaultData);
    this.prefix = `${options.prefix || 'DATA'}_`;
    this.storage = options.storage || localStorage;
    this._ignoreExportKeys = options.ignoreExportKeys || [];
    this.readonly = options.readonly;
    this.silently = false;
    this._changed = new Map();
    this._onChange = bounce.time(this._onChange.bind(this));

    objUtil.bridge(
      this as unknown as { constructor: { prototype: object }; [key: string]: unknown },
      new Emitter() as unknown as { constructor: { prototype: object }; [key: string]: unknown }
    );

    void this.restore().then(() => {
      this.props = this._makeProps(defaultData);
      void this.emitResolve('restore');
    });

    this.logger = (self || window).console;
    this.consoleSubscriber = {
      next: (v, ...args) => this.logger.log('next', v, ...args),
      error: (e, ...args) => this.logger.warn('error', e, ...args),
      complete: (c, ...args) => this.logger.log('complete', c, ...args),
    };
  }

  _makeProps(defaultData: Record<string, unknown> = {}, namespace = ''): Record<string, unknown> {
    namespace = namespace ? `${namespace}.` : '';
    const def: PropertyDescriptorMap = {};
    const props: Record<string, unknown> = {};
    Object.keys(defaultData)
      .sort()
      // .filter(key => !this._ignoreExportKeys.includes(key) && key.includes(namespace))
      .filter((key) => key.includes(namespace))
      .forEach((key) => {
        const k = key.slice(namespace.length);
        if (k.includes('.')) {
          const ns = k.slice(0, k.indexOf('.'));
          props[ns] = this._makeProps(defaultData, `${namespace}${ns}`);
        }
        def[k] = {
          enumerable: !this._ignoreExportKeys.includes(key),
          get: () => this.getValue(key),
          set: (v: unknown) => {
            this.setValue(key, v);
          },
        };
      });
    Object.defineProperties(props, def);
    return props;
  }

  _onChange(): unknown {
    const changed = new Map(this._changed);
    this._changed.clear();
    if (!changed.size) return;
    this.emit('change', changed);
    for (const [key, val] of changed) {
      setTimeout(() => {
        // A newer write may arrive before this deferred delivery, including
        // from another update listener. Never restore an obsolete UI value.
        if (!Object.is(this.getValue(key), val)) return;
        this.emit('update', key, val);
        if (Object.is(this.getValue(key), val)) this.emit(`update-${key}`, val);
      }, 0);
    }
    return;
  }

  onkey(key: string, callback: EmitterCallback): void {
    this.on(`update-${key}`, callback);
  }

  offkey(key: string, callback: EmitterCallback): void {
    this.off(`update-${key}`, callback);
  }

  // restore/refresh は Promise 連鎖の API のため async を維持する
  // eslint-disable-next-line @typescript-eslint/require-await
  async restore(storage?: Storage): Promise<void> {
    storage = storage || this.storage;
    const loose = storage as unknown as LooseStorage;
    Object.keys(this.default).forEach((key) => {
      const storageKey = this.getStorageKey(key);
      if (Object.prototype.hasOwnProperty.call(storage, storageKey) || loose[storageKey] !== undefined) {
        try {
          this._data[key] = JSON.parse(String(loose[storageKey]));
        } catch (e) {
          console.error('config parse error key:"%s" value:"%s" ', key, loose[storageKey], e);
          delete loose[storageKey];
          this._data[key] = this.default[key];
        }
      } else {
        this._data[key] = this.default[key];
      }
    });
  }

  getNativeKey(key: string): string {
    return key;
  }

  getStorageKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  // restore/refresh は Promise 連鎖の API のため async を維持する
  // eslint-disable-next-line @typescript-eslint/require-await
  async refresh(key?: string, storage?: Storage): Promise<unknown> {
    storage = storage || this.storage;
    key = this.getNativeKey(key as string);
    const loose = storage as unknown as LooseStorage;
    const storageKey = this.getStorageKey(key);
    if (Object.prototype.hasOwnProperty.call(storage, storageKey) || loose[storageKey] !== undefined) {
      try {
        this._data[key] = JSON.parse(String(loose[storageKey]));
      } catch (e) {
        console.error('config parse error key:"%s" value:"%s" ', key, loose[storageKey], e);
      }
    }
    return this._data[key];
  }

  getValue(key: string): unknown {
    key = this.getNativeKey(key);
    return this._data[key];
  }

  deleteValue(key: string): void {
    key = this.getNativeKey(key);
    const storageKey = this.getStorageKey(key);
    this.storage.removeItem(storageKey);
    this._data[key] = this.default[key];
  }

  setValue(key: string, value: unknown): void {
    const _key = key;
    key = this.getNativeKey(key);
    if (this._data[key] === value || value === undefined) {
      return;
    }
    const storageKey = this.getStorageKey(key);
    const storage = this.storage;
    if (!this.readonly) {
      try {
        (storage as unknown as LooseStorage)[storageKey] = JSON.stringify(value);
      } catch (e) {
        // A failed persistent write must not become a successful in-memory
        // update. Consumers can report the failure without leaking the value.
        this.emit('save-error', { key: _key, cause: e });
        return;
      }
    }
    this._data[key] = value;

    // console.log('%cupdate "%s" = "%s"', 'background: cyan', _key, value);
    if (!this.silently) {
      this._changed.set(_key, value);
      this._onChange();
    }
  }

  setValueSilently(key: string, value: unknown): void {
    const isSilent = this.silently;
    this.silently = true;
    this.setValue(key, value);
    this.silently = isSilent;
  }

  export(isAll = false): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const _default = this.default;

    Object.keys(this.props)
      .filter((key) => isAll || _default[key] !== this._data[key])
      .forEach((key) => (result[key] = this.getValue(key)));
    return result;
  }

  exportJson(): string {
    return JSON.stringify(this.export(), null, 2);
  }

  import(data: Record<string, unknown>): void {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError('設定データはオブジェクト形式で指定してください');
    }
    // Build the complete replacement before touching storage. Native keys may
    // alias a page-specific setting, so retain the existing last-value contract.
    const next = new Map<string, unknown>();
    for (const key of Object.keys(this.props)) {
      if (!Object.hasOwn(this.default, key)) continue;
      const value = Object.hasOwn(data, key) ? data[key] : this.default[key];
      if (value !== undefined) next.set(this.getNativeKey(key), value);
    }
    const writes = [...next]
      .filter(([key, value]) => this._data[key] !== value)
      .map(([key, value]) => {
        const storageKey = this.getStorageKey(key);
        return {
          key,
          value,
          storageKey,
          serialized: JSON.stringify(value),
          previous: this.storage.getItem(storageKey),
        };
      });
    if (!this.readonly) {
      const applied: typeof writes = [];
      try {
        for (const write of writes) {
          (this.storage as LooseStorage)[write.storageKey] = write.serialized;
          applied.push(write);
        }
      } catch (cause) {
        const rollbackErrors: unknown[] = [];
        for (const write of applied.reverse()) {
          try {
            if (write.previous === null) this.storage.removeItem(write.storageKey);
            else (this.storage as LooseStorage)[write.storageKey] = write.previous;
          } catch (error) {
            rollbackErrors.push(error);
          }
        }
        if (rollbackErrors.length) {
          throw new AggregateError(
            [cause, ...rollbackErrors],
            '設定の読み込みと元の保存値への復元に失敗しました。保存容量やブラウザーの設定を確認し、バックアップから復旧してください。',
            { cause }
          );
        }
        throw new Error(
          '設定を読み込めませんでした。変更前の設定へ戻しました。保存容量やブラウザーの設定を確認して再試行してください。',
          { cause }
        );
      }
    }
    // Import remains silent as before; callers reload only after it succeeds.
    for (const { key, value } of writes) this._data[key] = value;
  }

  importJson(json: string): void {
    const data: unknown = JSON.parse(json);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new TypeError('設定データはオブジェクト形式で指定してください');
    }
    this.import(data as Record<string, unknown>);
  }

  getKeys(): string[] {
    return Object.keys(this.props);
  }

  clearConfig(): void {
    const keys = Object.keys(this.default).filter((key) => !this._ignoreExportKeys.includes(key));
    if (!this.readonly) {
      const removed: { storageKey: string; previous: string }[] = [];
      try {
        for (const key of keys) {
          const storageKey = this.getStorageKey(key);
          const previous = this.storage.getItem(storageKey);
          if (previous === null) continue;
          // Native removeItem is atomic: a throwing deletion has not changed
          // that key, so only completed deletions need to be restored.
          this.storage.removeItem(storageKey);
          removed.push({ storageKey, previous });
        }
      } catch (cause) {
        const rollbackErrors: unknown[] = [];
        for (const { storageKey, previous } of removed.reverse()) {
          try {
            this.storage.setItem(storageKey, previous);
          } catch (error) {
            rollbackErrors.push(error);
          }
        }
        const error = rollbackErrors.length
          ? new AggregateError(
              [cause, ...rollbackErrors],
              '設定の初期化と元の保存値への復元に失敗しました。保存容量やブラウザーの設定を確認し、バックアップから復旧してください。',
              { cause }
            )
          : new Error(
              '設定を初期化できませんでした。変更前の設定へ戻しました。ブラウザーの保存設定を確認して再試行してください。',
              { cause }
            );
        this.emit('reset-error', error);
        throw error;
      }
    }
    // As with import, reset is silent. Do not alter the caller's silence mode.
    for (const key of keys) {
      this._data[key] = this.default[key];
      this._changed.delete(key);
    }
  }

  namespace(name: string): Record<string, unknown> {
    const namespace = name ? `${name}.` : '';
    const origin = Symbol(`${namespace}`);
    const result: Record<string, unknown> = {
      getValue: (key: string) => this.getValue(`${namespace}${key}`),
      setValue: (key: string, value: unknown) => this.setValue(`${namespace}${key}`, value),
      on: (key: string, func: (...args: unknown[]) => unknown) => {
        if (key === 'update') {
          const onUpdate: EmitterCallback = (...args) => {
            const [key, value] = args as [string, unknown];
            if (key.startsWith(namespace)) {
              func(key.slice(namespace.length + 1), value);
            }
          };
          (onUpdate as unknown as Record<symbol, unknown>)[origin] = func;
          this.on('update', onUpdate);
          return result;
        }
        return this.onkey(`${namespace}${key}`, func);
      },
      off: (key: string, func: (...args: unknown[]) => unknown) => {
        if (key === 'update') {
          func = ((func as unknown as Record<symbol, unknown>)[origin] as (...args: unknown[]) => unknown) || func;
          this.off('update', func);
          return result;
        }
        return this.offkey(`${namespace}${key}`, func);
      },
      onkey: (key: string, func: (...args: unknown[]) => unknown) => {
        this.on(`update-${namespace}${key}`, func);
        return result;
      },
      offkey: (key: string, func: (...args: unknown[]) => unknown) => {
        this.off(`update-${namespace}${key}`, func);
        return result;
      },
      props: this.props[name],
      refresh: () => this.refresh(),
      subscribe: (subscriber: SubscriberCallback | SubscriberParams | null) => {
        return this.subscribe(subscriber)
          .filter((changed) =>
            ((changed as Map<string, unknown>).keys() as unknown as string[]).some((k) => k.startsWith(namespace))
          )
          .map((changed) => {
            const result = new Map();
            for (const k of (changed as Map<string, unknown>).keys()) {
              if (k.startsWith(namespace)) {
                result.set(k, (changed as Map<string, unknown>).get(k));
              }
            }
            return result;
          });
      },
    };
    return result;
  }

  subscribe(subscriber?: SubscriberCallback | SubscriberParams | null): AnySubscription {
    subscriber = subscriber || this.consoleSubscriber;
    const observable = new Observable((o) => {
      const onChange = (changed: unknown): unknown => o.next(changed);
      this.on('change', onChange);
      return () => this.off('change', onChange);
    });
    return observable.subscribe(subscriber);
  }

  // for debug
  watch(): void {
    // if (this.consoleSubscription) { return; }
    // return this.consoleSubscription = this.subscribe();
  }
  unwatch(): void {
    if (this.consoleSubscription) {
      this.consoleSubscription.unsubscribe();
    }
    this.consoleSubscription = null;
  }
}

//===END===

export { DataStorage };
export type { DataStorageOptions };
