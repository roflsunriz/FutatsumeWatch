import { describe, expect, it } from 'bun:test';
import { NicoChat } from '../../packages/futatsume/src/commentLayer/NicoChat';
import { NicoScripter, NicoScriptParser } from '../../packages/futatsume/src/commentLayer/NicoScripter';

describe('NicoScriptParser.parseParams', () => {
  it('シングルクォートとダブルクォートのエスケープ規則を守る', () => {
    const str = "target:'owner',src:'~',dest:\"\\r\", dest2: 'シングルクォート中では\\rエスケープされない'";
    const p = NicoScriptParser.parseParams(str);

    expect(p?.target).toBe('owner');
    expect(p?.src).toBe('~');
    expect(p?.dest).toBe('\n');
    expect(p?.dest2).toBe('シングルクォート中では\\rエスケープされない');
  });

  it('閉じた後のクォート崩れでは null を返す', () => {
    // 不正経路は window.console へ報告するため、bun 環境では退避付きで用意する
    const scope = globalThis as unknown as Record<string, unknown>;
    const prev = scope.window;
    scope.window = { console };
    try {
      expect(NicoScriptParser.parseParams("a:'b'c'd")).toBeNull();
    } finally {
      if (prev === undefined) {
        delete scope.window;
      } else {
        scope.window = prev;
      }
    }
  });
});

describe('NicoScriptParser.parseNicosParams', () => {
  it('「」でもクォートできる', () => {
    const p = NicoScriptParser.parseNicosParams('＠置換　U　「( ˘ω˘)ｽﾔｧ」 全');

    expect(p[0]).toBe('＠置換');
    expect(p[1]).toBe('U');
    expect(p[2]).toBe('( ˘ω˘)ｽﾔｧ');
    expect(p[3]).toBe('全');
  });
});

describe('NicoScriptParser.splitLines', () => {
  it('クォート内のセミコロンを分割しない', () => {
    const str =
      "/replace(target:'owner user',src:'~',dest:\"\\r\");     /replace(target:'owner user',src:'И;;;;',dest:\"██\")   ;/replace(target:'owner user',src:'Щ',dest:\"▇▇\")";
    const p = NicoScriptParser.splitLines(str);

    expect(p.length).toBe(3);
    expect(p[1]).toBe("/replace(target:'owner user',src:'И;;;;',dest:\"██\")");
  });
});

describe('NicoScriptParser.parseNicos', () => {
  it('＠置換を REPLACE として解釈する', () => {
    const parsed = NicoScriptParser.parseNicos('＠置換 hello こんにちは');

    expect(parsed.type).toBe('REPLACE');
    expect(typeof parsed.id).toBe('number');
  });

  it('＠ジャンプの動画ID遷移先を JUMP として解釈する', () => {
    const parsed = NicoScriptParser.parseNicos('＠ジャンプ sm123');

    expect(parsed.type).toBe('JUMP');
  });

  it('＠ジャンプの時刻指定を SEEK として解釈する', () => {
    const parsed = NicoScriptParser.parseNicos('＠ジャンプ #1:30');

    expect(parsed.type).toBe('SEEK');
  });
});

describe('NicoScripter.apply', () => {
  it('＠置換で対象コメントの本文を置換する', () => {
    const scripter = new NicoScripter();
    const nicos = NicoChat.create({ text: '＠置換 hello こんにちは', vpos: 0, fork: 1 });
    const target = NicoChat.create({ text: 'say hello world', vpos: 100, fork: 0 });
    scripter.add(nicos);

    scripter.apply([target]);

    expect(target.text).toBe('say こんにちは world');
  });

  it('＠ジャンプで次動画IDを記録する', () => {
    const scripter = new NicoScripter();
    const nicos = NicoChat.create({ text: '＠ジャンプ sm123', vpos: 0, fork: 1 });
    scripter.add(nicos);

    scripter.apply([]);

    expect(scripter.getNextVideo()).toBe('sm123');
  });

  it('時間窓外のコメントには適用しない', () => {
    const scripter = new NicoScripter();
    const nicos = NicoChat.create({ text: '＠置換 hello こんにちは', vpos: 0, fork: 1 });
    const far = NicoChat.create({ text: 'say hello world', vpos: 99999999, fork: 0 });
    scripter.add(nicos);

    scripter.apply([far]);

    expect(far.text).toBe('say hello world');
  });
});
