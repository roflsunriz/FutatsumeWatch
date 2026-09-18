import { netUtil } from '../infra/netUtil';

interface UaaLoadOptions {
  limit?: number;
}

interface UaaLoaderApi {
  load: (videoId: string, options?: UaaLoadOptions) => Promise<unknown>;
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
// typoじゃなくて変なブロッカーと干渉しないために名前を変えている
const UaaLoader: UaaLoaderApi = {
  load: (videoId: string, { limit = 50 }: UaaLoadOptions = {}) => {
    const url = `https://api.nicoad.nicovideo.jp/v1/contents/video/${videoId}/thanks?limit=${limit}`;
    const result: unknown = (netUtil as unknown as NetUtilLike)
      .fetch(url, { credentials: 'include' })
      .then((res: Response) => res.json());
    return result as Promise<unknown>;
  },
};

//===END===

export { UaaLoader };
