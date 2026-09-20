import { expect, test } from 'bun:test';
import { LiveReadGate, scrub, scrubText, safeUrl, isProductSession } from '../../scripts/live-capture-policy';
test('読み取りの重複・キー変更再試行・未承認書込みを送信前に拒否する', () => {
  const gate = new LiveReadGate();
  expect(gate.decide('GET', 'https://www.nicovideo.jp/watch/sm9')).toBeNull();
  expect(gate.decide('GET', 'https://www.nicovideo.jp/watch/sm9')).toBe('repeat-blocked');
  const hls = 'https://nvapi.nicovideo.jp/v1/watch/sm9/access-rights/hls';
  expect(gate.decide('POST', hls, '{}')).toBe('host-playback-suppressed');
  expect(gate.decide('POST', hls + '?actionTrackId=one', '{"outputs":["video1"]}', '', true)).toBeNull();
  expect(gate.decide('POST', hls + '?actionTrackId=two&__retry=0', '{"outputs":["video2"]}', '', true)).toBe(
    'repeat-blocked'
  );
  expect(
    gate.decide('POST', 'https://public.nvcomment.nicovideo.jp/v1/threads', '{"threadKey":"first","params":{"id":"1"}}')
  ).toBeNull();
  expect(
    gate.decide(
      'POST',
      'https://public.nvcomment.nicovideo.jp/v1/threads',
      '{"threadKey":"second","params":{"id":"1"}}'
    )
  ).toBe('repeat-blocked');
  expect(
    gate.decide('POST', 'https://public.nvcomment.nicovideo.jp/v1/threads', '{"params":{"id":"1"},"threadKey":"third"}')
  ).toBe('repeat-blocked');
  expect(gate.decide('POST', 'https://public.nvcomment.nicovideo.jp/v1/threads/1/comments', 'x')).toBe(
    'write-not-authorized'
  );
  expect(gate.decide('GET', 'https://evil.invalid/')).toBe('unrelated-host');
  gate.closed = true;
  expect(gate.decide('GET', 'https://www.nicovideo.jp/')).toBe('capture-closed');
});
test('採取する認証ヘッダー・JSONキー・署名URLをマスクしJSONの構造を保つ', () => {
  expect(scrub({ Cookie: 'private', 'X-Access-Right-Key': 'private', 'Content-Type': 'application/json' })).toEqual({
    Cookie: '[REDACTED]',
    'X-Access-Right-Key': '[REDACTED]',
    'Content-Type': 'application/json',
  });
  const value = JSON.parse(scrubText('{"threadKey":"private","body":"visible","number":0.123}')) as Record<
    string,
    unknown
  >;
  expect(value).toEqual({ threadKey: '[REDACTED]', body: 'visible', number: 0.123 });
  expect(safeUrl('https://fixture.invalid/file?Signature=secret&videoId=sm9')).not.toContain('secret');
  expect(JSON.stringify(scrub({ postData: '{"postKey":"private","videoId":"sm9"}' }))).not.toContain('private');
  expect(scrubText('../chunk.mp4?session=private&Signature=private')).not.toContain('private');
  expect(scrub({ postDataEntries: [{ bytes: 'encoded-private' }], 'x-niconico-id': '123' })).toEqual({
    postDataEntries: '[REDACTED]',
    'x-niconico-id': '[REDACTED]',
  });
});

test('明示した関連GETの更新はpreflightも各1回だけ許可し、別methodや次の再送を通さない', () => {
  const gate = new LiveReadGate();
  const url = 'https://nvapi.nicovideo.jp/v1/users/me/mylists';
  expect(gate.decide('OPTIONS', url, '', 'GET:x-frontend-id')).toBeNull();
  expect(gate.decide('GET', url)).toBeNull();
  gate.allowReadRefresh(url);
  expect(gate.decide('OPTIONS', url, '', 'GET:x-frontend-id')).toBeNull();
  expect(gate.decide('OPTIONS', url, '', 'GET:x-frontend-id')).toBe('repeat-blocked');
  expect(gate.decide('GET', url)).toBeNull();
  expect(gate.decide('GET', url)).toBe('repeat-blocked');
  gate.allowReadRefresh(url);
  expect(gate.decide('GET', url)).toBeNull();
  expect(gate.decide('OPTIONS', url, '', 'GET:x-frontend-id')).toBe('repeat-blocked');
});
test('採取済みのinitiator構造から公式ページ・本体Worker・そのpreflightを区別する', () => {
  expect(
    isProductSession(
      { stack: { callFrames: [{ functionName: 'N', url: 'https://resource.video.nimg.jp/dist.js' }] } },
      new Map()
    )
  ).toBe(false);
  expect(
    isProductSession(
      { stack: { callFrames: [{ functionName: '_createSession', url: 'blob:https://www.nicovideo.jp/worker' }] } },
      new Map()
    )
  ).toBe(true);
  expect(
    isProductSession({ type: 'preflight', requestId: 'worker-request' }, new Map([['worker-request', true]]))
  ).toBe(true);
  expect(isProductSession({ type: 'preflight', requestId: 'site-request' }, new Map())).toBe(false);
});
test('採取した広告・タグ画像の失敗は新規の本体通信を止めず、同一要求の再送は拒否する', () => {
  const gate = new LiveReadGate();
  const optional = 'https://api.nicoad.nicovideo.jp/v2/contents/video/sm9/pickup_supporters';
  expect(gate.decide('GET', optional)).toBeNull();
  expect(gate.stopForFailure(optional, 'net::ERR_FAILED')).toBe(false);
  expect(
    gate.stopForFailure('https://live.nicovideo.jp/img/2012/watch/tag_icon003.png', 'net::ERR_BLOCKED_BY_ORB')
  ).toBe(false);
  expect(gate.decide('GET', optional)).toBe('repeat-blocked');
  expect(gate.decide('GET', 'https://delivery.domand.nicovideo.jp/hlsbid/fixture/video.m3u8')).toBeNull();
  expect(
    gate.stopForFailure('https://delivery.domand.nicovideo.jp/hlsbid/fixture/video.m3u8', 'net::ERR_CONNECTION_RESET')
  ).toBe(true);
  expect(gate.decide('GET', 'https://delivery.domand.nicovideo.jp/hlsbid/fixture/audio.m3u8')).toBe('capture-closed');
});
