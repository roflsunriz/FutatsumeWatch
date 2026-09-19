import { Emitter } from '../../../lib/src/Emitter';

interface StoryboardThumbnailImage {
  timestamp?: unknown;
  url?: string;
  buffer?: unknown;
}

interface StoryboardPrimary {
  version?: unknown;
  thumbnail: { width: unknown; height: unknown };
  columns?: unknown;
  rows?: unknown;
  interval?: unknown;
  count?: unknown;
  images: StoryboardThumbnailImage[];
}

interface StoryboardRawData {
  status?: unknown;
  format?: unknown;
  duration?: unknown;
  message?: unknown;
  isAvailable?: unknown;
  storyboard?: StoryboardPrimary;
}

export type { StoryboardRawData, StoryboardPrimary, StoryboardThumbnailImage };
//===BEGIN===

export function createStoryboardInfoModel(EmitterBase: typeof Emitter) {
  return class StoryboardInfoModel extends EmitterBase {
    declare _rawData: StoryboardRawData;
    declare primary: StoryboardPrimary;
    static get blankData(): StoryboardRawData {
      return {
        format: 'dmc',
        status: 'fail',
        duration: 1,
        storyboard: {
          version: '1',
          thumbnail: {
            width: 160,
            height: 90,
          },
          columns: 1,
          rows: 1,
          interval: 1000,
          images: [
            {
              timestamp: 0,
              url: 'https://example.com',
            },
          ],
        },
      };
    }

    constructor(rawData: StoryboardRawData | null) {
      super();
      this.update(rawData);
    }

    update(rawData: StoryboardRawData | null): StoryboardInfoModel {
      const ctor = this.constructor as unknown as typeof StoryboardInfoModel;
      if (!rawData || rawData.status !== 'ok') {
        this._rawData = ctor.blankData;
      } else {
        this._rawData = rawData;
      }
      this.primary = this._rawData.storyboard as StoryboardPrimary;
      this.emit('update', this);
      return this;
    }
    reset(): void {
      const ctor = this.constructor as unknown as typeof StoryboardInfoModel;
      this._rawData = ctor.blankData;
      this.emit('reset');
    }
    get rawData(): StoryboardRawData {
      const ctor = this.constructor as unknown as typeof StoryboardInfoModel;
      return this._rawData || ctor.blankData;
    }

    get isAvailable(): boolean {
      return this._rawData.status === 'ok';
    }

    get hasSubStoryboard(): boolean {
      return false;
    }

    get status(): unknown {
      return this._rawData.status;
    }
    get message(): unknown {
      return this._rawData.message;
    }
    get duration(): number {
      return (this._rawData.duration as number) * 1;
    }
    get isDmc(): boolean {
      return this._rawData.format === 'dmc';
    }
    get urls(): Array<string | undefined> {
      return this.primary.images.map((img) => img.url);
    }
    get images(): unknown[] {
      return [...Array<unknown>(this.pageCount)].map((a: unknown, i: number) => this.getPage(i));
    }
    get cellWidth(): number {
      return (this.primary.thumbnail.width as number) * 1;
    }
    get cellHeight(): number {
      return (this.primary.thumbnail.height as number) * 1;
    }
    get cellIntervalMs(): number {
      return (this.primary.interval as number) * 1;
    }
    get cellCount(): number {
      return (this.primary.count as number) * 1;
    }
    get rows(): number {
      return (this.primary.rows as number) * 1;
    }
    get cols(): number {
      return (this.primary.columns as number) * 1;
    }
    get pageCount(): number {
      return this.primary.images.length;
    }
    get totalRows(): number {
      return Math.ceil(this.cellCount / this.cols);
    }
    get pageWidth(): number {
      return this.cellWidth * this.cols;
    }
    get pageHeight(): number {
      return this.cellHeight * this.rows;
    }
    get countPerPage(): number {
      return this.rows * this.cols;
    }

    /**
     *  nページ目のURL/Bufferを返す。 ゼロオリジン
     */
    getPage(page: number): unknown {
      const entry = this.primary.images[page] as StoryboardThumbnailImage;
      const { url, buffer } = entry;
      return buffer ?? url;
    }

    /**
     * msに相当するサムネは何番目か？を返す
     */
    getIndex(ms: number): number {
      // msec -> sec
      const v = Math.max(0, Math.min(this.duration, Math.floor(ms / 1000)));

      // サムネの総数 ÷ 秒数
      // Math.maxはゼロ除算対策
      const n = this.cellCount / Math.max(1, this.duration);

      return Math.floor(v * n);
    }

    /**
     * Indexのサムネイルは何番目のページにあるか？を返す
     */
    getPageIndex(thumbnailIndex: number): number {
      const perPage = this.countPerPage;
      const pageIndex = Math.floor(thumbnailIndex / perPage);
      return Math.max(0, Math.min(this.pageCount, pageIndex));
    }

    /**
     *  msに相当するサムネは何ページの何番目にあるか？を返す
     */
    getThumbnailPosition(ms: number): {
      page: number;
      url: unknown;
      index: number;
      row: number;
      col: number;
    } {
      const index = this.getIndex(ms);
      const page = this.getPageIndex(index);

      const mod = index % this.countPerPage;
      const row = Math.floor(mod / Math.max(1, this.cols));
      const col = mod % this.rows;
      return {
        page,
        url: this.getPage(page),
        index,
        row,
        col,
      };
    }
  };
}
const StoryboardInfoModel = createStoryboardInfoModel(Emitter);
export type StoryboardInfoModel = InstanceType<typeof StoryboardInfoModel>;
//===END===
export { StoryboardInfoModel };
