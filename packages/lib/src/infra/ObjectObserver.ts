type ObservedObject = Record<string | symbol, unknown>;

type ObserverCallback = (key: string | symbol, newValue: unknown, oldValue: unknown, details: unknown) => void;

interface ObserveParams {
  target?: ObservedObject | null;
  callback?: ObserverCallback | null;
  parent?: unknown;
  path?: string;
}

type DisconnectFunction = (...args: unknown[]) => unknown;

import { Handler } from '../Emitter';
import type { AnyHandler } from '../Emitter';
import { objUtil } from './objUtil';
import { Observable } from './Observable';
import { bounce } from './bounce';

//===BEGIN===
const ObjectObserver = (() => {
  const disconnected = Symbol('disconnected');
  const disconnect = Symbol('disconnect');
  const listen = Symbol('listen');
  const revision = Symbol('revision');
  const parent = Symbol('parent');
  const dispatch = Symbol('dispatch');
  const id = Symbol('id');
  const isObjectObserver = (Symbol as unknown as Record<string, symbol>)['isObjectObserver'] as symbol;
  const handler = Symbol('handler');

  const isObject = objUtil.isObject;

  const listKeys = (obj: ObservedObject): string[] => {
    const keys = Object.keys(obj).sort();
    const objKeys = keys.filter((key) => isObject(obj[key]));
    const prmKeys = keys.filter((key) => !isObject(obj[key]));
    return prmKeys.concat(objKeys);
  };
  const updateObject = (prev: ObservedObject, next: ObservedObject, mode = 'update'): number => {
    const prevKeys = listKeys(prev);
    const nextKeys = listKeys(next);
    const removedKeys = prevKeys.filter((key) => !nextKeys.includes(key));
    const addedKeys = nextKeys.filter((key) => !prevKeys.includes(key));
    const changedKeys = nextKeys.filter((key) => prevKeys.includes(key)).filter((key) => prev[key] !== next[key]);

    let changed = 0;
    if (mode !== 'merge') {
      for (const key of removedKeys) {
        delete prev[key];
        changed++;
      }
    }
    for (const key of addedKeys) {
      prev[key] = next[key];
      changed++;
    }
    for (const key of changedKeys) {
      prev[key] = next[key];
      changed++;
    }
    return changed;
  };

  class ObserveHandler {
    static id: number;
    id: number;
    childProxy: Record<string | symbol, unknown>;
    childCallback: Record<string | symbol, ObserverCallback>;
    listener: AnyHandler;
    revision: number;
    target?: ObservedObject | null;
    callback?: ObserverCallback | null;
    parent?: unknown;
    path?: string;
    static getId(): number {
      this.id = this.id || 0;
      return this.id++;
    }
    constructor(params: ObserveParams = { target: null, callback: null, parent: null, path: '' }) {
      this.id = (this.constructor as typeof ObserveHandler).getId();
      this.childProxy = {};
      this.childCallback = {};
      this.listener = (Handler as unknown as { of: (callback: ObserverCallback | null | undefined) => AnyHandler }).of(
        params.callback
      );
      this.revision = 0;
      Object.assign(this, params);
    }
    createChild(target: ObservedObject, prop: string | symbol, thisProxy: unknown): ObservedObject {
      const callback: ObserverCallback = (key, newValue, oldValue, details: unknown = { parent: null, path: '' }) => {
        const d = Object.assign({}, details) as { path?: unknown };
        d.path = d.path ? `${d.path as string}.${prop as string}` : prop;
        ((thisProxy as ObservedObject)[dispatch] as DisconnectFunction)(key, newValue, oldValue, d);
      };
      if (target[isObjectObserver]) {
        this.childCallback[prop] = callback;
        (target[listen] as DisconnectFunction)(callback);
        return target;
      }
      const path: string = this.path ? `{this.path}.${prop as string}` : (prop as string);
      return observe(target, callback, { parent: thisProxy, path });
    }
    set(target: ObservedObject, prop: string | symbol, newValue: unknown, receiver: unknown): boolean | undefined {
      if (prop === revision) {
        return true;
      }
      const oldValue: unknown = Reflect.get(target, prop, receiver);
      if (oldValue === newValue) {
        return true;
      }
      this.revision++;
      if (isObject(oldValue)) {
        if (isObject(newValue)) {
          // object to object
          if (!oldValue[isObjectObserver]) {
            const child = this.createChild(oldValue, prop, receiver);
            Reflect.set(target, prop, child, receiver);
            this.revision += updateObject(child, newValue);
            return;
          }
          this.revision += updateObject(oldValue, newValue);
          return;
        } else {
          // object to primitive
          if (oldValue[isObjectObserver]) {
            (oldValue[disconnect] as DisconnectFunction)(this.childCallback[prop]);
          }
          Reflect.set(target, prop, newValue, receiver);
          this.revision++;
        }
      } else {
        // primitive to object|primitive
        target[prop] = isObject(newValue) ? this.createChild(newValue, prop, receiver) : newValue;
        this.revision++;
      }
      this.listener.exec(prop, newValue, oldValue, { target: receiver });
    }
    get(target: ObservedObject, prop: string | symbol, receiver: unknown): unknown {
      switch (prop) {
        case revision:
          return this.revision;
        case id:
          return this.id;
      }
      if (typeof prop === 'symbol' && Object.prototype.hasOwnProperty.call(receiver, prop)) {
        return (receiver as ObservedObject)[prop];
      }

      let val: unknown = Reflect.get(target, prop, receiver); //target[prop];
      if (!isObject(val)) {
        return val;
      }
      if (!this.childProxy[prop]) {
        if (typeof val === 'function') {
          // 関数は isObject の型ガードをすり抜けるためここでは never 扱い。実行時は bind できる
          val = (val as { bind(target: unknown): unknown }).bind(target);
        }
        this.childProxy[prop] = this.createChild(val as ObservedObject, prop, receiver);
      }
      return this.childProxy[prop];
    }
    deleteProperty(target: ObservedObject, prop: string | symbol): boolean {
      if (!Object.prototype.hasOwnProperty.call(target, prop)) {
        return true;
      }
      const val: unknown = target[prop];
      if ((val as ObservedObject)[isObjectObserver]) {
        (val as ObservedObject)[parent] = null;
        ((val as ObservedObject)[disconnect] as DisconnectFunction)(this.childCallback[prop]);
      }
      Reflect.deleteProperty(target, prop);
      delete this.childProxy[prop];
      this.revision++;
      this.listener.exec(prop, val, undefined, { target });
      return true;
    }
    dispatch(...args: unknown[]): void {
      this.listener.exec(...args);
    }
    add(callback: ObserverCallback): void {
      this.listener.add(callback);
    }
    remove(callback: ObserverCallback): void {
      this.listener.remove(callback);
    }
  }

  class NestedHandler {
    callback: ObserverCallback;
    target: ObservedObject;
    constructor({ callback, target }: { callback: ObserverCallback; target: ObservedObject }) {
      this.callback = callback;
      this.target = target;
    }
    get(target: ObservedObject, prop: string | symbol): unknown {
      switch (prop) {
        case disconnect:
          return () => (target[disconnect] as DisconnectFunction)(this.callback);
      }
      return target[prop];
    }
  }

  const defCallback: ObserverCallback = (key, newValue, oldValue, details) =>
    window.console.log({ key, newValue, oldValue, details });

  const observe = (
    target: ObservedObject,
    callback?: ObserverCallback | null,
    params: ObserveParams = { parent: null, path: '' }
  ): ObservedObject => {
    callback = callback || defCallback;
    if (target[isObjectObserver]) {
      (target[listen] as DisconnectFunction)(callback);
      return new Proxy(target, new NestedHandler({ callback, target }));
    }
    const _handler = new ObserveHandler(Object.assign(params, { callback, target }));
    const proxy: ObservedObject = new Proxy(target, _handler as unknown as ProxyHandler<ObservedObject>);
    proxy[handler] = _handler;
    proxy[revision] = 0;
    proxy[parent] = params.parent;
    proxy[isObjectObserver] = true;
    proxy[disconnected] = false;
    proxy[dispatch] = (...args: unknown[]) => _handler.dispatch(...args);
    proxy[disconnect] = (_callback?: ObserverCallback) => {
      _handler.remove(_callback || callback);
      if (!(_handler as unknown as { isEmpty: unknown }).isEmpty) {
        return;
      }
      proxy[disconnected] = true;
      for (const key of Object.keys(_handler.childProxy)) {
        ((_handler.childProxy[key] as ObservedObject)[disconnect] as DisconnectFunction)();
        delete _handler.childProxy[key];
        delete (_handler as unknown as { bound: Record<string, unknown> }).bound[key];
      }
    };
    proxy[listen] = (callback: ObserverCallback) => _handler.add(callback);
    return proxy;
  };

  const getHandler = (proxy: ObservedObject): unknown => (proxy[isObjectObserver] ? proxy[handler] : null);

  const subscribe = (target: ObservedObject, subscripter: (p: unknown) => void): unknown => {
    const observable = new Observable((o) => {
      let changed: Record<string, { newValue: unknown; oldValue: unknown; details: unknown }> = {};
      const onNext = bounce.idle(() => {
        const cp = Object.assign({}, changed);
        changed = {};
        o.next(cp);
      });
      const onChange: ObserverCallback = (key, newValue, oldValue, details) => {
        changed[key as string] = { newValue, oldValue, details };
        void onNext();
      };
      const observer = observe(target, onChange);
      observe(target);
      (observer[disconnect] as DisconnectFunction)();
    });
    return observable.subscribe(subscripter);
  };

  return {
    observe,
    getHandler,
    disconnect: (observer: ObservedObject) => (observer[disconnect] as DisconnectFunction)(),
    subscribe,
  };
})();
//===END===

// const ObjectSubscriber = (() => {
//   const subscribe = (target) => {
//     let nextFunc = (key, newValue, oldValue = null, details = {}) => {
//       window.console.log('next', {key, newValue, oldValue, details});
//     };

//     const subscribeChild = (child, path = '') => {
//       return Observable.object(child).subscribe((key, newValue, oldValue, details = {}) => {
//         details = details || {};
//         details.path = details.path || [];
//         details.path.push(path);
//         nextFunc(key, newValue, oldValue, details);
//       });
//     };

//     const observer = new Observable(o => {
//       nextFunc = (key, newValue, oldValue = null, details = {}) => {
//         window.console.log('next', {key, newValue, oldValue, details});
//         o.next(key, newValue, oldValue, details);
//       };
//       const p = Observable.proxy(target, (key, newValue, oldValue) => {
//         nextFunc(key, newValue, oldValue, {path: [], target: p});
//       });
//       o.start(p);
//       return () => {
//         p[ObjectObserver.disconnect]();
//       };
//     });

//     for (const key of Object.keys(target)) {
//       const val = target[key];
//       if (val !== null && typeof val === 'object') {
//         subscribeChild(target[key], key);
//       }
//     }
//     return observer;
//   };
//   return {
//     subscribe
//   };
// })();

export { ObjectObserver };
