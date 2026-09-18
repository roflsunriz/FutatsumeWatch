type SubscriberCallback = (...args: unknown[]) => unknown;

interface SubscriberParams {
  start?: SubscriberCallback;
  next?: SubscriberCallback;
  error?: SubscriberCallback;
  complete?: SubscriberCallback;
  closed?: () => boolean;
}

interface SubscriberCallbacks {
  start: SubscriberCallback;
  next: SubscriberCallback;
  error: SubscriberCallback;
  complete: SubscriberCallback;
}

type SubscriberFunction = (subscriber: ObservableSubscriber) => (() => void) | void;

type AnyObservable = InstanceType<typeof Observable>;
type AnySubscription = ReturnType<AnyObservable['subscribe']>;

// IIFE 内の Subscriber / Observable クラスは外から名前参照できないため、
// 構造型で受け、実体との対応は InstanceType で取る。
interface ObservableSubscriber {
  start: SubscriberCallback;
  next: SubscriberCallback;
  error: SubscriberCallback;
  complete: SubscriberCallback;
}

interface SubscriptionParams {
  observable: AnyObservable;
  subscriber: ObservableSubscriber;
  unsubscribe?: () => void;
  closed?: () => boolean;
}

import { Handler, PromiseHandler } from '../Emitter';
import type { AnyHandler, AnyPromiseHandler } from '../Emitter';

//===BEGIN===
const Observable = (() => {
  // if (window.Observable) {
  //   return window.Observable;
  // }
  const observableSymbol: symbol =
    (Symbol as unknown as Record<string, symbol | undefined>).observable || Symbol('observable');
  const nop: SubscriberCallback = Handler.nop;
  class Subscription {
    callbacks: { unsubscribe?: () => void; closed?: () => boolean };
    observable: Observable;
    _closed: boolean;
    _filterFunc?: (arg: unknown) => unknown;
    _mapFunc?: (arg: unknown) => unknown;
    constructor({ observable, subscriber, unsubscribe, closed }: SubscriptionParams) {
      this.callbacks = { unsubscribe, closed };
      this.observable = observable;
      const next = subscriber.next.bind(subscriber);
      subscriber.next = (args: unknown): unknown => {
        if (this.closed || (this._filterFunc && !this._filterFunc(args))) {
          return;
        }
        return this._mapFunc ? next(this._mapFunc(args)) : next(args);
      };
      this._closed = false;
    }
    subscribe(
      subscriber: Subscriber | SubscriberCallback | SubscriberParams | null,
      onError?: SubscriberCallback | null,
      onCompleted?: SubscriberCallback | null
    ): Subscription {
      return this.observable.subscribe(subscriber, onError, onCompleted).filter(this._filterFunc).map(this._mapFunc);
    }
    unsubscribe(): this {
      this._closed = true;
      if (this.callbacks.unsubscribe) {
        this.callbacks.unsubscribe();
      }
      return this;
    }
    dispose(): this {
      return this.unsubscribe();
    }
    filter(func?: (arg: unknown) => unknown): this {
      const _func = this._filterFunc;
      this._filterFunc = _func ? (arg: unknown): unknown => _func(arg) && func!(arg) : func;
      return this;
    }
    map(func?: (arg: unknown) => unknown): this {
      const _func = this._mapFunc;
      this._mapFunc = _func ? (arg: unknown): unknown => func!(_func(arg)) : func;
      return this;
    }
    get closed(): boolean {
      if (this.callbacks.closed) {
        return this._closed || this.callbacks.closed();
      } else {
        return this._closed;
      }
    }
  }

  class Subscriber {
    static nop: SubscriberCallbacks & { closed: SubscriberCallback };
    callbacks: SubscriberCallbacks;
    _callbacks?: { closed?: () => boolean };
    static create(
      onNext: Subscriber | SubscriberCallback | SubscriberParams | null = null,
      onError: SubscriberCallback | null = null,
      onCompleted: SubscriberCallback | null = null
    ): Subscriber {
      if (typeof onNext === 'function') {
        return new this({
          next: onNext,
          error: onError || undefined,
          complete: onCompleted || undefined,
        });
      }
      return new this((onNext || {}) as SubscriberParams);
    }
    constructor(
      { start, next, error, complete }: SubscriberParams = { start: nop, next: nop, error: nop, complete: nop }
    ) {
      this.callbacks = { start, next, error, complete } as SubscriberCallbacks;
    }
    start(arg: unknown): void {
      this.callbacks.start(arg);
    }
    next(arg: unknown): void {
      this.callbacks.next(arg);
    }
    error(arg: unknown): void {
      this.callbacks.error(arg);
    }
    complete(arg: unknown): void {
      this.callbacks.complete(arg);
    }
    get closed(): boolean {
      const callbacks = this._callbacks!;
      return callbacks.closed ? callbacks.closed() : false;
    }
  }
  Subscriber.nop = { start: nop, next: nop, error: nop, complete: nop, closed: nop };

  const eleMap: WeakMap<EventTarget, Record<string, Observable>> = new WeakMap();
  class Observable {
    static observavle: symbol;
    _subscriberFunction: SubscriberFunction;
    _completed: boolean;
    _cancelled: boolean;
    _handlers: AnyHandler;
    _subscriber!: Subscriber;
    _nextObservable?: Observable;
    _disconnectFunction?: () => void;
    _closed?: boolean;
    static of(...args: unknown[]): Observable {
      return new this((o) => {
        for (const arg of args) {
          o.next(arg);
        }
        o.complete();
        return () => {};
      });
    }
    static from(arg: unknown): Observable | undefined {
      if ((arg as { [Symbol.iterator]?: unknown })[Symbol.iterator]) {
        return this.of(...(arg as Iterable<unknown>));
      } else if ((arg as Record<symbol, unknown>)[Observable.observavle]) {
        return ((arg as Record<symbol, unknown>)[Observable.observavle] as () => Observable)();
      }
    }
    static fromEvent(element: EventTarget, eventName: string): Observable {
      const em = eleMap.get(element) || {};
      if (em && em[eventName]) {
        return em[eventName];
      }
      eleMap.set(element, em);
      return (em[eventName] = new this((o) => {
        const onUpdate = (e: Event): unknown => o.next(e);
        element.addEventListener(eventName, onUpdate, { passive: true });
        return () => element.removeEventListener(eventName, onUpdate);
      }));
    }
    static interval(ms: number): Observable {
      return new this(
        function (this: { i: number }, o: ObservableSubscriber) {
          const timer = setInterval(() => o.next(this.i++), ms);
          return () => clearInterval(timer);
        }.bind({ i: 0 })
      );
    }
    constructor(subscriberFunction: SubscriberFunction) {
      this._subscriberFunction = subscriberFunction;
      this._completed = false;
      this._cancelled = false;
      this._handlers = new Handler();
    }
    _initSubscriber(): Subscriber | undefined {
      if (this._subscriber) {
        return;
      }
      const handlers = this._handlers;
      this._completed = this._cancelled = false;
      return (this._subscriber = new Subscriber({
        start: (arg: unknown): unknown => handlers.execMethod('start', arg),
        next: (arg: unknown): unknown => handlers.execMethod('next', arg),
        error: (arg: unknown): unknown => handlers.execMethod('error', arg),
        complete: (arg) => {
          if (this._nextObservable) {
            this._nextObservable.subscribe(this._subscriber);
            this._nextObservable = this._nextObservable._nextObservable;
          } else {
            this._completed = true;
            handlers.execMethod('complete', arg);
          }
        },
        closed: () => this.closed,
      }));
    }
    get closed(): boolean {
      return this._completed || this._cancelled;
    }
    filter(func?: (arg: unknown) => unknown): Subscription {
      return this.subscribe().filter(func);
    }
    map(func?: (arg: unknown) => unknown): Subscription {
      return this.subscribe().map(func);
    }
    concat(arg: unknown): this {
      const observable = Observable.from(arg);
      if (this._nextObservable) {
        this._nextObservable.concat(observable);
      } else {
        this._nextObservable = observable;
      }
      return this;
    }
    forEach(callback: (p: AnyPromiseHandler) => void): Subscription {
      let p = new PromiseHandler();
      callback(p);
      return this.subscribe({
        next: (arg: unknown) => {
          const lp = p;
          p = new PromiseHandler();
          void lp.resolve(arg);
          callback(p);
        },
        error: (arg: unknown) => {
          const lp = p;
          p = new PromiseHandler();
          // emitReject 系と同様に任意の reason を透過させるため Error 限定しない
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          void lp.reject(arg);
          callback(p);
        },
      });
    }
    onStart(arg: unknown): void {
      this._subscriber.start(arg);
    }
    onNext(arg: unknown): void {
      this._subscriber.next(arg);
    }
    onError(arg: unknown): void {
      this._subscriber.error(arg);
    }
    onComplete(arg: unknown): void {
      this._subscriber.complete(arg);
    }
    disconnect(): void {
      if (!this._disconnectFunction) {
        return;
      }
      this._closed = true;
      this._disconnectFunction();
      delete this._disconnectFunction;
      void this._subscriber;
      this._handlers.clear();
    }
    [observableSymbol](): Observable {
      return this;
    }
    subscribe(
      onNext: Subscriber | SubscriberCallback | SubscriberParams | null = null,
      onError: SubscriberCallback | null = null,
      onCompleted: SubscriberCallback | null = null
    ): Subscription {
      this._initSubscriber();
      const isNop = [onNext, onError, onCompleted].every((f) => f === null);
      const subscriber = Subscriber.create(onNext, onError, onCompleted);
      return this._subscribe({ subscriber, isNop });
    }
    _subscribe({ subscriber, isNop }: { subscriber: Subscriber; isNop: boolean }): Subscription {
      if (!isNop && !this._disconnectFunction) {
        this._disconnectFunction = this._subscriberFunction(this._subscriber) as () => void;
      }

      if (!isNop) {
        this._handlers.add(subscriber);
      }

      return new Subscription({
        observable: this,
        subscriber,
        unsubscribe: () => {
          if (isNop) {
            return;
          }
          this._handlers.remove(subscriber);
          if (this._handlers.isEmpty) {
            this.disconnect();
          }
        },
        closed: () => this.closed,
      });
    }
  }

  Observable.observavle = observableSymbol;

  return Observable;
})();

const WindowResizeObserver = Observable.fromEvent(window, 'resize').map((o) => {
  return { width: window.innerWidth, height: window.innerHeight };
});
//===END===

export { Observable, WindowResizeObserver };
export type { SubscriberCallback, SubscriberParams, AnyObservable, AnySubscription };
