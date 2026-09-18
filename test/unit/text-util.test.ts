import { describe, expect, it } from 'bun:test';
import { textUtil } from '../../packages/lib/src/text/textUtil';

describe('textUtil.secToTime', () => {
  it('秒を mm:ss 形式にする', () => {
    expect(textUtil.secToTime(0)).toBe('00:00');
    expect(textUtil.secToTime(65)).toBe('01:05');
    expect(textUtil.secToTime(600)).toBe('10:00');
  });
});

describe('textUtil.parseQuery', () => {
  it('クエリ文字列を辞書にする', () => {
    expect(textUtil.parseQuery('?a=1&b=2')).toEqual({ a: '1', b: '2' });
    expect(textUtil.parseQuery('a=%E3%81%82')).toEqual({ a: 'あ' });
  });

  it('値に = を含めても壊さない', () => {
    expect(textUtil.parseQuery('a=b=c')).toEqual({ a: 'b=c' });
  });
});

describe('textUtil.escapeHtml', () => {
  it('HTML 特殊文字をエスケープし、戻せる', () => {
    const src = `<a href="x">&'`;
    const escaped = textUtil.escapeHtml(src);
    expect(escaped).not.toContain('<');
    expect(textUtil.unescapeHtml(escaped)).toBe(src);
  });
});

describe('textUtil.escapeToZenkaku', () => {
  it('半角記号を全角に置き換える', () => {
    expect(textUtil.escapeToZenkaku('<"\'>')).toBe('＜”’＞');
  });
});

describe('textUtil.escapeRegs', () => {
  it('正規表現の特殊文字をエスケープする', () => {
    const src = 'a.b(c)';
    expect(new RegExp(textUtil.escapeRegs(src)).test(src)).toBe(true);
  });
});

describe('textUtil.convertKansuEi', () => {
  it('漢数字を英数字に置き換える', () => {
    expect(textUtil.convertKansuEi('三話')).toBe('3話');
    expect(textUtil.convertKansuEi('十二話')).toBe('12話');
  });
});

describe('textUtil.dateToString', () => {
  it('不正な入力はエポック起点を返す', () => {
    expect(textUtil.dateToString('not a date')).toBe('not a date');
    expect(textUtil.dateToString(new Date(Number.NaN))).toBe('1970/01/01 00:00:00');
  });

  it('Date を所定形式にする', () => {
    const d = new Date(2026, 0, 2, 3, 4, 5);
    expect(textUtil.dateToString(d)).toBe('2026/01/02 03:04:05');
  });
});

describe('textUtil.isValidJson', () => {
  it('JSON 可否を判定する', () => {
    expect(textUtil.isValidJson('{"a":1}')).toBe(true);
    expect(textUtil.isValidJson('{a:}')).toBe(false);
  });
});

describe('textUtil.toRgba', () => {
  it('#rrggbb を rgba にする', () => {
    expect(textUtil.toRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });
});

describe('textUtil snake/camel', () => {
  it('相互変換できる', () => {
    expect(textUtil.snakeToCamel('foo-bar')).toBe('fooBar');
    expect(textUtil.camelToSnake('fooBar')).toBe('foo_bar');
  });
});

describe('textUtil base64', () => {
  it('往復ができる (decode は URL セーフ表記も受ける)', () => {
    const src = 'こんにちは:Hello/World?';
    const encoded = textUtil.encodeBase64(src);
    expect(textUtil.decodeBase64(encoded)).toBe(src);
    expect(textUtil.decodeBase64(encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))).toBe(src);
  });

  it('壊れた入力は空文字を返す', () => {
    expect(textUtil.decodeBase64('!!!')).toBe('');
  });
});
