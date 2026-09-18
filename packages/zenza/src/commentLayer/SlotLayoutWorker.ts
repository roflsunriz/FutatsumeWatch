import { workerUtil } from '../../../lib/src/infra/workerUtil';

interface SlotItem {
  begin: number;
  end: number;
  no: number;
  fork: number;
  invisible?: boolean;
  slot?: number;
}

interface SlotLayoutParams {
  top: SlotItem[];
  naka: SlotItem[];
  bottom: SlotItem[];
}

type SlotLayoutResult = SlotItem[] & { lastUpdate?: unknown };

interface SlotWorkerMessage {
  command: string;
  params: SlotLayoutParams & { lastUpdate?: unknown };
}

interface SlotWorkerScope {
  onmessage: ((message: SlotWorkerMessage) => unknown) | null;
}

interface CrossMessageWorkerUtil {
  readonly isAvailable: boolean;
  createCrossMessageWorker(
    func: (self: SlotWorkerScope) => void,
    options: { name: string }
  ): { post(message: unknown): Promise<unknown> };
}

// const Config = ZenzaWatch.config;

//===BEGIN===

const SlotLayoutWorker = (() => {
  const func = function (self: SlotWorkerScope): void {
    // 暫定設置
    const SLOT_COUNT = 40;

    /**
     * スロット≒Z座標をよしなに割り当てる。
     * デザパタ的にいうならFlyweightパターンの亜種。
     * ゲームプログラミングではよくあるやつ。
     */
    class SlotEntry {
      declare slotCount: number;
      declare slot: number[];
      declare itemTable: Record<number, SlotItem>;
      declare p: number;
      constructor(slotCount?: number) {
        this.slotCount = slotCount || SLOT_COUNT;
        this.slot = [];
        this.itemTable = {};
        this.p = 1;
      }
      findIdle(sec: number): number {
        // 歴史的経緯で count/table という別名で参照している。
        // 実行時の挙動を変えないため参照名は維持し、想定する形状へ絞り込む。
        const { count, slot, table } = this as unknown as {
          count: number;
          slot: number[];
          table: Record<number, SlotItem>;
        };
        for (let i = 0; i < count; i++) {
          if (!slot[i]) {
            //console.log('empty found! idx=%s, sec=%s slot=%s', i, sec, JSON.stringify(slot));
            slot[i] = this.p++;
            return i;
          }

          const item = table[i];
          if (item === undefined) {
            continue;
          }
          if (sec < item.begin || sec > item.end) {
            //console.log('idle found! idx=%s, sec=%s ', i, sec, JSON.stringify(slot), JSON.stringify(item));
            slot[i] = this.p++;
            return i;
          }
        }
        return -1;
      }
      get mostOld(): number {
        let idx = 0;
        const slot = this.slot;
        let min: number | undefined = slot[0];
        for (let i = 1, len = this.slot.length; i < len; i++) {
          const value = slot[i];
          if (value !== undefined && (min === undefined || value < min)) {
            min = value;
            idx = i;
          }
        }
        return idx;
      }
      find(item: SlotItem, sec: number): number {
        // まずは空いてるスロットを小さい順に探す
        let slot = this.findIdle(sec);
        // なかったら、一番古いやつから奪い取る
        if (slot < 0) {
          slot = this.mostOld;
        }
        this.itemTable[slot] = item;
        return slot;
      }
    }

    const sortByBeginTime = (data: SlotItem[]): SlotItem[] => {
      data = data.concat().sort((a, b) => {
        const av = a.begin,
          bv = b.begin;
        if (av !== bv) {
          return av - bv;
        } else {
          return a.no < b.no ? -1 : 1;
        }
      });
      return data;
    };

    const execute = ({ top, naka, bottom }: SlotLayoutParams): SlotLayoutResult => {
      const data: SlotLayoutResult = sortByBeginTime([top, naka, bottom].flat());

      const slotEntries = [new SlotEntry(), new SlotEntry(), new SlotEntry()];

      for (let i = 0, len = data.length; i < len; i++) {
        const o = data[i];
        if (o === undefined || o.invisible) {
          continue;
        }
        const sec = o.begin;
        const fork = o.fork % 3;
        o.slot = (slotEntries[fork] as SlotEntry).find(o, sec);
      }
      return data;
    };

    self.onmessage = ({ command, params }: SlotWorkerMessage): unknown => {
      void command;
      console.time('SlotLayoutWorker');

      const result = execute(params);

      console.timeEnd('SlotLayoutWorker');

      result.lastUpdate = params.lastUpdate;
      return result;
    };
  };

  return {
    _func: func,
    create: function (): { post(message: unknown): Promise<unknown> } | null {
      const util = workerUtil as unknown as CrossMessageWorkerUtil;
      if (!util.isAvailable) {
        return null;
      }
      return util.createCrossMessageWorker(func, { name: 'SlotLayoutWorker' });
    },
  };
})();

//===END===

export { SlotLayoutWorker };
