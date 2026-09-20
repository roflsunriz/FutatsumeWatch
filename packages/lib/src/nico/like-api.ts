import { NVApi } from './nv-api';

interface LikeApiType {
  call: (videoId: string, method?: string) => Promise<unknown>;
  like: (videoId: string) => Promise<unknown>;
  unlike: (videoId: string) => Promise<unknown>;
}

//===BEGIN===
//@require nv-api

const LikeApi: LikeApiType = {
  call: (videoId: string, method = 'POST') => {
    const api = 'https://nvapi.nicovideo.jp/v1/users/me/likes/items';
    const url = `${api}?videoId=${videoId}`;
    const result: unknown = NVApi.call(url, { method }).then((res: Response) => res.json());
    return result as Promise<unknown>;
  },
  like: (videoId: string) => LikeApi.call(videoId, 'POST'),
  unlike: (videoId: string) => LikeApi.call(videoId, 'DELETE'),
};

//===END===
// {"meta":{"status":201},"data":{"thanksMessage": 'hogehoge'}}
export { LikeApi };
