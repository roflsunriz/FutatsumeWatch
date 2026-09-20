import { netUtil } from '../infra/net-util';

interface MatrixRankingLoaderApi {
  load: () => Promise<unknown>;
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
const MatrixRankingLoader: MatrixRankingLoaderApi = {
  load: async () => {
    const fetched: unknown = await (netUtil as unknown as NetUtilLike)
      .fetch('https://www.nicovideo.jp/ranking', { cledentials: 'include' })
      .then((r: Response) => r.text());
    const htmlText = fetched as string;
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    const appText = doc.getElementById('MatrixRanking-app')!.dataset.app as string;
    const parsed: unknown = JSON.parse(appText);
    return parsed;
  },
};

//===END===

export { MatrixRankingLoader };
