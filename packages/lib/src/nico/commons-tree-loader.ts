import { netUtil } from '../infra/net-util';

interface CommonsTreeLoaderApi {
  load: (contentId: string) => Promise<unknown>;
}

//===BEGIN===
const CommonsTreeLoader: CommonsTreeLoaderApi = {
  load: (contentId: string) => {
    const api = 'https://api.commons.nicovideo.jp/tree/summary/get';
    const url = `${api}?id=${contentId}&limit=200`;
    const result: unknown = netUtil.jsonp(url);
    return result as Promise<unknown>;
  },
};

//===END===

export { CommonsTreeLoader };
