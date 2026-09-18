//===BEGIN===
type SleepResolver = (value: unknown) => void;

interface SleepFunction {
  (time?: number): Promise<unknown>;
  idle: () => Promise<unknown>;
  raf: () => Promise<unknown>;
  promise: () => Promise<void>;
  resolve: Promise<void>;
}

const sleep: SleepFunction = Object.assign(
  (time = 0): Promise<unknown> =>
    new Promise((res: SleepResolver) => {
      setTimeout(res, time);
    }),
  {
    idle: (): Promise<unknown> => {
      if (window.requestIdleCallback !== undefined) {
        return new Promise((res) => window.requestIdleCallback(res));
      }
      return new Promise((res: SleepResolver) => {
        setTimeout(res, 0);
      });
    },
    raf: (): Promise<unknown> =>
      new Promise((res) => {
        requestAnimationFrame(res);
      }),
    promise: (): Promise<void> => Promise.resolve(),
    resolve: Promise.resolve(),
  }
);
//===END===
export { sleep };
