import { describe, expect, it } from 'bun:test';
import { NicoScriptParser } from '../../packages/zenza/src/commentLayer/NicoScripter';

const nicos = NicoScriptParser;

describe('parseParams', () => {
  it('ニワン語シングルクォート、ダブルクォート対応', () => {
    ///replace(target:'owner',src:'~',dest:"\r")
    const str = "target:'owner',src:'~',dest:\"\\r\", dest2: 'シングルクォート中では\\rエスケープされない'";
    const p = nicos.parseParams(str);
    if (p === null) {
      throw new Error('parseParams が null を返した');
    }

    expect(p.target).toBe('owner');
    expect(p.src).toBe('~');
    expect(p.dest).toBe('\n');
    expect(p.dest2).toBe('シングルクォート中では\\rエスケープされない');
  });
});

describe('parseNicosParams', () => {
  it('ニコスクリプトは「」でもクォートできるらしい', () => {
    let str = '＠置換　U　「( ˘ω˘)ｽﾔｧ」 全';
    let p = nicos.parseNicosParams(str);
    //console.log(JSON.stringify(p));

    expect(p[0]).toBe('＠置換');
    expect(p[1]).toBe('U');
    expect(p[2]).toBe('( ˘ω˘)ｽﾔｧ');
    expect(p[3]).toBe('全');

    str = '＠置換 U あああ "あああ\'いいい"';
    p = nicos.parseNicosParams(str);
    //console.log(JSON.stringify(p));

    expect(p[0]).toBe('＠置換');
    expect(p[1]).toBe('U');
    expect(p[2]).toBe('あああ');
    expect(p[3]).toBe("あああ'いいい");
  });
});

// /replace(target:'owner user',src:'~',dest:"\r");/replace(target:'owner user',src:'И',dest:"██");/replace(target:'owner user',src:'Щ',dest:"▇▇");/replace(target:'owner user',src:'Ы',dest:"<U+3000><U+3000>");/replace(target:'owner user',src:'Ф',dest:"  "); B="█"; S="<U+3000>"; N=" \n"; F=" \n+ \n+ \n+ \n+ \n+ \n+ \n+ \n+ \n+ \n"
// /def_kari("ss", $1.color=$2; $1.x=$3; $1.y=$4; $1.width=$5; $1.height=$6; $1.alpha=$7||0; $1.shape="rect"; $1.mover=""; $1.pos=""; ($8!=nil).alt(($8.indexOf("c")>=0).alt($1.shape="circle"); ($8.indexOf("sm")>=0).alt($1.mover="smooth");($8.indexOf("si")>=0).alt($1.mover="simple"); ($8.indexOf("hu")>=0).alt($1.pos="hidariue")))
// /def_kari("tt", $1.color=$2; $1.x=$3; $1.y=$4; $1.scale=$5; $1.text=$6; $1.alpha=$7||0; $1.filter=""; $1.mover=""; $1.bold=false; $1.pos=""; ($8!=nil).alt(($8.indexOf("k")>=0).alt($1.filter="kasumi"); ($8.indexOf("f")>=0).alt($1.filter="fuchi"); ($8.indexOf("b")>=0).alt($1.bold=true); ($8.indexOf("sm")>=0).alt($1.mover="smooth"); ($8.indexOf("si")>=0).alt($1.mover="simple"); ($8.indexOf("hu")>=0).alt($1.pos="hidariue")))
describe('splitLines', () => {
  it('前後のスペースは除去される', () => {
    const str =
      "/replace(target:'owner user',src:'~',dest:\"\\r\");     /replace(target:'owner user',src:'И;;;;',dest:\"██\")   ;/replace(target:'owner user',src:'Щ',dest:\"▇▇\");/replace(target:'owner user',src:'Ы',dest:\"　　\");/replace(target:'owner user',src:'Ф',dest:\"  \"); B=\"█\"; S=\"　\"; N=\" \n\"; F=\" \n+ \n+ \n+ \n+ \n+ \n+ \n+ \n+ \n+ \n\"";
    const p = nicos.splitLines(str);
    //console.log(JSON.stringify(p));

    expect(p.length).toBe(9);
    expect(p[1]).toBe("/replace(target:'owner user',src:'И;;;;',dest:\"██\")");
  });
});
