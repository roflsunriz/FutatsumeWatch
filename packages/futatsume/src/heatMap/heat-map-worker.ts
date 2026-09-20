import { workerUtil } from '../../../lib/src/infra/worker-util';
import { global } from '../../../../src/futatsume-watch-index';
// import {WatchInfoCacheDb} from '../../../lib/src/nico/watch-info-cache-db';

interface HeatMapEmitter {
  emit(name: string, data: unknown): void;
}

interface HeatChat {
  fork: number;
  vpos: number;
}

interface HeatChatGroups {
  top: HeatChat[];
  naka: HeatChat[];
  bottom: HeatChat[];
}

interface HeatMapModelParams {
  resolution?: unknown;
}

interface HeatMapParams {
  model?: unknown;
  container?: Element | null;
  canvas?: HTMLCanvasElement | null;
  width?: unknown;
  height?: unknown;
}

interface HeatMapWorkerScope {
  onmessage: ((message: HeatMapWorkerMessage) => unknown) | null;
}

interface HeatMapWorkerMessage {
  command: string;
  params: {
    canvas?: HTMLCanvasElement | null;
    chatList?: HeatMapWorkerChatGroups;
    duration?: number;
  };
}

interface HeatMapWorkerChatGroups {
  top: Array<{ props: Record<string, unknown> }>;
  naka: Array<{ props: Record<string, unknown> }>;
  bottom: Array<{ props: Record<string, unknown> }>;
}

interface CrossMessageWorkerUtil {
  createCrossMessageWorker(
    func: string,
    options?: { name?: string }
  ): { post(message: unknown, options?: unknown): Promise<unknown> };
}

interface GlobalEmitterLike {
  emitter: { emit(name: string, ...args: unknown[]): void };
}

interface HeatMapHandle {
  canvas: HTMLCanvasElement;
  update(chatList: HeatMapWorkerChatGroups): Promise<unknown>;
  readonly duration: number | undefined;
  reset(): Promise<unknown>;
  readonly chatList: HeatMapWorkerChatGroups | undefined;
}

export type { HeatChat, HeatChatGroups, HeatMapModelParams, HeatMapParams };

type HeatMapInstance = InstanceType<ReturnType<typeof HeatMapInitFunc>>;

//===BEGIN===
function HeatMapInitFunc(self: HeatMapEmitter) {
  class HeatMapModel {
    declare static RESOLUTION: number;
    declare resolution: number;
    declare _duration: number;
    declare _chatReady: boolean;
    declare map: number[];
    declare _chat: HeatChatGroups;
    constructor(params: HeatMapModelParams) {
      this.resolution = (params.resolution as number) || HeatMapModel.RESOLUTION;
      this.reset();
    }
    reset(): void {
      this._duration = -1;
      this._chatReady = false;
      this.map = [];
    }
    set duration(duration: number) {
      if (this._duration === duration) {
        return;
      }
      this._duration = duration;
      this.update();
    }
    get duration(): number {
      return this._duration;
    }
    set chatList(comment: HeatChatGroups) {
      this._chat = comment;
      this._chatReady = true;
      this.update();
    }
    update(): boolean {
      if (!Number.isFinite(this._duration) || this._duration <= 0) {
        this.map = [];
        return false;
      }
      if (this._duration < 0 || !this._chatReady) {
        return false;
      }
      const map = (this.map = this.getHeatMap());
      return !!map.length;
    }
    getHeatMap(): number[] {
      const chatList = this._chat.top.concat(this._chat.naka, this._chat.bottom).filter((chat) => chat.fork !== 2); // かんたんコメント除外
      const duration = this._duration;
      if (!Number.isFinite(duration) || duration < 1) {
        return [];
      }
      const map = new Array<number>(Math.max(Math.min(this.resolution, Math.floor(duration)), 1));
      const length = map.length;
      let i = length;
      while (i > 0) {
        map[--i] = 0;
      }

      const ratio = duration > map.length ? map.length / duration : 1;

      for (i = chatList.length - 1; i >= 0; i--) {
        const nicoChat = chatList[i] as HeatChat;
        const pos = nicoChat.vpos;
        if (!Number.isFinite(pos) || pos < 0 || pos >= duration * 100) continue;
        const mpos = Math.min(Math.floor((pos * ratio) / 100), map.length - 1);
        map[mpos] = (map[mpos] as number) + 1;
      }
      for (i = 0; i < Math.min(length, 20); i++) {
        // 先頭付近は「うぽつ」などで一極集中しがちなのでリミットを設ける
        map[i] = Math.min(5, map[i] as number);
      }
      for (; i < Math.min(length, 60); i++) {
        map[i] = Math.min(10, map[i] as number);
      }
      map.length = length;
      return map;
    }
  }
  HeatMapModel.RESOLUTION = 200;

  class HeatMapView {
    declare model: HeatMapModel;
    declare container: Element | null | undefined;
    declare canvas: HTMLCanvasElement | null | undefined;
    declare _palette: string[];
    declare context: CanvasRenderingContext2D;
    declare width: number;
    declare height: number;
    declare _isInitialized: boolean | undefined;
    constructor(params: HeatMapParams) {
      this.model = params.model as HeatMapModel;
      this.container = params.container;
      this.canvas = params.canvas;
    }
    initializePalette(): void {
      this._palette = [];
      for (let c = 0; c < 256; c++) {
        const r = Math.floor(c > 127 ? c / 2 + 128 : 0),
          g = Math.floor(c > 127 ? 255 - (c - 128) * 2 : c * 2),
          b = Math.floor(c > 127 ? 0 : 255 - c * 2);
        this._palette.push(`rgb(${r}, ${g}, ${b})`);
      }
    }
    initializeCanvas(): void {
      if (!this.canvas) {
        this.canvas = this.container!.querySelector<HTMLCanvasElement>('canvas.heatMap');
      }

      this.context = this.canvas!.getContext('2d', {
        alpha: false,
        desynchronized: true,
      }) as CanvasRenderingContext2D;
      this.width = this.canvas!.width;
      this.height = this.canvas!.height;

      this.reset();
    }
    reset(): void {
      if (!this.context) {
        return;
      }
      this.context.fillStyle = this._palette[0] as string;
      this.context.beginPath();
      this.context.fillRect(0, 0, this.width, this.height);
    }
    async toDataURL(): Promise<string> {
      if (!this.canvas) {
        return '';
      }
      const type = 'image/png';
      const canvas = this.canvas;
      try {
        return canvas.toDataURL(type);
      } catch {
        const blob = await new Promise<Blob | null>((res) => {
          const convertible = canvas as unknown as {
            convertToBlob?: (options?: { type?: string }) => Promise<Blob>;
            toBlob(callback: (blob: Blob | null) => void, type?: string): void;
          };
          if (convertible.convertToBlob) {
            return res(convertible.convertToBlob({ type }));
          }
          convertible.toBlob(res, type);
        }).catch(() => null);
        if (!blob) {
          return '';
        }
        return new Promise<string>((ok, ng) => {
          const reader = new FileReader();
          reader.onload = () => {
            ok(reader.result as string);
          };
          reader.onerror = (e: unknown) => ng(e instanceof Error ? e : new Error('readAsDataURL failed'));
          reader.readAsDataURL(blob);
        }).catch(() => '');
      }
    }
    update(map?: number[]): boolean {
      if (!this._isInitialized) {
        this._isInitialized = true;
        this.initializePalette();
        this.initializeCanvas();
        this.reset();
      }
      map = map || this.model.map;
      if (!map.length) {
        return false;
      }

      console.time('draw HeatMap');

      // 一番コメント密度が高い所を100%として相対的な比率にする
      // 赤い所が常にピークになってわかりやすいが、
      // コメントが一カ所に密集している場合はそれ以外が薄くなってしまうのが欠点
      let max = 0,
        i: number;
      // -4 してるのは、末尾にコメントがやたら集中してる事があるのを集計対象外にするため (ニコニ広告に付いてたコメントの名残？)
      for (i = Math.max(map.length - 4, 0); i >= 0; i--) {
        max = Math.max(map[i] as number, max);
      }

      if (max > 0) {
        const rate = 255 / max;
        for (i = map.length - 1; i >= 0; i--) {
          map[i] = Math.min(255, Math.floor((map[i] as number) * rate));
        }
      } else {
        console.timeEnd('draw HeatMap');
        return false;
      }

      const scale = map.length >= this.width ? 1 : this.width / Math.max(map.length, 1),
        blockWidth = (this.width / map.length) * scale,
        context = this.context;

      for (i = map.length - 1; i >= 0; i--) {
        context.fillStyle = (this._palette[parseInt(String(map[i]), 10)] as string) || (this._palette[0] as string);
        context.beginPath();
        context.fillRect(i * scale, 0, blockWidth, this.height);
      }
      console.timeEnd('draw HeatMap');
      (context as unknown as { commit?: () => void }).commit?.();
      return true;
    }
  }

  class HeatMap {
    /**
     *
     * @param {object} params
     * @prop {Element?} container
     * @prop {HTMLCamvasElement?} canvas
     */
    declare model: HeatMapModel;
    declare view: HeatMapView;
    constructor(params: HeatMapParams) {
      /** @type {HeatMapModel} */
      this.model = new HeatMapModel({});
      /** @type {HeatMapView} */
      this.view = new HeatMapView({
        model: this.model,
        container: params.container,
        canvas: params.canvas,
      });
      this.reset();
    }
    reset(): void {
      this.model.reset();
      this.view.reset();
    }
    /**
     * @params {number} duration
     */
    set duration(duration: number) {
      if (this.model.duration === duration) {
        return;
      }
      this.model.duration = duration;
      if (this.view.update()) {
        void this.toDataURL().then((dataURL) => {
          self.emit('heatMapUpdate', { map: this.map, duration: this.duration, dataURL });
        });
      }
    }
    get duration(): number {
      return this.model.duration;
    }
    /**
     * @params {NicoChat[]} chatList
     */
    set chatList(chatList: HeatChatGroups) {
      this.model.chatList = chatList;
      if (this.view.update()) {
        void this.toDataURL().then((dataURL) => {
          self.emit('heatMapUpdate', { map: this.map, duration: this.duration, dataURL });
        });
      }
    }
    get canvas(): HTMLCanvasElement | Record<string, never> {
      return this.view.canvas || {};
    }
    get map(): number[] {
      return this.model.map;
    }
    async toDataURL(): Promise<string> {
      return this.view.toDataURL();
    }
  }
  return HeatMap;
} // end of HeatMapInitFunc

const HeatMapWorker = (() => {
  const _func = function (self: HeatMapWorkerScope): void {
    const HeatMap = HeatMapInitFunc(self as unknown as { emit(name: string, data: unknown): void });

    let heatMap: HeatMapInstance | undefined;
    const init = ({ canvas }: { canvas?: HTMLCanvasElement | null }): void => {
      heatMap = new HeatMap({ canvas });
    };
    const update = ({ chatList }: { chatList?: unknown }): void => {
      (heatMap as HeatMapInstance).chatList = chatList as HeatChatGroups;
    };
    const duration = ({ duration }: { duration?: unknown }): void => {
      (heatMap as HeatMapInstance).duration = duration as number;
    };
    const reset = (): void => {
      (heatMap as HeatMapInstance).reset();
    };
    self.onmessage = async ({ command, params }: HeatMapWorkerMessage): Promise<unknown> => {
      const target = heatMap as HeatMapInstance;
      const result: { status: string; dataURL?: unknown; map?: unknown; duration?: unknown } = { status: 'ok' };
      switch (command) {
        case 'init':
          init(params);
          break;
        case 'update':
          update(params);
          break;
        case 'duration':
          duration(params);
          break;
        case 'reset':
          reset();
          break;
        case 'getData':
          result.dataURL = await target.toDataURL();
          result.map = target.map;
          result.duration = target.duration;
          break;
      }
      return result;
    };
  };
  const func = `
  function(self) {
    ${HeatMapInitFunc.toString()};
    (${_func.toString()})(self);
  }
  `;
  const isOffscreenCanvasAvailable = !!HTMLCanvasElement.prototype.transferControlToOffscreen;
  let worker: { post(message: unknown, options?: unknown): Promise<unknown> } | undefined;
  const init = async ({
    container,
    width,
    height,
  }: {
    container: Element;
    width?: unknown;
    height?: unknown;
  }): Promise<unknown> => {
    void width;
    void height;
    const util = workerUtil as unknown as CrossMessageWorkerUtil;
    if (!isOffscreenCanvasAvailable) {
      const globalLike = global as unknown as GlobalEmitterLike;
      const HeatMap = HeatMapInitFunc({
        emit: (name: string, ...args: unknown[]) => globalLike.emitter.emit(name, ...args),
      });
      return new HeatMap({ container, width, height });
    }
    worker = worker || util.createCrossMessageWorker(func, { name: 'HeatMapWorker' });
    const post = worker.post.bind(worker);
    const canvas = container.querySelector('canvas.heatMap') as HTMLCanvasElement;
    const layer = canvas.transferControlToOffscreen();
    await post({ command: 'init', params: { canvas: layer } }, { transfer: [layer] });
    let _chatList: HeatMapWorkerChatGroups | undefined;
    let _duration: number | undefined;
    const handle: HeatMapHandle = {
      canvas,
      update(chatList: HeatMapWorkerChatGroups): Promise<unknown> {
        const normalized = {
          top: chatList.top.map((c) => {
            return { ...c.props, ...{ group: null } };
          }),
          naka: chatList.naka.map((c) => {
            return { ...c.props, ...{ group: null } };
          }),
          bottom: chatList.bottom.map((c) => {
            return { ...c.props, ...{ group: null } };
          }),
        };
        return post({ command: 'update', params: { chatList: normalized } });
      },
      get duration(): number | undefined {
        return _duration;
      },
      set duration(d: number) {
        _duration = d;
        void post({ command: 'duration', params: { duration: d } });
      },
      reset: () => post({ command: 'reset', params: {} }),
      get chatList(): HeatMapWorkerChatGroups | undefined {
        return _chatList;
      },
      set chatList(chatList: HeatMapWorkerChatGroups) {
        void this.update((_chatList = chatList));
      },
    };
    return handle;
  };
  return { init };
})();

const HeatMap = HeatMapInitFunc({
  emit: (name: string, ...args: unknown[]) => (global as unknown as GlobalEmitterLike).emitter.emit(name, ...args),
});

//===END===

export { HeatMap, HeatMapWorker };
