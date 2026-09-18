import { netUtil } from '../infra/netUtil';

interface IchibaLoaderApi {
  load: (watchId: string) => Promise<unknown>;
}

//===BEGIN===
const IchibaLoader: IchibaLoaderApi = {
  load: (watchId: string) => {
    const api = 'https://ichiba.nicovideo.jp/embed/zero/show_ichiba';
    const country = 'ja-jp';
    const url = `${api}?v=${watchId}&country=${country}&ch=&is_adult=1&rev=20120220`;
    const result: unknown = netUtil.jsonp(url);
    return result as Promise<unknown>;
  },
};

//===END===

export { IchibaLoader };
