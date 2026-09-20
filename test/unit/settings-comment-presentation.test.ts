import { afterEach, describe, expect, test } from 'bun:test';
import { Config } from '../../src/config';
import { NicoChat } from '../../packages/futatsume/src/commentLayer/nico-chat';
import { commentPresentation, decorateOverlayComment, overlayEntry } from '../../src/comment-overlay-data';
import { CommentRenderer, cloneDefaultSettings } from 'comment-overlay';

const keys = [
  'baseFontFamily',
  'baseFontBolder',
  'baseChatScale',
  'commentLayer.easyCommentOpacity',
  'commentLayer.aiCommentOpacity',
  'commentLayer.textShadowType',
  'commentLayer.ownerCommentShadowColor',
] as const;
const original = Object.fromEntries(keys.map((key) => [key, Config.getValue(key)]));
afterEach(() => {
  for (const key of keys) Config.setValue(key, original[key]);
});

describe('コメント設定から描画データへの反映', () => {
  test('フォント・太字・倍率は通常コメントへ適用し、フォントコマンドを優先する', () => {
    Config.setValue('baseFontFamily', 'monospace');
    Config.setValue('baseFontBolder', false);
    Config.setValue('baseChatScale', 1.5);
    const ordinary = commentPresentation(NicoChat.create({ text: 'test' }));
    expect(ordinary.fontFamily).toBe('monospace');
    expect(ordinary.fontWeight).toBe('normal');
    expect(ordinary.scale).toBe(1.5);
    const mincho = commentPresentation(NicoChat.create({ text: 'test', cmd: 'mincho' }));
    expect(mincho.fontFamily).toBe('');
    expect(mincho.fontWeight).toBeNull();
  });
  for (const fork of [0, 1, 2, 3]) {
    test(`fork ${fork} の不透明度は全体と種別を一度ずつ適用する`, () => {
      Config.setValue('commentLayer.easyCommentOpacity', 0.4);
      Config.setValue('commentLayer.aiCommentOpacity', 0.7);
      const source = NicoChat.create({ text: 'test', fork });
      const renderer = new CommentRenderer({ ...cloneDefaultSettings(), commentOpacity: 0.5 });
      const [comment] = renderer.addComments([overlayEntry(source)]);
      decorateOverlayComment(comment!, commentPresentation(source), renderer);
      comment!.syncWithSettings(renderer.settings, 1);
      expect(comment!.opacity).toBeCloseTo(0.5 * (fork === 2 ? 0.4 : fork === 3 ? 0.7 : 1));
    });
  }
  for (const shadow of ['', 'shadow-type2', 'shadow-type3', 'shadow-stroke', 'shadow-dokaben']) {
    test(`影 ${shadow || 'default'} と投稿者専用の色を通常コメントへ混入させない`, () => {
      Config.setValue('commentLayer.textShadowType', shadow);
      Config.setValue('commentLayer.ownerCommentShadowColor', '#123456');
      const owner = commentPresentation(NicoChat.create({ text: 'owner', fork: 1 }));
      const normal = commentPresentation(NicoChat.create({ text: 'normal', fork: 0 }));
      expect(owner.shadow).toBe(shadow);
      expect(owner.shadowColor).toBe('#123456');
      expect(normal.shadow).toBe(shadow);
      expect(normal.shadowColor).toBe('#000000');
    });
  }
});
