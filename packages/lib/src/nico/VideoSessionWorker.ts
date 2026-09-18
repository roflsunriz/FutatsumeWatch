/* eslint-disable @typescript-eslint/only-throw-error, @typescript-eslint/prefer-promise-reject-errors --
  セッション管理の既存契約として文字列・プレーンオブジェクトでthrow/rejectする（呼び出し側が文字列比較で分岐する）。
  Error化すると呼び出し側の分岐が壊れるため、ランタイム同一を優先して維持する。 */
import { workerUtil } from '../infra/workerUtil';
import { StoryboardCacheDb } from './StoryboardCacheDb';

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

interface WorkerDmcInfo {
  playerId: string;
  authTypes: Record<string, string>;
  contentKeyTimeout: number;
  serviceUserId: string;
  contentId: string;
  heartbeatLifetime: number;
  priority: number;
  recipeId: string;
  signature: string;
  token: string;
  transferPreset?: string;
  encryption?: { encryptedKey: string; keyUri: string };
  protocols: Array<string>;
  availableVideoIds: Array<string>;
  availableAudioIds: Array<string>;
  availableVideos: Array<{ id: string; metadata: { label: string } }>;
  urls: Array<{ url: string; is_well_known_port: boolean }>;
  [key: string]: unknown;
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
  dmcInfo?: WorkerDmcInfo | null;
  dmcStoryboardInfo?: {
    playerId: string;
    authTypes: Record<string, string>;
    contentKeyTimeout: number;
    serviceUserId: string;
    contentId: string;
    videos: Array<unknown>;
    heartbeatLifetime: number;
    priority: number;
    recipeId: string;
    signature: string;
    token: string;
    urls: Array<{ url: string }>;
  } | null;
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
  serverType: string;
  videoInfo: SessionVideoInfo;
  videoQuality?: string;
  useHLS?: boolean;
}

interface SessionInfo {
  url?: string;
  sessionId?: string;
  video?: { format?: string; label?: string };
  audioFormat?: string;
  heartBeatUrl?: string;
  deleteSessionUrl?: string;
  lastResponse?: unknown;
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

interface DmcStoryboardRaw {
  storyboards?: Array<{
    images: Array<{ timestamp: number; uri: string }>;
    thumbnail_width: number;
    thumbnail_height: number;
    columns: number;
    rows: number;
    interval: number;
    quality: number;
  }>;
  version?: number;
}
//===BEGIN===

const VideoSessionWorker = (() => {
  const func = function (self: VideoWorkerScope): void {
    const SMILE_HEART_BEAT_INTERVAL_MS = 10 * 60 * 1000; // 10min
    const DMC_HEART_BEAT_INTERVAL_MS = 30 * 1000; // 30sec

    const SESSION_CLOSE_FAIL_COUNT = 3;

    const VIDEO_QUALITY: Record<string, string> = {
      auto: 'auto',
      veryhigh: '1080p',
      high: '720p',
      mid: '480p',
      low: '360p',
      verylow: '低画質',
    };

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

    class DmcPostData {
      _dmcInfo: WorkerDmcInfo;
      _videoQuality: string;
      _useHLS: boolean;
      _useSSL: boolean;
      _useWellKnownPort: boolean;

      constructor(
        dmcInfo: WorkerDmcInfo,
        videoQuality: string | undefined,
        { useHLS = true, useSSL = false }: { useHLS?: boolean; useSSL?: boolean; useWellKnownPort?: boolean }
      ) {
        this._dmcInfo = dmcInfo;
        this._videoQuality = videoQuality || 'auto';
        this._useHLS = useHLS;
        this._useSSL = useSSL;
        this._useWellKnownPort = true;
      }

      toString(): string {
        const dmcInfo = this._dmcInfo;

        const label = VIDEO_QUALITY[this._videoQuality] || VIDEO_QUALITY.auto;
        let videos: Array<string>;
        if (label === VIDEO_QUALITY.auto) {
          videos = dmcInfo.availableVideoIds;
        } else {
          const { availableVideos } = dmcInfo;
          const video = (availableVideos.find((v) => label === v.metadata.label) ?? availableVideos[0])!;
          videos = [video.id];
        }

        const audio = dmcInfo.availableAudioIds[0];

        const contentSrcIdSets =
          this._useHLS && label === VIDEO_QUALITY.auto
            ? this._buildAbrContentSrcIdSets(videos, audio)
            : this._buildContentSrcIdSets(videos, audio);

        const http_parameters: { parameters?: unknown } = {};
        const parameters: {
          use_ssl: string;
          use_well_known_port: string;
          transfer_preset?: string;
          segment_duration?: number;
          encryption?: { hls_encryption_v1: { encrypted_key: string; key_uri: string } };
        } = {
          use_ssl: this._useSSL ? 'yes' : 'no',
          use_well_known_port: this._useWellKnownPort ? 'yes' : 'no',
          transfer_preset: dmcInfo.transferPreset,
        };
        if (this._useHLS) {
          parameters.segment_duration = 6000; //Config.getValue('video.hls.segmentDuration');
          if (dmcInfo.encryption) {
            parameters.encryption = {
              hls_encryption_v1: {
                encrypted_key: dmcInfo.encryption.encryptedKey,
                key_uri: dmcInfo.encryption.keyUri,
              },
            };
          }
        } else if (!dmcInfo.protocols.includes('http')) {
          throw new Error('HLSに未対応');
        }
        http_parameters.parameters = this._useHLS
          ? { hls_parameters: parameters }
          : { http_output_download_parameters: parameters };

        const request = {
          session: {
            client_info: {
              player_id: dmcInfo.playerId,
            },
            content_auth: {
              auth_type: dmcInfo.authTypes[this._useHLS ? 'hls' : 'http'] || 'ht2',
              content_key_timeout: dmcInfo.contentKeyTimeout,
              service_id: 'nicovideo',
              service_user_id: dmcInfo.serviceUserId,
              //max_content_count: 10,
            },
            content_id: dmcInfo.contentId,
            content_src_id_sets: contentSrcIdSets,
            content_type: 'movie',
            content_uri: '',
            keep_method: {
              heartbeat: { lifetime: dmcInfo.heartbeatLifetime },
            },
            priority: dmcInfo.priority,
            protocol: {
              name: 'http',
              parameters: { http_parameters },
            },
            recipe_id: dmcInfo.recipeId,

            session_operation_auth: {
              session_operation_auth_by_signature: {
                signature: dmcInfo.signature,
                token: dmcInfo.token,
              },
            },

            timing_constraint: 'unlimited',
          },
        };

        return JSON.stringify(request, null, 2);
      }

      _buildContentSrcIdSets(videos: Array<string>, audio: string | undefined) {
        return [
          {
            content_src_ids: [
              {
                src_id_to_mux: {
                  audio_src_ids: [audio],
                  video_src_ids: videos,
                },
              },
            ],
          },
        ];
      }

      _buildAbrContentSrcIdSets(videos: Array<string>, audio: string | undefined) {
        const v = videos.concat();
        const contentSrcIds: Array<{
          src_id_to_mux: { audio_src_ids: Array<string | undefined>; video_src_ids: Array<string> };
        }> = [];
        while (v.length > 0) {
          contentSrcIds.push({
            src_id_to_mux: {
              audio_src_ids: [audio],
              video_src_ids: v.concat(),
            },
          });
          v.shift();
        }
        return [{ content_src_ids: contentSrcIds }];
      }
    }

    abstract class VideoSession {
      _videoInfo: SessionVideoInfo;
      _isPlaying: () => boolean;
      _pauseCount: number;
      _failCount: number;
      _lastResponse: unknown;
      _videoQuality: string;
      _videoSessionInfo: SessionInfo;
      _isDeleted: boolean;
      _isAbnormallyClosed: boolean;
      _isClosed?: boolean;
      _createdAt!: number;
      _heartBeatInterval!: number;
      _heartBeatTimer: ReturnType<typeof setInterval> | null;
      _useSSL: boolean;
      _useHLS: boolean;
      _useWellKnownPort: boolean;
      _lastUpdate!: number;
      _heartbeatLifetime!: number;
      abstract _createSession(): Promise<SessionInfo & { type: string }>;
      _heartBeat(): void {}
      abstract _deleteSession(): Promise<unknown>;

      static create({ serverType, ...params }: VideoSessionCreateParams) {
        switch (serverType) {
          case 'domand':
            return new DomandSession(params);
          case 'dmc':
            return new DmcSession(params);
          default:
            throw new Error('Unknown server type');
        }
      }

      constructor({ videoInfo, videoQuality, useHLS }: VideoSessionParams) {
        this._videoInfo = videoInfo;

        this._isPlaying = () => true;
        this._pauseCount = 0;
        this._failCount = 0;
        this._lastResponse = '';
        this._videoQuality = videoQuality || 'auto';
        this._videoSessionInfo = {};
        this._isDeleted = false;
        this._isAbnormallyClosed = false;

        this._heartBeatTimer = null;

        this._useSSL = true;
        this._useHLS = !!useHLS;
        this._useWellKnownPort = true;

        this._onHeartBeatSuccess = this._onHeartBeatSuccess.bind(this);
        this._onHeartBeatFail = this._onHeartBeatFail.bind(this);
      }

      async connect() {
        this._createdAt = Date.now();
        return await this._createSession();
      }

      enableHeartBeat() {
        this.disableHeartBeat();
        this._heartBeatTimer = setInterval(this._onHeartBeatInterval.bind(this), this._heartBeatInterval);
      }

      changeHeartBeatInterval(interval: number) {
        if (this._heartBeatTimer) {
          clearInterval(this._heartBeatTimer);
        }
        this._heartBeatInterval = interval;
        this._heartBeatTimer = setInterval(this._onHeartBeatInterval.bind(this), this._heartBeatInterval);
      }

      disableHeartBeat() {
        if (this._heartBeatTimer) {
          clearInterval(this._heartBeatTimer);
        }
        this._heartBeatTimer = null;
      }

      _onHeartBeatInterval() {
        if (this._isClosed) {
          return;
        }
        this._heartBeat();
      }

      _onHeartBeatSuccess(_result: { data?: unknown }): void {}

      _onHeartBeatFail(): void {
        this._failCount++;
        if (this._failCount >= SESSION_CLOSE_FAIL_COUNT) {
          this._isAbnormallyClosed = true;
          void this.close();
        }
      }

      async close() {
        this._isClosed = true;
        this.disableHeartBeat();
        return await this._deleteSession();
      }

      get serverType(): string {
        return 'unknown';
      }

      get info(): SessionInfo & { type: string } {
        return { ...this._videoSessionInfo, type: this.serverType };
      }

      set info({ url, sessionId, video, audioFormat, heartBeatUrl, deleteSessionUrl, lastResponse }: SessionInfo) {
        this._videoSessionInfo = {
          url,
          sessionId,
          video,
          audioFormat,
          heartBeatUrl,
          deleteSessionUrl,
          lastResponse,
        };
      }

      get isDomand() {
        return this.serverType === 'domand';
      }

      get isDmc() {
        return this.serverType === 'dmc';
      }

      get isDeleted() {
        return !!this._isDeleted;
      }

      get isAbnormallyClosed() {
        return this._isAbnormallyClosed;
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
        console.time('create Domand session');
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
          .then((res: Response) => res.json());
        const result = rawResult as { meta: { status?: number }; data?: { contentUrl?: string; expireTime?: string } };
        if (result.meta.status == null || result.meta.status >= 300) {
          throw new Error('cannot create domand session', result as unknown as ErrorOptions);
        }

        this._lastResponse = result.data || {};
        const lastResponse = this._lastResponse as { contentUrl?: string; expireTime?: string };
        const {
          contentUrl,
          // createTime,
          expireTime,
        } = lastResponse;
        this._lastUpdate = Date.now();
        this._expireTime = new Date(expireTime as string);

        this.info = {
          url: contentUrl,
          video: {
            format: videoFormat,
            label: videoLabel,
          },
          audioFormat,
          lastResponse: result,
        };
        console.timeEnd('create Domand session');
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

    class DmcSession extends VideoSession {
      _heartBeatInterval: number;
      _dmcInfo: WorkerDmcInfo;
      _heartBeatUrl!: string;
      _deleteSessionUrl!: string;

      constructor(params: VideoSessionParams) {
        super(params);

        this._heartBeatInterval = DMC_HEART_BEAT_INTERVAL_MS;
        this._onHeartBeatSuccess = this._onHeartBeatSuccess.bind(this);
        this._onHeartBeatFail = this._onHeartBeatFail.bind(this);
        this._lastUpdate = Date.now();
        this._heartbeatLifetime = this._heartBeatInterval;
        this._dmcInfo = this._videoInfo.dmcInfo!;
      }

      _createSession(): Promise<SessionInfo & { type: string }> {
        const dmcInfo = this._dmcInfo;
        console.time('create DMC session');
        const baseUrl = (dmcInfo.urls.find((url) => url.is_well_known_port === this._useWellKnownPort) ||
          dmcInfo.urls[0])!.url;
        return new Promise<SessionInfo & { type: string }>((resolve, reject) => {
          const url = `${baseUrl}?_format=json`;

          this._heartbeatLifetime = dmcInfo.heartbeatLifetime;
          const postData = new DmcPostData(dmcInfo, this._videoQuality, {
            useHLS: this.useHLS,
            useSSL: url.startsWith('https://'),
            useWellKnownPort: true,
          });

          util
            .fetch(url, {
              method: 'post',
              timeout: 10000,
              dataType: 'text',
              body: postData.toString(),
            })
            .then((res: Response) => res.json())
            .then(
              (json: {
                data?: {
                  session?: {
                    id?: string;
                    content_uri?: string;
                    content_src_id_sets?: Array<{
                      content_src_ids: Array<{
                        src_id_to_mux: { video_src_ids: Array<string>; audio_src_ids: Array<string> };
                      }>;
                    }>;
                  };
                };
              }) => {
                const data = json.data || {},
                  session = data.session || {};
                const sessionId = session.id;
                const content_src_id_sets = session.content_src_id_sets!;
                const {
                  video_src_ids: [videoFormat],
                  audio_src_ids: [audioFormat],
                } = content_src_id_sets[0]!.content_src_ids[0]!.src_id_to_mux;

                this._heartBeatUrl = `${baseUrl}/${sessionId}?_format=json&_method=PUT`;
                this._deleteSessionUrl = `${baseUrl}/${sessionId}?_format=json&_method=DELETE`;

                this._lastResponse = data;

                this._lastUpdate = Date.now();
                this.info = {
                  url: session.content_uri,
                  sessionId,
                  video: {
                    format: videoFormat,
                    label: dmcInfo.availableVideos.find((v) => videoFormat === v.id)!.metadata.label,
                  },
                  audioFormat,
                  heartBeatUrl: this._heartBeatUrl,
                  deleteSessionUrl: this._deleteSessionUrl,
                  lastResponse: json,
                };
                this.enableHeartBeat();
                console.timeEnd('create DMC session');
                resolve(this.info);
              }
            )
            .catch((err: { message?: unknown }) => {
              console.error('create api fail', err);
              reject(err.message || err);
            });
        });
      }

      get useHLS(): boolean {
        return this._useHLS && this._dmcInfo.protocols.includes('hls');
      }

      _heartBeat(): void {
        const url = this.info.heartBeatUrl as string;
        void util
          .fetch(url, {
            method: 'post',
            dataType: 'text',
            timeout: 10000,
            body: JSON.stringify(this._lastResponse),
          })
          .then((res: Response) => res.json())
          .then((result: { data?: unknown }) => this._onHeartBeatSuccess(result))
          // eslint-disable-next-line @typescript-eslint/unbound-method -- コンストラクタでbind済みのメソッド参照であり、ランタイムは同一
          .catch(this._onHeartBeatFail);
      }

      _deleteSession(): Promise<unknown> {
        if (this._isDeleted) {
          return Promise.resolve();
        }
        this._isDeleted = true;
        const url = this.info.deleteSessionUrl as string;
        return new Promise((res) => setTimeout(res, 3000))
          .then(() => {
            return util.fetch(url, {
              method: 'post',
              dataType: 'text',
              timeout: 10000,
              body: JSON.stringify(this._lastResponse),
            });
          })
          .catch((err: unknown) => console.error('delete fail', err));
      }

      _onHeartBeatSuccess(result: { data?: unknown }): void {
        const json = result;
        this._lastResponse = json.data;
        this._lastUpdate = Date.now();
      }

      get isDeleted() {
        return !!this._isDeleted || Date.now() - this._lastUpdate > this._heartbeatLifetime * 1.2;
      }

      get serverType() {
        return 'dmc';
      }
    }

    class StoryboardInfoLoader {
      _url?: string;
      _duration: number;

      static create({ type, ...params }: { type: string; url?: string }) {
        switch (type) {
          case 'domand':
            return new DomandStoryboardInfoLoader(params);
          case 'dmc':
            return new DmcStoryboardInfoLoader(params);
          default:
            throw new Error('Unknown server type');
        }
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

    class DmcStoryboardInfoLoader extends StoryboardInfoLoader {
      _rawData: DmcStoryboardRaw | null;

      constructor(params: { url?: string }) {
        super(params);
        this._rawData = null;
      }

      async load(): Promise<void> {
        const rawResult: unknown = await util
          .fetch(this._url as string, { credentials: 'include' })
          .then((res: Response) => res.json());
        const result = rawResult as { meta: { status?: number }; data?: DmcStoryboardRaw };
        if (result.meta.status && result.meta.status >= 300) {
          throw 'storyboard request fail';
        }
        this._rawData = result.data as DmcStoryboardRaw;
        return;
      }

      get _storyboards(): Array<StoryboardShape> {
        const rawStoryboard: DmcStoryboardRaw = this._rawData ?? {};
        const storyboards = rawStoryboard.storyboards || [];
        const version = rawStoryboard.version || 0;
        const ver = version.toString();
        return storyboards
          .map((sb) => {
            const images = sb.images.map((img) => {
              return {
                timestamp: img.timestamp,
                url: img.uri,
              };
            });
            return {
              version: ver,
              thumbnail: {
                width: sb.thumbnail_width,
                height: sb.thumbnail_height,
              },
              columns: sb.columns,
              rows: sb.rows,
              interval: sb.interval,
              quality: sb.quality,
              images,
            };
          })
          .sort((a, b) => Number(b.quality < a.quality));
      }

      get storyboard(): StoryboardShape | null {
        if (this._storyboards.length > 0) {
          return this._storyboards[0] as StoryboardShape;
        }

        return null;
      }

      async getInfo() {
        return {
          ...(await this._getInfo()),
          format: 'dmc',
        };
      }

      toJSON() {
        return {
          ...this._toJSON(),
          format: 'dmc',
        };
      }
    }

    abstract class StoryboardSession {
      _videoInfo: SessionVideoInfo;

      static create({ serverType, ...params }: { serverType: string; videoInfo: SessionVideoInfo }) {
        switch (serverType) {
          case 'domand':
            return new DomandStoryboardSession(params);
          case 'dmc':
            return new DmcStoryboardSession(params);
          default:
            throw new Error('Unknown server type');
        }
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

    class DmcStoryboardSession extends StoryboardSession {
      _info: NonNullable<SessionVideoInfo['dmcStoryboardInfo']>;
      _url: string;

      constructor(params: { videoInfo: SessionVideoInfo }) {
        super(params);
        this._info = this._videoInfo.dmcStoryboardInfo!;
        this._url = this._info.urls[0]!.url;
      }

      async _createSession(): Promise<{ type: string; url?: string }> {
        const url = `${this._url}?_format=json`;
        const body = this._createRequestString();
        try {
          const rawResult: unknown = await util
            .fetch(url, {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
              },
              body,
            })
            .then((res: Response) => res.json());
          const result = rawResult as { meta: { status?: number }; data?: { session?: { content_uri?: string } } };
          const sessionData = result.data;
          if ((result.meta.status && result.meta.status >= 300) || !sessionData?.session?.content_uri) {
            throw 'api_not_exist';
          }
          return this._toSessionInfo(sessionData);
        } catch (err) {
          if (err === 'api_not_exist') {
            throw 'DMC storyboard api not exist';
          }
          console.error('create dmc session fail', err);
          throw 'create dmc session fail';
        }
      }

      _createRequestString() {
        const info = this._info;

        // 階層が深くて目が疲れた
        const request = {
          session: {
            client_info: {
              player_id: info.playerId,
            },
            content_auth: {
              auth_type: info.authTypes.storyboard,
              content_key_timeout: info.contentKeyTimeout,
              service_id: 'nicovideo',
              service_user_id: info.serviceUserId,
            },
            content_id: info.contentId,
            content_src_id_sets: [
              {
                content_src_ids: info.videos,
              },
            ],
            content_type: 'video',
            content_uri: '',
            keep_method: {
              heartbeat: {
                lifetime: info.heartbeatLifetime,
              },
            },
            priority: info.priority,
            protocol: {
              name: 'http',
              parameters: {
                http_parameters: {
                  parameters: {
                    storyboard_download_parameters: {
                      use_well_known_port: 'yes',
                      use_ssl: 'yes',
                    },
                  },
                },
              },
            },
            recipe_id: info.recipeId,
            session_operation_auth: {
              session_operation_auth_by_signature: {
                signature: info.signature,
                token: info.token,
              },
            },
            timing_constraint: 'unlimited',
          },
        };

        //console.log('storyboard session request', JSON.stringify(request, null, ' '));
        return JSON.stringify(request);
      }

      _toSessionInfo(info: { session?: { content_uri?: string } } | undefined) {
        return {
          type: 'dmc',
          url: info?.session?.content_uri,
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
        serverType: current.serverType,
        isDomand: current.isDomand,
        isDmc: current.isDmc,
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
        serverType: current.serverType,
        isDomand: current.isDomand,
        isDmc: current.isDmc,
        isDeleted: current.isDeleted,
        isAbnormallyClosed: current.isAbnormallyClosed,
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

    const storyboard = async ({ videoInfo, serverType }: { videoInfo: SessionVideoInfo; serverType: string }) => {
      const sbSessionInfo = await StoryboardSession.create({ videoInfo, serverType }).create();
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
          return await storyboard(params as { videoInfo: SessionVideoInfo; serverType: string });
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
    serverType,
    useHLS,
  }: {
    videoInfo: { toJSON: () => unknown };
    videoQuality?: string;
    serverType: string;
    useHLS?: boolean;
  }) => {
    initWorker();
    const params = {
      videoInfo: videoInfo.toJSON(),
      videoQuality,
      serverType,
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

  const storyboard = async ({ type, info }: { type: string; info: { toJSON: () => unknown; watchId?: string } }) => {
    const videoInfo: unknown = info.toJSON();
    const cacheId = `${info.watchId as string}_${type}`;
    const cache: unknown = await StoryboardCacheDb.get(cacheId);
    if (cache) {
      return cache;
    }
    initWorker();
    const params = { videoInfo, serverType: type };
    const result: unknown = await worker!.post({ command: 'storyboard', params });
    void StoryboardCacheDb.put(cacheId, result as { status?: string; [key: string]: unknown });
    return result;
  };

  return { initWorker, create, storyboard };
})();

//===END===

export { VideoSessionWorker };
