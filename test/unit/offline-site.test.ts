import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOfflineSite } from '../../scripts/offline-site';
import type { FixtureReply, FixtureRequest } from '../../scripts/offline-site';
import { installOffline, offlineReports, offlineSites } from '../../scripts/dev-offline';
import type { CdpSession } from '../../scripts/dev-cdp';

const postUrl = 'https://public.nvcomment.nicovideo.jp/v1/threads/1173108780/comments?pc=1';
const packet = () => ({ postKey: 'fixture-post-key', videoId: 'sm9', body: '本文', commands: ['184'], vposMs: 1200 });
const request = (url: string, body?: object): FixtureRequest => ({
  url,
  method: body ? 'POST' : 'GET',
  postData: body ? JSON.stringify(body) : undefined,
});
const loadPacket = () => ({
  threadKey: 'fixture-thread-key',
  params: { targets: [{ id: '1173108780', fork: 'main' }], language: 'ja-jp' },
  additionals: {},
});
const parse = (
  response: FixtureReply | null
): {
  data: { threads: Array<{ comments: Array<{ body: string; id: string; no: number }> }>; id?: string; no?: number };
} => {
  if (!response || typeof response.body !== 'string') throw new Error('JSON応答なし');
  return JSON.parse(response.body) as ReturnType<typeof parse>;
};

describe('Phase0 ブラウザ用要求契約', () => {
  test('専用loopback登録は完全URLとGETだけを許可し、別port/query/bodyを許可しない', async () => {
    const site = createOfflineSite();
    const url = 'http://127.0.0.1:43210/worker.js';
    site.resources.set(url, { status: 200, mime: 'application/javascript', body: 'self.fixture=true;' });
    expect((await site.reply(request(url)))?.mime).toBe('application/javascript');
    for (const altered of [url + '?extra=1', url.replace('43210', '43211'), url.replace('worker.js', 'other.js')])
      expect(await site.reply(request(altered))).toBeNull();
    expect(await site.reply({ url, method: 'POST' })).toBeNull();
    expect(await site.reply({ url, method: 'GET', postData: 'unexpected' })).toBeNull();
  });
  test('動画ごとの長さ・画質メタデータ・配信URLを分離し、別動画の画質IDを受理しない', async () => {
    const site = createOfflineSite();
    for (const [id, duration, high, low, width] of [
      ['sm9', 64, 360, 180, 640],
      ['sm2057168', 40, 480, 240, 640],
      ['sm100', 24, 640, 320, 480],
    ] as const) {
      const watch = await site.reply(request(`https://www.nicovideo.jp/watch/${id}?responseType=json`));
      expect(JSON.parse(String(watch?.body))).toMatchObject({
        data: {
          response: {
            video: { id, duration },
            media: {
              domand: {
                videos: [
                  { id: `video-h264-${high}p`, width, height: high },
                  { id: `video-h264-${low}p`, width: width / 2, height: low },
                ],
              },
            },
          },
        },
      });
      const hls = await site.reply(
        request(`https://nvapi.nicovideo.jp/v1/watch/${id}/access-rights/hls?actionTrackId=fixture-track`, {
          outputs: [[`video-h264-${high}p`, 'audio-aac-128kbps']],
        })
      );
      expect(JSON.parse(String(hls?.body))).toMatchObject({
        data: { contentUrl: `https://fixture.invalid/${id}/high.m3u8` },
      });
      expect((await site.reply(request(`https://fixture.invalid/${id}/master.m3u8`)))?.body).toBeInstanceOf(Uint8Array);
    }
    expect(
      await site.reply(
        request('https://nvapi.nicovideo.jp/v1/watch/sm2057168/access-rights/hls?actionTrackId=fixture-track', {
          outputs: [['video-h264-360p', 'audio-aac-128kbps']],
        })
      )
    ).toBeNull();
  });

  test('シーン認証をヘッダーとviewerへ反映し、キー401では書き込まず回復できる', async () => {
    const site = createOfflineSite();
    site.auth.isLogin = false;
    expect(String((await site.reply(request('https://www.nicovideo.jp/watch/sm9')))?.body)).toContain(
      '"isLogin":false'
    );
    expect(
      JSON.parse(String((await site.reply(request('https://www.nicovideo.jp/watch/sm9?responseType=json')))?.body))
    ).toMatchObject({ data: { response: { viewer: null } } });
    const key = 'https://nvapi.nicovideo.jp/v1/comment/keys/post?threadId=1173108780&pc=1';
    expect((await site.reply(request(key)))?.status).toBe(401);
    site.auth.isLogin = true;
    site.auth.isPremium = true;
    expect(
      JSON.parse(String((await site.reply(request('https://www.nicovideo.jp/watch/sm9?responseType=json')))?.body))
    ).toMatchObject({ data: { response: { viewer: { isPremium: true } } } });
    site.auth.postKeyStatus = 401;
    expect((await site.reply(request(key)))?.status).toBe(401);
    expect(site.writes).toHaveLength(0);
    site.auth.postKeyStatus = 200;
    expect((await site.reply(request(key)))?.status).toBe(200);
  });
  test('プロフィール遷移は指定した完全URLのGETだけを空文書で再生する', async () => {
    const site = createOfflineSite();
    const url = 'https://www.nicovideo.jp/user/4';
    const response = await site.reply(request(url));
    expect(response?.status).toBe(200);
    expect(response?.mime).toBe('text/html');
    expect(response?.body).toContain('<body></body>');
    for (const different of [url + '?other=1', url + '/', url.replace('/4', '/5'), url.replace('https:', 'http:')])
      expect(await site.reply(request(different))).toBeNull();
    expect(await site.reply({ url, method: 'POST' })).toBeNull();
  });
  test('追加機能の固定文書は登録した完全URLだけに応答する', async () => {
    const site = createOfflineSite();
    const url = 'https://www.youtube.com/watch?v=fixture';
    site.documents.set(url, '<!doctype html><title>fixture</title>');
    expect((await site.reply(request(url)))?.body).toContain('<title>fixture</title>');
    expect(await site.reply(request(url + '&other=1'))).toBeNull();
    expect(await site.reply(request(url.replace('v=fixture', 'v=other')))).toBeNull();
    expect(await site.reply({ url, method: 'POST' })).toBeNull();
  });
  test('pc=1とクエリ集合を厳密照合し、別path/host/schemeの成功を拒否する', async () => {
    const site = createOfflineSite();
    expect(await site.reply(request(postUrl, packet()))).not.toBeNull();
    for (const url of [
      postUrl.replace('?pc=1', ''),
      postUrl.replace('pc=1', 'pc=2'),
      postUrl + '&extra=1',
      postUrl.replace('https:', 'http:'),
      postUrl.replace('1173108780', '1173108781'),
      postUrl.replace('.jp/', '.jp.evil.test/'),
    ]) {
      expect(await site.reply(request(url, packet()))).toBeNull();
    }
    const keyUrl = 'https://nvapi.nicovideo.jp/v1/comment/keys/post?threadId=1173108780&pc=1';
    expect(await site.reply(request(keyUrl))).not.toBeNull();
    for (const url of [keyUrl.replace('&pc=1', ''), keyUrl + '&pc=1', keyUrl + '&extra=1'])
      expect(await site.reply(request(url))).toBeNull();
    expect(await site.reply(request('https://www.nicovideo.jp/watch/sm9/other'))).toBeNull();
    expect(await site.reply(request('https://fixture.invalid/sm9/master.m3u8?quality=other'))).toBeNull();
    expect(await site.reply(request('https://secure-dcdn.cdn.nimg.jp/unknown.jpg'))).toBeNull();
  });

  test('投稿本文・文字数・型・videoId・時刻・余分なフィールドを検証して失敗を保存しない', async () => {
    const site = createOfflineSite(),
      initial = site.comments.length;
    for (const body of [
      { ...packet(), body: ' ' },
      { ...packet(), body: 'あ'.repeat(76) },
      { ...packet(), body: 1 },
      { ...packet(), commands: [184] },
      { ...packet(), commands: ['red big'] },
      { ...packet(), vposMs: -1 },
      { ...packet(), vposMs: 1.5 },
      { ...packet(), videoId: 'sm100' },
      { ...packet(), unexpected: true },
      { ...packet(), postKey: 'wrong' },
    ])
      expect(await site.reply(request(postUrl, body))).toBeNull();
    expect(await site.reply({ url: postUrl, method: 'POST', postData: '{' })).toBeNull();
    expect(site.comments).toHaveLength(initial);
    expect(site.writes).toHaveLength(0);
    site.faults.postStatus = 403;
    expect((await site.reply(request(postUrl, packet())))?.status).toBe(403);
    expect(site.comments).toHaveLength(initial);
    expect(site.writes).toHaveLength(1);
  });

  test('受理ID/番号を再取得でき、独立シーンと別動画には投稿を混入させない', async () => {
    const site = createOfflineSite();
    const result = parse(await site.reply(request(postUrl, packet())));
    const response = parse(await site.reply(request('https://public.nvcomment.nicovideo.jp/v1/threads', loadPacket())));
    const accepted = response.data.threads
      .flatMap((thread) => thread.comments)
      .filter((comment) => comment.id === result.data.id);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.no).toBe(result.data.no);
    expect(site.commentsByVideo.get('sm2057168')?.some((comment) => comment.body === '本文')).toBe(false);
    expect(createOfflineSite().comments.some((comment) => comment.body === '本文')).toBe(false);
    const other = {
      threadKey: 'fixture-thread-key-sm2057168',
      params: { targets: [{ id: '1173108781', fork: 'main' }], language: 'ja-jp' },
      additionals: {},
    };
    expect(
      parse(await site.reply(request('https://public.nvcomment.nicovideo.jp/v1/threads', other))).data.threads[0]
        ?.comments
    ).toHaveLength(64);
  });

  test('取得の言語・過去ログ時刻・forkを反映し、異なる意味の条件を無視しない', async () => {
    const site = createOfflineSite(),
      url = 'https://public.nvcomment.nicovideo.jp/v1/threads';
    const body = loadPacket();
    const japanese = parse(await site.reply(request(url, body)));
    body.params.language = 'en-us';
    const english = parse(await site.reply(request(url, body)));
    expect(english.data.threads[0]?.comments[0]?.body).not.toBe(japanese.data.threads[0]?.comments[0]?.body);
    body.additionals = { when: 1 };
    expect(parse(await site.reply(request(url, body))).data.threads[0]?.comments).toHaveLength(0);
    for (const invalid of [
      { ...loadPacket(), params: { ...loadPacket().params, language: 'unknown' } },
      { ...loadPacket(), additionals: { when: '1' } },
      { ...loadPacket(), additionals: { when: 1, extra: true } },
      {
        ...loadPacket(),
        params: {
          ...loadPacket().params,
          targets: [
            { id: '1173108780', fork: 'main' },
            { id: '1173108780', fork: 'main' },
          ],
        },
      },
    ])
      expect(await site.reply(request(url, invalid))).toBeNull();
  });

  test('HLSの動画と音声の組を厳密検証し、異なる画質に対応したplaylistを返す', async () => {
    const site = createOfflineSite(),
      url = 'https://nvapi.nicovideo.jp/v1/watch/sm9/access-rights/hls?actionTrackId=fixture-track';
    const high = await site.reply(request(url, { outputs: [['video-h264-360p', 'audio-aac-128kbps']] }));
    const low = await site.reply(request(url, { outputs: [['video-h264-180p', 'audio-aac-128kbps']] }));
    expect(high?.body).toContain('high.m3u8');
    expect(low?.body).toContain('low.m3u8');
    site.faults.hlsStatus = 403;
    const refused = await site.reply(request(url, { outputs: [['video-h264-360p', 'audio-aac-128kbps']] }));
    expect(refused?.status).toBe(403);
    expect(JSON.parse(String(refused?.body))).toMatchObject({ meta: { status: 403 } });
    site.faults.hlsStatus = 503;
    site.faults.hlsBodyStatus = 201;
    const contradictory = await site.reply(request(url, { outputs: [['video-h264-360p', 'audio-aac-128kbps']] }));
    expect(contradictory?.status).toBe(503);
    expect(JSON.parse(String(contradictory?.body))).toMatchObject({
      meta: { status: 201 },
      data: { contentUrl: 'https://fixture.invalid/sm9/high.m3u8' },
    });
    for (const outputs of [
      [],
      [['video-h264-360p', 'wrong']],
      ['bad'],
      [
        ['video-h264-360p', 'audio-aac-128kbps'],
        ['video-h264-360p', 'audio-aac-128kbps'],
      ],
    ])
      expect(await site.reply(request(url, { outputs }))).toBeNull();
    site.faults.hlsStatus = 200;
    site.faults.hlsBodyStatus = undefined;
    expect((await site.reply(request(url, { outputs: [['video-h264-360p', 'audio-aac-128kbps']] })))?.status).toBe(201);
  });

  test('ニコる・本人コメント削除は拒否時に変更せず、成功後の再取得へ反映する', async () => {
    const site = createOfflineSite();
    const target = site.comments[0]!;
    const count = target.nicoruCount;
    const nicoru = request('https://public.nvcomment.nicovideo.jp/v1/threads/1173108780/nicorus', {
      content: target.body,
      fork: 'main',
      no: target.no,
      nicoruKey: 'fixture-nicoru-sm9',
      videoId: 'sm9',
    });
    site.faults.nicoruStatus = 403;
    expect((await site.reply(nicoru))?.status).toBe(403);
    expect(target.nicoruCount).toBe(count);
    site.faults.nicoruStatus = 200;
    expect((await site.reply(nicoru))?.status).toBe(200);
    expect(target.nicoruCount).toBe(count + 1);
    expect((await site.reply(nicoru))?.status).toBe(409);
    const accepted = parse(await site.reply(request(postUrl, packet()))).data;
    const deletion = {
      ...request('https://public.nvcomment.nicovideo.jp/v1/threads/1173108780/comment-comment-owner-deletions', {
        deleteKey: 'fixture-delete-sm9',
        fork: 'main',
        language: 'ja-jp',
        targets: [{ no: accepted.no, operation: 'DELETE' }],
        videoId: 'sm9',
      }),
      method: 'PUT',
    };
    site.faults.deleteStatus = 403;
    expect((await site.reply(deletion))?.status).toBe(403);
    expect(site.comments.some((comment) => comment.id === accepted.id)).toBe(true);
    site.faults.deleteStatus = 200;
    expect((await site.reply(deletion))?.status).toBe(200);
    const restored = parse(await site.reply(request('https://public.nvcomment.nicovideo.jp/v1/threads', loadPacket())));
    expect(restored.data.threads[0]?.comments.some((comment) => comment.id === accepted.id)).toBe(false);
    expect(restored.data.threads[0]?.comments[0]).toMatchObject({ nicoruCount: count + 1 });
    const next = parse(await site.reply(request(postUrl, packet()))).data;
    expect(next.no).toBeGreaterThan(accepted.no!);
  });

  test('取得条件の応答は遅延前に確定し、遅延中の別投稿を混入させない', async () => {
    const site = createOfflineSite();
    site.faults.commentDelayMs = 30;
    const delayed = site.reply(request('https://public.nvcomment.nicovideo.jp/v1/threads', loadPacket()));
    await Bun.sleep(1);
    await site.reply(request(postUrl, packet()));
    expect(parse(await delayed).data.threads[0]?.comments).toHaveLength(128);
    site.faults.commentDelayMs = 0;
    expect(
      parse(await site.reply(request('https://public.nvcomment.nicovideo.jp/v1/threads', loadPacket()))).data.threads[0]
        ?.comments
    ).toHaveLength(129);
  });
});

class FakeSession implements CdpSession {
  calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  handlers: Array<(method: string, params: Record<string, unknown>) => void> = [];
  closed = 0;
  closeError: Error | undefined;
  missingTargetSessions = new Set<string>();
  targetSessionErrors = new Map<string, string>();
  fetchErrors = new Map<string, string>();
  send = (method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
    this.calls.push({ method, params });
    if (method === 'Fetch.fulfillRequest' || method === 'Fetch.failRequest') {
      const fetchError = this.fetchErrors.get(String(params.requestId));
      if (fetchError) return Promise.reject(new Error(`${method}: ${fetchError}`));
    }
    if (method === 'Target.sendMessageToTarget') {
      if (this.missingTargetSessions.has(String(params.sessionId)))
        return Promise.reject(new Error('Target.sendMessageToTarget: No session with given id'));
      const targetSessionError = this.targetSessionErrors.get(String(params.sessionId));
      if (targetSessionError) return Promise.reject(new Error(targetSessionError));
      const message = JSON.parse(String(params.message)) as { id: number; method: string };
      queueMicrotask(() =>
        this.emit('Target.receivedMessageFromTarget', {
          sessionId: params.sessionId,
          message: JSON.stringify(
            message.method === 'Target.setAutoAttach'
              ? { id: message.id, error: { message: "'Target.setAutoAttach' wasn't found" } }
              : { id: message.id, result: {} }
          ),
        })
      );
    }
    return Promise.resolve({});
  };
  close = (): Promise<void> => {
    this.closed++;
    return this.closeError ? Promise.reject(this.closeError) : Promise.resolve();
  };
  onEvent = (handler: (method: string, params: Record<string, unknown>) => void): void => {
    this.handlers.push(handler);
  };
  emit(method: string, params: Record<string, unknown>): void {
    for (const handler of this.handlers) handler(method, params);
  }
  worker(method: string, params: Record<string, unknown>): void {
    this.emit('Target.receivedMessageFromTarget', { sessionId: 'worker', message: JSON.stringify({ method, params }) });
  }
}
let directory = '';
const oldOffline = process.env.FUTATSUME_TEST_OFFLINE,
  oldOutput = process.env.FUTATSUME_TEST_OUTPUT;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'fw-offline-test-'));
  process.env.FUTATSUME_TEST_OFFLINE = '1';
  process.env.FUTATSUME_TEST_OUTPUT = directory;
});
afterEach(() => {
  if (oldOffline === undefined) delete process.env.FUTATSUME_TEST_OFFLINE;
  else process.env.FUTATSUME_TEST_OFFLINE = oldOffline;
  if (oldOutput === undefined) delete process.env.FUTATSUME_TEST_OUTPUT;
  else process.env.FUTATSUME_TEST_OUTPUT = oldOutput;
  rmSync(directory, { recursive: true, force: true });
});
const closeError = async (session: CdpSession): Promise<string> =>
  session.close().then(
    () => '',
    (error: Error) => error.message
  );

describe('Phase0 非同期通信監査と終了処理', () => {
  test('closeが遅延応答を待ち、終了直前の未登録通信をレポートへ記録する', async () => {
    const session = new FakeSession();
    await installOffline(session);
    const site = offlineSites.get(session)!;
    site.faults.postDelayMs = 25;
    session.emit('Fetch.requestPaused', { requestId: 'post', networkId: 'n1', request: request(postUrl, packet()) });
    session.emit('Fetch.requestPaused', {
      requestId: 'bad',
      networkId: 'n2',
      request: request('https://fixture.invalid/unknown'),
    });
    expect(await closeError(session)).toContain('未登録通信');
    expect(site.comments.at(-1)?.body).toBe('本文');
    expect(session.closed).toBe(1);
    const report = offlineReports.get(session)!;
    expect(report.completed).toBe(false);
    expect(report.errors).toHaveLength(1);
    expect(JSON.parse(readFileSync(report.reportPath, 'utf8'))).toMatchObject({ completed: false });
    expect(session.calls.some((call) => call.method === 'Fetch.failRequest' && call.params.requestId === 'bad')).toBe(
      true
    );
    await closeError(session);
    expect(session.closed).toBe(1);
  });

  test('ルート処理の例外でもpaused要求を失敗させ、元の例外を保存する', async () => {
    const session = new FakeSession();
    await installOffline(session);
    // libraryの既存JSON境界がthrowする場合も、CDP要求を待機させたままにしない。
    const url =
      'https://nvapi.nicovideo.jp/v1/recommend?recipe=invalid&site=nicovideo&_frontendId=6&_frontendVersion=0';
    session.emit('Fetch.requestPaused', { requestId: 'invalid-json', networkId: 'n1', request: request(url) });
    expect(await closeError(session)).toContain('オフライン検証失敗');
    expect(
      session.calls.some((call) => call.method === 'Fetch.failRequest' && call.params.requestId === 'invalid-json')
    ).toBe(true);
    expect(offlineReports.get(session)?.errors.length).toBeGreaterThan(0);
    expect(session.closed).toBe(1);
  });

  test('Workerとページの同じnetworkIdは一件にし、未捕捉Worker通信は失敗にする', async () => {
    const session = new FakeSession();
    await installOffline(session);
    session.emit('Target.attachedToTarget', { sessionId: 'worker', targetInfo: { type: 'worker' } });
    const known = request('https://fixture.invalid/poster.svg');
    session.worker('Network.requestWillBeSent', { requestId: 'shared', request: known });
    session.emit('Network.requestWillBeSent', { requestId: 'shared', request: known });
    session.emit('Fetch.requestPaused', { requestId: 'fetch-shared', networkId: 'shared', request: known });
    session.worker('Network.requestWillBeSent', {
      requestId: 'unseen',
      request: request('https://unregistered.invalid/worker'),
    });
    session.worker('Network.loadingFailed', { requestId: 'unseen', errorText: 'net::ERR_PROXY_CONNECTION_FAILED' });
    expect(await closeError(session)).toContain('未捕捉通信');
    const report = offlineReports.get(session)!;
    expect(report.requests).toHaveLength(2);
    expect(report.requests.find((value) => value.requestId === 'shared')?.sources).toHaveLength(3);
    expect(report.errors).toHaveLength(1);
  });

  test('購読開始中に終了したWorkerのセッション消滅だけは監査失敗にしない', async () => {
    const session = new FakeSession();
    await installOffline(session);
    session.missingTargetSessions.add('gone-worker');
    session.emit('Target.attachedToTarget', { sessionId: 'gone-worker', targetInfo: { type: 'worker' } });
    expect(await closeError(session)).toBe('');
    expect(offlineReports.get(session)).toMatchObject({ completed: true, errors: [] });
  });

  test('子セッションの消滅以外のCDPエラーは監査失敗として保持する', async () => {
    const session = new FakeSession();
    await installOffline(session);
    session.targetSessionErrors.set('broken-worker', 'Target.sendMessageToTarget: unexpected protocol failure');
    session.emit('Target.attachedToTarget', { sessionId: 'broken-worker', targetInfo: { type: 'worker' } });
    expect(await closeError(session)).toContain('unexpected protocol failure');
    expect(offlineReports.get(session)?.completed).toBe(false);
  });

  test('close開始後に無効化されたinterceptionだけは監査失敗にしない', async () => {
    const session = new FakeSession();
    await installOffline(session);
    session.fetchErrors.set('expired', 'Invalid InterceptionId.');
    session.emit('Fetch.requestPaused', {
      requestId: 'expired',
      networkId: 'expired-network',
      request: request('https://fixture.invalid/poster.svg'),
    });
    expect(await closeError(session)).toBe('');
    expect(offlineReports.get(session)).toMatchObject({ completed: true, errors: [] });
  });

  test('close中でもinterception消滅以外のFetchエラーは監査失敗にする', async () => {
    const session = new FakeSession();
    await installOffline(session);
    session.fetchErrors.set('broken', 'unexpected fetch failure');
    session.emit('Fetch.requestPaused', {
      requestId: 'broken',
      networkId: 'broken-network',
      request: request('https://fixture.invalid/poster.svg'),
    });
    expect(await closeError(session)).toContain('unexpected fetch failure');
    expect(offlineReports.get(session)?.completed).toBe(false);
  });

  test('close中の製品例外・socket終了失敗を隠さず監査結果を失敗にする', async () => {
    const session = new FakeSession();
    session.closeError = new Error('socket close failed');
    await installOffline(session);
    const closing = closeError(session);
    session.emit('Runtime.exceptionThrown', { exceptionDetails: { text: 'late product error' } });
    expect(await closing).toContain('late product error');
    expect(session.closed).toBe(1);
    expect(offlineReports.get(session)?.errors).toContain('Error: socket close failed');
    expect(offlineReports.get(session)?.completed).toBe(false);
  });

  test('offline指定がない場合はセッションへ何も登録しない', async () => {
    delete process.env.FUTATSUME_TEST_OFFLINE;
    const session = new FakeSession();
    await installOffline(session);
    expect(session.calls).toHaveLength(0);
    expect(offlineSites.has(session)).toBe(false);
    await session.close();
    expect(session.closed).toBe(1);
  });
});
