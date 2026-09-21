/* eslint-disable @typescript-eslint/only-throw-error --
  Nico APIラッパーの既存契約としてプレーンオブジェクトでthrowする（呼び出し側がresult/status/errorCodeで分岐する）。
  Error化すると呼び出し側の分岐が壊れるため、ランタイム同一を優先して維持する。 */
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

export interface CommentPostResult {
  status: 'ok';
  no: number;
  id?: string;
  message: string;
}

type Acceptance = 'not-sent' | 'rejected' | 'unknown';

class CommentRequestError extends Error {
  readonly status = 'fail';
  constructor(
    message: string,
    readonly result: { status?: number; errorCode?: string } = {},
    readonly acceptance: Acceptance = 'unknown'
  ) {
    super(message);
    this.name = 'CommentRequestError';
  }
  get statusCode(): number | undefined {
    return this.result.status;
  }
  get errorCode(): string | undefined {
    return this.result.errorCode;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function readEnvelope(response: Response, acceptance: Acceptance): Promise<Record<string, unknown>> {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new CommentRequestError('コメントAPIの応答を確認できませんでした', { status: response.status }, acceptance);
  }
  const meta = isRecord(raw) && isRecord(raw.meta) ? raw.meta : null;
  const status = response.ok && typeof meta?.status === 'number' ? meta.status : response.status;
  const errorCode = typeof meta?.errorCode === 'string' ? meta.errorCode : undefined;
  if (!response.ok || status < 200 || status >= 300) {
    throw new CommentRequestError(
      errorCode ? `コメントAPIが要求を拒否しました: ${errorCode}` : `コメントAPIの通信失敗 (${response.status})`,
      { status, errorCode },
      acceptance === 'not-sent' ? 'not-sent' : status >= 400 && status < 500 ? 'rejected' : 'unknown'
    );
  }
  if (!meta || !Number.isFinite(meta.status) || !isRecord(raw) || !isRecord(raw.data)) {
    throw new CommentRequestError('コメントAPIの応答形式が不正です', { status: response.status }, acceptance);
  }
  return raw.data;
}

interface ThreadLoadData {
  globalComments?: Array<{ count: number }>;
  threads: Array<{ id: string; fork: string; commentCount: number; info?: unknown }>;
  [key: string]: unknown;
}

function isThreadLoadData(data: Record<string, unknown>): data is ThreadLoadData {
  return (
    (data.globalComments === undefined ||
      (Array.isArray(data.globalComments) &&
        data.globalComments.every((entry: unknown) => isRecord(entry) && typeof entry.count === 'number'))) &&
    Array.isArray(data.threads) &&
    data.threads.every(
      (entry: unknown) =>
        isRecord(entry) &&
        typeof entry.id === 'string' &&
        typeof entry.fork === 'string' &&
        typeof entry.commentCount === 'number'
    )
  );
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
    async getPostKey(threadId: string): Promise<PostKeyData> {
      const url = new URL('https://nvapi.nicovideo.jp/v1/comment/keys/post');
      url.searchParams.set('threadId', threadId);
      url.searchParams.set('pc', '1');
      try {
        const response = await (netUtil as unknown as NetUtilLike).fetch(url, {
          method: 'GET',
          headers: {
            'X-Frontend-Id': FRONT_ID,
            'X-Frontend-Version': FRONT_VER,
            'X-Client-Os-Type': 'others',
          },
          credentials: 'include',
        });
        const data = await readEnvelope(response, 'not-sent');
        if (isRecord(data.challenge) && data.challenge.isRequired === true) {
          throw new CommentRequestError('公式視聴ページで投稿前の認証を行ってください', {}, 'not-sent');
        }
        if (typeof data.postKey !== 'string' || !data.postKey) {
          throw new CommentRequestError('コメント投稿キーの応答が不正です', {}, 'not-sent');
        }
        return { postKey: data.postKey };
      } catch (error) {
        if (error instanceof CommentRequestError) throw error;
        throw new CommentRequestError('コメント投稿キーを取得できませんでした', {}, 'not-sent');
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
          .then((res: Response) => {
            if (!res.ok) throw { status: res.status, errorCode: 'HTTP_ERROR' };
            return res.json();
          });
        if (!isRecord(raw) || !isRecord(raw.meta) || typeof raw.meta.status !== 'number')
          throw { status: 0, errorCode: 'INVALID_RESPONSE' };
        if (raw.meta.status >= 300) {
          throw raw.meta;
        }
      } catch (result) {
        throw {
          result,
          message: `コメントの通信失敗`,
        };
      }
    }

    async _post(url: URL, body: string, signal?: AbortSignal): Promise<PostResultData> {
      try {
        const response = await (netUtil as unknown as NetUtilLike).fetch(url, {
          method: 'POST',
          headers: {
            'X-Frontend-Id': FRONT_ID,
            'X-Frontend-Version': FRONT_VER,
            'X-Client-Os-Type': 'others',
            'Content-Type': 'application/json; charset=UTF-8',
          },
          credentials: 'omit',
          body,
          signal,
        });
        const data = await readEnvelope(response, 'unknown');
        return {
          no: typeof data.no === 'number' ? data.no : undefined,
          id: typeof data.id === 'string' ? data.id : typeof data.id === 'number' ? String(data.id) : undefined,
          nicoruId: typeof data.nicoruId === 'string' ? data.nicoruId : undefined,
          nicoruCount: typeof data.nicoruCount === 'number' ? data.nicoruCount : undefined,
        };
      } catch (error) {
        if (error instanceof CommentRequestError) throw error;
        throw new CommentRequestError('コメント投稿の結果を確認できませんでした。再取得して反映を確認してください');
      }
    }

    async _load(msgInfo: ThreadMsgInfo): Promise<ThreadLoadData> {
      const { params, server, threadKey } = msgInfo.nvComment;

      const packet: { additionals?: { when: number }; params: NvCommentParams; threadKey?: string } = {
        params: { ...params },
        threadKey,
      };

      if (msgInfo.language !== params.language) {
        packet.params.language = msgInfo.language;
      }

      const when = msgInfo.when;
      if (typeof when === 'number' && when > 0) {
        packet.additionals = { when };
      }

      const url = new URL('/v1/threads', server);
      console.log('load threads...', url);
      try {
        const response = await (netUtil as unknown as NetUtilLike).fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'X-Client-Os-Type': 'others',
            'X-Frontend-Id': FRONT_ID,
            'X-Frontend-Version': FRONT_VER,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(packet),
        });
        const data = await readEnvelope(response, 'not-sent');
        if (!isThreadLoadData(data)) throw new Error('コメント取得応答の形式が不正です');
        return data;
      } catch (result) {
        throw {
          result,
          message: `コメントの通信失敗`,
        };
      }
    }

    async load(msgInfo: ThreadMsgInfo): Promise<{ threadInfo: ThreadInfoData; body: ThreadLoadData; format: string }> {
      const { videoId, userId } = msgInfo;

      const timeKey = `loadComment videoId: ${videoId}`;
      console.time(timeKey);

      let result: ThreadLoadData;
      try {
        result = await this._load(msgInfo);
      } catch (error) {
        console.timeEnd(timeKey);
        window.console.error('loadComment fail: ', error);
        throw { message: 'コメントサーバーの通信失敗' };
      }

      console.timeEnd(timeKey);
      debug.lastMessageServerResult = result;

      let totalResCount: number = (result.globalComments ?? result.threads).reduce(
        (count, current) => count + ('count' in current ? current.count : current.commentCount),
        0
      );
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
      options: { signal?: AbortSignal } = {}
    ): Promise<CommentPostResult> {
      const { videoId, threadId, isWaybackMode } = msgInfo.threadInfo ?? {};
      if (!videoId || !threadId || isWaybackMode || !text.trim() || text.length > 75 || !Number.isFinite(vpos)) {
        throw new CommentRequestError('投稿内容・投稿先・再生位置を確認してください', {}, 'not-sent');
      }
      let server: URL;
      try {
        server = new URL(msgInfo.nvComment.server);
      } catch {
        throw new CommentRequestError('コメント投稿先のURLが不正です', {}, 'not-sent');
      }
      if (
        server.protocol !== 'https:' ||
        !server.hostname.endsWith('.nvcomment.nicovideo.jp') ||
        server.username ||
        server.password ||
        server.port
      ) {
        throw new CommentRequestError('コメント投稿先のURLが不正です', {}, 'not-sent');
      }
      const url = new URL('/v1/threads/' + encodeURIComponent(threadId) + '/comments', server);
      url.searchParams.set('pc', '1');
      const commands = cmd?.trim().split(/\s+/).filter(Boolean) ?? [];
      const vposMs = Math.max(0, Math.floor(vpos * 10));
      if (!Number.isSafeInteger(vposMs)) throw new CommentRequestError('コメントの投稿位置が不正です', {}, 'not-sent');
      for (let attempt = 0; attempt < 2; attempt++) {
        options.signal?.throwIfAborted();
        const { postKey } = await this.getPostKey(threadId);
        options.signal?.throwIfAborted();
        const packet = JSON.stringify({
          body: text,
          commands,
          vposMs,
          postKey,
          videoId,
        });
        try {
          const { no, id } = await this._post(url, packet, options.signal);
          if (!Number.isSafeInteger(no) || no === undefined || no < 1) {
            throw new CommentRequestError(
              'コメント投稿の受理番号を確認できませんでした。再取得して反映を確認してください'
            );
          }
          return { status: 'ok', no, id, message: 'コメント投稿成功' };
        } catch (error) {
          // 採取した公式API契約どおり、期限切れで明示拒否された場合だけキーを更新する。
          // 接続切断・応答喪失・5xxでは受理済みか不明なため自動再送しない。
          if (
            attempt === 0 &&
            error instanceof CommentRequestError &&
            error.acceptance === 'rejected' &&
            error.errorCode === 'EXPIRED_TOKEN'
          )
            continue;
          throw error;
        }
      }
      throw new CommentRequestError('コメント投稿に失敗しました');
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
          .then((res: Response) => {
            if (!res.ok) throw new Error(`削除キー取得失敗 (HTTP ${res.status})`);
            return res.json();
          });
        if (
          !isRecord(raw) ||
          !isRecord(raw.meta) ||
          typeof raw.meta.status !== 'number' ||
          !isRecord(raw.data) ||
          typeof raw.data.deleteKey !== 'string' ||
          !raw.data.deleteKey
        )
          throw new Error('削除キーの応答形式が不正です');
        if (raw.meta.status >= 300) {
          throw raw.meta;
        }
        return { deleteKey: raw.data.deleteKey };
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
          .then((res: Response) => {
            if (!res.ok) throw new Error(`ニコるキー取得失敗 (HTTP ${res.status})`);
            return res.json();
          });
        if (
          !isRecord(raw) ||
          !isRecord(raw.meta) ||
          typeof raw.meta.status !== 'number' ||
          !isRecord(raw.data) ||
          typeof raw.data.nicoruKey !== 'string' ||
          !raw.data.nicoruKey
        )
          throw new Error('ニコるキーの応答形式が不正です');
        if (raw.meta.status >= 300) {
          throw raw.meta;
        }
        return { nicoruKey: raw.data.nicoruKey };
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
