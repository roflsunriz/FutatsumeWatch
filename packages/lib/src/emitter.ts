type EmitterCallback = (...args: unknown[]) => unknown;

type PromiseHandlerCallback = (resolve: (...args: unknown[]) => void, reject: (...args: unknown[]) => void) => unknown;

interface PromiseHandlerKey {
  id: string;
  callback: PromiseHandlerCallback;
  status: string;
  value?: unknown[];
  result?: Promise<unknown>;
  resolve?: (...args: unknown[]) => void;
  reject?: (...args: unknown[]) => void;
}

type AnyHandler = InstanceType<typeof Handler>;
type AnyPromiseHandler = InstanceType<typeof PromiseHandler>;
type AnyEmitter = InstanceType<typeof Emitter>;

//===BEGIN===
function EmitterInitFunc() {
  class Handler {
    //extends Array {
    static nop: () => void;
    name?: string;
    _list: unknown[];
    constructor(...args: EmitterCallback[]) {
      this._list = args;
    }

    get length(): number {
      return this._list.length;
    }

    exec(...args: unknown[]): void {
      if (!this._list.length) {
        return;
      } else if (this._list.length === 1) {
        (this._list[0] as EmitterCallback)(...args);
        return;
      }
      for (let i = this._list.length - 1; i >= 0; i--) {
        (this._list[i] as EmitterCallback)(...args);
      }
    }

    execMethod(name: string, ...args: unknown[]): void {
      if (!this._list.length) {
        return;
      } else if (this._list.length === 1) {
        (this._list[0] as Record<string, EmitterCallback>)[name]!(...args);
        return;
      }
      for (let i = this._list.length - 1; i >= 0; i--) {
        (this._list[i] as Record<string, EmitterCallback>)[name]!(...args);
      }
    }

    add(member: unknown): this {
      if (this._list.includes(member)) {
        return this;
      }
      this._list.unshift(member);
      return this;
    }

    remove(member: unknown): this {
      this._list = this._list.filter((m) => m !== member);
      return this;
    }

    clear(): this {
      this._list.length = 0;
      return this;
    }

    get isEmpty(): boolean {
      return this._list.length < 1;
    }

    *[Symbol.iterator](): Generator<unknown> {
      const list = this._list || [];
      for (const member of list) {
        yield member;
      }
    }

    next(): Generator<unknown> {
      return this[Symbol.iterator]();
    }
  }
  Handler.nop = () => {
    /*     ( ˘ω˘ ) スヤァ    */
  };

  const PromiseHandler = (() => {
    const id = function (this: { id: number }): string {
      return `Promise${this.id++}`;
    }.bind({ id: 0 });

    class PromiseHandler extends Promise<unknown> {
      key: PromiseHandlerKey;
      constructor(callback: PromiseHandlerCallback = () => {}) {
        const key = new Object({ id: id(), callback, status: 'pending' }) as unknown as PromiseHandlerKey;

        const cb = function (
          this: PromiseHandlerKey,
          res: (...args: unknown[]) => void,
          rej: (...args: unknown[]) => void
        ) {
          const resolve = (...args: unknown[]): void => {
            this.status = 'resolved';
            this.value = args;
            res(...args);
          };
          const reject = (...args: unknown[]) => {
            this.status = 'rejected';
            this.value = args;
            rej(...args);
          };
          if (this.result) {
            return this.result.then(resolve, reject);
          }
          Object.assign(this, { resolve, reject });
          return callback(resolve, reject);
        }.bind(key);

        super(cb);
        this.resolve = this.resolve.bind(this);
        this.reject = this.reject.bind(this);
        this.key = key;
      }

      resolve(...args: unknown[]): this {
        if (this.key.resolve) {
          this.key.resolve(...args);
        } else {
          this.key.result = (Promise.resolve as unknown as (...args: unknown[]) => Promise<unknown>)(...args);
        }
        return this;
      }

      reject(...args: unknown[]): this {
        if (this.key.reject) {
          this.key.reject(...args);
        } else {
          this.key.result = (Promise.reject as unknown as (...args: unknown[]) => Promise<unknown>)(...args);
        }
        return this;
      }

      addCallback(callback: PromiseHandlerCallback): this {
        void Promise.resolve().then(() => {
          callback(
            (...args) => {
              void this.resolve(...args);
            },
            (...args) => {
              // emitReject は任意の reason を透過させる API のため Error 限定しない
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
              void this.reject(...args);
            }
          );
        });
        return this;
      }
    }
    return PromiseHandler;
  })();

  const { Emitter } = (() => {
    const totalCount = 0;
    const warnings: Emitter[] = [];
    class Emitter {
      static totalCount: number;
      static warnings: Emitter[];
      _events?: Map<string, Handler>;
      _promise?: Map<string, AnyPromiseHandler>;
      on(name: string, callback: EmitterCallback): this {
        if (!this._events) {
          Emitter.totalCount++;
          this._events = new Map();
        }

        name = name.toLowerCase();
        let e = this._events.get(name);
        if (!e) {
          const handler = new Handler(callback);
          handler.name = name;
          this._events.set(name, handler);
          e = handler;
        } else {
          e.add(callback);
        }
        if (e.length > 10) {
          console.warn('listener count > 10', name, e, callback);
          if (!Emitter.warnings.includes(this)) {
            Emitter.warnings.push(this);
          }
        }
        return this;
      }

      off(name: string, callback?: EmitterCallback): this | undefined {
        if (!this._events) {
          return;
        }

        name = name.toLowerCase();
        const e = this._events.get(name);

        if (!this._events.has(name)) {
          return;
        } else if (!callback) {
          this._events.delete(name);
        } else {
          e!.remove(callback);

          if (e!.isEmpty) {
            this._events.delete(name);
          }
        }

        if (this._events.size < 1) {
          delete this._events;
        }
        return this;
      }

      once(name: string, func: EmitterCallback): this {
        const wrapper: EmitterCallback & { _original: EmitterCallback | null } = (...args) => {
          func(...args);
          this.off(name, wrapper);
          wrapper._original = null;
        };
        wrapper._original = func;
        return this.on(name, wrapper);
      }

      clear(name?: string): this | undefined {
        if (!this._events) {
          return;
        }

        if (name) {
          this._events.delete(name);
        } else {
          delete this._events;
          Emitter.totalCount--;
        }
        return this;
      }

      emit(name: string, ...args: unknown[]): this | undefined {
        if (!this._events) {
          return;
        }

        name = name.toLowerCase();
        const e = this._events.get(name);

        if (!e) {
          return;
        }

        e.exec(...args);
        return this;
      }
      emitAsync(...args: [string, ...unknown[]]): this | undefined {
        if (!this._events) {
          return;
        }

        setTimeout(() => this.emit(...args), 0);
        return this;
      }
      promise(name: string, callback?: PromiseHandlerCallback): AnyPromiseHandler {
        if (!this._promise) {
          this._promise = new Map();
        }
        const p = this._promise.get(name);
        if (p) {
          return callback ? p.addCallback(callback) : p;
        }
        this._promise.set(name, new PromiseHandler(callback));
        return this._promise.get(name)!;
      }
      emitResolve(name: string, ...args: unknown[]): AnyPromiseHandler {
        if (!this._promise) {
          this._promise = new Map();
        }
        if (!this._promise.has(name)) {
          this._promise.set(name, new PromiseHandler());
        }
        return this._promise.get(name)!.resolve(...args);
      }
      emitReject(name: string, ...args: unknown[]): AnyPromiseHandler {
        if (!this._promise) {
          this._promise = new Map();
        }
        if (!this._promise.has(name)) {
          this._promise.set(name, new PromiseHandler());
        }
        // emitReject は任意の reason を透過させる API のため Error 限定しない
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return this._promise.get(name)!.reject(...args);
      }
      resetPromise(name: string): void {
        if (!this._promise) {
          return;
        }
        this._promise.delete(name);
      }
      hasPromise(name: string): boolean | undefined {
        return this._promise && this._promise.has(name);
      }
      addEventListener(...args: [string, EmitterCallback]): this {
        return this.on(...args);
      }
      removeEventListener(...args: [string, EmitterCallback | undefined]): this | undefined {
        return this.off(...args);
      }
    }
    Emitter.totalCount = totalCount;
    Emitter.warnings = warnings;
    return { Emitter };
  })();

  return { Handler, PromiseHandler, Emitter };
}
const { Handler, PromiseHandler, Emitter } = EmitterInitFunc();

//===END===

export { EmitterInitFunc, Handler, PromiseHandler, Emitter };
export type { EmitterCallback, PromiseHandlerCallback, AnyHandler, AnyPromiseHandler, AnyEmitter };
