import { describe, expect, it } from 'bun:test';
import { CONSTANT } from '../../src/constant';

describe('constant', () => {
  it('レイアウト定数が正の数値である', () => {
    expect(CONSTANT.BASE_Z_INDEX).toBeGreaterThan(0);
    expect(CONSTANT.CONTROL_BAR_HEIGHT).toBe(40);
    expect(CONSTANT.SIDE_PLAYER_WIDTH).toBe(400);
    expect(CONSTANT.BIG_PLAYER_WIDTH).toBe(896);
    expect(CONSTANT.RIGHT_PANEL_WIDTH).toBe(320);
    expect(CONSTANT.BOTTOM_PANEL_HEIGHT).toBe(240);
  });

  it('空動画 URL は base 連結回避のため // である', () => {
    expect(CONSTANT.BLANK_VIDEO_URL).toBe('//');
  });

  it('MEDIA_ERROR のコード体系を保つ', () => {
    expect(CONSTANT.MEDIA_ERROR.MEDIA_ERR_ABORTED).toBe(1);
    expect(CONSTANT.MEDIA_ERROR.MEDIA_ERR_NETWORK).toBe(2);
    expect(CONSTANT.MEDIA_ERROR.MEDIA_ERR_DECODE).toBe(3);
    expect(CONSTANT.MEDIA_ERROR.MEDIA_ERR_SRC_NOT_SUPPORTED).toBe(4);
  });

  it('CSS 変数ブロックが 8 変数を含む', () => {
    const vars = CONSTANT.BASE_CSS_VARS;
    for (const key of [
      'base-bg-color',
      'base-fore-color',
      'light-text-color',
      'scrollbar-bg-color',
      'scrollbar-thumb-color',
      'item-border-color',
      'hatsune-color',
      'enabled-button-color',
    ]) {
      expect(vars).toContain(`--${key}:`);
    }
  });

  it('共通 CSS が変数ブロックと主要クラスを含む', () => {
    expect(CONSTANT.COMMON_CSS).toContain(CONSTANT.BASE_CSS_VARS);
    expect(CONSTANT.COMMON_CSS).toContain('.FutatsumeButton');
    expect(CONSTANT.COMMON_CSS).toContain('.futatsumePopupMenu');
  });

  it('スクロールバー CSS が対象セレクターを含む', () => {
    expect(CONSTANT.SCROLLBAR_CSS).toContain('::-webkit-scrollbar');
    expect(CONSTANT.SCROLLBAR_CSS).toContain('var(--scrollbar-bg-color)');
  });
});
