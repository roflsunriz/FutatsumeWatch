const sm9 = `
<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="ok">
  <thumb>
    <video_id>sm9</video_id>
    <title>新・豪血寺一族 -煩悩解放 - レッツゴー！陰陽師</title>
    <description>レッツゴー！陰陽師（フルコーラスバージョン）</description>
    <thumbnail_url>http://nicovideo.cdn.nimg.jp/thumbnails/9/9</thumbnail_url>
    <first_retrieve>2007-03-06T00:33:00+09:00</first_retrieve>
    <length>5:20</length>
    <movie_type>flv</movie_type>
    <size_high>21138631</size_high>
    <size_low>17436492</size_low>
    <view_counter>18135121</view_counter>
    <comment_num>4843412</comment_num>
    <mylist_counter>176842</mylist_counter>
    <last_res_body>悪霊退散卍悪霊退散卍 獅子手脳(666) 悪霊退散卍悪霊退散卍 悪霊退散卍悪霊退... </last_res_body>
    <watch_url>https://www.nicovideo.jp/watch/sm9</watch_url>
    <thumb_type>video</thumb_type>
    <embeddable>1</embeddable>
    <no_live_play>0</no_live_play>
    <tags domain="jp">
      <tag lock="1">陰陽師</tag>
      <tag lock="1">レッツゴー！陰陽師</tag>
      <tag lock="1">公式</tag>
      <tag lock="1">音楽</tag>
      <tag lock="1">ゲーム</tag>
    </tags>
    <genre>未設定</genre>
    <user_id>4</user_id>
    <user_nickname>中の</user_nickname>
    <user_icon_url>https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/0/4.jpg?1271141672</user_icon_url>
  </thumb>
</nicovideo_thumb_response>
`;
export interface VideoTag {
  text: string | null;
  category: boolean;
  lock: boolean;
}

export interface ThumbOwnerInfo {
  type: 'user' | 'channel';
  id: string;
  linkId: string;
  name: string;
  url: string;
  icon: string;
}

export interface ThumbInfoOk {
  status: 'ok';
  _format: string;
  v: string;
  id: string;
  videoId: string;
  watchId: string;
  originalVideoId: string;
  isChannel: boolean;
  title: string | null;
  description: string | null;
  thumbnail: string;
  movieType: string | null;
  lastResBody: string | null;
  duration: number;
  postedAt: string;
  mylistCount: number;
  viewCount: number;
  commentCount: number;
  tagList: VideoTag[];
  owner?: ThumbOwnerInfo;
  code?: string | null;
}

export interface ThumbInfoFail {
  status: 'fail';
  code: string | null;
  message: string | null;
}

export type ThumbInfoData = ThumbInfoOk | ThumbInfoFail;

//===BEGIN===
function parseThumbInfo(xmlText: string | ThumbInfoData): ThumbInfoData {
  if (typeof xmlText !== 'string' || (xmlText as unknown as ThumbInfoData).status === 'ok') {
    return xmlText as unknown as ThumbInfoData;
  }
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'text/xml');
  const val = (name: string): string | null => {
    const elms = xml.getElementsByTagName(name);
    if (elms.length < 1) {
      return null;
    }
    return elms[0]!.textContent;
  };
  const dateToString = (dateString: string | Date): string => {
    const date = new Date(dateString);
    const [yy, mm, dd, h, m, s] = [
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    ].map((n: number) => n.toString().padStart(2, '0'));
    return `${yy}/${mm}/${dd} ${h}:${m}:${s}`;
  };

  const resp = xml.getElementsByTagName('nicovideo_thumb_response');
  if (resp.length < 1 || resp[0]!.getAttribute('status') !== 'ok') {
    return {
      status: 'fail',
      code: val('code'),
      message: val('description'),
    };
  }

  const [min, sec] = val('length')!.split(':');
  const duration = Number(min) * 60 + Number(sec) * 1;
  const watchId = val('watch_url')!.split('/').reverse()[0]!;
  const postedAt = dateToString(new Date(val('first_retrieve')!));
  const tags = [...xml.getElementsByTagName('tag')].map((tag: Element): VideoTag => {
    return {
      text: tag.textContent,
      category: tag.hasAttribute('category'),
      lock: tag.hasAttribute('lock'),
    };
  });

  const videoId = val('video_id')!;
  const isChannel = videoId.substring(0, 2) === 'so';
  const result: ThumbInfoOk = {
    status: 'ok',
    _format: 'thumbInfo',
    v: isChannel ? videoId : watchId,
    id: videoId,
    videoId,
    watchId: isChannel ? videoId : watchId,
    originalVideoId: !isChannel && watchId !== videoId ? videoId : '',
    isChannel,
    title: val('title'),
    description: val('description'),
    thumbnail: val('thumbnail_url')!.replace(/^http:/, 'https:'),
    movieType: val('movie_type'),
    lastResBody: val('last_res_body'),
    duration,
    postedAt,
    mylistCount: parseInt(val('mylist_counter')!, 10),
    viewCount: parseInt(val('view_counter')!, 10),
    commentCount: parseInt(val('comment_num')!, 10),
    tagList: tags,
  };
  const userId = val('user_id');
  if (userId !== null && userId !== '') {
    result.owner = {
      type: 'user',
      id: userId,
      linkId: userId ? `user/${userId}` : '',
      name: val('user_nickname') || '(非公開ユーザー)',
      url: userId ? 'https://www.nicovideo.jp/user/' + userId : '#',
      icon: val('user_icon_url') || 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
    };
  }
  const channelId = val('ch_id');
  if (channelId !== null && channelId !== '') {
    result.owner = {
      type: 'channel',
      id: channelId,
      linkId: channelId ? `ch${channelId}` : '',
      name: val('ch_name') || '(非公開チャンネル)',
      url: 'https://ch.nicovideo.jp/ch' + channelId,
      icon: val('ch_icon_url') || 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
    };
  }

  return result;
}
//===END===

export { parseThumbInfo };
