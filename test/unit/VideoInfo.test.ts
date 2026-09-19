import { describe, expect, it, beforeEach } from 'bun:test';
import fs from 'node:fs';
import { DmcInfo, VideoFilter, VideoInfoModel } from '../../src/VideoInfo';
import type { RawVideoInfoData } from '../../src/VideoInfo';

// 旧テスト（flvInfo・session_api・import_version による smile/dmc 判定）は、
// Domand 対応で判定ロジックが置き換えられたため仕様変更として書き直す。
// 現行の maybeBetterQualityServerType は domand/dmc の有無と高さ比較のみを見る。

const FIXTURE_PATH = './test/fixtures/VideoInfoRawData.json';

interface FixtureShape {
  watchApiData: {
    videoDetail: Record<string, unknown>;
    viewerInfo: unknown;
    channelInfo?: unknown;
    uploaderInfo?: unknown;
  };
  msgInfo: { threadId: string | number };
  playlist?: { playlist?: Array<Record<string, unknown>> };
  dmcInfo?: { movie?: unknown };
  thumbnail: string;
  playlistToken?: unknown;
  watchAuthKey?: unknown;
  csrfToken?: unknown;
  resumeInfo?: { initialPlaybackPosition?: number; [key: string]: unknown };
  isDmc: boolean;
  isDomand?: boolean;
}

const isFixtureShape = (v: unknown): v is FixtureShape => {
  if (typeof v !== 'object' || v === null) {
    return false;
  }
  const o = v as Record<string, unknown>;
  const watchApiData = o.watchApiData;
  if (typeof watchApiData !== 'object' || watchApiData === null) {
    return false;
  }
  const detail = (watchApiData as Record<string, unknown>).videoDetail;
  if (typeof detail !== 'object' || detail === null) {
    return false;
  }
  const msgInfo = o.msgInfo;
  if (typeof msgInfo !== 'object' || msgInfo === null) {
    return false;
  }
  return true;
};

const loadRaw = (): RawVideoInfoData => {
  const parsed: unknown = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  if (!isFixtureShape(parsed)) {
    throw new Error(`fixture の形式が不正: ${FIXTURE_PATH}`);
  }
  const detail = parsed.watchApiData.videoDetail;
  const stringOr = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
  const numberOr = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);
  // ローダーの組み立て契約を模した最小構成。欠落キーは既定値で補う。
  return {
    watchApiData: {
      videoDetail: {
        id: stringOr(detail.id, ''),
        v: stringOr(detail.v, ''),
        title: stringOr(detail.title, ''),
        title_original: typeof detail.title_original === 'string' ? detail.title_original : undefined,
        description: typeof detail.description === 'string' ? detail.description : undefined,
        description_original: typeof detail.description_original === 'string' ? detail.description_original : undefined,
        postedAt: stringOr(detail.postedAt, ''),
        thumbnail: stringOr(detail.thumbnail, ''),
        tagList: Array.isArray(detail.tagList)
          ? detail.tagList.map((t) => ({
              name:
                typeof (t as Record<string, unknown>).name === 'string'
                  ? ((t as Record<string, unknown>).name as string)
                  : undefined,
            }))
          : [],
        tagEdit: detail.tagEdit,
        width: typeof detail.width === 'number' || typeof detail.width === 'string' ? detail.width : 0,
        height: typeof detail.height === 'number' || typeof detail.height === 'string' ? detail.height : 0,
        length: numberOr(detail.length, 0),
        commentCount: numberOr(detail.commentCount, 0),
        mylistCount: numberOr(detail.mylistCount, 0),
        viewCount: numberOr(detail.viewCount, 0),
        channelId:
          typeof detail.channelId === 'string' || typeof detail.channelId === 'number' ? detail.channelId : undefined,
        isMymemory: typeof detail.isMymemory === 'boolean' ? detail.isMymemory : undefined,
        communityId:
          typeof detail.communityId === 'string' || typeof detail.communityId === 'number'
            ? detail.communityId
            : undefined,
        commons_tree_exists: typeof detail.commons_tree_exists === 'boolean' ? detail.commons_tree_exists : undefined,
      },
      viewerInfo: parsed.watchApiData.viewerInfo,
      // 2018年スナップショットの channelInfo/uploaderInfo は snake_case キーのため
      // 現行コード（camelCase 読み）は既定値になる。 drift として記録し、undefined で組み立てる。
      channelInfo: undefined,
      uploaderInfo: undefined,
      clientTrackId: '',
    },
    viewerInfo: parsed.watchApiData.viewerInfo,
    ngFilters: [],
    msgInfo: { threadId: parsed.msgInfo.threadId },
    dmcInfo: undefined,
    domandInfo: undefined,
    linkedChannelVideo: undefined,
    playlist: {
      playlist: (parsed.playlist?.playlist ?? []).map((p) => ({
        ...p,
        id: typeof p.id === 'string' ? p.id : '',
      })),
    },
    playlistToken: typeof parsed.playlistToken === 'string' ? parsed.playlistToken : '',
    watchAuthKey: typeof parsed.watchAuthKey === 'string' ? parsed.watchAuthKey : '',
    seekToken: '',
    resumeInfo: parsed.resumeInfo,
    thumbnail: parsed.thumbnail,
    series: undefined,
    community: undefined,
    csrfToken: typeof parsed.csrfToken === 'string' ? parsed.csrfToken : undefined,
    isDmc: parsed.isDmc,
    isDomand: parsed.isDomand ?? false,
  };
};

let raw: RawVideoInfoData;

beforeEach(() => {
  raw = loadRaw();
});

describe('VideoInfoModel 基本取得', () => {
  it('id・watchId・タイトルが取れる', () => {
    const info = new VideoInfoModel(raw);
    expect(info.videoId).toBe('sm9');
    expect(info.getVideoId()).toBe('sm9');
    expect(info.watchId).toBe('sm9');
    expect(info.getWatchId()).toBe('sm9');
    expect(info.watchUrl).toBe('https://www.nicovideo.jp/watch/sm9');
    expect(typeof info.title).toBe('string');
    expect(info.title.length).toBeGreaterThan(0);
  });

  it('寸法・件数が取れる', () => {
    const info = new VideoInfoModel(raw);
    expect(info.width).toBe(320);
    expect(info.height).toBe(240);
    expect(info.duration).toBe(320);
    expect(info.count.view).toBe(17107122);
  });

  it('投稿者は非チャンネル扱いになる', () => {
    const info = new VideoInfoModel(raw);
    expect(info.isChannel).toBe(false);
    expect(info.owner.type).toBe('user');
  });

  it('関連動画とスレッド情報が取れる', () => {
    const info = new VideoInfoModel(raw);
    expect(info.relatedVideoItems.length).toBe(18);
    expect(info.threadId === '1173108780').toBe(true);
    expect(info.csrfToken).toBe('CSRF-2525');
  });
});

describe('maybeBetterQualityServerType 現行判定', () => {
  it('dmc のみ対応なら dmc', () => {
    raw.isDmc = true;
    raw.isDomand = false;
    const info = new VideoInfoModel(raw);
    expect(info.isDmcAvailable).toBe(true);
    expect(info.isDomandAvailable).toBe(false);
    expect(info.isDmcOnly).toBe(true);
    expect(info.isDomandOnly).toBe(false);
    expect(info.maybeBetterQualityServerType).toBe('dmc');
    expect(info.extension).toBe('mp4');
  });

  it('現行APIのdmcInfo:nullでもdomand再生できる', () => {
    raw.dmcInfo = null;
    raw.isDmc = false;
    raw.isDomand = true;
    raw.domandInfo = {
      accessRightKey: '',
      audios: [],
      videos: [{ id: 'v1', qualityLevel: 1, isAvailable: true, height: 720 }],
      isStoryboardAvailable: false,
    };
    const info = new VideoInfoModel(raw);
    expect(info.isDomandOnly).toBe(true);
    expect(info.maybeBetterQualityServerType).toBe('domand');
  });

  it('両対応なら高さが高い方を選ぶ', () => {
    raw.isDmc = true;
    raw.isDomand = true;
    raw.domandInfo = {
      accessRightKey: '',
      audios: [],
      videos: [{ id: 'v1', qualityLevel: 1, isAvailable: true, height: 1080 }],
      isStoryboardAvailable: true,
    };
    raw.dmcInfo = {
      movie: {
        session: {
          urls: [{ url: 'https://example.com/session' }],
          signature: 'sig',
          token: 'tok',
          serviceUserId: 'u1',
          contentId: 'c1',
          playerId: 'p1',
          recipeId: 'r1',
          priority: 1,
          authTypes: ['ht2'],
        },
        audios: [],
        videos: [
          {
            id: 'd1',
            isAvailable: true,
            metadata: { levelIndex: 1, resolution: { height: 720 } },
          },
        ],
      },
    };
    const info = new VideoInfoModel(raw);
    expect(info.maybeBetterQualityServerType).toBe('domand');
    expect(info.hasDomandStoryboard).toBe(true);
    expect(info.hasStoryboard).toBe(true);
  });
});

describe('DmcInfo', () => {
  const buildDmc = (): RawVideoInfoData => {
    const base = loadRaw();
    base.isDmc = true;
    base.dmcInfo = {
      movie: {
        session: {
          urls: [{ url: 'https://example.com/session' }],
          signature: 'sig',
          token: 'tok',
          serviceUserId: 'u1',
          contentId: 'c1',
          playerId: 'p1',
          recipeId: 'r1',
          priority: 1,
          authTypes: ['ht2'],
        },
        audios: [{ id: 'a1', isAvailable: true, metadata: { levelIndex: 0 } }],
        videos: [
          {
            id: 'd1',
            isAvailable: true,
            metadata: { levelIndex: 1, resolution: { height: 720 } },
          },
        ],
      },
    };
    return base;
  };

  it('セッション情報を返す', () => {
    const info = new VideoInfoModel(buildDmc());
    const dmc = info.dmcInfo;
    if (dmc === null) {
      throw new Error('dmcInfo が null');
    }
    expect(dmc instanceof DmcInfo).toBe(true);
    expect(dmc.apiUrl).toBe('https://example.com/session');
    expect(dmc.signature).toBe('sig');
    expect(dmc.token).toBe('tok');
    expect(dmc.availableVideoIds).toEqual(['d1']);
    expect(dmc.availableAudioIds).toEqual(['a1']);
    expect(dmc.isHLSRequired).toBe(true);
    expect(dmc.hasStoryboard).toBe(false);
    expect(dmc.storyboardInfo).toBeNull();
  });

  it('未設定値はフォールバックする', () => {
    const info = new VideoInfoModel(buildDmc());
    const dmc = info.dmcInfo;
    if (dmc === null) {
      throw new Error('dmcInfo が null');
    }
    expect(dmc.contentKeyTimeout).toBe(600 * 1000);
    expect(dmc.heartbeatLifetime).toBe(120 * 1000);
    expect(dmc.protocols).toEqual([]);
    expect(dmc.transferPreset).toBe('');
    expect(dmc.importVersion).toBe(0);
  });
});

describe('VideoFilter', () => {
  it('ng タグ・投稿者に一致したら true', () => {
    const filter = new VideoFilter(['12345'], ['ngword']);
    expect(
      filter.isNgVideo({
        isChannel: false,
        tagList: [{ name: 'hello' }, { name: 'NGWord' }],
        owner: { id: '12345' },
      })
    ).toBe(true);
  });

  it('一致しなければ false', () => {
    const filter = new VideoFilter(['99999'], ['ngword']);
    expect(
      filter.isNgVideo({
        isChannel: false,
        tagList: [{ name: 'hello' }],
        owner: { id: '12345' },
      })
    ).toBe(false);
  });
});
