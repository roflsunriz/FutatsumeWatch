import { afterEach, expect, test } from 'bun:test';
import { ThreadLoader } from '../../packages/lib/src/nico/thread-loader';
import { netUtil } from '../../packages/lib/src/infra/net-util';
const original = netUtil.fetch;
afterEach(() => {
  netUtil.fetch = original;
});
const context: Parameters<typeof ThreadLoader.nicoru>[0] = {
  videoId: 'sm9',
  threadId: '1234',
  language: 'ja-jp',
  nvComment: {
    server: 'https://public.nvcomment.nicovideo.jp',
    params: { language: 'ja-jp', targets: [{ id: '1234', fork: 'main' }] },
    threadKey: 'fixture-thread-key',
  },
  defaultThread: {},
  threads: [],
  threadInfo: { videoId: 'sm9', threadId: '1234', totalResCount: 0, isWaybackMode: false },
};
test('P3-08 HTTP失敗のキーを信頼して削除・ニコるを書き込まない', async () => {
  for (const operation of [
    () => ThreadLoader.nicoru(context, { no: 1, fork: 0, text: '対象' }),
    () => ThreadLoader.deleteChat(context, { no: 1, fork: 0, text: '対象' }),
  ]) {
    const methods: string[] = [];
    netUtil.fetch = (_url, options) => {
      methods.push(options?.method ?? 'GET');
      return Promise.resolve(
        Response.json({ meta: { status: 200 }, data: { nicoruKey: 'key', deleteKey: 'key' } }, { status: 500 })
      );
    };
    const failure: unknown = await operation().then(
      () => null,
      (error: unknown) => error
    );
    expect(failure).not.toBeNull();
    expect(methods).toEqual(['GET']);
  }
});
test('P3-08 HTTP失敗の削除応答を成功と扱わない', async () => {
  netUtil.fetch = (_url, options) =>
    Promise.resolve(
      options?.method === 'PUT'
        ? Response.json({ meta: { status: 200 } }, { status: 500 })
        : Response.json({ meta: { status: 200 }, data: { deleteKey: 'key' } })
    );
  const failure: unknown = await ThreadLoader.deleteChat(context, { no: 1, fork: 0, text: '対象' }).then(
    () => null,
    (error: unknown) => error
  );
  expect(failure).not.toBeNull();
});
