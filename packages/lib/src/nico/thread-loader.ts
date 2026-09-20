/* eslint-disable @typescript-eslint/only-throw-error --
  Nico APIラッパーの既存契約としてプレーンオブジェクトでthrowする（呼び出し側がresult/status/errorCodeで分岐する）。
  Error化すると呼び出し側の分岐が壊れるため、ランタイム同一を優先して維持する。 */
import { PopupMessage } from '../ui/popup-message';
import { sleep } from '../infra/sleep';
import { netUtil } from '../infra/net-util';

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

interface PopupLike {
  alert: (message: string) => unknown;
}

interface NvApiMeta {
  status: number;
  [key: string]: unknown;
}

interface NvApiEnvelope<T = Record<string, unknown>> {
  meta: NvApiMeta;
  data: T;
}

interface ThreadKeyData {
  threadKey: string;
  [key: string]: unknown;
}

interface PostKeyData {
  postKey: string;
  [key: string]: unknown;
}

interface DeleteKeyData {
  deleteKey: string;
  [key: string]: unknown;
}

interface NicoruKeyData {
  nicoruKey: string;
  [key: string]: unknown;
}

interface PostResultData {
  no?: number;
  id?: string;
  nicoruId?: string;
  nicoruCount?: number;
  [key: string]: unknown;
}

interface ThreadLoadData {
  globalComments: Array<{ count: number }>;
  threads: Array<{ id: string; fork: string; commentCount: number; info?: unknown }>;
  [key: string]: unknown;
}

interface NvCommentParams {
  language?: string;
  [key: string]: unknown;
}

interface ThreadMsgInfo {
  videoId: string;
  userId?: unknown;
  threadId?: string;
  language?: string;
  when?: number;
  threads?: Array<{ id: string | number; forkLabel?: string; fork?: string }>;
  defaultThread?: { is184Forced?: boolean };
  threadInfo?: ThreadInfoData;
  nvComment: {
    params: NvCommentParams;
    server: string;
    threadKey?: string;
  };
  [key: string]: unknown;
}

interface ThreadInfoData {
  userId?: unknown;
  videoId: string;
  threadId?: string;
  is184Forced?: boolean;
  totalResCount: number;
  language?: string;
  when?: number;
  isWaybackMode: boolean;
}

interface ThreadLoadOptions {
  retrying?: boolean;
  language?: string;
  fork?: string;
  [key: string]: unknown;
}

interface ChatInfo {
  no: number;
  fork?: number;
  text?: string;
  [key: string]: unknown;
}

import { global } from '../../../../src/futatsume-watch-index';
const debug = global.debug;

//===BEGIN===

const { ThreadLoader } = (() => {
  const FRONT_ID = '6';
  const FRONT_VER = '0';

  const FORK_LABEL: Record<number, string> = {
    0: 'main',
    1: 'owner',
    2: 'easy',
    3: 'ai',
  };

  class ThreadLoader {
    _threadKeys: Record<string, string>;

    constructor() {
      this._threadKeys = {};
    }

    async getThreadKey(videoId: string): Promise<ThreadKeyData> {
      const url = `https://nvapi.nicovideo.jp/v1/comment/keys/thread?videoId=${videoId}`;

      console.log('getThreadKey url: ', url);
      try {
        const raw: unknown = await (netUtil as unknown as NetUtilLike)
          .fetch(url, {
            headers: {
              'X-Frontend-Id': FRONT_ID,
              'X-Frontend-Version': FRONT_VER,
            },
            credentials: 'include',
          })
          .then((res: Response) => res.json());
        const { meta, data } = raw as NvApiEnvelope<ThreadKeyData>;
        if (meta.status >= 300) {
          throw meta;
        }
        this._threadKeys[videoId] = data.threadKey;
        return data;
      } catch (result) {
        throw { result, message: `ThreadKeyの取得失敗 ${videoId}` };
      }
    }

    async getPostKey(threadId: string): Promise<PostKeyData> {
      const url = `https://nvapi.nicovideo.jp/v1/comment/keys/post?threadId=${threadId}`;

      console.log('getPostKey url: ', url);
      try {
        const raw: unknown = await (netUtil as unknown as NetUtilLike)
          .fetch(url, {
            headers: {
              'X-Frontend-Id': FRONT_ID,
              'X-Frontend-Version': FRONT_VER,
            },
            credentials: 'include',
          })
          .then((res: Response) => res.json());
        const { meta, data } = raw as NvApiEnvelope<PostKeyData>;
        if (meta.status >= 300) {
          throw meta;
        }
        return data;
      } catch (result) {
        throw { result, message: `PostKeyの取得失敗 ${threadId}` };
      }
    }

    async _delete(url: URL, body: string): Promise<void> {
      try {
        const raw: unknown = await (netUtil as unknown as NetUtilLike)
          .fetch(url, {
            method: 'PUT',
            headers: {
              'X-Frontend-Id': FRONT_ID,
              'X-Frontend-Version': FRONT_VER,
              'Content-Type': 'text/plain; charset=UTF-8',
            },
            body,
          })
          .then((res: Response) => res.json());
        const { meta } = raw as NvApiEnvelope;
        if (meta.status >= 300) {
          throw meta;
        }
      } catch (result) {
        throw {
          result,
          message: `コメントの通信失敗`,
        };
      }
    }

    async _post(url: URL, body: string): Promise<PostResultData> {
      try {
        const raw: unknown = await (netUtil as unknown as NetUtilLike)
          .fetch(url, {
            method: 'POST',
            headers: {
              'X-Frontend-Id': FRONT_ID,
              'X-Frontend-Version': FRONT_VER,
              'Content-Type': 'text/plain; charset=UTF-8',
            },
            body,
          })
          .then((res: Response) => res.json());
        const { meta, data } = raw as NvApiEnvelope<PostResultData>;
        if (meta.status >= 300) {
          throw meta;
        }
        return data;
      } catch (result) {
        throw {
          result,
          message: `コメントの通信失敗`,
        };
      }
    }

    async _load(msgInfo: ThreadMsgInfo, options: ThreadLoadOptions = {}): Promise<ThreadLoadData> {
      const { params, server, threadKey } = msgInfo.nvComment;

      const packet: { additionals: Record<string, unknown>; params: NvCommentParams; threadKey?: string } = {
        additionals: {},
        params,
        threadKey,
      };

      if (options.retrying) {
        const info = await this.getThreadKey(msgInfo.videoId);
        console.log('threadKey: ', msgInfo.videoId, info);
        packet.threadKey = info.threadKey;
      }

      if (msgInfo.language !== params.language) {
        packet.params.language = msgInfo.language;
      }

      if ((msgInfo.when || 0) > 0) {
        packet.additionals.when = msgInfo.when;
      }

      const url = new URL('/v1/threads', server);
      console.log('load threads...', url, packet);
      try {
        const raw: unknown = await (netUtil as unknown as NetUtilLike)
          .fetch(url, {
            method: 'POST',
            headers: {
              'X-Frontend-Id': FRONT_ID,
              'X-Frontend-Version': FRONT_VER,
              'Content-Type': 'text/plain; charset=UTF-8',
            },
            body: JSON.stringify(packet),
          })
          .then((res: Response) => res.json());
        const { meta, data } = raw as NvApiEnvelope<ThreadLoadData>;
        if (meta.status >= 300) {
          throw meta;
        }
        return data;
      } catch (result) {
        throw {
          result,
          message: `コメントの通信失敗`,
        };
      }
    }

    async load(
      msgInfo: ThreadMsgInfo,
      options: ThreadLoadOptions = {}
    ): Promise<{ threadInfo: ThreadInfoData; body: ThreadLoadData; format: string }> {
      const { videoId, userId } = msgInfo;

      const timeKey = `loadComment videoId: ${videoId}`;
      console.time(timeKey);

      let result: ThreadLoadData;
      try {
        result = await this._load(msgInfo, options);
      } catch (e) {
        console.timeEnd(timeKey);
        window.console.error('loadComment fail 1st: ', e);
        (PopupMessage as unknown as PopupLike).alert('コメントの取得失敗: 3秒後にリトライ');

        await sleep(3000);
        try {
          console.time(timeKey);
          result = await this._load(msgInfo, { retrying: true, ...options });
        } catch (e) {
          console.timeEnd(timeKey);
          window.console.error('loadComment fail finally: ', e);
          throw {
            message: 'コメントサーバーの通信失敗',
          };
        }
      }

      console.timeEnd(timeKey);
      debug.lastMessageServerResult = result;

      let totalResCount: number = result.globalComments.reduce((count, current) => count + current.count, 0);
      for (const thread of result.threads) {
        const fork = thread.fork;
        thread.info = msgInfo.threads!.find(({ id, forkLabel }) => `${id}` === thread.id && forkLabel === fork);
        // 投稿者コメントはGlobalにカウントされていない
        if (fork === 'easy') {
          // かんたんコメントをカウントしていない挙動に合わせる。不要？
          const resCount = thread.commentCount;
          totalResCount -= resCount;
        }
      }

      const threadInfo: ThreadInfoData = {
        userId,
        videoId,
        threadId: msgInfo.threadId,
        is184Forced: msgInfo.defaultThread!.is184Forced,
        totalResCount,
        language: msgInfo.language,
        when: msgInfo.when,
        isWaybackMode: !!msgInfo.when,
      };

      msgInfo.threadInfo = threadInfo;

      console.log('threadInfo: ', threadInfo);
      return { threadInfo, body: result, format: 'threads' };
    }

    async postChat(
      msgInfo: ThreadMsgInfo,
      text: string,
      cmd: string | undefined,
      vpos: number,
      retrying = false
    ): Promise<{ status: string; no?: number; id?: string; message: string; statusCode?: number }> {
      const { videoId, threadId } = msgInfo.threadInfo!;
      const url = new URL(`/v1/threads/${threadId}/comments`, msgInfo.nvComment.server);
      const { postKey } = await this.getPostKey(threadId as string);

      const packet = JSON.stringify({
        body: text,
        commands: cmd?.split(/[\x20\xA0\u3000\t\u2003\s]+/) ?? [],
        vposMs: Math.floor((vpos || 0) * 10),
        postKey,
        videoId,
      });
      console.log('post packet: ', packet);
      try {
        const { no, id } = await this._post(url, packet);
        return {
          status: 'ok',
          no,
          id,
          message: 'コメント投稿成功',
        };
      } catch (error) {
        const {
          result: { status: statusCode, errorCode },
        } = error as { result: { status?: number; errorCode?: string } };
        if (statusCode == null) {
          throw {
            status: 'fail',
            message: `コメント投稿失敗`,
          };
        }
        if (!retrying && ['INVALID_TOKEN', 'EXPIRED_TOKEN'].includes(errorCode as string)) {
          await this.load(msgInfo);
        } else {
          throw {
            status: 'fail',
            statusCode,
            message: errorCode ? `コメント投稿失敗 ${errorCode}` : 'コメント投稿失敗',
          };
        }
        await sleep(3000);
        return await this.postChat(msgInfo, text, cmd, vpos, true);
      }
    }

    async getDeleteKey(threadId: string, options: ThreadLoadOptions = {}): Promise<DeleteKeyData> {
      const url = `https://nvapi.nicovideo.jp/v1/comment/keys/delete?threadId=${threadId}&fork=${options.fork || 'main'}`;

      console.log('getNicoruKey url: ', url);
      try {
        const raw: unknown = await (netUtil as unknown as NetUtilLike)
          .fetch(url, {
            headers: {
              'X-Frontend-Id': FRONT_ID,
              'X-Frontend-Version': FRONT_VER,
              'X-Niconico-Language': options.language || 'ja-jp',
            },
            credentials: 'include',
          })
          .then((res: Response) => res.json());
        const { meta, data } = raw as NvApiEnvelope<DeleteKeyData>;
        if (meta.status >= 300) {
          throw meta;
        }
        return data;
      } catch (result) {
        throw { result, message: `DeleteKeyの取得失敗 ${threadId}` };
      }
    }

    async deleteChat(msgInfo: ThreadMsgInfo, chat: ChatInfo) {
      const { videoId, threadId, language } = msgInfo.threadInfo!;
      const url = new URL(`/v1/threads/${threadId}/comment-comment-owner-deletions`, msgInfo.nvComment.server);
      const fork = FORK_LABEL[chat.fork || 0];
      const { deleteKey } = await this.getDeleteKey(threadId as string, { language, fork });
      const packet = JSON.stringify({
        deleteKey,
        fork,
        language,
        targets: [
          {
            no: chat.no,
            operation: 'DELETE',
          },
        ],
        videoId,
      });
      console.log('put packet: ', packet);
      try {
        await this._delete(url, packet);
        return {
          status: 'ok',
          message: 'コメント削除成功',
        };
      } catch (error) {
        const {
          result: { status: statusCode, errorCode },
        } = error as { result: { status?: number; errorCode?: string } };
        throw {
          status: 'fail',
          statusCode,
          message: errorCode ? `コメント削除失敗 ${errorCode}` : 'コメント削除失敗',
        };
      }
    }

    async getNicoruKey(threadId: string, options: ThreadLoadOptions = {}): Promise<NicoruKeyData> {
      const url = `https://nvapi.nicovideo.jp/v1/comment/keys/nicoru?threadId=${threadId}`;

      console.log('getNicoruKey url: ', url);
      try {
        const raw: unknown = await (netUtil as unknown as NetUtilLike)
          .fetch(url, {
            headers: {
              'X-Frontend-Id': FRONT_ID,
              'X-Frontend-Version': FRONT_VER,
              'X-Niconico-Language': options.language || 'ja-jp',
            },
            credentials: 'include',
          })
          .then((res: Response) => res.json());
        const { meta, data } = raw as NvApiEnvelope<NicoruKeyData>;
        if (meta.status >= 300) {
          throw meta;
        }
        return data;
      } catch (result) {
        throw { result, message: `NicoruKeyの取得失敗 ${threadId}` };
      }
    }

    async nicoru(msgInfo: ThreadMsgInfo, chat: ChatInfo) {
      const { videoId, threadId, language } = msgInfo.threadInfo!;
      const url = new URL(`/v1/threads/${threadId}/nicorus`, msgInfo.nvComment.server);
      const { nicoruKey } = await this.getNicoruKey(threadId as string, { language });
      const packet = JSON.stringify({
        content: chat.text,
        fork: FORK_LABEL[chat.fork || 0],
        no: chat.no,
        nicoruKey,
        videoId,
      });
      console.log('post packet: ', packet);
      try {
        const { nicoruId, nicoruCount } = await this._post(url, packet);
        return {
          status: 'ok',
          id: nicoruId,
          count: nicoruCount,
          message: 'ニコれた',
        };
      } catch (error) {
        const {
          result: { status: statusCode, errorCode },
        } = error as { result: { status?: number; errorCode?: string } };
        throw {
          status: 'fail',
          statusCode,
          message: errorCode ? `ニコれなかった＞＜ ${errorCode}` : 'ニコれなかった＞＜',
        };
      }
    }
  }

  return { ThreadLoader: new ThreadLoader() };
})();

//===END===

export { ThreadLoader };
