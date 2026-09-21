/* eslint-disable @typescript-eslint/only-throw-error, @typescript-eslint/prefer-promise-reject-errors --
  セッション管理の既存契約として文字列・プレーンオブジェクトでthrow/rejectする（呼び出し側が文字列比較で分岐する）。
  Error化すると呼び出し側の分岐が壊れるため、ランタイム同一を優先して維持する。 */
import { workerUtil } from '../infra/worker-util';
import { StoryboardCacheDb } from './storyboard-cache-db';

interface UtilFetchParams {
  timeout?: number;
  method?: string;
  headers?: Record<string, string | number>;
  credentials?: string;
  body?: string;
  dataType?: string;
  [key: string]: unknown;
}

interface VideoWorkerScope {
  xFetch?: (url: string, params?: UtilFetchParams) => Promise<Response>;
  onmessage?: ((message: WorkerMessage) => Promise<unknown>) | null;
}

interface WorkerMessage {
  command: string;
  params?: unknown;
}

interface CrossMessageWorker {
  post: (message: { command: string; params?: unknown }) => Promise<unknown>;
}

interface WorkerUtilLike {
  createCrossMessageWorker: (func: (self: VideoWorkerScope) => void, options?: { name?: string }) => CrossMessageWorker;
}

interface WorkerDomandInfo {
  videoId?: string;
  accessRightKey?: string;
  availableVideos: Array<{ id: string; label: string }>;
  availableVideoIds?: Array<string>;
  availableAudioIds?: Array<string>;
  [key: string]: unknown;
}

interface SessionVideoInfo {
  domandInfo?: WorkerDomandInfo | null;
  actionTrackId?: string;
  duration?: number;
  watchId?: string;
  toJSON?: () => unknown;
  [key: string]: unknown;
}

interface VideoSessionParams {
  videoInfo: SessionVideoInfo;
  videoQuality?: string;
  useHLS?: boolean;
}

interface VideoSessionCreateParams {
  videoInfo: SessionVideoInfo;
  videoQuality?: string;
  useHLS?: boolean;
}

interface SessionInfo {
  url?: string;
  video?: { format?: string; label?: string };
  audioFormat?: string;
}

interface StoryboardShape {
  version: string;
  thumbnail: { width?: number; height?: number };
  columns: number;
  rows: number;
  interval: number;
  quality: number;
  images: Array<{ timestamp?: number; url: string; buffer?: ArrayBuffer }>;
  [key: string]: unknown;
}

interface DomandStoryboardRaw {
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  images: Array<{ url: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

//===BEGIN===

const VideoSessionWorker = (() => {
  const func = function (self: VideoWorkerScope): void {
    const util: { fetch: (url: string, params?: UtilFetchParams) => Promise<Response> } = {
      fetch(url: string, params: UtilFetchParams = {}): Promise<Response> {
        // ブラウザによっては location.origin は 'blob:' しか入らない
        if (
          !location.origin.endsWith('.nicovideo.jp') &&
          !new RegExp('^blob:https?://[a-z0-9]+\\.nicovideo\\.jp/').test(location.href)
        ) {
          return self.xFetch!(url, params);
        }
        const racers: Array<Promise<unknown>> = [];
        let timer: ReturnType<typeof setTimeout> | null = null;

        const timeout = typeof params.timeout === 'number' && !isNaN(params.timeout) ? params.timeout : 30 * 1000;
        if (timeout > 0) {
          racers.push(
            new Promise<void>((resolve, reject) => {
              timer = setTimeout(() => (timer ? reject({ name: 'timeout', message: 'timeout' }) : resolve()), timeout);
            })
          );
        }

        const controller = AbortController ? new AbortController() : null;
        if (controller) {
          params.signal = controller.signal;
        }
        racers.push(fetch(url, params as unknown as RequestInit));
        const raced: unknown = Promise.race(racers)
          .catch((err: { name?: string; message?: unknown }) => {
            if (err.name === 'timeout') {
              console.warn('request timeout', url, params);
              if (controller) {
                controller.abort();
              }
            }
            return Promise.reject(err.message || err);
          })
          .finally(() => (timer = null));
        return raced as Promise<Response>;
      },
    };

    abstract class VideoSession {
      _videoInfo: SessionVideoInfo;
      _videoQuality: string;
      _videoSessionInfo: SessionInfo;
      _isDeleted: boolean;
      _useHLS: boolean;
      abstract _createSession(): Promise<SessionInfo & { type: string }>;
      abstract _deleteSession(): Promise<unknown>;

      static create(params: VideoSessionCreateParams) {
        return new DomandSession(params);
      }

      constructor({ videoInfo, videoQuality, useHLS }: VideoSessionParams) {
        this._videoInfo = videoInfo;

        this._videoQuality = videoQuality || 'auto';
        this._videoSessionInfo = {};
        this._isDeleted = false;

        this._useHLS = !!useHLS;
      }

      async connect() {
        return await this._createSession();
      }

      async close() {
        return await this._deleteSession();
      }

      get serverType(): string {
        return 'unknown';
      }

      get info(): SessionInfo & { type: string } {
        return { ...this._videoSessionInfo, type: this.serverType };
      }

      set info({ url, video, audioFormat }: SessionInfo) {
        this._videoSessionInfo = {
          url,
          video,
          audioFormat,
        };
      }

      get isDeleted() {
        return !!this._isDeleted;
      }
    }

    class DomandSession extends VideoSession {
      _expireTime: Date;
      _domandInfo: WorkerDomandInfo;

      constructor(params: VideoSessionParams) {
        super(params);
        this._expireTime = new Date();
        this._domandInfo = this._videoInfo.domandInfo!;
      }

      async _createSession(): Promise<SessionInfo & { type: string }> {
        if (!this._useHLS) {
          throw new Error('HLSに未対応');
        }
        const { availableVideos } = this._domandInfo;
        const audioFormat = this._domandInfo.availableAudioIds![0];
        let videos: Array<string>;
        let videoFormat: string;
        let videoLabel: string;
        if (this._videoQuality === 'auto') {
          videos = this._domandInfo.availableVideoIds!;
          const { id, label } = availableVideos[0]!;
          videoFormat = id;
          videoLabel = label;
        } else {
          const video = (availableVideos.find((v) => v.label === this._videoQuality) ?? availableVideos[0])!;
          videoFormat = video.id;
          videoLabel = video.label;
          videos = [videoFormat];
        }

        const query = new URLSearchParams({ actionTrackId: this._videoInfo.actionTrackId as string });
        const url = `https://nvapi.nicovideo.jp/v1/watch/${this._domandInfo.videoId}/access-rights/hls?${query.toString()}`;
        const rawResult: unknown = await util
          .fetch(url, {
            method: 'post',
            headers: {
              'Content-Type': 'application/json',
              'X-Frontend-Id': 6,
              'X-Frontend-Version': '0',
              'X-Request-With': 'https://www.nicovideo.jp',
              'X-Access-Right-Key': this._domandInfo.accessRightKey as string,
            },
            credentials: 'include',
            body: JSON.stringify(this._buildOutputsMatrix(videos, audioFormat)),
          })
          .then((res: Response) => {
            if (!res.ok) throw new Error(`動画配信APIの取得失敗: HTTP ${res.status}`);
            return res.json();
          });
        const result = rawResult as {
          meta?: { status?: number };
          data?: { contentUrl?: string; expireTime?: string };
        } | null;
        if (
          !result ||
          typeof result.meta?.status !== 'number' ||
          result.meta.status < 200 ||
          result.meta.status >= 300 ||
          typeof result.data?.contentUrl !== 'string' ||
          !/^https?:\/\//.test(result.data.contentUrl)
        ) {
          throw new Error('動画配信APIの応答が不正です');
        }

        const lastResponse = result.data || {};
        const {
          contentUrl,
          // createTime,
          expireTime,
        } = lastResponse;
        this._expireTime = new Date(expireTime as string);

        this.info = {
          url: contentUrl,
          video: {
            format: videoFormat,
            label: videoLabel,
          },
          audioFormat,
        };
        return this.info;
      }

      // eslint-disable-next-line @typescript-eslint/require-await -- 旧実装はasyncでPromiseを返却する契約のため維持する
      async _deleteSession() {
        if (this._isDeleted) {
          return;
        }
        this._isDeleted = true;
      }

      get isDeleted() {
        if (this._isDeleted) {
          return true;
        }
        if (Date.now() > this._expireTime.getTime()) {
          this._isDeleted = true;
        }
        return this._isDeleted;
      }

      get serverType() {
        return 'domand';
      }

      _buildOutputsMatrix(videoIds: Array<string>, audio: string | undefined) {
        return {
          outputs: videoIds.map((v) => [v, audio]),
        };
      }
    }

    class StoryboardInfoLoader {
      _url?: string;
      _duration: number;

      static create(params: { type?: string; url?: string }) {
        return new DomandStoryboardInfoLoader(params);
      }

      constructor({ url }: { url?: string }) {
        this._url = url;
        this._duration = 1;
      }

      load(): Promise<void> {
        throw new Error('not implemented');
      }

      get storyboard(): StoryboardShape | null {
        return {
          version: '1',
          thumbnail: {
            width: 160,
            height: 90,
          },
          columns: 1,
          rows: 1,
          interval: 1000,
          quality: 1,
          images: [
            {
              timestamp: 0,
              url: 'https://example.com',
            },
          ],
        };
      }

      get duration(): number {
        return this._duration;
      }

      set duration(value: number) {
        this._duration = value;
      }

      async getStoryboardWithImages() {
        const storyboard = this.storyboard!;
        const fetchImages = storyboard.images.map(async (image) => {
          try {
            const res = await fetch(image.url);
            return {
              ...image,
              buffer: await res.arrayBuffer(),
            };
          } catch {
            return image;
          }
        });
        const count = Math.ceil((this.duration * 1000) / storyboard.interval);
        return {
          ...storyboard,
          count,
          images: await Promise.all(fetchImages),
        };
      }

      async _getInfo() {
        return {
          duration: this.duration,
          storyboard: await this.getStoryboardWithImages(),
        };
      }

      async getInfo() {
        return {
          ...(await this._getInfo()),
          format: 'unknown',
        };
      }

      _toJSON() {
        return {
          duration: this.duration,
          storyboard: this.storyboard,
        };
      }

      toJSON() {
        return {
          ...this._toJSON(),
          format: 'unknown',
        };
      }
    }

    class DomandStoryboardInfoLoader extends StoryboardInfoLoader {
      _rawData: DomandStoryboardRaw | null;

      constructor(params: { url?: string }) {
        super(params);
        this._rawData = null;
      }

      async load(): Promise<void> {
        try {
          const result = await util.fetch(this._url as string, { credentials: 'include' });
          const rawBody: unknown = await result.json();
          this._rawData = rawBody as DomandStoryboardRaw;
        } catch {
          throw 'storyboard request fail';
        }
      }

      get storyboard(): StoryboardShape | null {
        if (this._rawData == null) {
          return null;
        }
        const { thumbnailWidth: width, thumbnailHeight: height, images, ...sbInfo } = this._rawData;
        return {
          ...sbInfo,
          thumbnail: {
            width,
            height,
          },
          images: images.map((image) => {
            const url = new URL(this._url as string);
            const name = image.url;
            url.pathname = url.pathname.replace(/storyboard\.json$/, name);
            image.url = url.toString();
            return image;
          }),
        } as unknown as StoryboardShape;
      }

      async getInfo() {
        return {
          ...(await this._getInfo()),
          format: 'domand',
        };
      }

      toJSON() {
        return {
          ...this._toJSON(),
          format: 'domand',
        };
      }
    }

    abstract class StoryboardSession {
      _videoInfo: SessionVideoInfo;

      static create(params: { videoInfo: SessionVideoInfo }) {
        return new DomandStoryboardSession(params);
      }

      constructor({ videoInfo }: { videoInfo: SessionVideoInfo }) {
        this._videoInfo = videoInfo;
      }

      async create(): Promise<{ type: string; url?: string }> {
        return await this._createSession();
      }

      abstract _createSession(): Promise<{ type: string; url?: string }>;
    }

    class DomandStoryboardSession extends StoryboardSession {
      _info: WorkerDomandInfo;

      constructor(params: { videoInfo: SessionVideoInfo }) {
        super(params);
        this._info = this._videoInfo.domandInfo!;
      }

      async _createSession(): Promise<{ type: string; url?: string }> {
        const query = new URLSearchParams({ actionTrackId: this._videoInfo.actionTrackId as string });
        const url = `https://nvapi.nicovideo.jp/v1/watch/${this._info.videoId}/access-rights/storyboard?${query.toString()}`;
        try {
          const rawResult: unknown = await util
            .fetch(url, {
              method: 'post',
              headers: {
                'Content-Type': 'application/json',
                'X-Frontend-Id': 6,
                'X-Frontend-Version': '0',
                'X-Request-With': 'https://www.nicovideo.jp',
                'X-Access-Right-Key': this._info.accessRightKey as string,
              },
              credentials: 'include',
            })
            .then((res: Response) => res.json());
          const result = rawResult as { meta: { status?: number }; data?: { contentUrl?: string } };
          if (result.meta.status && result.meta.status >= 300) {
            throw 'api_not_exist';
          }
          return this._toSessionInfo(result.data!);
        } catch (err) {
          if (err === 'api_not_exist') {
            throw 'Domand storyboard api not exist';
          }
          console.error('create domand session fail', err);
          throw 'create domand session fail';
        }
      }

      _toSessionInfo({ contentUrl: url }: { contentUrl?: string }) {
        return {
          type: 'domand',
          url,
        };
      }
    }

    const SESSION_ID = Symbol('SESSION_ID');
    const getSessionId = function (this: { id: number }) {
      return `session_${this.id++}`;
    }.bind({ id: 0 });

    let current: VideoSession | null = null;
    const create = (params: VideoSessionCreateParams) => {
      if (current) {
        void current.close();
        current = null;
      }
      current = VideoSession.create(params);
      const sessionId = getSessionId();
      (current as unknown as Record<symbol, string>)[SESSION_ID] = sessionId;

      // console.log('create', sessionId, current[SESSION_ID]);
      return {
        sessionId,
      };
    };

    const connect = async () => {
      // console.log('connect', sessionId, current[SESSION_ID]);
      return current!.connect();
    };

    const getState = () => {
      if (!current) {
        return {};
      }
      // console.log('getState', sessionId, current[SESSION_ID]);
      return {
        isDeleted: current.isDeleted,
        isAbnormallyClosed: false,
        sessionId: (current as unknown as Record<symbol, string>)[SESSION_ID],
      };
    };

    const close = (): void => {
      // current && console.log('close', sessionId, current[SESSION_ID]);
      if (current) {
        void current.close();
      }
      current = null;
    };

    const storyboard = async ({ videoInfo }: { videoInfo: SessionVideoInfo }) => {
      const sbSessionInfo = await StoryboardSession.create({ videoInfo }).create();
      const loader = StoryboardInfoLoader.create(sbSessionInfo);
      loader.duration = videoInfo.duration as number;
      await loader.load();
      try {
        const sbInfo = await loader.getInfo();
        return {
          ...sbInfo,
          status: 'ok',
          watchId: videoInfo.watchId,
        };
      } catch {
        return {
          watchId: videoInfo.watchId,
          status: 'fail',
        };
      }
    };

    self.onmessage = async ({ command, params }: WorkerMessage) => {
      switch (command) {
        case 'create':
          return create(params as VideoSessionCreateParams);
        case 'connect':
          return await connect();
        case 'getState':
          return getState();
        case 'close':
          return close();
        case 'storyboard':
          return await storyboard(params as { videoInfo: SessionVideoInfo });
      }
    };
  };

  let worker: CrossMessageWorker | undefined;
  const initWorker = () => {
    if (worker) {
      return worker;
    }
    worker =
      worker ||
      (workerUtil as unknown as WorkerUtilLike).createCrossMessageWorker(func, { name: 'VideoSessionWorker' });
    return worker;
  };
  const create = async ({
    videoInfo,
    videoQuality,
    useHLS,
  }: {
    videoInfo: { toJSON: () => unknown };
    videoQuality?: string;
    useHLS?: boolean;
  }) => {
    initWorker();
    const params = {
      videoInfo: videoInfo.toJSON(),
      videoQuality,
      useHLS,
    };
    const rawResult: unknown = await worker!.post({ command: 'create', params });
    const result = rawResult as { sessionId?: string; [key: string]: unknown };
    const sessionId = result.sessionId;
    return Object.assign(result, {
      connect: () => worker!.post({ command: 'connect', params: { sessionId } }),
      getState: () => worker!.post({ command: 'getState', params: { sessionId } }),
      close: () => worker!.post({ command: 'close', params: { sessionId } }),
    });
  };

  const storyboard = async ({ info }: { info: { toJSON: () => unknown; watchId?: string } }) => {
    const videoInfo: unknown = info.toJSON();
    const cacheId = `${info.watchId as string}_domand`;
    const cache: unknown = await StoryboardCacheDb.get(cacheId);
    if (cache) {
      return cache;
    }
    initWorker();
    const params = { videoInfo };
    const result: unknown = await worker!.post({ command: 'storyboard', params });
    void StoryboardCacheDb.put(cacheId, result as { status?: string; [key: string]: unknown });
    return result;
  };

  return { initWorker, create, storyboard };
})();

//===END===

export { VideoSessionWorker };
