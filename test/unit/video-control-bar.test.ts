import { expect, test } from 'bun:test';

Object.assign(globalThis, { HTMLCanvasElement: window.HTMLCanvasElement });
const { CommentPreviewModel } = await import('../../src/video-control-bar/index');

test('コメントプレビューは動画位置に合わせて昇順コメント範囲を選ぶ', () => {
  const model = new CommentPreviewModel();
  const chats = [
    { vpos: 1000, uniqNo: 1 },
    { vpos: 700, uniqNo: 3 },
    { vpos: 1500, uniqNo: 2 },
    { vpos: 300, uniqNo: 4 },
    { vpos: 1601, uniqNo: 5 },
  ];
  model.chatList = { top: [], naka: chats, bottom: [] };
  model.currentTime = 11;

  expect(model.chatList.map((chat) => chat.vpos)).toEqual([300, 700, 1000, 1500, 1601]);
  expect(model.currentChatList.map((chat) => chat.vpos)).toEqual([700, 1000]);
  expect(model.currentIndex).toBe(2);
});
