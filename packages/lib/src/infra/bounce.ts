type BounceCallback = (...args: unknown[]) => unknown;

interface BounceIdleResult {
  (...args: unknown[]): AnyPromiseHandler;
  [key: symbol]: BounceCallback;
}

interface BounceResult {
  (...args: unknown[]): AnyPromiseHandler;
  cancel: () => void;
}

interface Throttle {
  (func: BounceCallback, interval: number): BounceResult;
  time: (func: BounceCallback, interval?: number) => BounceResult;
  raf: (func: BounceCallback) => BounceResult;
  idle: (func: BounceCallback) => BounceResult;
}

interface Bounce {
  origin: symbol;
  idle: (func: BounceCallback, time?: number) => BounceIdleResult;
  time: (func: BounceCallback, time?: number) => BounceIdleResult;
}

interface RafThrottleState {
  req: Promise<unknown> | null;
  count: number;
  id: number;
}

import { PromiseHandler } from '../Emitter';
import type { AnyPromiseHandler } from '../Emitter';
//===BEGIN===
// let bid = 0;
const bounce: Bounce = {
  origin: Symbol('origin'),
  // raf(func) {
  //   let reqId = null;
  //   let lastArgs = null;
  //   let promise = new PromiseHandler();
  //   // let id = bid++;
  //   const callback = () => {
  //     // performance.mark(`bounce.raf.callback:${id}`);
  //     const lastResult = func(...lastArgs);
  //     // performance.mark(`bounce.raf.callback:${id}:end`);
  //     // performance.measure(`exec callback bounce.raf.callback:${id}`,
  //     // `bounce.raf.callback:${id}`, `bounce.raf.callback:${id}:end`);
  //     promise.resolve({lastResult, lastArgs});
  //     reqId = lastArgs = null;
  //     promise = new PromiseHandler();
  //   };

  //   const result =  (...args) => {
  //     // performance.mark(`call0.requestAnimationFrame.bounce.raf:${id}`);
  //     if (reqId) {
  //       cancelAnimationFrame(reqId);
  //     }
  //     lastArgs = args;
  //     reqId = requestAnimationFrame(callback);
  //     // performance.mark(`call1.requestAnimationFrame.bounce.raf:${id}`);
  //     // performance.measure('bounce.requestAnimationFrame',
  //     //   `call0.requestAnimationFrame.bounce.raf:${id}`,
  //     //   `call1.requestAnimationFrame.bounce.raf:${id}`
  //     // );
  //       return promise;
  //   };

  //   result[this.origin] = func;
  //   return result;
  // },
  idle(func, time) {
    let reqId: number | null | undefined | void = null;
    let lastArgs: unknown[] | null = null;
    let promise = new PromiseHandler();

    const [caller, canceller] = (
      time === undefined && self.requestIdleCallback
        ? // 連結スコープでは self(=window/worker) のメソッドを unbound のまま渡す (sloppy 実行系で this は self に解決される)
          // eslint-disable-next-line @typescript-eslint/unbound-method
          [self.requestIdleCallback, self.cancelIdleCallback]
        : // eslint-disable-next-line @typescript-eslint/unbound-method
          [self.setTimeout, self.clearTimeout]
    ) as [(callback: () => void, time?: number) => number, (id: number) => void];
    const callback = (): void => {
      const lastResult = func(...lastArgs!);
      void promise.resolve({ lastResult, lastArgs });
      reqId = lastArgs = null;
      promise = new PromiseHandler();
    };
    const result = ((...args: unknown[]): AnyPromiseHandler => {
      if (reqId) {
        reqId = canceller(reqId);
      }
      lastArgs = args;
      reqId = caller(callback, time);
      return promise;
    }) as BounceIdleResult;
    result[this.origin] = func;
    return result;
  },
  time(func, time = 0) {
    return this.idle(func, time);
  },
};
const throttle: Throttle = (func, interval) => {
  let lastTime = 0;
  let timer: ReturnType<typeof setTimeout> | null | undefined | void;
  let promise = new PromiseHandler();

  const result = ((...args: unknown[]): AnyPromiseHandler => {
    if (timer) {
      return promise;
    }
    const now = performance.now();
    const timeDiff = now - lastTime;

    timer = setTimeout(
      () => {
        lastTime = performance.now();
        timer = null;
        const lastResult = func(...args);
        void promise.resolve({ lastResult, lastArgs: args });
        promise = new PromiseHandler();
      },
      Math.max(interval - timeDiff, 0)
    );

    return promise;
  }) as BounceResult;

  result.cancel = () => {
    if (timer) {
      timer = clearTimeout(timer);
    }
    void promise.resolve({ lastResult: null, lastArgs: null });
    promise = new PromiseHandler();
  };
  return result;
};

throttle.time = (func, interval = 0) => throttle(func, interval);

throttle.raf = function (this: RafThrottleState, func: BounceCallback) {
  let promise: Promise<unknown> | null | undefined;
  let cancelled = false;
  let lastArgs: unknown[] = [];

  const callRaf = (res: (value: unknown) => void): number => requestAnimationFrame(res);
  const onRaf = () => (this.req = null);
  const onCall = (): void => {
    if (cancelled) {
      cancelled = false;
      return;
    }
    try {
      func(...lastArgs);
    } catch (e) {
      console.warn(e);
    }
    promise = null;
  };
  const result = ((...args: unknown[]): Promise<unknown> => {
    lastArgs = args;
    if (promise) {
      return promise;
    }
    if (!this.req) {
      this.req = new Promise(callRaf).then(onRaf);
    }
    promise = this.req.then(onCall);
    return promise;
  }) as BounceResult;

  result.cancel = () => {
    cancelled = true;
    promise = null;
  };

  return result;
}.bind({ req: null, count: 0, id: 0 });

// throttle.raf = func => throttle.time(func, 0);

throttle.idle = (func) => {
  let id: number | null | undefined | void;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const request = (self.requestIdleCallback || self.setTimeout) as (callback: () => void, time?: number) => number;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const cancel = self.cancelIdleCallback || self.clearTimeout;

  const result = ((...args: unknown[]): void => {
    if (id) {
      return;
    }
    id = request(() => {
      id = null;
      func(...args);
    }, 0);
  }) as BounceResult;

  result.cancel = () => {
    if (id) {
      id = cancel(id);
    }
  };

  return result;
};

//===END===

export { bounce, throttle };
export type { BounceCallback, BounceIdleResult, BounceResult };
