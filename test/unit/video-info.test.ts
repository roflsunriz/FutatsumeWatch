import { beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import { VideoFilter, VideoInfoModel } from '../../src/video-info';
import type { RawVideoInfoData } from '../../src/video-info';

const FIXTURE_PATH = './test/fixtures/video-info-raw-data.json';

interface FixtureShape {
  watchApiData: {
    videoDetail: Record<string, unknown>;
    viewerInfo: unknown;
  };
  msgInfo: { threadId: string | number };
  playlist?: { playlist?: Array<Record<string, unknown>> };
  thumbnail: string;
  playlistToken?: unknown;
  watchAuthKey?: unknown;
  csrfToken?: unknown;
  resumeInfo?: { initialPlaybackPosition?: number; [key: string]: unknown };
  isDomand?: boolean;
}

const isFixtureShape = (value: unknown): value is FixtureShape => {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  if (typeof data.watchApiData !== 'object' || data.watchApiData === null) return false;
  const watchApiData = data.watchApiData as Record<string, unknown>;
  return (
    typeof watchApiData.videoDetail === 'object' &&
    watchApiData.videoDetail !== null &&
    typeof data.msgInfo === 'object' &&
    data.msgInfo !== null
  );
};

const loadRaw = (): RawVideoInfoData => {
  const parsed: unknown = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  if (!isFixtureShape(parsed)) throw new Error(`fixture の形式が不正: ${FIXTURE_PATH}`);
  const detail = parsed.watchApiData.videoDetail;
  const stringOr = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);
  const numberOr = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback);
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
          ? detail.tagList.map((tag) => ({
              name:
                typeof (tag as Record<string, unknown>).name === 'string'
                  ? ((tag as Record<string, unknown>).name as string)
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
      channelInfo: undefined,
      uploaderInfo: undefined,
      clientTrackId: '',
    },
    viewerInfo: parsed.watchApiData.viewerInfo,
    ngFilters: [],
    msgInfo: { threadId: parsed.msgInfo.threadId },
    domandInfo: undefined,
    linkedChannelVideo: undefined,
    playlist: {
      playlist: (parsed.playlist?.playlist ?? []).map((item) => ({
        ...item,
        id: typeof item.id === 'string' ? item.id : '',
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
    isDomand: parsed.isDomand ?? false,
  };
};

let raw: RawVideoInfoData;

beforeEach(() => {
  raw = loadRaw();
});

describe('VideoInfoModel 基本取得', () => {
  it('動画・投稿者・関連動画の情報を返す', () => {
    const info = new VideoInfoModel(raw);
    expect(info.videoId).toBe('sm9');
    expect(info.watchId).toBe('sm9');
    expect(info.watchUrl).toBe('https://www.nicovideo.jp/watch/sm9');
    expect(info.width).toBe(320);
    expect(info.height).toBe(240);
    expect(info.duration).toBe(320);
    expect(info.count.view).toBe(17107122);
    expect(info.isChannel).toBe(false);
    expect(info.owner.type).toBe('user');
    expect(info.relatedVideoItems.length).toBe(18);
    expect(info.threadId).toBe('1173108780');
    expect(info.csrfToken).toBe('CSRF-2525');
  });
});

it('Domand画質は入力順に依存せず高品質順で利用可能なものを返す', () => {
  const videos = [
    { id: 'low', height: 180, label: '180p', qualityLevel: 0, isAvailable: true },
    { id: 'unavailable', height: 1080, label: '1080p', qualityLevel: 3, isAvailable: false },
    { id: 'high', height: 720, label: '720p', qualityLevel: 2, isAvailable: true },
    { id: 'middle', height: 360, label: '360p', qualityLevel: 1, isAvailable: true },
  ];
  raw.domandInfo = { videos, audios: [], isStoryboardAvailable: true };
  raw.isDomand = true;
  const model = new VideoInfoModel(raw);
  expect(model.isDomandAvailable).toBe(true);
  expect(model.domandInfo?.availableVideoIds).toEqual(['high', 'middle', 'low']);
  expect(model.hasStoryboard).toBe(true);
  expect(model.extension).toBe('mp4');
  expect(videos.map((video) => video.id)).toEqual(['low', 'unavailable', 'high', 'middle']);
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
