import { netUtil } from '../infra/netUtil';

interface NVApiCallParams {
  method?: string;
}

interface NVApiType {
  FRONT_ID: string;
  FRONT_VER: string;
  REQUEST_WITH: string;
  call: (url: string, params?: NVApiCallParams) => Promise<Response>;
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

const NVApi: NVApiType = {
  FRONT_ID: '6',
  FRONT_VER: '0',
  REQUEST_WITH: 'https://www.nicovideo.jp',
  call: (url: string, params: NVApiCallParams = {}) => {
    const result: unknown = (netUtil as unknown as NetUtilLike)
      .fetch(url, {
        mode: 'cors',
        credentials: 'include',
        timeout: 5000,
        method: params.method || 'GET',
        headers: {
          'X-Frontend-Id': NVApi.FRONT_ID,
          'X-Frontend-Version': NVApi.FRONT_VER,
          'X-Request-with': NVApi.REQUEST_WITH,
        },
      })
      .catch((err: unknown) => console.warn('nvapi fail', { err, url, params }));
    return result as Promise<Response>;
  },
};

//===END===

export { NVApi };
