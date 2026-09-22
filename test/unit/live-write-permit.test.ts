import { expect, test } from 'bun:test';
import { LiveWritePermitGuard } from '../../scripts/live-write-permit';
import type { LiveWritePermit, LiveWriteRequest } from '../../scripts/live-write-permit';

const comment: Extract<LiveWritePermit, { kind: 'comment-post' }> = {
  id: 'comment-once',
  kind: 'comment-post',
  videoId: 'sm9',
  threadId: '1173108780',
  body: '動画に沿うコメント',
  commands: ['184'],
  vposMs: { min: 1000, max: 2000 },
};
const create: Extract<LiveWritePermit, { kind: 'mylist-create' }> = {
  id: 'create-once',
  kind: 'mylist-create',
  name: '検証専用 & 一覧',
  description: '一度だけ検証',
  isPublic: false,
  defaultSortKey: 'addedAt',
  defaultSortOrder: 'desc',
  encoding: 'form',
};
const add: Extract<LiveWritePermit, { kind: 'mylist-add' }> = {
  id: 'add-once',
  kind: 'mylist-add',
  mylistId: '42',
  videoId: 'sm9',
  description: '対象の説明 & memo',
};
function commentRequest(permit = comment): LiveWriteRequest {
  return {
    method: 'POST',
    url: `https://public.nvcomment.nicovideo.jp/v1/threads/${permit.threadId}/comments?pc=1`,
    contentType: 'application/json; charset=UTF-8',
    postData: JSON.stringify({
      body: permit.body,
      videoId: permit.videoId,
      commands: permit.commands,
      vposMs: permit.vposMs.min,
      postKey: 'opaque-test-key',
    }),
  };
}
function createRequest(permit = create): LiveWriteRequest {
  const value = {
    name: permit.name,
    description: permit.description,
    isPublic: 'false',
    defaultSortKey: permit.defaultSortKey,
    defaultSortOrder: permit.defaultSortOrder,
  };
  return {
    method: 'POST',
    url: 'https://nvapi.nicovideo.jp/v1/users/me/mylists',
    contentType: 'application/x-www-form-urlencoded',
    postData: new URLSearchParams(value).toString(),
  };
}
function addRequest(): LiveWriteRequest {
  const body = new URLSearchParams({ itemId: add.videoId, description: add.description }).toString();
  return {
    method: 'POST',
    url: `https://nvapi.nicovideo.jp/v1/users/me/mylists/42/items?${body}`,
    contentType: 'application/x-www-form-urlencoded',
    postData: body,
  };
}
function created(): LiveWritePermitGuard {
  const guard = new LiveWritePermitGuard();
  guard.arm(create);
  expect(guard.decide(createRequest()).action).toBe('allow-write');
  guard.recordCreatedMylist(create.id, {
    status: 201,
    mylistId: '42',
    name: create.name,
    description: create.description,
    isPublic: false,
  });
  return guard;
}
function added(): LiveWritePermitGuard {
  const guard = created();
  guard.arm(add);
  expect(guard.decide(addRequest()).action).toBe('allow-write');
  guard.recordAddedItem(add.id, { status: 201, mylistId: '42', videoId: 'sm9', itemId: '321' });
  return guard;
}
test('未armと無関係な書込みは既定で拒否し、GET/HEADは許可扱いせず別判定へ返す', () => {
  const guard = new LiveWritePermitGuard();
  expect(guard.decide(commentRequest())).toEqual({ action: 'deny', reason: 'no-matching-permit' });
  for (const method of ['GET', 'HEAD'])
    expect(guard.decide({ method, url: 'https://www.nicovideo.jp/watch/sm9' })).toEqual({ action: 'not-write' });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post'])
    expect(guard.decide({ method, url: 'https://nvapi.nicovideo.jp/other' }).action).toBe('deny');
  expect(
    guard.decide({ method: 'GET', url: 'https://www.nicovideo.jp/watch/sm9', postData: 'not-readonly' }).action
  ).toBe('deny');
});
test('コメント要求を一度だけ消費し、成功・拒否・通信失敗いずれの後も再送を許さない', () => {
  for (const outcome of ['201', '403', '500', 'network-error', 'aborted']) {
    const guard = new LiveWritePermitGuard();
    guard.arm(comment);
    expect(guard.decide(commentRequest())).toEqual({
      action: 'allow-write',
      permitId: comment.id,
      kind: 'comment-post',
    });
    // 消費は応答から独立する。外部結果outcomeを見て再armする経路も提供しない。
    expect(outcome.length).toBeGreaterThan(0);
    expect(guard.decide(commentRequest())).toEqual({ action: 'deny', reason: 'already-consumed' });
    expect(() => guard.arm({ ...comment, id: 'another-attempt' })).toThrow('permit-already-armed');
  }
});
test('OPTIONSは正しい書込みpreflightだけを許し、回数を消費しない', () => {
  const guard = new LiveWritePermitGuard();
  guard.arm(comment);
  const options = { method: 'OPTIONS', url: commentRequest().url, preflightMethod: 'POST' };
  expect(guard.decide(options).action).toBe('allow-preflight');
  expect(guard.decide(options).action).toBe('allow-preflight');
  expect(guard.status()[0]!.consumed).toBe(false);
  for (const bad of [
    { ...options, preflightMethod: 'DELETE' },
    { ...options, preflightMethod: undefined },
    { ...options, postData: 'body' },
  ])
    expect(guard.decide(bad).action).toBe('deny');
  expect(guard.decide(commentRequest()).action).toBe('allow-write');
});
test('ホスト・scheme・port・thread・path・query・userinfo・URL再解釈を厳密に拒否する', () => {
  const request = commentRequest();
  for (const url of [
    request.url.replace('https:', 'http:'),
    request.url.replace('.jp/', '.jp.evil.test/'),
    request.url.replace('public.nvcomment', 'other.nvcomment'),
    request.url.replace('.jp/', '.jp:443/'),
    request.url.replace('https://', 'https://user@'),
    request.url.replace('1173108780', '1173108781'),
    request.url.replace('/comments?', '/comments/?'),
    request.url.replace('pc=1', 'pc=2'),
    request.url + '&pc=1',
    request.url + '&extra=x',
    request.url + '#',
    request.url.replace('/v1/', '/unexpected/../v1/'),
  ]) {
    const guard = new LiveWritePermitGuard();
    guard.arm(comment);
    expect(guard.decide({ ...request, url }).action).toBe('deny');
    expect(guard.status()[0]!.consumed).toBe(false);
  }
});
test('本文・動画ID・コマンド・時刻範囲・dynamic key型・未知fieldsを照合する', () => {
  const packet = { body: comment.body, videoId: 'sm9', commands: ['184'], vposMs: 1500, postKey: 'dummy' };
  const variants: Record<string, unknown>[] = [
    { body: '別本文' },
    { videoId: 'sm100' },
    { commands: ['184', 'red'] },
    { commands: '184' },
    { vposMs: 999 },
    { vposMs: 2001 },
    { vposMs: 1.5 },
    { vposMs: null },
    { postKey: '' },
    { postKey: 7 },
    { extra: true },
  ];
  for (const change of variants) {
    const guard = new LiveWritePermitGuard();
    guard.arm(comment);
    expect(guard.decide({ ...commentRequest(), postData: JSON.stringify({ ...packet, ...change }) }).action).toBe(
      'deny'
    );
    expect(guard.status()[0]!.consumed).toBe(false);
  }
  for (const vposMs of [1000, 2000]) {
    const guard = new LiveWritePermitGuard();
    guard.arm(comment);
    expect(guard.decide({ ...commentRequest(), postData: JSON.stringify({ ...packet, vposMs }) }).action).toBe(
      'allow-write'
    );
  }
});
test('JSONの重複・escaped重複キー・不正JSON・異なるContent-Typeを拒否する', () => {
  const request = commentRequest();
  for (const postData of [
    'null',
    '[]',
    '{broken',
    request.postData!.replace('{', '{"videoId":"sm9",'),
    request.postData!.replace('{', '{"\\u0076ideoId":"sm9",'),
  ]) {
    const guard = new LiveWritePermitGuard();
    guard.arm(comment);
    expect(guard.decide({ ...request, postData }).action).toBe('deny');
  }
  for (const contentType of [
    undefined,
    'text/plain',
    'application/json;charset=shift_jis',
    'application/json;extra=1',
  ]) {
    const guard = new LiveWritePermitGuard();
    guard.arm(comment);
    expect(guard.decide({ ...request, contentType }).action).toBe('deny');
  }
  const quoted = { ...comment, body: '引用 "videoId":"sm100" と } [ の本文' };
  const guard = new LiveWritePermitGuard();
  guard.arm(quoted);
  expect(guard.decide(commentRequest(quoted)).action).toBe('allow-write');
});
test('認証値をsnapshot・結果へ保持せず、動的postKeyが変わっても再送は不可', () => {
  const guard = new LiveWritePermitGuard();
  guard.arm(comment);
  const secret = 'DUMMY-EPHEMERAL-AUTH-VALUE';
  const request = { ...commentRequest(), postData: commentRequest().postData!.replace('opaque-test-key', secret) };
  const decision = guard.decide(request);
  expect(JSON.stringify({ decision, status: guard.status(), guard })).not.toContain(secret);
  expect(guard.decide(commentRequest()).action).toBe('deny');
  const invalid = new LiveWritePermitGuard();
  expect(() => invalid.arm({ ...comment, postKey: secret } as unknown as LiveWritePermit)).toThrow('invalid-permit');
});
test('armは深いコピーを保持し、入力や公開statusを書き換えても許可を拡大しない', () => {
  const commands = ['184'];
  const range = { min: 1000, max: 2000 };
  const permit = { ...comment, commands, vposMs: range };
  const guard = new LiveWritePermitGuard();
  guard.arm(permit);
  commands.push('red');
  range.max = 999999;
  expect(guard.decide(commentRequest(permit)).action).toBe('deny');
  expect(guard.decide(commentRequest()).action).toBe('allow-write');
  const state = guard.status();
  state[0]!.consumed = false;
  expect(guard.decide(commentRequest()).action).toBe('deny');
});
test('非公開list作成は公式formの必須5fieldsを照合し公開化・sort変更・未知fieldsを拒否する', () => {
  for (const defaultSortOrder of ['asc', 'desc'] as const) {
    const permit = { ...create, defaultSortOrder };
    const guard = new LiveWritePermitGuard();
    guard.arm(permit);
    const request = createRequest(permit);
    for (const postData of [
      request.postData + '&iconId=0',
      request.postData + '&extra=1',
      request.postData + '&defaultSortOrder=desc',
      request.postData!.replace('isPublic=false', 'isPublic=true'),
      request.postData!.replace('defaultSortKey=addedAt', 'defaultSortKey=registeredAt'),
      request.postData!.replace(
        `defaultSortOrder=${defaultSortOrder}`,
        `defaultSortOrder=${defaultSortOrder === 'asc' ? 'desc' : 'asc'}`
      ),
      request.postData!.replace('&defaultSortKey=addedAt', ''),
      request.postData!.replace(`&defaultSortOrder=${defaultSortOrder}`, ''),
      request.postData!.replace('isPublic=false', 'isPublic=0'),
    ]) {
      expect(guard.decide({ ...request, postData }).action).toBe('deny');
      expect(guard.status()[0]!.consumed).toBe(false);
    }
    expect(
      guard.decide({
        ...request,
        contentType: 'application/json',
        postData: JSON.stringify({
          name: permit.name,
          description: permit.description,
          isPublic: false,
          defaultSortKey: permit.defaultSortKey,
          defaultSortOrder,
        }),
      })
    ).toEqual({ action: 'deny', reason: 'content-type' });
    expect(guard.decide(request).action).toBe('allow-write');
    expect(guard.decide(request).action).toBe('deny');
  }
});
test('追加は今回の作成成功receiptへ限定し、失敗receiptや別IDへの差替えを拒否する', () => {
  const guard = new LiveWritePermitGuard();
  expect(() => guard.arm(add)).toThrow('mylist-not-created-by-this-run');
  guard.arm(create);
  const receipt = {
    status: 201 as const,
    mylistId: '42',
    name: create.name,
    description: create.description,
    isPublic: false as const,
  };
  expect(() => guard.recordCreatedMylist(create.id, receipt)).toThrow('invalid-created-mylist-receipt');
  guard.decide(createRequest());
  expect(() => guard.recordCreatedMylist(create.id, { ...receipt, status: 403 } as unknown as typeof receipt)).toThrow(
    'invalid-created-mylist-receipt'
  );
  expect(() =>
    guard.recordCreatedMylist(create.id, { ...receipt, isPublic: true } as unknown as typeof receipt)
  ).toThrow('invalid-created-mylist-receipt');
  guard.recordCreatedMylist(create.id, receipt);
  expect(() => guard.recordCreatedMylist(create.id, { ...receipt, mylistId: '43' })).toThrow(
    'created-mylist-already-bound'
  );
  expect(() => guard.arm({ ...add, mylistId: '43' })).toThrow('mylist-not-created-by-this-run');
  guard.arm(add);
  const request = addRequest();
  for (const bad of [
    { ...request, url: request.url.replace('/42/', '/43/') },
    { ...request, postData: 'itemId=sm100&description=x' },
    { ...request, postData: request.postData + '&itemId=sm9' },
    { ...request, url: request.url + '&x=1' },
  ])
    expect(guard.decide(bad).action).toBe('deny');
  expect(guard.decide(request).action).toBe('allow-write');
});
test('動画削除は今回追加したexact itemID一件だけ、list削除は今回作成したexact IDだけ', () => {
  const guard = added();
  expect(() => guard.arm({ id: 'remove-wrong', kind: 'mylist-item-remove', mylistId: '42', itemId: 'sm9' })).toThrow(
    'item-not-added-by-this-run'
  );
  guard.arm({ id: 'item-remove-once', kind: 'mylist-item-remove', mylistId: '42', itemId: '321' });
  guard.arm({ id: 'list-remove-once', kind: 'mylist-remove', mylistId: '42' });
  const url = 'https://nvapi.nicovideo.jp/v1/users/me/mylists/42/items?itemIds=321';
  for (const wrong of [
    url.replace('321', '322'),
    url + '&itemIds=322',
    url.replace('321', '321%2C322'),
    url.replace('/42/', '/43/'),
    'https://nvapi.nicovideo.jp/v1/users/me/watch-later?itemIds=321',
  ])
    expect(guard.decide({ method: 'DELETE', url: wrong }).action).toBe('deny');
  expect(guard.decide({ method: 'DELETE', url }).action).toBe('allow-write');
  expect(guard.decide({ method: 'DELETE', url }).action).toBe('deny');
  expect(guard.decide({ method: 'DELETE', url: 'https://nvapi.nicovideo.jp/v1/users/me/mylists/43' }).action).toBe(
    'deny'
  );
  expect(guard.decide({ method: 'DELETE', url: 'https://nvapi.nicovideo.jp/v1/users/me/mylists/42' }).action).toBe(
    'allow-write'
  );
});
test('失敗/異なる動画/異なるlistの追加receiptから削除許可を作らない', () => {
  const guard = created();
  guard.arm(add);
  const receipt = { status: 201 as const, mylistId: '42', videoId: 'sm9', itemId: '321' };
  expect(() => guard.recordAddedItem(add.id, receipt)).toThrow('invalid-added-item-receipt');
  guard.decide(addRequest());
  for (const bad of [
    { ...receipt, status: 500 },
    { ...receipt, videoId: 'sm100' },
    { ...receipt, mylistId: '43' },
    { ...receipt, itemId: '321,322' },
  ])
    expect(() => guard.recordAddedItem(add.id, bad as typeof receipt)).toThrow('invalid-added-item-receipt');
  guard.recordAddedItem(add.id, receipt);
  expect(() => guard.recordAddedItem(add.id, { ...receipt, itemId: '322' })).toThrow('added-item-already-bound');
});
test('permit自体の範囲・ID・未知fieldを実行時も検証する', () => {
  for (const bad of [
    { ...comment, videoId: 'sm9/other' },
    { ...comment, threadId: '1/other' },
    { ...comment, body: '' },
    { ...comment, body: 'あ'.repeat(76) },
    { ...comment, commands: ['red big'] },
    { ...comment, vposMs: { min: 2, max: 1 } },
    { ...comment, vposMs: { min: -1, max: 1 } },
    { ...create, isPublic: true },
    { ...create, defaultSortKey: 'registeredAt' },
    { ...create, defaultSortKey: '' },
    { ...create, defaultSortOrder: 'random' },
    { ...create, defaultSortOrder: undefined },
    { ...create, encoding: 'json' },
    { ...create, iconId: '0' },
    { ...comment, extra: true },
  ]) {
    const guard = new LiveWritePermitGuard();
    expect(() => guard.arm(bad as LiveWritePermit)).toThrow('invalid-permit');
    expect(guard.status()).toEqual([]);
  }
});
