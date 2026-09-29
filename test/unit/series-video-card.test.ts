import { expect, test } from 'bun:test';
import { toSeriesVideoCardData } from '../../src/video-info-panel/series-video-card';

test('シリーズAPIのcontentを共通動画カード用のサムネイル・詳細情報へ変換する', () => {
  expect(
    toSeriesVideoCardData(
      {
        watchId: 'sm2057168',
        content: {
          id: 'sm2057168',
          title: '次の動画',
          duration: 125,
          count: { comment: 12, mylist: 34, view: 56 },
          thumbnail: { url: 'https://fixture.invalid/next.jpg' },
          registeredAt: '2026-09-20T12:00:00+09:00',
        },
      },
      { id: 'sm2057168', title: 'IDだけの代替名', thumbnail: 'https://fixture.invalid/fallback.jpg' }
    )
  ).toEqual({
    id: 'sm2057168',
    title: '次の動画',
    thumbnail: 'https://fixture.invalid/next.jpg',
    duration: 125,
    commentCount: 12,
    mylistCount: 34,
    viewCount: 56,
    postedAt: '2026-09-20T12:00:00+09:00',
  });
});

test('シリーズ詳細取得前もwatch応答のID・タイトル・サムネイルを保持する', () => {
  expect(
    toSeriesVideoCardData(null, {
      id: 'sm2057168',
      title: '次の動画',
      thumbnail: 'https://fixture.invalid/fallback.jpg',
    })
  ).toEqual({
    id: 'sm2057168',
    title: '次の動画',
    thumbnail: 'https://fixture.invalid/fallback.jpg',
    duration: 0,
    commentCount: 0,
    mylistCount: 0,
    viewCount: 0,
    postedAt: '',
  });
});
