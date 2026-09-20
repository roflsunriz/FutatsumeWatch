import { workerUtil } from '../../../lib/src/infra/worker-util';
import { StoryboardInfoModel, createStoryboardInfoModel } from './storyboard-info-model';
import type { StoryboardRawData } from './storyboard-info-model';

interface StoryboardWorkerScope {
  OffscreenCanvas?: typeof OffscreenCanvas;
  createImageBitmap?: typeof createImageBitmap;
  onmessage: ((message: StoryboardWorkerMessage) => unknown) | null;
}

interface StoryboardWorkerMessage {
  command: string;
  params: {
    canvas?: unknown;
    info?: unknown;
    name?: string;
    id?: string;
    currentTime?: number;
    scrollLeft?: number;
    width?: number;
    height?: number;
    buffer?: ArrayBuffer;
    MAP?: SharedMemoryMap;
  };
}

interface SharedMemoryMap {
  currentTime: number;
  timestamp: number;
  duration: number;
  playbackRate: number;
  paused: number;
}

interface WorkerCanvas {
  width: number;
  height: number;
  getContext(contextId: string, options?: unknown): WorkerCanvasContext | null;
  transferToImageBitmap?(): ImageBitmap;
}

interface WorkerCanvasContext {
  beginPath(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: unknown, ...rect: number[]): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillStyle: string;
  strokeStyle: string;
  shadowColor: string;
  shadowOffsetX: number;
  commit?(): void;
  transferFromImageBitmap?(bitmap: ImageBitmap): void;
}

interface CachedImage {
  ref: number;
  image: { close?(): void };
  updated?: number;
}

interface StoryboardBoard {
  image: WorkerCanvas & { close?(): void };
  left: number;
  right: number;
  width: number;
}

interface SharedBufferView {
  readonly currentTime: number;
  readonly timestamp: number;
  wait(): number;
  readonly duration: number;
  readonly playbackRate: number;
  readonly paused: boolean;
}

interface BoardViewParams {
  canvas: WorkerCanvas;
  info: unknown;
  name: string;
}

interface CreateViewArgs {
  container?: Element | null;
  canvas?: HTMLCanvasElement | null;
  info?: unknown;
  ratio?: unknown;
  name?: string;
  style?: { widthPx?: number; heightPx?: number };
}

interface StoryboardWorkerHandle {
  name?: string;
  onmessage(message: { command: string; params: unknown }): unknown;
  post(message: { command: string; params: unknown }, transfer?: unknown): unknown;
}

interface CrossMessageWorkerUtil {
  createCrossMessageWorker(
    func: (self: StoryboardWorkerScope) => void,
    options: { name: string; inject?: string }
  ): StoryboardWorkerHandle;
}

export type {
  StoryboardWorkerScope,
  WorkerCanvas,
  WorkerCanvasContext,
  BoardViewParams,
  CreateViewArgs,
  SharedMemoryMap,
};
//===BEGIN===

const StoryboardWorker = (() => {
  const func = function (self: StoryboardWorkerScope): void {
    const SCROLL_BAR_WIDTH = 8;
    const BLANK_SRC =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAE0lEQVQoU2NkYGD4z4AHMI4MBQCFZAgB+jxHYAAAAABJRU5ErkJggg==';
    let BLANK_IMG: ImageBitmap | HTMLImageElement | undefined;
    const items: Record<string, BoardView | ThumbnailView> = {};
    const getCanvas = (width: number, height: number): WorkerCanvas => {
      if (self.OffscreenCanvas) {
        return new self.OffscreenCanvas(width, height) as unknown as WorkerCanvas;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas as unknown as WorkerCanvas;
    };
    // ArrayBuffer -> DataURL
    const a2d = (arrayBuffer: ArrayBuffer, type = 'image/jpeg'): Promise<unknown> => {
      return new Promise<unknown>((ok, ng) => {
        const reader = new FileReader();
        reader.onload = () => ok(reader.result);
        reader.onerror = ng;
        reader.readAsDataURL(new Blob([arrayBuffer], { type }));
      });
    };
    /**
     * @param {ArrayBuffer|string} src
     */
    const loadImage = async (src: ArrayBuffer | string): Promise<ImageBitmap | HTMLImageElement | undefined> => {
      try {
        if (self.createImageBitmap) {
          return createImageBitmap(
            src instanceof ArrayBuffer
              ? new Blob([src], { type: 'image/jpeg' })
              : await fetch(src).then((r) => r.blob())
          );
        } else {
          const img = new Image();
          img.src = src instanceof ArrayBuffer ? ((await a2d(src)) as string) : src;
          await img.decode();
          return img;
        }
      } catch (e) {
        console.warn('load image fail', e);
        return BLANK_IMG;
      }
    };
    void loadImage(BLANK_SRC).then((img) => (BLANK_IMG = img));

    const ImageCacheMap = new (class {
      declare map: Map<string, CachedImage>;
      constructor() {
        this.map = new Map();
      }
      async get(src: unknown): Promise<{ close?(): void } | undefined> {
        let cache = this.map.get(src as string);
        if (!cache) {
          cache = {
            ref: 0,
            image: (await loadImage(src as ArrayBuffer | string)) as { close?(): void },
          };
        }
        cache.ref++;
        cache.updated = Date.now();
        this.map.set(src as string, cache);
        void this.gc();
        return cache.image;
      }
      release(src: unknown): void {
        const cache = this.map.get(src as string);
        if (!cache) {
          return;
        }
        cache.ref--;
        if (cache.ref <= 0) {
          cache.image.close?.();
          this.map.delete(src as string);
        }
      }
      gc(): void {
        const MAX = 8;
        const map = this.map;
        if (map.size < MAX) {
          return;
        }
        const sorted = [...map].sort((a, b) => (a[1].updated as number) - (b[1].updated as number));
        while (map.size >= MAX) {
          const [src] = sorted.shift() as [string, CachedImage];
          const cache = map.get(src);
          if (cache?.image?.close) {
            cache.image.close();
          }
          map.delete(src);
        }
      }
    })();

    class BoardView {
      declare canvas: WorkerCanvas;
      declare name: string;
      declare _currentTime: number;
      declare _scrollLeft: number;
      declare _info: StoryboardInfoModel | null;
      declare lastPos: unknown;
      declare ctx: WorkerCanvasContext;
      declare bitmapCtx: WorkerCanvasContext | null;
      declare bufferCanvas: WorkerCanvas;
      declare bufferCtx: WorkerCanvasContext;
      declare images: typeof ImageCacheMap;
      declare totalWidth: number;
      declare isReady: boolean;
      declare boards: StoryboardBoard[];
      declare isAnimating: boolean;
      declare isInitialized: Promise<unknown>;
      declare buffer: SharedBufferView;
      constructor({ canvas, info, name }: BoardViewParams) {
        this.canvas = canvas;
        this.name = name;
        this._currentTime = -1;
        this._scrollLeft = 0;
        this._info = null;
        this.lastPos = {};
        this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) as WorkerCanvasContext;
        this.bitmapCtx = canvas.getContext('bitmaprenderer');
        this.bufferCanvas = getCanvas(canvas.width, canvas.height);
        this.bufferCtx = this.bufferCanvas.getContext('2d', {
          alpha: false,
          desynchronized: true,
        }) as WorkerCanvasContext;
        this.images = ImageCacheMap;
        this.totalWidth = 0;
        this.isReady = false;
        this.boards = [];
        this.isAnimating = false;
        this.cls();
        if (info) {
          this.isInitialized = this.setInfo(info);
        } else {
          this.isInitialized = Promise.resolve();
        }
      }
      get info(): StoryboardInfoModel | null {
        return this._info;
      }

      set info(infoRawData: unknown) {
        void this.setInfo(infoRawData);
      }

      async setInfo(infoRawData: unknown): Promise<void> {
        this.isReady = false;
        const current = this._info;
        if (current) {
          current.update(infoRawData as StoryboardRawData | null);
        } else {
          this._info = new StoryboardInfoModel(infoRawData as StoryboardRawData | null);
        }

        const info = this.info as StoryboardInfoModel;
        if (!info.isAvailable) {
          return this.cls();
        }
        console.time('BoardView setInfo');
        const cols = info.cols;
        const rows = info.rows;
        const pageWidth = info.pageWidth;
        const boardWidth = pageWidth * rows;
        const cellWidth = info.cellWidth;
        const cellHeight = info.cellHeight;

        this.height = cellHeight;
        this.totalWidth = Math.ceil((info.duration * 1000) / info.cellIntervalMs) * cellWidth;
        // info.cellCount * info.cellWidth;

        this.boards.forEach((board) => board.image.close?.());
        this.boards = (
          await Promise.all(
            info.images.map(async (url, idx) => {
              const image = await this.images.get(url);
              const boards: StoryboardBoard[] = [];
              for (let row = 0; row < rows; row++) {
                const canvas = getCanvas(pageWidth, cellHeight);
                const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) as WorkerCanvasContext;
                ctx.beginPath();
                const sy = row * cellHeight;
                ctx.drawImage(image, 0, sy, pageWidth, cellHeight, 0, 0, pageWidth, cellHeight);
                ctx.strokeStyle = 'rgb(128, 128, 128)';
                ctx.shadowColor = 'rgb(192, 192, 192)';
                ctx.shadowOffsetX = -1;
                for (let col = 0; col < cols; col++) {
                  const x = col * cellWidth;
                  ctx.strokeRect(x, 1, cellWidth - 1, cellHeight + 2);
                }

                boards.push({
                  image: canvas, //.transferToImageBitmap ? canvas.transferToImageBitmap() : canvas, // ImageBitmapじゃないほうが速い？気のせい？
                  left: idx * boardWidth + row * pageWidth,
                  right: idx * boardWidth + row * pageWidth + pageWidth,
                  width: pageWidth,
                });
              }
              this.images.release(url);
              return boards;
            })
          )
        ).flat();

        this.height = info.cellHeight;
        this._currentTime = -1;
        this.cls();
        console.timeEnd('BoardView setInfo');
        this.isReady = true;
        this.reDraw();
      }
      reDraw(): void {
        const left = this._scrollLeft;
        this._scrollLeft = -1;
        this.scrollLeft = left;
      }
      get scrollLeft(): number {
        return this._scrollLeft;
      }
      set scrollLeft(left: number) {
        left = Math.max(0, Math.min(this.totalWidth - this.width, left));
        if (this._scrollLeft === left) {
          return;
        }
        this._scrollLeft = left;
        if (!this.info || !this.info.isAvailable || !this.isReady) {
          return;
        }
        const width = this.width;
        const height = this.height;
        const totalWidth = this.totalWidth;
        const right = left + width;

        const bctx = this.bufferCtx;
        bctx.beginPath();
        for (const board of this.boards) {
          if (board.right < left) {
            continue;
          }
          if (board.left > right) {
            break;
          }
          const dx = board.left - left;
          bctx.drawImage(board.image, 0, 0, board.width, height, dx, 0, board.width, height);
        }
        const scrollBarLength = (width * width) / totalWidth;
        if (scrollBarLength < width) {
          const scrollBarLeft = (width * left) / totalWidth;
          bctx.fillStyle = 'rgba(240, 240, 240, 0.8)';
          bctx.fillRect(scrollBarLeft, height - SCROLL_BAR_WIDTH, scrollBarLength, SCROLL_BAR_WIDTH);
        }
        if (this.isAnimating && this._currentTime >= 0) {
          bctx.fillStyle = 'rgba(255, 255, 144, 0.5)';
          const cellWidth = this.info.cellWidth;
          const cellIndex = (this._currentTime * 1000) / this.info.cellIntervalMs;
          const pointerLeft = cellWidth * cellIndex - left - cellWidth / 2;
          bctx.fillRect(pointerLeft, 0, cellWidth, height);
        }

        if (this.bufferCanvas.transferToImageBitmap && this.bitmapCtx && this.bitmapCtx.transferFromImageBitmap) {
          const bitmap = this.bufferCanvas.transferToImageBitmap();
          this.bitmapCtx.transferFromImageBitmap(bitmap);
        } else {
          this.ctx.beginPath();
          this.ctx.drawImage(this.bufferCanvas, 0, 0, width, height, 0, 0, width, height);
        }
      }

      cls(): void {
        this.bufferCtx.clearRect(0, 0, this.width, this.height);
        this.ctx.clearRect(0, 0, this.width, this.height);
      }
      get currentTime(): number {
        const center = this._scrollLeft + this.width / 2;
        return (this as unknown as { duration: number }).duration * (center / this.totalWidth);
      }
      set currentTime(time: number) {
        this.setCurrentTime(time);
      }
      get width(): number {
        return this.canvas.width;
      }
      get height(): number {
        return this.canvas.height;
      }
      set width(width: number) {
        this.canvas.width = width;
        this.bufferCanvas.width = width;
      }
      set height(height: number) {
        this.canvas.height = height;
        this.bufferCanvas.height = height;
      }
      setCurrentTime(sec: number): void {
        const info = this.info as StoryboardInfoModel;
        this._currentTime = sec;
        const duration = Math.max(1, info.duration);
        const per = sec / duration;
        const intervalMs = info.cellIntervalMs;
        const totalWidth = this.totalWidth;
        const innerWidth = this.width;
        const cellWidth = info.cellWidth;
        const cellIndex = (this._currentTime * 1000) / intervalMs;
        const scrollLeft = Math.min(Math.max(cellWidth * cellIndex - innerWidth * per, 0), totalWidth - innerWidth);
        //        const scrollLeft = Math.min(Math.max(totalWidth * r - innerWidth * per, 0), totalWidth - innerWidth);
        this.scrollLeft = scrollLeft;
      }

      resize({ width, height }: { width?: number; height?: number }): void {
        if (width) {
          this.width = width;
        }
        if (height) {
          this.height = height;
        }
        if (this.isReady) {
          this.reDraw();
        } else {
          this.cls();
        }
      }

      sharedMemory({ buffer, MAP }: { buffer: ArrayBuffer; MAP: SharedMemoryMap }): void {
        const view = new Float32Array(buffer);
        const iview = new Int32Array(buffer);
        this.buffer = {
          get currentTime(): number {
            return view[MAP.currentTime] as number;
          },
          get timestamp(): number {
            return iview[MAP.timestamp] as number;
          },
          wait(): number {
            const tm = Atomics.load(iview, MAP.timestamp);
            Atomics.wait(iview, MAP.timestamp, tm, 3000);
            return Atomics.load(iview, MAP.timestamp);
          },
          get duration(): number {
            return view[MAP.duration] as number;
          },
          get playbackRate(): number {
            return view[MAP.playbackRate] as number;
          },
          get paused(): boolean {
            return iview[MAP.paused] !== 0;
          },
        };
      }

      async execAnimation(): Promise<void> {
        // SharedArrayBufferで遊びたかっただけ. 最適化の余地はありそう
        this.isAnimating = true;
        const buffer = this.buffer;
        while (this.isAnimating) {
          while (!this.isReady) {
            await new Promise((res) => setTimeout(res, 500));
          }
          while (this.isReady && this.isAnimating && !buffer.paused) {
            buffer.wait();
            this.currentTime = this.buffer.currentTime;
            await new Promise((res) => requestAnimationFrame(res)); // 結局raf安定だった
          }
          if (!this.isAnimating) {
            return;
          }
          await new Promise((res) => setTimeout(res, 1000));
        }
      }
      startAnimation(): void {
        if (!this.buffer || this.isAnimating) {
          return;
        }
        this.currentTime = this.buffer.currentTime;
        void this.execAnimation();
      }
      async stopAnimation(): Promise<void> {
        this.isAnimating = false;
        await new Promise((res) => requestAnimationFrame(res));
        this.reDraw();
      }

      dispose(): void {
        void this.stopAnimation();
        this.isReady = false;
        this.boards.length = 0;
      }
    }

    class ThumbnailView {
      declare canvas: WorkerCanvas;
      declare name: string;
      declare _currentTime: number;
      declare _info: StoryboardInfoModel;
      declare lastPos: unknown;
      declare ctx: WorkerCanvasContext;
      declare images: typeof ImageCacheMap;
      declare isInitialized: Promise<unknown>;
      declare isAnimating: boolean;
      declare isReady: boolean;
      constructor({ canvas, info, name }: BoardViewParams) {
        this.canvas = canvas;
        this.name = name;
        this._currentTime = -1;
        this._info = new StoryboardInfoModel(info as StoryboardRawData | null);
        this.lastPos = {};
        this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) as WorkerCanvasContext;
        this.images = ImageCacheMap;
        this.cls();
        this.isInitialized = Promise.resolve();
        this.isAnimating = false;
      }
      get info(): StoryboardInfoModel {
        return this._info;
      }

      set info(info: StoryboardRawData | null) {
        this.isReady = false;
        const current = this.info;
        if (current) {
          current.images.forEach((url) => this.images.release(url));
        }

        this._info.update(info);
        this._currentTime = -1;
        this.cls();
        if (!(info as StoryboardRawData).isAvailable) {
          return;
        }
        this.isReady = true;
      }
      setInfo(info: unknown): void {
        this.info = info as StoryboardRawData;
      }
      cls(): void {
        this.ctx.clearRect(0, 0, this.width, this.height);
      }
      get currentTime(): number {
        return this.currentTime;
      }
      set currentTime(time: number) {
        void this.setCurrentTime(time);
      }
      get width(): number {
        return this.canvas.width;
      }
      get height(): number {
        return this.canvas.height;
      }
      set width(width: number) {
        this.canvas.width = width;
      }
      set height(height: number) {
        this.canvas.height = height;
      }

      async setCurrentTime(time: number): Promise<void> {
        const info = this.info;
        if (time > info.duration) {
          time = info.duration;
        }
        if (time < 0) {
          time = 0;
        }
        if (this._currentTime === time) {
          return;
        }
        const pos = info.getThumbnailPosition(time * 1000);
        const keys = Object.keys(pos) as Array<keyof typeof pos>;
        if (keys.every((key) => pos[key] === (this.lastPos as Record<string, unknown>)[key])) {
          return;
        }
        this.lastPos = pos;
        this._currentTime = time;
        const { url, row, col } = pos;
        const cellWidth = info.cellWidth;
        const cellHeight = info.cellHeight;
        const image = await this.images.get(url);
        const imageLeft = col * cellWidth;
        const imageTop = row * cellHeight;
        const scale = Math.min(this.width / cellWidth, this.height / cellHeight);
        this.cls();
        this.ctx.drawImage(
          image,
          imageLeft,
          imageTop,
          cellWidth,
          cellHeight,
          (this.width - cellWidth * scale) / 2,
          (this.height - cellHeight * scale) / 2,
          cellWidth * scale,
          cellHeight * scale
        );
      }
      resize({ width, height }: { width?: number; height?: number }): void {
        if (width !== undefined) {
          this.width = width;
        }
        if (height !== undefined) {
          this.height = height;
        }
        this.cls();
      }

      dispose(): void {
        const current = this.info;
        if (current) {
          current.images.forEach((url) => this.images.release(url));
        }
        this.info = null;
      }
      sharedMemory(): void {}

      async execAnimation(): Promise<void> {
        while (this.isAnimating) {
          while (!this.isReady) {
            await new Promise((res) => setTimeout(res, 500));
          }
          await this.setCurrentTime(
            (this.currentTime + (this.info as unknown as { interval: number }).interval / 1000) % this.info.duration
          );
          if (!this.isAnimating) {
            return;
          }
          await new Promise((res) => setTimeout(res, 1000));
        }
      }
      startAnimation(): void {
        if (this.isAnimating) {
          return;
        }
        this.isAnimating = true;
        void this.execAnimation();
      }
      stopAnimation(): void {
        this.isAnimating = false;
      }
    }

    const getId = function (this: { id: number }): string {
      return `Storyboard-${this.id++}`;
    }.bind({ id: 0 });

    const createView = async (
      {
        canvas,
        info,
        name,
      }: {
        canvas?: unknown;
        info?: unknown;
        name?: string;
      },
      type = 'thumbnail'
    ): Promise<{ status: string; id: string }> => {
      const id = getId();
      const view =
        type === 'thumbnail'
          ? new ThumbnailView({ canvas: canvas as WorkerCanvas, info, name: name as string })
          : new BoardView({ canvas: canvas as WorkerCanvas, info, name: name as string });
      items[id] = view;
      await view.isInitialized;
      return { status: 'ok', id };
    };

    const info = async ({ id, info }: { id?: string; info?: unknown }): Promise<{ status: string }> => {
      const item = items[id as string];
      if (!item) {
        throw new Error(`unknown id:${String(id)}`);
      }
      await item.setInfo(info);
      return { status: 'ok' };
    };

    const currentTime = ({ id, currentTime }: { id?: string; currentTime?: number }): { status: string } => {
      const item = items[id as string];
      if (!item) {
        throw new Error(`unknown id:${String(id)}`);
      }
      void item.setCurrentTime(currentTime as number);
      return { status: 'ok' };
    };

    const scrollLeft = ({ id, scrollLeft }: { id?: string; scrollLeft?: number }): { status: string } => {
      const item = items[id as string];
      if (!item) {
        throw new Error(`unknown id:${String(id)}`);
      }
      (item as BoardView).scrollLeft = scrollLeft as number;
      return { status: 'ok' };
    };

    const resize = (params: { id?: string; width?: number; height?: number }): { status: string } => {
      const item = items[params.id as string];
      if (!item) {
        throw new Error(`unknown id:${String(params.id)}`);
      }
      item.resize(params);
      return { status: 'ok' };
    };

    const cls = (params: { id?: string }): { status: string } => {
      const item = items[params.id as string];
      if (!item) {
        throw new Error(`unknown id:${String(params.id)}`);
      }
      item.cls();
      return { status: 'ok' };
    };

    const dispose = ({ id }: { id?: string }): { status: string } | undefined => {
      const item = items[id as string];
      if (!item) {
        return;
      }
      item.dispose();
      delete items[id as string];
      return { status: 'ok' };
    };

    const sharedMemory = ({
      id,
      buffer,
      MAP,
    }: {
      id?: string;
      buffer?: ArrayBuffer;
      MAP?: SharedMemoryMap;
    }): { status: string } => {
      const item = items[id as string];
      if (!item) {
        throw new Error(`unknown id:${String(id)}`);
      }
      (item as BoardView).sharedMemory({ buffer: buffer as ArrayBuffer, MAP: MAP as SharedMemoryMap });
      return { status: 'ok' };
    };

    const startAnimation = ({ id }: { id?: string }): { status: string } => {
      const item = items[id as string];
      if (!item) {
        throw new Error(`unknown id:${String(id)}`);
      }
      item.startAnimation();
      return { status: 'ok' };
    };

    const stopAnimation = ({ id }: { id?: string }): { status: string } => {
      const item = items[id as string];
      if (!item) {
        throw new Error(`unknown id:${String(id)}`);
      }
      void item.stopAnimation();
      return { status: 'ok' };
    };

    self.onmessage = async ({ command, params }: StoryboardWorkerMessage): Promise<unknown> => {
      switch (command) {
        case 'createThumbnail':
          return createView(params, 'thumbnail');
        case 'createBoard':
          return createView(params, 'board');
        case 'info':
          return info(params);
        case 'currentTime':
          return currentTime(params);
        case 'scrollLeft':
          return scrollLeft(params);
        case 'resize':
          return resize(params);
        case 'cls':
          return cls(params);
        case 'dispose':
          return dispose(params);
        case 'sharedMemory':
          return sharedMemory(params);
        case 'startAnimation':
          return startAnimation(params);
        case 'stopAnimation':
          return stopAnimation(params);
      }
    };
  };

  const isOffscreenCanvasAvailable = !!HTMLCanvasElement.prototype.transferControlToOffscreen;

  const NAME = 'StoryboardWorker';

  let worker: StoryboardWorkerHandle | undefined;
  const initWorker = (): StoryboardWorkerHandle => {
    if (worker) {
      return worker;
    }
    if (!isOffscreenCanvasAvailable) {
      if (!worker) {
        const fallback: StoryboardWorkerHandle = {
          name: NAME,
          onmessage: () => {},
          post: ({ command, params }) => {
            const target = worker as StoryboardWorkerHandle;
            return target.onmessage({ command, params });
          },
        };
        worker = fallback;
        func(worker);
      }
    } else {
      const util = workerUtil as unknown as CrossMessageWorkerUtil;
      worker =
        worker ||
        util.createCrossMessageWorker(func, {
          name: NAME,
          inject: `const StoryboardInfoModel = (${createStoryboardInfoModel.toString()})(Emitter);`,
        });
    }
    return worker;
  };

  const createView = (
    { container, canvas, info, name, style }: CreateViewArgs,
    type = 'thumbnail'
  ): {
    container: Element | null | undefined;
    canvas: HTMLCanvasElement;
    setInfo(info: unknown): Promise<unknown>;
    resize(size: { width?: number; height?: number }): Promise<unknown>;
    readonly scrollLeft: number;
    readonly currentTime: number;
    dispose(): void;
    sharedMemory(params: { MAP: SharedMemoryMap; buffer: ArrayBuffer }): void;
    startAnimation(): void;
    stopAnimation(): void;
    readonly isAnimating: boolean;
  } => {
    const viewStyle = style || {};
    const viewName = name || 'Storyboard';
    let viewCanvas = canvas;
    if (!viewCanvas) {
      viewCanvas = document.createElement('canvas');
      Object.assign(viewCanvas.style, {
        width: '100%',
        height: '100%',
      });
      if (container) {
        container.append(viewCanvas);
      }
      if (viewStyle.widthPx) {
        viewCanvas.width = Math.max(viewStyle.widthPx);
      }
      if (viewStyle.heightPx) {
        viewCanvas.height = Math.max(viewStyle.heightPx);
      }
    }
    viewCanvas.dataset.name = viewName;
    viewCanvas.classList.add('is-loading');

    // const worker = await ;

    const layer = isOffscreenCanvasAvailable ? viewCanvas.transferControlToOffscreen() : viewCanvas;

    const promiseSetup = (async () => {
      const w = initWorker();
      const result = (await w.post(
        {
          command: type === 'thumbnail' ? 'createThumbnail' : 'createBoard',
          params: { canvas: layer, info, style: viewStyle, name: viewName },
        },
        { transfer: [layer] }
      )) as { id: string };
      viewCanvas.classList.remove('is-loading');
      return result.id;
    })();
    let currentTime = -1,
      scrollLeft = -1,
      isAnimating = false;

    const post = async (message: { command: string; params: unknown }, transfer: unknown = {}): Promise<unknown> => {
      const id = await promiseSetup;
      const params = (message.params || {}) as Record<string, unknown>;
      params.id = id;
      const w = initWorker();
      return w.post({ command: message.command, params }, transfer);
    };

    const result = {
      container,
      canvas: viewCanvas,
      setInfo(info: unknown): Promise<unknown> {
        currentTime = -1;
        scrollLeft = -1;
        viewCanvas.classList.add('is-loading');
        return post({ command: 'info', params: { info } }).then(() => viewCanvas.classList.remove('is-loading'));
      },
      resize({ width, height }: { width?: number; height?: number }): Promise<unknown> {
        scrollLeft = -1;
        return post({ command: 'resize', params: { width, height } });
      },
      get scrollLeft(): number {
        return scrollLeft;
      },
      set scrollLeft(left: number) {
        if (scrollLeft === left) {
          return;
        }
        scrollLeft = left;
        void post({ command: 'scrollLeft', params: { scrollLeft } });
      },
      get currentTime(): number {
        return currentTime;
      },
      set currentTime(time: number) {
        if (currentTime === time) {
          return;
        }
        currentTime = time;
        void post({ command: 'currentTime', params: { currentTime } });
      },
      dispose(): void {
        void post({ command: 'dispose', params: {} });
      },
      sharedMemory({ MAP, buffer }: { MAP: SharedMemoryMap; buffer: ArrayBuffer }): void {
        void post({ command: 'sharedMemory', params: { MAP, buffer } });
      },
      startAnimation(): void {
        isAnimating = true;
        void post({ command: 'startAnimation', params: {} });
      },
      stopAnimation(): void {
        isAnimating = false;
        void post({ command: 'stopAnimation', params: {} });
      },
      get isAnimating(): boolean {
        return isAnimating;
      },
    };
    return result;
  };
  return {
    initWorker,
    createThumbnail: (args: CreateViewArgs) => createView(args, 'thumbnail'),
    createBoard: (args: CreateViewArgs) => createView(args, 'board'),
  };
})();

//===END===
export { StoryboardWorker };
