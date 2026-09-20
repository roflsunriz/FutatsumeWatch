import { describe, expect, test } from 'bun:test';
import { CommentRenderer, cloneDefaultSettings } from 'comment-overlay';
import { NicoChat } from '../../packages/futatsume/src/commentLayer/NicoChat';
import { NicoComment } from '../../packages/futatsume/src/commentLayer/NicoComment';
import { overlayEntry, decorateOverlayComment, commentPresentation } from '../../src/comment-overlay-data';
import { Config } from '../../src/Config';

const legacy = (text: string, no: number, extra: Record<string, unknown> = {}) => ({
  chat: { content: text, mail: '', no, thread: 123, vpos: 500, user_id: `user${no}`, ...extra },
});

describe('comment-overlayへのコメント移行', () => {
  test('空の一覧を参照してから投稿しても重複せず、一度の取り消しで消える', () => {
    const model = new NicoComment({});
    expect(model.chatList.top).toHaveLength(0);
    const chat = NicoChat.create({ text: 'preview', cmd: 'ue', no: 42 });
    model.addChat(chat);
    expect(model.chatList.top).toHaveLength(1);
    expect(model.nonFilteredChatList.top).toHaveLength(1);
    model.removeChat(chat);
    expect(model.chatList.top).toHaveLength(0);
  });
  test('空白・改行・ミリ秒とコメントの同一性を保持する', () => {
    const chat = NicoChat.create({
      text: '\u3000 AA\n\u00a0 BB ',
      cmd: 'ue big mincho #123456',
      vpos: 123.4,
      no: 3,
      fork: 1,
      thread: 42,
    });
    const entry = overlayEntry(chat);
    expect(entry.text).toBe('\u3000 AA\n\u00a0 BB ');
    expect(entry.vposMs).toBe(1234);
    const renderer = new CommentRenderer(cloneDefaultSettings());
    const [comment] = renderer.addComments([entry]);
    expect(comment?.layout).toBe('ue');
    expect(comment?.size).toBe('big');
    expect(comment?.color).toBe('#123456');
    expect(comment?.meta?.threadId).toBe('42');
  });
  test('終端時刻をランダム補正せず、新エンジンが終端3秒前へ丸める', () => {
    const renderer = new CommentRenderer(cloneDefaultSettings());
    renderer.duration = 10000;
    for (const cmd of ['ue', 'shita', 'naka']) {
      const chat = NicoChat.create({ text: cmd, cmd, vpos: 990 }, { videoDuration: 10 });
      expect(chat.vpos).toBe(990);
      const [comment] = renderer.addComments([overlayEntry(chat)]);
      expect(comment).toBeDefined();
      // npm 4.1.6 は横流れの進入を表示基準より2秒前から準備する。
      expect(renderer.getEffectiveCommentVpos(comment!)).toBe(cmd === 'naka' ? 5000 : 7000);
    }
  });
  test('NG・置換・追加・取り消し後も非フィルター一覧を保持する', async () => {
    const model = new NicoComment({ filter: { wordFilter: 'blocked' } });
    await model.setData([legacy('blocked', 1), legacy('old text', 2)], { replacement: { old: 'new' } });
    expect(model.chatList.naka.map((chat) => chat.text)).toEqual(['new text']);
    expect(model.nonFilteredChatList.naka).toHaveLength(2);
    const pending = NicoChat.create({ text: 'new post', no: 3, thread: 123 });
    model.addChat(pending);
    expect(model.chatList.naka).toHaveLength(2);
    model.removeChat(pending);
    expect(model.chatList.naka.map((chat) => chat.text)).toEqual(['new text']);
    model.removeChat(NicoChat.create({ text: 'absent', no: 999, thread: 123 }));
    expect(model.nonFilteredChatList.naka).toHaveLength(2);
    model.clear();
    await model.setData([legacy('next video', 4)], {});
    expect(model.chatList.naka.map((chat) => chat.text)).toEqual(['next video']);
  });
  test('現行threadsとXMLを同じデータモデルへ変換する', async () => {
    const model = new NicoComment({});
    await model.setThreads(
      {
        threads: [
          {
            id: 42,
            info: { fork: 2, layer: { index: 0 }, label: 'easy' },
            comments: [
              {
                body: 'easy',
                commands: ['shita'],
                postedAt: '2026-09-20T00:00:00Z',
                vposMs: 1250,
                isPremium: false,
                userId: 'u',
                isMyPost: false,
                nicoruCount: 0,
              },
            ],
          },
        ],
      },
      {}
    );
    expect(model.chatList.bottom[0]?.vpos).toBe(125);
    expect(model.chatList.bottom[0]?.size).toBe('small');
    const xml = new DOMParser().parseFromString(
      '<packet><chat no="7" thread="42" vpos="234" mail="ue">　XML</chat></packet>',
      'text/xml'
    );
    await model.setXml(xml, { format: 'xml' });
    expect(model.chatList.top[0]?.text).toBe('　XML');
    expect(model.chatList.top[0]?.vpos).toBe(234);
  });
  test('半透明コマンドを二重適用せず、逆再生属性を受け渡す', () => {
    const renderer = new CommentRenderer(cloneDefaultSettings());
    const chat = NicoChat.create({ text: 'live', cmd: '_live', vpos: 0, isReverse: true });
    const [comment] = renderer.addComments([overlayEntry(chat)]);
    decorateOverlayComment(comment!, commentPresentation(chat), renderer);
    comment!.syncWithSettings(renderer.settings, 10);
    expect(comment!.opacity).toBe(0.5);
    expect(comment!.scrollDirection).toBe('ltr');
    expect(Config.props.baseChatScale).toBe(1);
  });
});
