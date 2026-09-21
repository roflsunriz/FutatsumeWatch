import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { netUtil } from '../../packages/lib/src/infra/net-util';
import { ThreadLoader } from '../../packages/lib/src/nico/thread-loader';
import { NicoComment } from '../../packages/futatsume/src/commentLayer/nico-comment';
import { NicoChat } from '../../packages/futatsume/src/commentLayer/nico-chat';
import { CommentPostSession, normalizeCommentCommands } from '../../src/comment-post-session';

type MessageInfo = Parameters<typeof ThreadLoader.postChat>[0];
const context = (): MessageInfo => ({
  videoId: 'sm9',
  threadId: '1234',
  language: 'ja-jp',
  nvComment: {
    server: 'https://public.nvcomment.nicovideo.jp',
    params: { language: 'ja-jp', targets: [{ id: '1234', fork: 'main' }] },
    threadKey: 'fixture-thread-key',
  },
  defaultThread: { is184Forced: false },
  threads: [{ id: '1234', fork: 'main', forkLabel: 'main' }],
  threadInfo: { videoId: 'sm9', threadId: '1234', totalResCount: 0, isWaybackMode: false },
});
interface Packet {
  body: string;
  commands: string[];
  vposMs: number;
  postKey: string;
  videoId: string;
}
interface Failure {
  status: string;
  statusCode?: number;
  errorCode?: string;
  message: string;
  acceptance: string;
}
const originalFetch = netUtil.fetch;
let writes: Packet[] = [];
let keyCount = 0;
const ok = (data: object) => Response.json({ meta: { status: 200 }, data });
const refused = (status: number, errorCode: string) => Response.json({ meta: { status, errorCode } }, { status });
const fail = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('拒否されるべき要求が成功した');
    },
    (error: Failure) => error
  );

beforeEach(() => {
  writes = [];
  keyCount = 0;
});
afterEach(() => {
  netUtil.fetch = originalFetch;
});
function install(post: (packet: Packet) => Response | Promise<Response>, load?: () => Response): void {
  netUtil.fetch = async (raw, init = {}) => {
    const url = new URL(raw);
    const headers = new Headers(init.headers);
    expect(headers.get('X-Frontend-Id')).toBe('6');
    expect(headers.get('X-Frontend-Version')).toBe('0');
    if (url.pathname === '/v1/comment/keys/post') {
      expect(url.origin).toBe('https://nvapi.nicovideo.jp');
      expect([...url.searchParams]).toEqual([
        ['threadId', '1234'],
        ['pc', '1'],
      ]);
      expect(init.credentials).toBe('include');
      keyCount++;
      return ok({ postKey: `fixture-key-${keyCount}` });
    }
    if (url.pathname === '/v1/threads' && load) {
      expect(init.credentials).toBe('same-origin');
      expect(headers.get('X-Client-Os-Type')).toBe('others');
      expect(headers.get('content-type')).toBe('application/json');
      const packet = JSON.parse(typeof init.body === 'string' ? init.body : '') as Record<string, unknown>;
      expect(Object.keys(packet).sort()).toEqual(['params', 'threadKey']);
      return load();
    }
    expect(url.origin + url.pathname + url.search).toBe(
      'https://public.nvcomment.nicovideo.jp/v1/threads/1234/comments?pc=1'
    );
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(headers.get('content-type')).toBe('application/json; charset=UTF-8');
    expect(headers.get('X-Client-Os-Type')).toBe('others');
    const packet = JSON.parse(typeof init.body === 'string' ? init.body : '') as Packet;
    writes.push(packet);
    return post(packet);
  };
}

describe('P4 コメント投稿API契約', () => {
  test('P4-07/08 本文・ID・コマンド・時刻を1回送り受理番号とIDを返す', async () => {
    install(() => ok({ no: 42, id: 'accepted-42' }));
    const result = await ThreadLoader.postChat(context(), '日本語 & < >\n本文', ' red \t big　184 ', 123.49);
    expect(result).toMatchObject({ status: 'ok', no: 42, id: 'accepted-42' });
    expect(writes).toEqual([
      {
        body: '日本語 & < >\n本文',
        commands: ['red', 'big', '184'],
        vposMs: 1234,
        postKey: 'fixture-key-1',
        videoId: 'sm9',
      },
    ]);
    expect(keyCount).toBe(1);
  });

  test('P4-06 空コマンド・位置の下限・75文字と76文字の境界を固定する', async () => {
    install(() => ok({ no: 1 }));
    await ThreadLoader.postChat(context(), 'あ'.repeat(75), '', -3);
    expect(writes[0]?.commands).toEqual([]);
    expect(writes[0]?.vposMs).toBe(0);
    for (const text of ['', '　\n', 'あ'.repeat(76), '😀'.repeat(38)]) {
      expect((await fail(ThreadLoader.postChat(context(), text, '', 0))).acceptance).toBe('not-sent');
    }
    for (const vpos of [NaN, Infinity, Number.MAX_VALUE]) {
      expect((await fail(ThreadLoader.postChat(context(), '本文', '', vpos))).acceptance).toBe('not-sent');
    }
    expect(writes).toHaveLength(1);
  });

  test('P4-10 EXPIRED_TOKENの明示拒否だけ新しいキーで1回再試行する', async () => {
    install(() => (writes.length === 1 ? refused(403, 'EXPIRED_TOKEN') : ok({ no: 2, id: 'accepted' })));
    expect((await ThreadLoader.postChat(context(), '本文', undefined, 20)).no).toBe(2);
    expect(writes.map((packet) => packet.postKey)).toEqual(['fixture-key-1', 'fixture-key-2']);
    expect(writes.map((packet) => packet.body)).toEqual(['本文', '本文']);
    expect(keyCount).toBe(2);
  });

  test('P4-10 期限切れが続いても2回で止まり、他の拒否は再送しない', async () => {
    install(() => refused(403, 'EXPIRED_TOKEN'));
    expect((await fail(ThreadLoader.postChat(context(), '本文', '', 0))).errorCode).toBe('EXPIRED_TOKEN');
    expect(writes).toHaveLength(2);
    for (const [status, code] of [
      [401, 'UNAUTHORIZED'],
      [403, 'INVALID_TOKEN'],
      [429, 'TOO_MANY_REQUESTS'],
    ] as const) {
      writes = [];
      keyCount = 0;
      install(() => refused(status, code));
      expect(await fail(ThreadLoader.postChat(context(), '本文', '', 0))).toMatchObject({
        status: 'fail',
        statusCode: status,
        errorCode: code,
        acceptance: 'rejected',
      });
      expect(writes).toHaveLength(1);
      expect(keyCount).toBe(1);
    }
  });

  test('P4-10 HTTP失敗・不正JSON・欠落受理番号を成功にせず自動再送しない', async () => {
    for (const response of [
      Response.json({ meta: { status: 200 }, data: { no: 12 } }, { status: 500 }),
      Response.json({ meta: { status: 403, errorCode: 'EXPIRED_TOKEN' } }, { status: 500 }),
      new Response('{', { status: 200 }),
      ok({}),
      ok({ no: '1' }),
      ok({ no: -1 }),
      ok({ no: 1.5 }),
    ]) {
      writes = [];
      install(() => response);
      const error = await fail(ThreadLoader.postChat(context(), '本文', '', 0));
      expect(error.status).toBe('fail');
      expect(error.acceptance).toBe('unknown');
      expect(writes).toHaveLength(1);
    }
  });

  test('P4-09/10 受理後の応答喪失を再送せず再取得で同じ受理IDを1件確認する', async () => {
    const stored: Array<{ id: string; no: number; body: string }> = [];
    install(
      (packet) => {
        stored.push({ id: 'accepted-1', no: 1, body: packet.body });
        throw new TypeError('connection lost after acceptance');
      },
      () =>
        ok({
          globalComments: [{ count: stored.length }],
          threads: [{ id: '1234', fork: 'main', commentCount: stored.length, comments: stored }],
        })
    );
    const info = context();
    const error = await fail(ThreadLoader.postChat(info, '1回の投稿', '184', 10));
    expect(error.acceptance).toBe('unknown');
    expect(error.message).toContain('再取得');
    expect(writes).toHaveLength(1);
    const loaded = await ThreadLoader.load(info);
    expect(loaded.threadInfo.totalResCount).toBe(1);
    expect(loaded.body.threads[0]).toMatchObject({ comments: [{ id: 'accepted-1', no: 1, body: '1回の投稿' }] });
  });

  test('globalCommentsがないfilter-matome互換応答はthread件数から合計する', async () => {
    install(
      () => ok({ no: 1 }),
      () =>
        ok({
          threads: [
            { id: '1234', fork: 'main', commentCount: 2, comments: [] },
            { id: '1234', fork: 'owner', commentCount: 1, comments: [] },
          ],
        })
    );
    expect((await ThreadLoader.load(context())).threadInfo.totalResCount).toBe(3);
  });

  test('P4-10 キー取得中の動画切替で書き込みせず、呼出後の対象変更を混入させない', async () => {
    let release!: (response: Response) => void;
    netUtil.fetch = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    const controller = new AbortController();
    const pending = ThreadLoader.postChat(context(), '本文', '', 0, { signal: controller.signal });
    controller.abort();
    release(ok({ postKey: 'key' }));
    const error = await fail(pending);
    expect(error.message).toContain('abort');
    expect(writes).toHaveLength(0);
    install(() => ok({ no: 1 }));
    const info = context();
    const snapshotPost = ThreadLoader.postChat(info, '本文', '', 0);
    info.threadInfo!.videoId = 'sm10';
    info.threadInfo!.threadId = '9999';
    await snapshotPost;
    expect(writes[0]?.videoId).toBe('sm9');
  });

  test('P4-05 キー取得拒否・認証要求・不正キーで投稿APIを呼ばない', async () => {
    for (const response of [
      refused(401, 'UNAUTHORIZED'),
      ok({}),
      ok({ postKey: 'key', challenge: { isRequired: true } }),
    ]) {
      let calls = 0;
      netUtil.fetch = () => {
        calls++;
        return Promise.resolve(response);
      };
      const error = await fail(ThreadLoader.postChat(context(), '本文', '', 0));
      expect(error.acceptance).toBe('not-sent');
      expect(calls).toBe(1);
    }
  });

  test('P4-10 切替後に期限切れ応答が到着しても新しいキー取得や再投稿を始めない', async () => {
    let release!: (response: Response) => void;
    install(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        })
    );
    const controller = new AbortController();
    const pending = fail(ThreadLoader.postChat(context(), '本文', '', 0, { signal: controller.signal }));
    for (let turn = 0; turn < 50 && writes.length === 0; turn++) await Promise.resolve();
    expect(writes).toHaveLength(1);
    controller.abort();
    release(refused(403, 'EXPIRED_TOKEN'));
    expect((await pending).message).toContain('abort');
    expect(keyCount).toBe(1);
    expect(writes).toHaveLength(1);
  });

  test('P4-07 投稿禁止コンテキスト・不正サーバーを送信前に拒否する', async () => {
    let calls = 0;
    netUtil.fetch = () => {
      calls++;
      return Promise.reject(new Error('送信禁止'));
    };
    const info = context();
    info.threadInfo!.isWaybackMode = true;
    expect((await fail(ThreadLoader.postChat(info, '本文', '', 0))).acceptance).toBe('not-sent');
    for (const server of [
      'https://public.nvcomment.nicovideo.jp.evil.test',
      'http://public.nvcomment.nicovideo.jp',
      'https://u:p@public.nvcomment.nicovideo.jp',
      'not a URL',
    ]) {
      const other = context();
      other.nvComment.server = server;
      expect((await fail(ThreadLoader.postChat(other, '本文', '', 0))).acceptance).toBe('not-sent');
    }
    expect(calls).toBe(0);
  });

  test('P3-07 再取得の時刻と言語を本文に反映し元パラメーターを変更しない', async () => {
    const info = context();
    info.when = 123456;
    info.language = 'en-us';
    let body = '';
    netUtil.fetch = (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('X-Client-Os-Type')).toBe('others');
      expect(headers.get('content-type')).toBe('application/json');
      body = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(ok({ globalComments: [], threads: [] }));
    };
    await ThreadLoader._load(info);
    expect(JSON.parse(body)).toMatchObject({ additionals: { when: 123456 }, params: { language: 'en-us' } });
    expect(info.nvComment.params.language).toBe('ja-jp');
  });

  test('コメント取得失敗を別キーで自動再送しない', async () => {
    let calls = 0;
    netUtil.fetch = () => {
      calls++;
      return Promise.resolve(refused(503, 'SERVICE_UNAVAILABLE'));
    };
    expect((await fail(ThreadLoader.load(context()))).message).toBe('コメントサーバーの通信失敗');
    expect(calls).toBe(1);
  });
});

function createSessionFixture() {
  const session = new CommentPostSession();
  const model = new NicoComment({});
  const notifications: string[] = [];
  let posting = false;
  const operation = (send: Parameters<CommentPostSession['post']>[0]['send']) => ({
    createPreview: () => {
      const chat = NicoChat.create({ text: '同じ本文', cmd: '184', thread: 1234, isMine: true, isUpdating: true });
      model.addChat(chat);
      return chat;
    },
    removePreview: (chat: InstanceType<typeof NicoChat>) => model.removeChat(chat),
    send,
    setPosting: (value: boolean) => {
      posting = value;
    },
    success: () => {
      notifications.push('success');
    },
    failure: (error: Error) => {
      notifications.push(error.message);
    },
  });
  return { session, model, operation, notifications, isPosting: () => posting };
}

describe('P4 投稿プレビューとAPIの結合', () => {
  test('P4-06 通常とthreadkey必須の184処理を重複なく適用する', () => {
    expect(normalizeCommentCommands(' 184 red　184 big ', false)).toBe('184 red big');
    expect(normalizeCommentCommands(' 184 red　184 big ', true)).toBe('red big');
    expect(normalizeCommentCommands('', false)).toBe('184');
    expect(normalizeCommentCommands('', true)).toBe('');
  });
  test('P4-07/08 一度の入力をAPIへ1回だけ通し同じプレビューに受理no/idを付ける', async () => {
    install(() => ok({ no: 8, id: 'accepted-8' }));
    const f = createSessionFixture();
    const pending = f.session.post(
      f.operation((signal) => ThreadLoader.postChat(context(), '同じ本文', '184', 0, { signal }))
    );
    expect(f.isPosting()).toBe(true);
    expect(f.model.nonFilteredChatList.naka).toHaveLength(1);
    const duplicate = await fail(
      f.session.post(f.operation(() => ThreadLoader.postChat(context(), '同じ本文', '184', 0)))
    );
    expect(duplicate.message).toContain('送信中');
    await pending;
    const chats = f.model.nonFilteredChatList.naka;
    expect(chats).toHaveLength(1);
    expect(chats[0]?.no).toBe(8);
    expect(chats[0]?.props.serverId).toBe('accepted-8');
    expect(chats[0]?.isUpdating).toBe(false);
    expect(writes).toHaveLength(1);
    expect(f.isPosting()).toBe(false);
  });

  test('P4-10 失敗プレビューを除去してから再送しても同じ本文が二重に残らない', async () => {
    install(() => refused(403, 'FORBIDDEN'));
    const f = createSessionFixture();
    await fail(f.session.post(f.operation(() => ThreadLoader.postChat(context(), '同じ本文', '184', 0))));
    expect(f.model.nonFilteredChatList.naka).toHaveLength(0);
    expect(f.model.chatList.naka).toHaveLength(0);
    expect(f.isPosting()).toBe(false);
    install(() => ok({ no: 9 }));
    await f.session.post(f.operation(() => ThreadLoader.postChat(context(), '同じ本文', '184', 0)));
    expect(f.model.chatList.naka).toHaveLength(1);
    expect(f.notifications[0]).toContain('FORBIDDEN');
    expect(f.notifications[1]).toBe('success');
  });

  test('P4-10 close/切替後の遅い成功・失敗が次の投稿や状態を変えない', async () => {
    for (const succeeds of [true, false]) {
      const f = createSessionFixture();
      let resolve!: (result: Awaited<ReturnType<typeof ThreadLoader.postChat>>) => void;
      let reject!: (error: Error) => void;
      const old = f.session.post(
        f.operation(
          () =>
            new Promise((res, rej) => {
              resolve = res;
              reject = rej;
            })
        )
      );
      f.session.reset();
      expect(f.model.nonFilteredChatList.naka).toHaveLength(0);
      let finishNew!: (result: Awaited<ReturnType<typeof ThreadLoader.postChat>>) => void;
      const current = f.session.post(
        f.operation(
          () =>
            new Promise((res) => {
              finishNew = res;
            })
        )
      );
      if (succeeds) resolve({ status: 'ok', no: 1, message: 'ok' });
      else reject(new Error('古い失敗'));
      await old.catch(() => undefined);
      expect(f.isPosting()).toBe(true);
      expect(f.notifications).toHaveLength(0);
      expect(f.model.nonFilteredChatList.naka).toHaveLength(1);
      finishNew({ status: 'ok', no: 2, message: 'ok' });
      await current;
      expect(f.model.chatList.naka[0]?.no).toBe(2);
      expect(f.notifications).toEqual(['success']);
    }
  });
});
