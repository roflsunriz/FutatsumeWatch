import { afterEach, expect, test } from 'bun:test';
import { LoaderContextType } from 'hls.js';
import type { LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderResponse } from 'hls.js';
import { GateHlsLoader, isDomandDeliveryUrl } from '../../src/hls/gate-hls-loader';
import { netUtil } from '../../packages/lib/src/infra/net-util';
import { CrossDomainGate } from '../../packages/lib/src/infra/cross-domain-gate';

const originalFetch = netUtil.fetch;
const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
const loaders: GateHlsLoader[] = [];
const config: LoaderConfiguration = {
  loadPolicy: { maxLoadTimeMs: 5000, maxTimeToFirstByteMs: 5000, errorRetry: null, timeoutRetry: null },
  maxRetry: 0,
  timeout: 5000,
  retryDelay: 0,
  maxRetryDelay: 0,
};
const context: LoaderContext = {
  url: 'https://delivery.domand.nicovideo.jp/fixture/master.m3u8',
  type: LoaderContextType.MANIFEST,
  responseType: 'text',
};
function loader() {
  Object.defineProperty(globalThis, 'self', { configurable: true, value: globalThis });
  const value = new GateHlsLoader();
  loaders.push(value);
  return value;
}
function callbacks(
  success: LoaderCallbacks<LoaderContext>['onSuccess'],
  error: LoaderCallbacks<LoaderContext>['onError']
): LoaderCallbacks<LoaderContext> {
  return {
    onSuccess: success,
    onError: error,
    onTimeout: () => {
      throw new Error('unexpected timeout');
    },
  };
}
afterEach(() => {
  for (const value of loaders.splice(0)) value.destroy();
  netUtil.fetch = originalFetch;
  if (originalSelf) Object.defineProperty(globalThis, 'self', originalSelf);
  else Reflect.deleteProperty(globalThis, 'self');
});

test('DomandのHTTPS配信だけを対象とし、URL・資格情報・Range・本文・統計をHLSへ渡す', async () => {
  for (const url of [
    'http://delivery.domand.nicovideo.jp/a',
    'https://delivery.domand.nicovideo.jp.evil.test/a',
    'https://u:p@delivery.domand.nicovideo.jp/a',
  ])
    expect(isDomandDeliveryUrl(url)).toBe(false);
  expect(isDomandDeliveryUrl(context.url)).toBe(true);
  expect(isDomandDeliveryUrl('https://asset.domand.nicovideo.jp/fixture/init.cmfv')).toBe(true);
  expect(isDomandDeliveryUrl('https://asset.domand.nicovideo.jp.evil.test/fixture/init.cmfv')).toBe(false);
  for (const responseType of ['text', 'arraybuffer']) {
    const value = loader();
    netUtil.fetch = (url, options) => {
      expect(url).toBe(context.url);
      expect(options?.credentials).toBe('include');
      expect(new Headers(options?.headers).get('Range')).toBe('bytes=3-6');
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(new Response('data', { headers: { Age: '12' } }));
    };
    const response = await new Promise<LoaderResponse>((resolve, reject) =>
      value.load(
        { ...context, responseType, rangeStart: 3, rangeEnd: 7 },
        config,
        callbacks(resolve, (error) => reject(new Error(error.text)))
      )
    );
    expect(response.url).toBe(context.url);
    if (responseType === 'text') expect(response.data).toBe('data');
    else expect(response.data).toBeInstanceOf(ArrayBuffer);
    expect(value.stats.loaded).toBe(4);
    expect(value.getCacheAge()).toBe(12);
  }
});

test('HTTP拒否を成功にせず、abort・timeout・destroy後の遅い応答を破棄する', async () => {
  const failed = loader();
  let code = 0;
  netUtil.fetch = () => Promise.resolve(new Response('denied', { status: 403 }));
  await new Promise<void>((resolve, reject) =>
    failed.load(
      context,
      config,
      callbacks(
        () => reject(Error('false success')),
        (error) => {
          code = error.code;
          resolve();
        }
      )
    )
  );
  expect(code).toBe(403);
  for (const action of ['abort', 'destroy', 'timeout'] as const) {
    const value = loader();
    let finish!: (response: Response) => void;
    let signal: AbortSignal | null | undefined;
    let successes = 0,
      failures = 0,
      timeout = 0;
    netUtil.fetch = (_url, options) => {
      signal = options?.signal;
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    };
    value.load(
      context,
      { ...config, loadPolicy: { ...config.loadPolicy, maxLoadTimeMs: 10 } },
      {
        ...callbacks(
          () => {
            successes++;
          },
          () => {
            failures++;
          }
        ),
        onTimeout: () => {
          timeout++;
        },
      }
    );
    if (action === 'timeout') await Bun.sleep(25);
    else value[action]();
    expect(signal?.aborted).toBe(true);
    finish(new Response('late'));
    await Bun.sleep(1);
    expect(successes).toBe(0);
    expect(failures).toBe(0);
    expect(timeout).toBe(action === 'timeout' ? 1 : 0);
    if (action === 'destroy') loaders.splice(loaders.indexOf(value), 1);
  }
});

test('HLSの範囲なしを表すrangeEnd=0から不正なRangeヘッダーを作らない', async () => {
  const value = loader();
  netUtil.fetch = (_url, options) => {
    expect(new Headers(options?.headers).has('Range')).toBe(false);
    return Promise.resolve(new Response('fragment'));
  };
  await new Promise<void>((resolve, reject) =>
    value.load(
      { ...context, rangeStart: 0, rangeEnd: 0 },
      config,
      callbacks(
        () => resolve(),
        (error) => reject(Error(error.text))
      )
    )
  );
});

test('iframe境界でAbortSignalとHeadersを直列化し、abortを同じ要求IDへ伝える', async () => {
  const gate = new CrossDomainGate({ baseUrl: 'https://www.nicovideo.jp/robots.txt', type: 'test' });
  const packets: Array<{ command: string; params: { requestId?: string; options?: RequestInit } }> = [];
  let finish!: (value: unknown) => void;
  Object.assign(gate, {
    _initializeFrame: () => Promise.resolve(),
    _postMessage: (packet: (typeof packets)[number]) => {
      packets.push(packet);
      return packet.command === 'fetch'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve();
    },
  });
  const controller = new AbortController();
  const pending = gate.fetch(context.url, { headers: new Headers({ Range: 'bytes=3-6' }), signal: controller.signal });
  await Bun.sleep(1);
  expect(packets[0]?.params.options?.signal).toBeUndefined();
  expect(packets[0]?.params.options?.headers).toEqual({ range: 'bytes=3-6' });
  controller.abort();
  const error: unknown = await pending.catch((value: unknown) => value);
  expect(error).toMatchObject({ name: 'AbortError' });
  expect(packets[1]?.command).toBe('abortFetch');
  expect(packets[1]?.params.requestId).toBe(packets[0]?.params.requestId);
  finish(null);
});
