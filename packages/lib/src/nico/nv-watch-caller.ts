import { netUtil } from '../infra/net-util';

interface NVWatchCallerApi {
  call: (trackingId: string) => Promise<unknown>;
}

interface NetFetchInit {
  method?: string;
  headers?: Record<string, string | number>;
  credentials?: string;
  body?: string;
  mode?: string;
  timeout?: number;
  signal?: AbortSignal | null;
  [key: string]: unknown;
}

interface NetUtilLike {
  fetch: (url: string | URL, init?: NetFetchInit) => Promise<Response>;
  jsonp: (url: string) => Promise<unknown>;
}

//===BEGIN===
const NVWatchCaller: NVWatchCallerApi = (() => {
  const FRONT_ID = '6';
  const FRONT_VER = '0';
  const call = (trackingId: string): Promise<unknown> => {
    const url = `https://nvapi.nicovideo.jp/v1/2ab0cbaa/watch?t=${encodeURIComponent(trackingId)}`; //&_frontendId=${FRONT_ID}`;
    const result: unknown = (netUtil as unknown as NetUtilLike)
      .fetch(url, {
        mode: 'cors',
        credentials: 'include',
        timeout: 5000,
        headers: {
          'X-Frontend-Id': FRONT_ID,
          'X-Frontend-Version': FRONT_VER,
        },
      })
      .catch((e: unknown) => {
        console.warn('nvlog fail', e);
      });
    return result as Promise<unknown>;
  };

  return { call };
})();

//===END===

export { NVWatchCaller };
