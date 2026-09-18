interface BrowserAssert {
  equal(actual: unknown, expected: unknown, msg?: string): void;
}

interface E2EMap {
  [name: string]: () => void;
}

interface ZenzaWatchTestSurface {
  test: {
    e2e: E2EMap;
    exec?: () => void;
  };
  ready?: boolean;
  util?: unknown;
}

interface ZenzaWindow {
  ZenzaWatch?: ZenzaWatchTestSurface;
  assert?: BrowserAssert;
}

const getWindow = (): ZenzaWindow => window as unknown as ZenzaWindow;

void new Promise<ZenzaWatchTestSurface>((resolve) => {
  const w = getWindow();
  if (w.ZenzaWatch && w.ZenzaWatch.ready) {
    return resolve(w.ZenzaWatch);
  }
  document.body.addEventListener('ZenzaWatchInitialize', () => {
    const zw = getWindow().ZenzaWatch;
    if (zw === undefined) {
      throw new Error('ZenzaWatch が初期化されていない');
    }
    resolve(zw);
  });
}).then((ZenzaWatch) => {
  const assert: BrowserAssert = getWindow().assert ?? {
    equal: (a: unknown, b: unknown, msg = '') => {
      if (a !== b) {
        console.error('fail', a, b, msg);
      } else {
        console.log('ok', a, b, msg);
      }
    },
  };

  ZenzaWatch.test = Object.assign({}, ZenzaWatch.test, { e2e: {} });
  const loadUtilTest = async (): Promise<unknown> => {
    const mod: unknown = await import(`./utilTest.ts?${String(Math.random())}`);
    return mod;
  };
  void Promise.all([
    loadUtilTest().then((mod: unknown) => {
      const o = mod as Record<string, unknown>;
      if (typeof o.test !== 'function') {
        throw new Error('utilTest の形式が不正');
      }
      const test = o.test as (args: { assert: BrowserAssert; ZenzaWatch: ZenzaWatchTestSurface }) => void;
      // console.info('test test', $test);
      ZenzaWatch.test.e2e.util = () => {
        test({ assert, ZenzaWatch });
      };
    }),
  ]).then(() => {
    console.info('test ready');
  });

  ZenzaWatch.test.exec = () => {
    for (const name of Object.keys(ZenzaWatch.test.e2e)) {
      console.info('%crun test: %s', 'font-weight: bold;', name);
      ZenzaWatch.test.e2e[name]?.();
    }
  };
});
