import { describe, expect, it } from 'bun:test';
import { setupNicoDom } from './nico-test-setup';
import { parseThumbInfo } from '../../packages/lib/src/nico/parseThumbInfo';

setupNicoDom();

const OK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="ok">
  <thumb>
    <video_id>sm9</video_id>
    <title>テスト動画</title>
    <description>説明文</description>
    <thumbnail_url>http://nicovideo.cdn.nimg.jp/thumbnails/9/9</thumbnail_url>
    <first_retrieve>2007-03-06T00:33:00+09:00</first_retrieve>
    <length>5:20</length>
    <movie_type>flv</movie_type>
    <size_high>21138631</size_high>
    <size_low>17436492</size_low>
    <view_counter>18135121</view_counter>
    <comment_num>4843412</comment_num>
    <mylist_counter>176842</mylist_counter>
    <last_res_body>コメント</last_res_body>
    <watch_url>https://www.nicovideo.jp/watch/sm9</watch_url>
    <thumb_type>video</thumb_type>
    <embeddable>1</embeddable>
    <no_live_play>0</no_live_play>
    <tags domain="jp">
      <tag lock="1">音楽</tag>
      <tag>ゲーム</tag>
    </tags>
    <genre>未設定</genre>
    <user_id>4</user_id>
    <user_nickname>中の</user_nickname>
    <user_icon_url>https://example.com/icon.jpg</user_icon_url>
  </thumb>
</nicovideo_thumb_response>
`;

const FAIL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="fail">
  <error>
    <code>DELETED</code>
    <description>deleted</description>
  </error>
</nicovideo_thumb_response>
`;

describe('parseThumbInfo', () => {
  it('正常系のXMLをパースする', () => {
    const info = parseThumbInfo(OK_XML);
    expect(info.status).toBe('ok');
    if (info.status !== 'ok') {
      return;
    }
    expect(info.v).toBe('sm9');
    expect(info.id).toBe('sm9');
    expect(info.title).toBe('テスト動画');
    expect(info.duration).toBe(5 * 60 + 20);
    expect(info.viewCount).toBe(18135121);
    expect(info.commentCount).toBe(4843412);
    expect(info.mylistCount).toBe(176842);
    expect(info.isChannel).toBe(false);
    expect(info.thumbnail).toBe('https://nicovideo.cdn.nimg.jp/thumbnails/9/9');
    expect(info.tagList).toHaveLength(2);
    expect(info.tagList[0]?.text).toBe('音楽');
    expect(info.tagList[0]?.lock).toBe(true);
    expect(info.tagList[1]?.lock).toBe(false);
    expect(info.owner?.type).toBe('user');
    expect(info.owner?.id).toBe('4');
  });

  it('so始まりのvideo_idをチャンネルとして扱う', () => {
    const xml = OK_XML.replaceAll('<video_id>sm9</video_id>', '<video_id>so9</video_id>').replaceAll(
      'https://www.nicovideo.jp/watch/sm9',
      'https://www.nicovideo.jp/watch/so9'
    );
    const info = parseThumbInfo(xml);
    expect(info.status).toBe('ok');
    if (info.status !== 'ok') {
      return;
    }
    expect(info.isChannel).toBe(true);
    expect(info.v).toBe('so9');
  });

  it('失敗応答をfailとして返す', () => {
    const info = parseThumbInfo(FAIL_XML);
    expect(info.status).toBe('fail');
    if (info.status !== 'fail') {
      return;
    }
    expect(info.code).toBe('DELETED');
    expect(info.message).toBe('deleted');
  });

  it('パース済みオブジェクトはそのまま返す', () => {
    const parsed = parseThumbInfo(OK_XML);
    expect(parseThumbInfo(parsed)).toBe(parsed);
  });
});
