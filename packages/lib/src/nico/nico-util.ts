import { textUtil } from '../text/text-util';

interface WatchQueryPlaylist {
  type?: string;
  id?: string;
  options?: unknown;
  [key: string]: unknown;
}

interface WatchQueryResult {
  playlist?: WatchQueryPlaylist | string;
  [key: string]: unknown;
}

interface PlaylistContext {
  type?: string;
  context: {
    seriesId?: string;
    userId?: string;
    mylistId?: string;
    [key: string]: unknown;
  };
}

interface CommonHeaderData {
  initConfig: {
    user: {
      isPremium: boolean;
      isLogin: boolean;
    };
  };
}

interface TweetWindowParams {
  watchId: string;
  duration: number;
  isChannel: boolean;
  title: string;
  videoId: string;
}

//===BEGIN===

const nicoUtil = {
  parseWatchQuery: (query: string): WatchQueryResult => {
    try {
      const result = textUtil.parseQuery(query) as unknown as WatchQueryResult;
      const playlistSource = result.playlist;
      const decoded: unknown =
        (typeof playlistSource === 'string' && playlistSource !== '' && textUtil.decodeBase64(playlistSource)) || '{}';
      const playlist = JSON.parse((decoded as string) || '{}') as unknown as PlaylistContext;
      const context = playlist.context;

      result.playlist = { type: playlist.type };

      switch (playlist.type) {
        case 'series':
          Object.assign(result.playlist, { id: context.seriesId });
          break;
        case 'user-uploaded': {
          const { userId, ...options } = context;
          Object.assign(result.playlist, { id: userId, options });
          break;
        }
        case 'mylist': {
          const { mylistId, ...options } = context;
          Object.assign(result.playlist, { id: mylistId, options });
          break;
        }
        case 'watchlater':
        case 'search':
          Object.assign(result.playlist, { options: context });
          break;
      }

      return result;
    } catch {
      return {};
    }
  },
  hasLargeThumbnail: (videoId: string): boolean => {
    // 大サムネが存在する最初の動画ID。 ソースはちゆ12歳
    // ※この数字以降でもごく稀に例外はある。
    const threthold = 16371888;
    const cid = videoId.substr(0, 2);
    const fid = (videoId.substr(2) as unknown as number) * 1;
    if (cid === 'nm') {
      return false;
    }
    if (cid !== 'sm' && fid < 35000000) {
      return false;
    }

    if (fid < threthold) {
      return false;
    }

    return true;
  },
  getThumbnailUrlByVideoId: (videoId: string): string | null => {
    const videoIdReg = /^[a-z]{2}\d+$/;
    if (!videoIdReg.test(videoId)) {
      return null;
    }
    const fileId = parseInt(videoId.substr(2), 10);
    const large = nicoUtil.hasLargeThumbnail(videoId) ? '.L' : '';
    return fileId >= 35374758 // このIDから先は新サーバー(おそらく)
      ? `https://nicovideo.cdn.nimg.jp/thumbnails/${fileId}/${fileId}.L`
      : `https://tn.smilevideo.jp/smile?i=${fileId}.${large}`;
  },
  getWatchId: (url?: string): string | null => {
    if (url && url.indexOf('nico.ms') >= 0) {
      const m = /\/\/nico\.ms\/([a-z0-9]+)/.exec(url);
      return m ? m[1]! : null;
    } else {
      const m = /\/?(watch|shorts)\/([a-z0-9]+)/.exec(url || location.pathname);
      return m ? m[2]! : null;
    }
  },
  getCommonHeader: (): CommonHeaderData => {
    try {
      // hoge?.fuga... はGreasyforkの文法チェックで弾かれるのでまだ使えない
      const el = document.querySelector('#CommonHeader[data-common-header]') as HTMLElement;
      const parsed: unknown = JSON.parse(el.dataset.commonHeader || '{}');
      return parsed as CommonHeaderData;
    } catch {
      return { initConfig: {} } as unknown as CommonHeaderData;
    }
  },
  isLegacyHeader: (): boolean => !document.querySelector('#CommonHeader[data-common-header]'),
  isPremiumLegacy: (): boolean => {
    const a = 'a[href^="https://account.nicovideo.jp/premium/register"]';
    return !document.querySelector(`#topline ${a}, #CommonHeader ${a}`);
  },
  isLoginLegacy: (): boolean => {
    const a = 'a[href^="https://account.nicovideo.jp/login"]';
    if (!document.querySelector('#topline, #CommonHeader')) {
      return (
        !document.querySelector(a) &&
        !!document.querySelector('a[href^="https://www.nicovideo.jp/my"], a[href^="/my/"]')
      );
    }
    return !document.querySelector(`#topline ${a}, #CommonHeader ${a}`);
  },
  isPremium: (): boolean =>
    nicoUtil.isLegacyHeader() ? nicoUtil.isPremiumLegacy() : !!nicoUtil.getCommonHeader().initConfig.user.isPremium,
  isLogin: (): boolean =>
    nicoUtil.isLegacyHeader() ? nicoUtil.isLoginLegacy() : !!nicoUtil.getCommonHeader().initConfig.user.isLogin,
  getPageLanguage: (): string => {
    try {
      const h = document.getElementsByClassName('html')[0] as HTMLElement;
      return h.lang || 'ja-JP';
    } catch {
      return 'ja-JP';
    }
  },
  openMylistWindow: (watchId: string): void => {
    window.open(
      `//www.nicovideo.jp/mylist_add/video/${watchId}`,
      'nicomylistadd',
      'width=500, height=400, menubar=no, scrollbars=no'
    );
  },
  openTweetWindow: ({ watchId, duration, isChannel, title, videoId }: TweetWindowParams): void => {
    const nicomsUrl = `https://nico.ms/${watchId}`;
    const watchUrl = `https://www.nicovideo.jp/watch/${watchId}`;

    title = `${title}(${textUtil.secToTime(duration)})`.replace(/@/g, '@ ');
    const nicoch = isChannel ? ',+nicoch' : '';
    const url =
      'https://twitter.com/intent/tweet?' +
      'url=' +
      encodeURIComponent(nicomsUrl) +
      '&text=' +
      encodeURIComponent(title) +
      '&hashtags=' +
      encodeURIComponent(videoId + nicoch) +
      '&original_referer=' +
      encodeURIComponent(watchUrl) +
      '';
    (window.open as unknown as (url: string, target: string, features: string, extra?: unknown) => void)(
      url,
      '_blank',
      'width=550, height=480, left=100, top50, personalbar=0, toolbar=0, scrollbars=1, sizable=1',
      0
    );
  },
  isGinzaWatchUrl: (url?: string): boolean =>
    /^https?:\/\/www\.nicovideo\.jp\/(watch|shorts)\//.test(url || location.href),
  getNicoHistory: window.decodeURIComponent(document.cookie.replace(/^.*(nicohistory[^;+]).*?/, '')),
  getMypageVer: (): string => (document.querySelector('#js-initial-userpage-data') ? 'spa' : 'legacy'),
};

//===END===

export { nicoUtil };
