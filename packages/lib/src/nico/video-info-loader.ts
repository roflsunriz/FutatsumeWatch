/* eslint-disable @typescript-eslint/only-throw-error, @typescript-eslint/prefer-promise-reject-errors --
  動画情報ローダーの既存契約としてプレーンオブジェクトでthrow/rejectする（呼び出し側がreason/watchId/infoで分岐する）。
  Error化すると呼び出し側の分岐が壊れるため、ランタイム同一を優先して維持する。 */
import { netUtil } from '../infra/net-util';
import { CacheStorage } from '../infra/cache-storage';

interface NetFetchInit {
  method?: string;
  headers?: Record<string, string | number>;
  credentials?: string;
  body?: string;
  mode?: string;
  timeout?: number;
  signal?: AbortSignal | null;
  [key: string]: unknown;
}

interface NetUtilLike {
  fetch: (url: string | URL, init?: NetFetchInit) => Promise<Response>;
  jsonp: (url: string) => Promise<unknown>;
}

interface CacheStorageLike {
  getItem: (key: string) => unknown;
  setItem: (key: string, data: unknown, expireTime?: number) => void;
}

interface WatchThread {
  id: string | number;
  fork: string;
  layer?: unknown;
  isDefaultPostTarget?: boolean;
  isThreadkeyRequired?: boolean;
  isOwnerThread?: boolean;
}

interface DomandDelivery {
  videoId?: string;
  accessRightKey?: string;
  availableVideos?: Array<{ id: string; label: string }>;
  availableVideoIds?: Array<string>;
  availableAudioIds?: Array<string>;
  [key: string]: unknown;
}

interface WatchVideoTag {
  isLocked: boolean;
  isNicodicArticleExists: boolean;
  name: string;
}

interface LinkedChannelVideo {
  linkedVideoId: string;
  isChannelMember?: boolean;
  [key: string]: unknown;
}

interface WatchApiData {
  channel?: {
    id: string;
    name: string;
    thumbnail: { smallUrl?: string; url?: string };
  } | null;
  client: { watchId: string; watchTrackId: string };
  comment: {
    keys: { userKey: string };
    layers: Array<{ threadIds: Array<{ id: string | number; fork: string }> }>;
    ng: { channel: Array<unknown>; owner: Array<unknown> };
    nvComment: { params: Record<string, unknown>; server: string; threadKey?: string };
    server: { url: string };
    threads: Array<WatchThread>;
  };
  community?: { id?: string } | null;
  external: { commons: { hasContentTree: boolean } };
  genre: { key: string };
  media: { domand?: DomandDelivery | null };
  owner?: { iconUrl?: string; id: string | number; nickname?: string } | null;
  payment: { video: { isAdmission: boolean; isPpv: boolean; isPremium: boolean } };
  player: { initialPlayback?: { type?: string; positionSec?: number } | null };
  series?: unknown;
  tag: { edit: unknown; items: Array<WatchVideoTag> };
  video: {
    count: { comment: number; like: number; mylist: number; view: number };
    description: string;
    duration: number;
    id: string;
    registeredAt: string;
    thumbnail: { largeUrl?: string; url?: string; player?: string };
    title: string;
    viewer?: { like: { isLiked: boolean } } | null;
  };
  viewer?: { id?: number; isPremium?: boolean } | null;
}

interface WatchApiResponse {
  data: { response: WatchApiData };
}

interface WatchLoadOptions {
  economy?: boolean;
}

interface LoadError {
  reason?: string;
  message?: string;
  info?: unknown;
}

interface LinkedChannelVideoHolder {
  linkedChannelVideo: LinkedChannelVideo | null | undefined;
  watchApiData: { videoDetail: { id: string } };
  domandInfo?: DomandDelivery | null;
  isPlayable: boolean;
  isDomand: boolean;
}

import { Config } from '../../../../src/config';
import { global } from '../../../../src/futatsume-watch-index';
const { emitter, debug } = global;

//===BEGIN===
const VideoInfoLoader = (function () {
  const cacheStorage: CacheStorageLike = new CacheStorage(sessionStorage);

  const parseWatchApiData = function (json: WatchApiResponse) {
    const _data = json.data.response;
    const {
      // ads,
      // category,
      channel, // nullable
      client: {
        // nicosid,
        watchId,
        watchTrackId,
      },
      comment: {
        // isAttentionRequired,
        keys: { userKey },
        layers,
        ng: {
          channel: channelNg,
          // ngScore,
          owner: ownerNg,
          // viewer,
        },
        nvComment,
        server: { url: commentServer },
        threads,
      },
      community, // nullable
      // easyComment,
      external: {
        commons: { hasContentTree },
      },
      genre: {
        // isDisabled,
        // isImmoral,
        // isNotSet,
        key: genreKey,
        // label,
      },
      // marquee,
      media: { domand: domandInfo },
      // okReason,
      owner, // nullable
      payment: {
        // preview,
        video: {
          // commentableUserType,
          isAdmission: isMemberFree,
          isPpv: isNeedPayment,
          isPremium: isPremiumFree,
          // watchableUserType,
        },
      },
      // pcWatchPage,
      player: {
        // comment,
        initialPlayback, // nullable
        // layerMode,
      },
      // ppv,
      // ranking,
      series,
      // smartphone,
      // system,
      tag: {
        edit: tagEdit,
        // hasR18Tag,
        // isPublishedNicoscript,
        items: tags,
        // viewer,
      },
      video: {
        // 9d091f87, // version hash?
        // commentableUserTypeForPayment,
        count: { comment: commentCount, like: likeCount, mylist: mylistCount, view: viewCount },
        description,
        duration,
        id: videoId,
        // isAuthenticationRequired,
        // isDeleted,
        // isEmbedPlayerAllowed,
        // isGiftAllowed,
        // isNoBanner,
        // isPrivate,
        // rating,
        registeredAt,
        thumbnail: {
          largeUrl: thumbnailUrl, // null
          // middleUrl,
          // ogp,
          url: thumbnail,
          player: largeThumbnail,
        },
        title,
        viewer: videoStatusForViewer, // nullable
        // watchableUserTypeForPayment,
      },
      // videoAds,
      // videoLive,
      viewer, // nullable
      // waku,
    } = _data;

    const csrfToken = null;
    const watchAuthKey = null;
    threads.forEach((thread) => {
      thread.layer = layers.find(({ threadIds }) => {
        return threadIds.some(({ id, fork }) => id === thread.id && fork === thread.fork);
      });
    });
    const resumeInfo = (() => {
      const { type = '', positionSec = null } = { ...initialPlayback };
      return {
        initialPlaybackType: type,
        initialPlaybackPosition: positionSec ?? 0,
      };
    })();
    const isLiked = videoStatusForViewer?.like.isLiked ?? false;
    const viewerInfo = (() => {
      const { id = 0, isPremium = false } = { ...viewer };
      return { id, isPremium };
    })();
    const defaultThread = threads.find((t) => t.isDefaultPostTarget)!;
    const msgInfo = {
      server: commentServer,
      threadId: defaultThread.id,
      duration,
      videoId,
      nvComment,
      userId: viewerInfo.id,
      isNeedKey: threads.findIndex((t) => t.isThreadkeyRequired) >= 0, // (isChannel || isCommunity)
      optionalThreadId: '',
      defaultThread,
      optionalThreads: threads.filter((t) => t.id !== defaultThread.id) || [],
      threads,
      userKey,
      hasOwnerThread: threads.find((t) => t.isOwnerThread),
      when: null,
      frontendId: 6,
      frontendVersion: 0,
    };

    const isDomand = domandInfo != null;
    const isPlayable = isDomand;

    cacheStorage.setItem('csrfToken', csrfToken, 30 * 60 * 1000);

    const playlist = { playlist: [] };

    const tagList = tags.map((tag) => {
      const {
        // isCategory, // カテゴリ廃止
        // isCategoryCandidate,
        isLocked,
        isNicodicArticleExists,
        name,
      } = tag;
      return {
        _data: tag,
        isLocked,
        isNicodicArticleExists,
        name,
      };
    });

    let channelInfo: { iconUrl?: string; id: string; linkId: string; name?: string } | null = null;
    let channelId: string | undefined;
    let uploaderInfo: { iconUrl?: string; id: string | number; linkId: string; name?: string } | null = null;
    if (channel) {
      const {
        id,
        // isDisplayAdBanner,
        // isOfficialAnime,
        name,
        thumbnail: { smallUrl, url },
        // viewer: {
        //   follow: {
        //     isBookmarked,
        //     isFollowed,
        //     token,
        //     tokenTimestamp,
        //   },
        // },
      } = { ...channel };
      channelInfo = {
        iconUrl: smallUrl ?? url ?? undefined,
        id,
        linkId: id,
        name,
      };
      channelId = id;
    }
    if (owner) {
      const {
        // channel,
        iconUrl,
        id,
        // isMylistsPublic,
        // isVideosPublic,
        // live,
        nickname,
        // videoLiveNotice,
        // viewer: {
        //   isFollowing,
        // },
      } = { ...owner };
      uploaderInfo = {
        iconUrl,
        id,
        linkId: `user/${id}`,
        name: nickname,
      };
    }

    const watchApiData = {
      videoDetail: {
        v: watchId,
        id: videoId,
        title,
        // title_original: data.video.originalTitle,
        description,
        // description_original: data.video.originalDescription,
        postedAt: registeredAt,
        thumbnail,
        largeThumbnail,
        length: duration,

        commons_tree_exists: hasContentTree,

        isChannel: channel && channel.id,
        isMymemory: false,
        communityId: community?.id ?? null,
        isLiked,
        channelId,

        commentCount,
        likeCount,
        mylistCount,
        viewCount,

        tagList,
        tagEdit,
      },
      viewerInfo,
      channelInfo,
      uploaderInfo,
      clientTrackId: watchTrackId,
    };

    const ngFilters = Array.prototype.concat(channelNg, ownerNg);

    const result = {
      _format: 'html5watchApi',
      _data,
      watchApiData,
      domandInfo,
      msgInfo,
      playlist,
      isPlayable,
      isDomand,
      thumbnailUrl,
      csrfToken,
      watchAuthKey,
      series,
      genreKey,
      ngFilters,

      isMemberFree,
      isNeedPayment,
      isPremiumFree,
      linkedChannelVideo: null as LinkedChannelVideo | null | undefined,
      resumeInfo,
    };

    void emitter.emitAsync('csrfTokenUpdate', csrfToken);
    return result;
  };

  const loadLinkedChannelVideoInfo = (originalData: LinkedChannelVideoHolder) => {
    const linkedChannelVideo = originalData.linkedChannelVideo;
    const originalVideoId = originalData.watchApiData.videoDetail.id;
    const videoId = linkedChannelVideo!.linkedVideoId;

    if (originalVideoId === videoId) {
      originalData.linkedChannelVideo = null;
      return Promise.reject();
    }

    const url = `https://www.nicovideo.jp/watch/${videoId}?responseType=json`;
    window.console.info('%cloadLinkedChannelVideoInfo', 'background: cyan', linkedChannelVideo);
    return new Promise((r) => {
      setTimeout(r, 1000);
    })
      .then(() => (netUtil as unknown as NetUtilLike).fetch(url, { credentials: 'include' }))
      .then((res: Response) => res.json())
      .then((json: WatchApiResponse) => {
        const data = parseWatchApiData(json);
        //window.console.info('linkedChannelData', data);
        originalData.domandInfo = data.domandInfo;
        originalData.isPlayable = data.isPlayable;
        originalData.isDomand = data.isDomand;
        return originalData;
      })
      .catch(() => {
        originalData.linkedChannelVideo = null;
        return Promise.reject({ reason: 'network', message: '通信エラー(loadLinkedChannelVideoInfo)' });
      });
  };

  const onLoadPromise = async (
    watchId: string,
    options: WatchLoadOptions,
    isRetry: boolean,
    resp: WatchApiResponse
  ) => {
    const data = parseWatchApiData(resp);
    debug.watchApiData = data;
    if (!data) {
      throw {
        reason: 'network',
        message: '通信エラー。動画情報の取得に失敗しました。(watch api)',
      };
    }

    if ((data as { reject?: unknown }).reject) {
      throw data;
    }

    if (data.isPlayable) {
      void emitter.emitAsync('loadVideoInfo', data, 'WATCH_API', watchId);
      return data;
    }

    if (data.isNeedPayment && data.genreKey === 'anime' && Config.getValue('loadLinkedChannelVideo')) {
      const query = new URLSearchParams({
        videoId: data.watchApiData.videoDetail.id,
        _frontendId: String(data.msgInfo.frontendId),
      });
      const url = `https://public-api.ch.nicovideo.jp/v1/user/channelVideoDAnimeLinks?${query.toString()}`;
      const linkedRaw: unknown = await (netUtil as unknown as NetUtilLike)
        .fetch(url, { credentials: 'include' })
        .then((r: Response) => r.json())
        .catch(() => ({}));
      const linkedChannelVideos = linkedRaw as { data?: { items?: Array<LinkedChannelVideo> } };
      data.linkedChannelVideo = linkedChannelVideos.data?.items?.find((ch) => {
        return !!ch.isChannelMember;
      });
      if (data.linkedChannelVideo != null) {
        return await loadLinkedChannelVideoInfo(data);
      }
    }

    const error = (({ isMemberFree, isNeedPayment, isPremiumFree }) => {
      if (!isNeedPayment && isPremiumFree) {
        return {
          reason: 'premium only',
          message: 'プレミアム会員限定',
        };
      }
      if (!isNeedPayment && isMemberFree) {
        return {
          reason: 'member only',
          message: 'CH会員限定',
        };
      }
      if (!isNeedPayment) {
        return {
          reason: 'not supported',
          message: 'この動画はFutatsumeWatchで再生できません',
        };
      }
      const err = {
        reason: 'need payment',
        message: 'この動画は有料です',
      };
      if (isPremiumFree) {
        err.message += ' (プレミアム会員無料)';
      }
      if (isMemberFree) {
        err.message += ' (CH会員無料)';
      }
      return err;
    })(data);
    throw {
      ...error,
      info: data,
    };
  };

  const createSleep = function (sleepTime: number) {
    return new Promise((resolve) => setTimeout(resolve, sleepTime));
  };

  const loadPromise = function (watchId: string, options: WatchLoadOptions, isRetry = false): Promise<unknown> {
    let url = `https://www.nicovideo.jp/watch/${watchId}`;
    console.log('%cloadFromWatchApiData...', 'background: lightgreen;', watchId, url);
    const query = ['responseType=json'];
    if (options.economy === true) {
      query.push('eco=1');
    }
    if (query.length > 0) {
      url += '?' + query.join('&');
    }

    return (netUtil as unknown as NetUtilLike)
      .fetch(url, { credentials: 'include' })
      .then((res: Response) => res.json())
      .catch(() => Promise.reject({ reason: 'network', message: '通信エラー(network)' }))
      .then((resp: WatchApiResponse) => onLoadPromise(watchId, options, isRetry, resp))
      .catch((err: LoadError) => {
        window.console.error('err', { err, isRetry, url, query });
        if (isRetry) {
          return Promise.reject({
            watchId,
            message: err.message || '動画情報の取得に失敗したか、未対応の形式です',
            type: 'watchapi',
          });
        }

        if (err.reason === 'forbidden') {
          return Promise.reject(err);
        } else if (err.reason === 'network') {
          return createSleep(5000).then(() => {
            window.console.warn('network error & retry');
            return loadPromise(watchId, options, true);
          });
        } else if (err.reason === 'flv' && !options.economy) {
          options.economy = true;
          window.console.log('%cエコノミーにフォールバック(flv)', 'background: cyan; color: red;');
          return createSleep(500).then(() => {
            return loadPromise(watchId, options, true);
          });
        } else {
          window.console.info('watch api fail', err);
          return Promise.reject({
            watchId,
            message: err.message || '動画情報の取得に失敗',
            info: err.info,
          });
        }
      });
  };

  return {
    load: function (watchId: string, options: WatchLoadOptions) {
      const timeKey = `watchAPI:${watchId}`;
      window.console.time(timeKey);
      return loadPromise(watchId, options).then(
        (result) => {
          window.console.timeEnd(timeKey);
          return result;
        },
        (err: LoadError & { watchId?: string }) => {
          err.watchId = watchId;
          window.console.timeEnd(timeKey);
          return Promise.reject(err);
        }
      );
    },
  };
})();

//===END===

export { VideoInfoLoader };
