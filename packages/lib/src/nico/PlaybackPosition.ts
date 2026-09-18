import { netUtil } from '../infra/netUtil';

interface PlaybackPositionApi {
  record: (
    watchId: string,
    playbackPosition: number,
    frontendId: string | number,
    frontendVersion: string | number
  ) => Promise<unknown>;
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
const PlaybackPosition: PlaybackPositionApi = {
  record: (watchId, playbackPosition, frontendId, frontendVersion) => {
    const url = 'https://nvapi.nicovideo.jp/v1/users/me/watch/history/playback-position';
    const body = `watchId=${watchId}&seconds=${playbackPosition}`;
    const result: unknown = (netUtil as unknown as NetUtilLike).fetch(url, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Frontend-Id': frontendId,
        'X-Frontend-Version': frontendVersion,
        'X-Request-With': 'https://www.nicovideo.jp',
      },
      body,
    });
    return result as Promise<unknown>;
  },
};

//===END===

export { PlaybackPosition };
