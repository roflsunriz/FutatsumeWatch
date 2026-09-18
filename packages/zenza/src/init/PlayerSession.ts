import { PRODUCT } from '../../../../src/ZenzaWatchIndex';

interface PlayingStatusStore {
  removeItem(key: string): void;
  hasOwnProperty(key: string): boolean;
}

type PlayingStatusRecord = Record<string, string | undefined>;

interface PlayerSessionLike {
  session: Record<string, unknown>;
  storage: PlayingStatusStore;
  KEY: string;
}
//===BEGIN===
const PlayerSession = {
  session: {} as Record<string, unknown>,
  init(this: PlayerSessionLike, storage: PlayingStatusStore): PlayerSessionLike {
    this.storage = storage;
    return this;
  },
  save(this: PlayerSessionLike, playingStatus: unknown): void {
    (this.storage as unknown as PlayingStatusRecord)[this.KEY] = JSON.stringify(playingStatus);
  },
  restore(this: PlayerSessionLike): Record<string, unknown> {
    let ss: Record<string, unknown> = {};
    try {
      const data = (this.storage as unknown as PlayingStatusRecord)[this.KEY];
      if (!data) {
        return ss;
      }
      ss = JSON.parse((this.storage as unknown as PlayingStatusRecord)[this.KEY] as string) as Record<string, unknown>;
      this.storage.removeItem(this.KEY);
    } catch (e) {
      window.console.error('PlayserSession restore fail: ', this.KEY, e);
    }
    console.log('lastSession', ss);
    return ss;
  },
  clear(this: PlayerSessionLike): void {
    this.storage.removeItem(this.KEY);
  },
  hasRecord(this: PlayerSessionLike): boolean {
    // eslint-disable-next-line no-prototype-builtins -- 連結資産の実行時挙動を保つため元の呼び方を維持する
    return this.storage.hasOwnProperty(this.KEY);
  },
};
(PlayerSession as unknown as PlayerSessionLike).KEY = `ZenzaWatch_PlayingStatus`;
//===END===
export { PlayerSession };
