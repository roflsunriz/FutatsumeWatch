import { expect, test } from 'bun:test';
import { Config } from '../../src/config';
import { Emitter } from '../../src/baselib';
import { uq } from '../../packages/lib/src/u-query';
await Config.promise('restore');
Object.assign(globalThis, {
  Window: window.Window,
  HTMLCollection: window.HTMLCollection,
  NodeList: window.NodeList,
  Node: window.Node,
  Document: window.Document,
});
const { CommentPanel } = await import('../../src/comment-panel');
type Params = ConstructorParameters<typeof CommentPanel>[0];
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
function create() {
  const player = new Emitter();
  const panel = new CommentPanel({
    player: player as unknown as Params['player'],
    $container: uq(document.createElement('div')) as unknown as Params['$container'],
  });
  const chat = {
    vpos: '100',
    text: '対象',
    userId: 'user',
    date: 1,
    fork: 0,
    no: 1,
    color: '',
    fontCommand: '',
    isSubThread: false,
    cmd: '',
    uniqNo: '1',
    threadId: '1',
    time3d: 0,
    time3dp: 0,
    nicoru: 2,
    nicotta: false,
    duration: 3,
    valhalla: '',
    isMine: true,
  };
  panel.setChatList({ top: [], naka: [chat], bottom: [] });
  const model = Reflect.get(panel, '_model') as { _items: Array<{ itemId: number }> };
  const itemId = String(model._items[0]!.itemId);
  const events: Array<{ resolve(value?: { count?: number }): void; reject(error: Error): void }> = [];
  for (const event of ['deleteChat', 'nicoruChat'])
    panel.on(event, (request) =>
      events.push(request as { resolve(value?: { count?: number }): void; reject(error: Error): void })
    );
  return { panel, player, chat, model, itemId, events };
}
test('P3-08 削除失敗は行を残し、成功後だけ除去して連打を1要求にする', async () => {
  const f = create();
  f.panel._onCommand('removeComment', null, f.itemId);
  f.panel._onCommand('removeComment', null, f.itemId);
  expect(f.events).toHaveLength(1);
  expect(f.model._items).toHaveLength(1);
  f.events[0]!.reject(new Error('拒否'));
  await flush();
  expect(f.model._items).toHaveLength(1);
  f.panel._onCommand('removeComment', null, f.itemId);
  f.events[1]!.resolve();
  await flush();
  expect(f.model._items).toHaveLength(0);
});
test('P3-08 ニコるの拒否では件数と状態を変更せず、受理件数を反映する', async () => {
  const f = create();
  f.panel._onCommand('nicoru', null, f.itemId);
  f.panel._onCommand('nicoru', null, f.itemId);
  expect(f.events).toHaveLength(1);
  expect(f.chat.nicoru).toBe(2);
  expect(f.chat.nicotta).toBe(false);
  f.events[0]!.reject(new Error('拒否'));
  await flush();
  expect(f.chat.nicoru).toBe(2);
  expect(f.chat.nicotta).toBe(false);
  f.panel._onCommand('nicoru', null, f.itemId);
  f.events[1]!.resolve({ count: 7 });
  await flush();
  expect(f.chat.nicoru).toBe(7);
  expect(f.chat.nicotta).toBe(true);
});
test('P3-08 動画終了後に保留中のニコる結果を適用しない', async () => {
  const f = create();
  f.panel._onCommand('nicoru', null, f.itemId);
  f.player.emit('close');
  f.events[0]!.resolve({ count: 99 });
  await flush();
  expect(f.chat.nicoru).toBe(2);
  expect(f.chat.nicotta).toBe(false);
  expect(f.model._items).toHaveLength(0);
});
