import { describe, expect, test } from 'bun:test';
import { NicoChat } from '../../packages/futatsume/src/commentLayer/nico-chat';
import { NicoChatFilter } from '../../packages/futatsume/src/commentLayer/nico-chat-filter';

const chat = (no: number, props: Record<string, string | number> = {}) =>
  NicoChat.create({ text: `text-${no}`, no, fork: 0, score: 0, user_id: String(no), ...props });

describe('NG設定の対象別効果と解除', () => {
  for (const fork of [0, 1, 2, 3] as const) {
    test(`fork${fork} は対象だけを除外し、解除で復元する`, () => {
      const filter = new NicoChatFilter({ sharedNgLevel: 'NONE' });
      const comments = [0, 1, 2, 3].map((value) => chat(value + 1, { fork: value }));
      const key = `fork${fork}` as const;
      filter[key] = false;
      expect(filter.applyFilter(comments).map((c) => c.fork)).toEqual([0, 1, 2, 3].filter((value) => value !== fork));
      filter[key] = true;
      expect(filter.applyFilter(comments)).toEqual(comments);
    });
  }
  for (const [key, label] of [
    ['defaultThread', 'default'],
    ['ownerThread', 'owner'],
    ['communityThread', 'community'],
    ['nicosThread', 'nicos'],
    ['easyThread', 'easy'],
    ['aiThread', 'ai'],
    ['extraCommunityThread', 'extra-community'],
    ['extraEasyThread', 'extra-easy'],
  ] as const) {
    test(`${key} は対応スレッドだけを切り替える`, () => {
      const filter = new NicoChatFilter({ sharedNgLevel: 'NONE' });
      const target = chat(1, { threadLabel: label });
      const other = chat(2, { threadLabel: 'unrelated' });
      filter[key] = false;
      expect(filter.applyFilter([target, other])).toEqual([other]);
      filter[key] = true;
      expect(filter.applyFilter([target, other])).toEqual([target, other]);
    });
  }
  for (const [level, threshold] of [
    ['NONE', -99999],
    ['LOW', -10000],
    ['MID', -5000],
    ['HIGH', -1000],
    ['MAX', -1],
  ] as const) {
    test(`共有NG ${level} の境界を判定し、投稿者コメントを保持する`, () => {
      const filter = new NicoChatFilter({ sharedNgLevel: level });
      const denied = chat(1, { score: threshold });
      const allowed = chat(2, { score: threshold + 1 });
      const owner = chat(3, { fork: 1, score: threshold - 1 });
      expect(filter.applyFilter([denied, allowed, owner])).toEqual([allowed, owner]);
      filter.isEnable = false;
      expect(filter.applyFilter([denied, allowed, owner])).toEqual([denied, allowed, owner]);
    });
  }
  test('単語・コマンド・ユーザーと同一発言者をそれぞれ除外し、OFFで復元する', () => {
    const comments = [
      chat(1, { text: 'blocked', user_id: 'same' }),
      chat(2, { user_id: 'same' }),
      chat(3, { cmd: 'red' }),
      chat(4, { user_id: 'denied' }),
      chat(5),
    ];
    const filter = new NicoChatFilter({
      wordFilter: ['blocked'],
      commandFilter: ['red'],
      userIdFilter: ['denied'],
      removeNgMatchedUser: true,
    });
    expect(filter.applyFilter(comments)).toEqual([comments[4]!]);
    filter.isEnable = false;
    expect(filter.applyFilter(comments)).toEqual(comments);
  });
  for (const flags of ['g', 'y', 'gi']) {
    test(`正規表現 ${flags} は前のコメントの一致位置に依存しない`, () => {
      const filter = new NicoChatFilter({ wordRegFilter: 'blocked', wordRegFilterFlags: flags });
      const comments = [
        chat(1, { text: 'blocked' }),
        chat(2, { text: 'blocked' }),
        chat(3, { text: 'safe' }),
        chat(4, { text: 'blocked' }),
      ];
      expect(filter.applyFilter(comments)).toEqual([comments[2]!]);
      expect(filter.applyFilter(comments)).toEqual([comments[2]!]);
    });
  }
});
