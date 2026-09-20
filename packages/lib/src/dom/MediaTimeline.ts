interface MediaTimelineOptions {
  interval?: number;
  media?: HTMLMediaElement | null;
}

interface MediaAnimation {
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  pause: () => void;
  play: () => void;
}

interface MediaTimelineStatics {
  map: Map<string, MediaTimeline>;
}

import { objUtil } from '../infra/objUtil';
import { sleep } from '../infra/sleep';
//===BEGIN===

/*
 * アニメーション基準用の時間ゲッターとしてはperformance.now()よりWeb Animations APIのほうが優れている。
 */
class MediaTimeline {
  buffer: ArrayBuffer | SharedArrayBuffer;
  fview: Float32Array;
  iview: Int32Array;
  anime: MediaAnimation;
  isWAAvailable: boolean;
  interval: number;
  eventMap: Map<string, (e: Event) => void>;
  media!: HTMLMediaElement | null;
  timer?: ReturnType<typeof setInterval>;
  raf?: number | null;
  _isBusy: boolean;
  static MAP: {
    currentTime: number;
    duration: number;
    playbackRate: number;
    paused: number;
    timestamp: number;
  };
  static isSharable: boolean;
  static register: (name?: string, media?: HTMLMediaElement | null) => MediaTimeline;
  static get: (name?: string) => MediaTimeline;

  constructor(options: MediaTimelineOptions = {}) {
    this.buffer = new (MediaTimeline.isSharable ? self.SharedArrayBuffer : ArrayBuffer)(
      Float32Array.BYTES_PER_ELEMENT * 100
    );
    this.fview = new Float32Array(this.buffer);
    this.iview = new Int32Array(this.buffer);
    const span = document.createElement('span');
    this.anime = (span.animate
      ? span.animate([], { duration: 3 * 24 * 60 * 60 * 1000 })
      : { currentTime: 0, playbackRate: 1, paused: true }) as unknown as MediaAnimation;
    this.isWAAvailable = !!span.animate;
    this.interval = options.interval || 200;
    this.onTimer = this.onTimer.bind(this);
    this.onRaf = this.onRaf.bind(this);
    this.eventMap = this.initEventMap();
    this._isBusy = false;
    if (options.media) {
      this.attach(options.media);
    }
  }
  initEventMap(): Map<string, (e: Event) => void> {
    const map: Record<string, (e: Event) => void> = {
      pause: () => {
        // console.nicoru('paused', this.paused, this.media.paused, this.currentTime, this.media.currentTime);
        this.paused = true;
        this.currentTime = this.media!.currentTime;
      },
      play: () => {
        // console.nicoru('play');
        this.currentTime = this.media!.currentTime;
        this.paused = false;
      },
      seeked: () => {
        // console.nicoru('seeked');
        this.currentTime = this.media!.currentTime;
      },
      ratechange: () => {
        // console.nicoru('ratechange');
        this.playbackRate = this.media!.playbackRate;
        this.currentTime = this.media!.currentTime;
      },
    };
    return objUtil.toMap(map) as Map<string, (e: Event) => void>;
  }
  attach(media: HTMLMediaElement): void {
    if (this.media) {
      this.detach();
    }
    this.media = media;
    this.currentTime = media.currentTime;
    this.playbackRate = media.playbackRate;
    this.duration = media.duration;
    this.paused = media.paused;
    this.timer = setInterval(
      // onTimer/onRaf は constructor で bind 済みのため unbind のまま渡す
      // eslint-disable-next-line @typescript-eslint/unbound-method
      this.onTimer,
      this.interval
    );
    for (const [eventName, handler] of this.eventMap) {
      media.addEventListener(eventName, handler, { passive: true });
    }
  }
  detach(): void {
    const media = this.media!;
    for (const [eventName, handler] of this.eventMap) {
      media.removeEventListener(eventName, handler);
    }
    this.media = null;
    clearInterval(this.timer);
  }
  onTimer(): void {
    const media = this.media!;
    const ac = this.anime.currentTime / 1000;
    const mc = media.currentTime;
    const diffMs = Math.abs(mc - ac) * 1000;
    if (!this.isWAAvailable || diffMs >= this.interval * 3 || media.paused !== this.paused) {
      // console.warn('fix diff', diff);
      this.currentTime = mc;
      this.playbackRate = media.playbackRate;
      this.paused = media.paused;
    }
  }
  onRaf(): void {
    if (this._isBusy) {
      this.raf = null;
      return;
    }
    this._isBusy = true;
    this.currentTime = Math.min(this.anime.currentTime / 1000, this.media!.duration);
    this.timestamp = Math.round(performance.now() * 1000);
    if (!this.media!.paused) {
      void this.callRaf();
      // sleep.resolve.then(this.callRaf);
    } else {
      this.raf = null;
      this._isBusy = false;
    }
  }
  async callRaf(): Promise<void> {
    await sleep.resolve;
    // onRaf は constructor で bind 済みのため unbind のまま渡す
    // eslint-disable-next-line @typescript-eslint/unbound-method
    this.raf = requestAnimationFrame(this.onRaf);
    this._isBusy = false;
  }
  get timestamp(): number {
    // if (MediaTimeline.isSharable) {
    //   return Atomics.load(this.iview, MediaTimeline.MAP.timestamp);
    // }
    return this.iview[MediaTimeline.MAP.timestamp]!;
  }
  set timestamp(v: number) {
    if (this.iview[MediaTimeline.MAP.timestamp] === v) {
      return;
    }
    if (MediaTimeline.isSharable) {
      Atomics.store(this.iview, MediaTimeline.MAP.timestamp, v);
      Atomics.notify(this.iview, MediaTimeline.MAP.timestamp);
    } else {
      this.iview[MediaTimeline.MAP.timestamp] = v;
    }
  }
  get currentTime(): number {
    return this.fview[MediaTimeline.MAP.currentTime]!;
  }
  set currentTime(v: number) {
    v = isNaN(v) ? 0 : v;
    if (this.fview[MediaTimeline.MAP.currentTime] !== v) {
      this.fview[MediaTimeline.MAP.currentTime] = v;
    }
    const ac = this.anime.currentTime / 1000;
    const diffMs = Math.abs(ac - v) * 1000;
    if (v === 0 || diffMs > 1000) {
      this.anime.currentTime = v * 1000;
    }
  }
  get duration(): number {
    return this.fview[MediaTimeline.MAP.duration]!;
  }
  set duration(v: number) {
    this.fview[MediaTimeline.MAP.duration] = v;
  }
  get playbackRate(): number {
    return this.fview[MediaTimeline.MAP.playbackRate]!;
  }
  set playbackRate(v: number) {
    this.fview[MediaTimeline.MAP.playbackRate] = v;
    if (this.anime.playbackRate !== v) {
      this.anime.playbackRate = v;
    }
  }
  get paused(): boolean {
    return this.iview[MediaTimeline.MAP.paused] !== 0;
  }
  set paused(v: boolean) {
    this.iview[MediaTimeline.MAP.paused] = v ? 1 : 0;
    if (!this.isWAAvailable) {
      return;
    }
    if (v) {
      this.anime.pause();
      this.raf = cancelAnimationFrame(this.raf as number) as unknown as null;
      this.timestamp = 0;
    } else {
      this.anime.play();
      if (!this.raf) {
        // onRaf は constructor で bind 済みのため unbind のまま渡す
        // eslint-disable-next-line @typescript-eslint/unbound-method
        this.raf = requestAnimationFrame(this.onRaf);
      }
    }
  }
}
MediaTimeline.MAP = {
  currentTime: 0,
  duration: 1,
  playbackRate: 2,
  paused: 3,
  timestamp: 10,
};
MediaTimeline.isSharable = 'SharedArrayBuffer' in self && 'animate' in document.documentElement;
MediaTimeline.register = function (
  this: MediaTimelineStatics,
  name: string = 'main',
  media: HTMLMediaElement | null = null
) {
  if (!this.map.has(name)) {
    const mt = new MediaTimeline({ media });
    this.map.set(name, mt);
    return mt;
  }
  const mt = this.map.get(name)!;
  if (media) {
    mt.attach(media);
  }
  return mt;
}.bind({ map: new Map<string, MediaTimeline>() });

MediaTimeline.get = (name?: string) => MediaTimeline.register(name);

//===END===

export { MediaTimeline };
