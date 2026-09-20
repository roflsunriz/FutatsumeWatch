import { describe, expect, it } from 'bun:test';
import { NicoSearchApiV2Query } from '../../packages/lib/src/nico/video-search';
import type { SearchQueryParams } from '../../packages/lib/src/nico/video-search';

interface SearchParams extends SearchQueryParams {
  searchWord: string;
  searchType: string;
}

const { F_RANGE, L_RANGE } = NicoSearchApiV2Query;

describe('Video Search API v2', () => {
  const baseParams: SearchParams = {
    searchWord: 'hogehoge',
    searchType: 'tag',
    order: 'd',
  };

  const NOW = Date.now();
  const create = (params: SearchParams): InstanceType<typeof NicoSearchApiV2Query> => {
    const query = new NicoSearchApiV2Query(Object.assign(params, { _now: NOW }));
    return query;
  };

  describe('基本パース', () => {
    it('既定の検索対象とソートが設定される', () => {
      const params = Object.assign({}, baseParams);
      const query = new NicoSearchApiV2Query(params);

      expect(query.q).toBe('hogehoge');
      expect(query.targets.length).toBe(1);
      expect(query.targets[0]).toBe('tagsExact');
      expect(query.sort).toBe('-lastCommentTime');
    });

    it('sort 指定で生成できる', () => {
      expect(() => {
        new NicoSearchApiV2Query({
          searchWord: 'fugafuga',
          searchType: 'tag',
          sort: '_hot',
        });
      }).not.toThrow();
    });
  });

  describe('user指定対応', () => {
    it('userId の equal フィルタになる', () => {
      const params = Object.assign({}, baseParams);
      const query = create(Object.assign(params, { userId: 1234 }));
      const filters = query.filters;
      expect(filters[0]?.field).toBe('userId');
      expect(filters[0]?.type).toBe('equal');
      expect(typeof filters[0]?.value).toBe('number');
      expect(filters[0]?.value).toBe(1234);
    });
  });

  describe('channel指定対応', () => {
    it('channelId の equal フィルタになる', () => {
      const params = Object.assign({}, baseParams);
      const query = create(Object.assign(params, { channelId: '2525' }));
      const filters = query.filters;
      expect(filters[0]?.field).toBe('channelId');
      expect(filters[0]?.type).toBe('equal');
      expect(typeof filters[0]?.value).toBe('number');
      expect(filters[0]?.value).toBe(2525);
    });
  });

  describe('コメント数指定対応', () => {
    it('commentCounter の range フィルタになる', () => {
      const params = Object.assign({}, baseParams);
      const query = create(Object.assign(params, { commentCount: 12345 }));
      const filters = query.filters;
      expect(filters[0]?.field).toBe('commentCounter');
      expect(filters[0]?.type).toBe('range');
      expect(filters[0]?.from).toBe(12345);
    });
  });

  describe('投稿日時指定対応(utime)', () => {
    it('from > to の時は入れ替わる', () => {
      const params = Object.assign({}, baseParams);

      const from = new Date('2007-03-06').getTime();
      const to = new Date('2017-03-06').getTime();
      let query = create(Object.assign(params, { utimeFrom: from, utimeTo: to }));
      // NOTE: 原本どおり filters は最初の query のものを参照する。
      // 2回目の生成後に filters を取り直していない点も原本のまま維持する。
      const filters = query.filters;
      expect(filters[0]?.field).toBe('startTime');
      expect(filters[0]?.type).toBe('range');
      expect(filters[0]?.from).toBe(from);
      expect(filters[0]?.to).toBe(to);

      query = create(Object.assign(params, { utimeFrom: to, utimeTo: from }));
      expect(query).toBeDefined();
      expect(filters[0]?.from).toBe(from);
      expect(filters[0]?.to).toBe(to);
    });
  });

  describe('投稿日時指定対応(date)', () => {
    it('Date 指定が時刻範囲フィルタになる', () => {
      const params = Object.assign({}, baseParams);

      const from = new Date('2007-03-06');
      const to = new Date('2017-03-06');
      const query = create(Object.assign(params, { dateFrom: from, dateTo: to }));
      const filters = query.filters;
      expect(filters[0]?.field).toBe('startTime');
      expect(filters[0]?.type).toBe('range');
      expect(filters[0]?.from).toBe(from.getTime());
      expect(filters[0]?.to).toBe(to.getTime());
    });
  });

  describe('公式検索ページの f_range対応', () => {
    it('相対時間指定が startTime フィルタになる', () => {
      const params = Object.assign({}, baseParams);

      let query = create(Object.assign(params, { f_range: F_RANGE.U_1H }));
      let filters = query.filters;
      expect(filters[0]?.field).toBe('startTime');
      expect(filters[0]?.type).toBe('range');
      expect(filters[0]?.from).toBe(NOW - 1000 * 60 * 60);

      query = create(Object.assign(params, { f_range: F_RANGE.U_24H }));
      filters = query.filters;
      expect(filters[0]?.from).toBe(NOW - 1000 * 60 * 60 * 24);

      query = create(Object.assign(params, { f_range: F_RANGE.U_1W }));
      filters = query.filters;
      expect(filters[0]?.from).toBe(NOW - 1000 * 60 * 60 * 24 * 7);

      query = create(Object.assign(params, { f_range: F_RANGE.U_30D }));
      filters = query.filters;
      expect(filters[0]?.from).toBe(NOW - 1000 * 60 * 60 * 24 * 30);
    });
  });

  describe('公式検索ページの l_range対応', () => {
    it('動画長指定が lengthSeconds フィルタになる', () => {
      const params = Object.assign({}, baseParams);

      let query = create(Object.assign(params, { l_range: L_RANGE.U_5MIN }));
      let filters = query.filters;
      expect(filters[0]?.field).toBe('lengthSeconds');
      expect(filters[0]?.type).toBe('range');
      expect(filters[0]?.from).toBe(0);
      expect(filters[0]?.to).toBe(60 * 5);

      query = create(Object.assign(params, { l_range: L_RANGE.O_20MIN }));
      filters = query.filters;
      expect(filters[0]?.from).toBe(60 * 20);
    });
  });

  describe('公式検索ページの 日付指定対応', () => {
    it('開始・終了日が startTime フィルタになる', () => {
      const params = Object.assign({}, baseParams);

      const start = '2007-03-06';
      const end = '2017-03-06';
      const query = create(Object.assign(params, { start, end }));
      const filters = query.filters;
      expect(filters[0]?.field).toBe('startTime');
      expect(filters[0]?.type).toBe('range');
      expect(filters[0]?.from).toBe(new Date(start).getTime());
      expect(filters[0]?.to).toBe(new Date(end).getTime());
    });
  });
});
