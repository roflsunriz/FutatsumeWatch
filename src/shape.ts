import { css } from '../packages/lib/src/css/css';
import { SettingsDialog } from '../packages/components/src/settings-dialog';

interface MaskedWatchConfig {
  interval: number;
  enabled: boolean;
  debug: boolean;
  faceDetection: boolean;
  textDetection: boolean;
  fastMode: boolean;
  tmpWidth: number;
  tmpHeight: number;
  [key: string]: number | boolean;
}

interface MaskedWatchBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
}

interface MaskedWatchSupport {
  face: boolean;
  text: boolean;
}

interface MaskedWatchProduct {
  config: MaskedWatchConfig;
  dialog?: unknown;
  support: MaskedWatchSupport | null;
}

interface MaskedWatchWorkerParams {
  config?: MaskedWatchConfig;
  bitmap?: ImageBitmap;
  dataURL?: string;
  boxes?: MaskedWatchBoundingBox[];
}

interface MaskedWatchWorkerSelf {
  onmessage: ((e: { data: { body: { command: string; params: MaskedWatchWorkerParams } } }) => unknown) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

interface MaskedWatchDetectorHost {
  FaceDetector: new (options: { fastMode: boolean }) => {
    detect(bitmap: ImageBitmap): Promise<unknown[]>;
  };
  TextDetector: new () => { detect(bitmap: ImageBitmap): Promise<unknown[]> };
}

interface MaskedWatchPaintContext {
  beginPath(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillStyle: string;
}

interface MaskedWatchPaintProps {
  get(name: string): { toString(): string };
}

interface MaskedWatchFutatsume {
  emitter: {
    promise(event: string): Promise<unknown>;
    on(event: string, listener: (...args: unknown[]) => void): unknown;
  };
  version: unknown;
}

interface MaskedWatchCss {
  addModule(func: unknown, options?: unknown): Promise<unknown>;
  registerProps(...props: unknown[]): void;
  addStyle(cssText: string): void;
}

// chrome://flags/#enable-experimental-web-platform-features

/**
 * @typedf BoundingBox
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {'face'|'text'} type
 */

(() => {
  const PRODUCT = 'MaskedWatch';

  const monkey = (PRODUCT: string): void => {
    'use strict';
    let FutatsumeWatch: MaskedWatchFutatsume | null = null;

    const DEFAULT_CONFIG: MaskedWatchConfig = {
      interval: 300,
      enabled: true,
      debug: false,
      faceDetection: true,
      textDetection: !navigator.userAgent.toLowerCase().includes('windows'),
      fastMode: true,
      tmpWidth: 854,
      tmpHeight: 480,
    };
    const config = new (class extends Function {
        toString(): string {
          return `
*** CONFIG MENU (設定はサービスごとに保存) ***
enabled: ${config.enabled},       // 有効/無効
debug: ${config.debug},        // デバッグON/OFF
faceDetection: ${config.faceDetection}, // 顔検出ON/OFF
textDetection: ${config.textDetection}, // テキスト検出ON/OFF
fastMode: ${config.fastMode},     // false 精度重視 true 速度重視
tmpWidth: ${config.tmpWidth},      // 検出処理用キャンバスの横解像度
tmpHeight: ${config.tmpHeight}        // 検出処理用キャンバスの縦解像度
interval: ${config.interval}        // マスクの更新間隔
`;
        }
      })() as unknown as MaskedWatchConfig,
      def: PropertyDescriptorMap & ThisType<unknown> = {};
    Object.keys(DEFAULT_CONFIG)
      .sort()
      .forEach((key) => {
        const storageKey = `${PRODUCT}_${key}`;
        def[key] = {
          enumerable: true,
          get() {
            return (
              Object.prototype.hasOwnProperty.call(localStorage, storageKey)
                ? JSON.parse(localStorage[storageKey] as string)
                : DEFAULT_CONFIG[key]
            ) as unknown;
          },
          set(value: unknown) {
            const currentValue = (this as unknown as Record<string, unknown>)[key];
            if (value === currentValue) {
              return;
            }
            if (value === DEFAULT_CONFIG[key]) {
              localStorage.removeItem(storageKey);
            } else {
              localStorage[storageKey] = JSON.stringify(value);
            }
            document.body.dispatchEvent(
              new CustomEvent(`${PRODUCT}-config.update`, {
                detail: { key, value, lastValue: currentValue },
                bubbles: true,
                composed: true,
              })
            );
          },
        };
      });
    Object.defineProperties(config, def);

    const MaskedWatch: MaskedWatchProduct = ((window as unknown as { MaskedWatch: MaskedWatchProduct }).MaskedWatch = {
      config,
      support: null,
    });

    const createWorker = (func: (...args: never[]) => unknown, options: WorkerOptions = {}): Worker => {
      const src = `(${func.toString()})(self);`;
      const blob = new Blob([src], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      return new Worker(url, options);
    };

    const 業務 = function (self: MaskedWatchWorkerSelf): void {
      let fastMode!: boolean, faceDetection!: boolean, textDetection!: boolean;
      const init = (params: MaskedWatchWorkerParams): void => {
        updateConfig({ config: params.config as MaskedWatchConfig });
      };

      const updateConfig = ({ config }: { config: MaskedWatchConfig }): void => {
        ({ fastMode, faceDetection, textDetection } = config);
        const host = self as unknown as Partial<MaskedWatchDetectorHost>;
        faceDetector = typeof host.FaceDetector === 'function' ? new host.FaceDetector({ fastMode }) : null;
        textDetector = typeof host.TextDetector === 'function' ? new host.TextDetector() : null;
        self.postMessage({
          body: {
            command: 'support',
            params: { support: { face: faceDetector !== null, text: textDetector !== null } },
            status: 'ok',
          },
        });
      };

      let faceDetector: { detect(bitmap: ImageBitmap): Promise<unknown[]> } | null = null;
      let textDetector: { detect(bitmap: ImageBitmap): Promise<unknown[]> } | null = null;
      const detect = async ({
        bitmap,
      }: MaskedWatchWorkerParams): Promise<{
        boxes: MaskedWatchBoundingBox[];
        dataURL?: string;
      }> => {
        // debug && console.time('detect');
        const tasks: Promise<unknown[]>[] = [];
        if (faceDetection && faceDetector) {
          tasks.push(faceDetector.detect(bitmap as ImageBitmap).catch(() => []));
        }
        if (textDetection && textDetector) {
          tasks.push(textDetector.detect(bitmap as ImageBitmap).catch(() => []));
        }
        const detected = (await Promise.all(tasks)).flat();

        const boxes = detected.map((d) => {
          const { x, y, width, height } = (
            d as {
              boundingBox: { x: number; y: number; width: number; height: number };
              landmarks?: unknown;
            }
          ).boundingBox;
          return { x, y, width, height, type: (d as { landmarks?: unknown }).landmarks ? 'face' : 'text' };
        });
        // debug && console.timeEnd('detect');
        return { boxes };
      };

      self.onmessage = async (e: {
        data: { body: { command: string; params: MaskedWatchWorkerParams } };
      }): Promise<void> => {
        const { command, params } = e.data.body;
        try {
          switch (command) {
            case 'init':
              init(params);
              self.postMessage({ body: { command: 'init', params: {}, status: 'ok' } });
              break;
            case 'config':
              updateConfig(params as { config: MaskedWatchConfig });
              break;
            case 'detect':
              {
                const { dataURL, boxes } = await detect(params);
                self.postMessage({ body: { command: 'data', params: { dataURL, boxes }, status: 'ok' } });
              }
              break;
          }
        } catch (err) {
          console.error('error', { command, params }, err);
        }
      };
    };

    const 下請 = function (self: unknown, registerPaint: (name: string, painter: unknown) => void): void {
      registerPaint(
        '塗装',
        class {
          static get inputProperties(): string[] {
            return ['--json-args', '--config'];
          }
          paint(
            ctx: MaskedWatchPaintContext,
            { width, height }: { width: number; height: number },
            props: MaskedWatchPaintProps
          ): void {
            const args = JSON.parse(props.get('--json-args').toString() || '{}') as {
              history?: MaskedWatchBoundingBox[][];
              tmpWidth?: number;
              tmpHeight?: number;
            };
            const config = JSON.parse(props.get('--config').toString() || '{}') as MaskedWatchConfig;

            ctx.beginPath();
            ctx.fillStyle = 'rgba(255, 255, 255, 1)';
            ctx.fillRect(0, 0, width, height);
            if (!args.history || !config.enabled) {
              return;
            }

            const ratio = Math.min(width / config.tmpWidth, height / config.tmpHeight);
            const transX = (width - config.tmpWidth * ratio) / 2;
            const transY = (height - config.tmpHeight * ratio) / 2;
            const tmpArea = config.tmpWidth * ratio * (config.tmpHeight * ratio);

            /** @type {(BoundingBox[])[]} */
            const history = args.history;
            for (const boxes of history) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.fillRect(0, 0, width, height);

              for (const box of boxes) {
                const { x: boxX, y: boxY, width: boxWidth, height: boxHeight, type: boxType } = box;
                if ((boxType === 'face' && !config.faceDetection) || (boxType === 'text' && !config.textDetection)) {
                  continue;
                }
                let x = boxX,
                  y = boxY,
                  width = boxWidth,
                  height = boxHeight;
                const type = boxType;
                const area = width * height;
                const opacity = (area / tmpArea) * 0.3;
                ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;

                x = x * ratio + transX;
                y = y * ratio + transY;
                width *= ratio;
                height *= ratio;
                if (type === 'face') {
                  const mx = 16 * ratio,
                    my = 24 * ratio; // margin
                  ctx.clearRect(x - mx, y - my, width + mx * 2, height + my * 2);
                  ctx.fillRect(x - mx, y - my, width + mx * 2, height + my * 2);
                } else {
                  const mx = 16 * ratio,
                    my = 16 * ratio; // margin
                  ctx.clearRect(x - mx, y - my, width + mx * 2, height + my * 2);
                  ctx.fillRect(x - mx, y - my, width + mx * 2, height + my * 2);
                }
              }
            }
          }
        }
      );
    };

    const createDetector = async ({
      video,
      layer,
      interval,
      type,
    }: {
      video: HTMLVideoElement;
      layer: HTMLElement;
      interval: number;
      type: string;
    }): Promise<{ start(): void; stop(): void }> => {
      const worker = createWorker(業務, { name: 'Facelook' });
      await (css as unknown as MaskedWatchCss).addModule(下請, { config: { ...config } });
      const transferCanvas = new OffscreenCanvas(config.tmpWidth, config.tmpHeight);
      const ctx = transferCanvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      }) as OffscreenCanvasRenderingContext2D;
      const debugLayer = document.createElement('div');
      [layer, debugLayer].forEach((layer) => {
        layer.style.setProperty('--config', JSON.stringify({ ...config }));
        layer.style.setProperty('--json-args', '{}');
      });
      if ('maskImage' in layer.style) {
        layer.style.maskImage = 'paint(塗装)';
      } else {
        (layer.style as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage = 'paint(塗装)';
      }

      // for debug
      Object.assign(debugLayer.style, {
        border: '1px solid #888',
        left: 0,
        bottom: '48px',
        position: 'fixed',
        zIndex: '100000',
        width: '160px',
        height: '90px',
        opacity: 0.5,
        background: '#333',
        pointerEvents: 'none',
        userSelect: 'none',
      });
      debugLayer.classList.add('futatsume-family');
      debugLayer.dataset.type = type;
      debugLayer.style.backgroundImage = 'paint(塗装)';
      if (config.debug) {
        document.body.append(debugLayer);
      }
      worker.postMessage({ body: { command: 'init', params: { config: { ...config } } } });

      let isBusy = true,
        currentTime = video.currentTime;
      const boxHistory: MaskedWatchBoundingBox[][] = [];
      worker.addEventListener('message', (e: MessageEvent) => {
        const { command, params } = (
          e.data as {
            body: {
              command: string;
              params: { boxes: MaskedWatchBoundingBox[]; support?: MaskedWatchSupport };
            };
          }
        ).body;
        switch (command) {
          case 'support':
            if (params.support) {
              MaskedWatch.support = params.support;
              dialog.updateSupport();
            }
            break;
          case 'init':
            console.log('initialized');
            isBusy = false;
            break;
          case 'data':
            {
              isBusy = false;
              if (!config.enabled) {
                return;
              }
              /** @type {BoundingBox[]} */
              const boxes = params.boxes;
              boxHistory.push(boxes);
              while (boxHistory.length > 5) {
                boxHistory.shift();
              }
              const arg = JSON.stringify({
                tmpWidth: config.tmpWidth,
                tmpHeight: config.tmpHeight,
                history: boxHistory,
              });
              layer.style.setProperty('--json-args', arg);
              if (config.debug) {
                debugLayer.style.setProperty('--json-args', arg);
              }
            }
            break;
        }
      });

      const onTimer = (): void => {
        if (isBusy || currentTime === video.currentTime || document.visibilityState !== 'visible') {
          return;
        }
        const support = MaskedWatch.support;
        if (support && !support.face && !support.text) return;

        currentTime = video.currentTime;
        const vw = video.videoWidth,
          vh = video.videoHeight;
        const tmpWidth = config.tmpWidth,
          tmpHeight = config.tmpHeight;
        const ratio = Math.min(tmpWidth / vw, tmpHeight / vh);
        const dw = vw * ratio,
          dh = vh * ratio;
        ctx.beginPath();
        ctx.drawImage(video, 0, 0, vw, vh, (tmpWidth - dw) / 2, (tmpHeight - dh) / 2, dw, dh);
        const bitmap = transferCanvas.transferToImageBitmap();
        isBusy = true;
        worker.postMessage({ body: { command: 'detect', params: { bitmap } } }, [bitmap]);
      };
      let timer: ReturnType<typeof setInterval> = setInterval(onTimer, interval);

      const start = (): void => {
        clearInterval(timer);
        timer = setInterval(onTimer, interval);
      };
      const stop = (): void => {
        clearInterval(timer);
      };

      window.addEventListener(
        `${PRODUCT}-config.update`,
        (e: Event) => {
          worker.postMessage({ body: { command: 'config', params: { config: { ...config } } } });
          const { key, value } = (e as CustomEvent).detail as { key: string; value: unknown };
          layer.style.setProperty('--config', JSON.stringify({ ...config }));
          debugLayer.style.setProperty('--config', JSON.stringify({ ...config }));
          switch (key) {
            case 'enabled':
              if (value) {
                start();
              } else {
                stop();
              }
              break;
            case 'debug':
              if (value) {
                document.body.append(debugLayer);
              } else {
                debugLayer.remove();
              }
              break;
            case 'tmpWidth':
              transferCanvas.width = value as number;
              break;
            case 'tmpHeight':
              transferCanvas.height = value as number;
              break;
          }
        },
        { passive: true }
      );
      return { start, stop };
    };

    const dialog = ((config: MaskedWatchConfig) => {
      class MaskedWatchDialog extends HTMLElement {
        private modal!: SettingsDialog;
        private shadow!: ShadowRoot;
        private root!: HTMLDialogElement;
        init(): void {
          if (this.shadow) {
            return;
          }
          this.shadow = this.attachShadow({ mode: 'open' });
          this.shadow.innerHTML = this.getTemplate();
          this.root = this.shadow.querySelector('#root') as HTMLDialogElement;
          this.modal = new SettingsDialog(this.root, 'masked', () => {});
          this.shadow.querySelector('.close-button')!.addEventListener('click', (e: Event) => {
            this.close();
            e.stopPropagation();
            e.preventDefault();
          });
          this.root.addEventListener('click', (e: Event) => {
            e.stopPropagation();
          });
          this.classList.add('futatsume-family');
          this.root.classList.add('futatsume-family');
          this.update();

          this.root.addEventListener('change', (e: Event) => {
            const input = e.target as HTMLInputElement;
            const name = input.name;
            const value = JSON.parse(input.value) as unknown;
            if (config.debug) {
              console.log('update config', { name, value });
            }
            (config as unknown as Record<string, unknown>)[name] = value;
          });
        }
        getTemplate(): string {
          return `
          <dialog id="root" class="root">
            <div>
            <style>
              .root {
                position: fixed;
                z-index: 10000;
                left: 0;
                top: 50%;
                transform: translate(0, -50%);
                background: rgba(240, 240, 240, 0.95);
                color: #222;
                padding: 16px 24px 8px;
                border: 0;
                user-select: none;
                box-shadow: 0px 0px 4px rgba(0, 0, 0, 0.8);
                text-shadow: 1px 1px 0 #fff;
                border-radius: 4px;
              }
              .title {
                margin: 0;
                padding: 0 0 16px;
                font-size: 20px;
                text-align: center;
              }
              .config {
                padding: 0 0 16px;
                line-height: 20px;
              }
              .name {
                display: inline-block;
                min-width: 240px;
                white-space: nowrap;
                margin: 0;
              }
              label {
                display: inline-block;
                padding: 8px;
                line-height: 20px;
                min-width: 100px;
                border: 1px groove silver;
                border-radius: 4px;
                cursor: pointer;
              }
              label + label {
                margin-left: 8px;
              }
              label:hover {
                background: rgba(255, 255, 255, 1);
              }
              input[type=radio] {
                transform: scale(1.5);
                margin-right: 12px;
              }
              .close-button {
                display: block;
                margin: 8px auto 0;
                min-width: 180px;
                padding: 8px;
                font-size: 16px;
                border-radius: 4px;
                text-align: center;
                cursor: pointer;
                outline: none;
              }
            </style>
            <h1 class="title">††† Masked Watch 設定 †††</h1>
            <p data-masked-support role="status"></p>
            <div class="config">
              <h3 class="name">顔の検出</h3>
              <label><input type="radio" name="faceDetection" value="true">ON</label>
              <label><input type="radio" name="faceDetection" value="false">OFF</label>
            </div>

            <div class="config">
              <h3 class="name">テキストの検出<br>
                <span class="name" style="font-size: 80%;">windowsで動かないっぽい？</span>
              </h3>
              <label><input type="radio" name="textDetection" value="true">ON</label>
              <label><input type="radio" name="textDetection" value="false">OFF</label>
            </div>

            <div class="config">
              <h3 class="name">動作モード</h3>
              <label><input type="radio" name="fastMode" value="true">速度重視</label>
              <label><input type="radio" name="fastMode" value="false">精度重視</label>
            </div>

            <div class="config">
              <h3 class="name">デバッグ</h3>
              <label><input type="radio" name="debug" value="true">ON</label>
              <label><input type="radio" name="debug" value="false">OFF</label>
            </div>

            <div class="config">
              <h3 class="name">MaskedWatch有効/無効</h3>
              <label><input type="radio" name="enabled" value="true">有効</label>
              <label><input type="radio" name="enabled" value="false">無効</label>
            </div>
            <div class="config">
              <button class="close-button">閉じる</button>
            </div>
            </div>
          </dialog>
          `;
        }

        update(): void {
          this.init();
          [...this.shadow.querySelectorAll('input')].forEach((input) => {
            const name = input.name,
              value = JSON.parse(input.value) as unknown;
            input.checked = (config as unknown as Record<string, unknown>)[name] === value;
          });
          this.updateSupport();
        }

        updateSupport(): void {
          if (!this.shadow) return;
          const output = this.shadow.querySelector<HTMLElement>('[data-masked-support]');
          if (!output) return;
          const support = MaskedWatch.support;
          const messages = {
            ja: {
              pending: '動画の再生後に検出APIの対応状況を確認します。',
              unavailable:
                'このブラウザーには顔・文字の検出APIがありません。設定は保持されますが、マスクは適用されません。',
              available: '顔・文字の検出APIを確認しました。',
              faceOnly: '文字の検出APIがありません。顔検出の設定は利用できます。',
              textOnly: '顔の検出APIがありません。文字検出の設定は利用できます。',
            },
            en: {
              pending: 'Detector support is checked after video playback starts.',
              unavailable:
                'This browser has no face or text detection API. Your settings are kept, but no mask is applied.',
              available: 'Face and text detection APIs were found.',
              faceOnly: 'The text detection API is unavailable. Face detection settings remain available.',
              textOnly: 'The face detection API is unavailable. Text detection settings remain available.',
            },
          }[navigator.language.startsWith('ja') ? 'ja' : 'en'];
          const state =
            support === null
              ? 'pending'
              : !support.face && !support.text
                ? 'unavailable'
                : support.face && support.text
                  ? 'available'
                  : 'partial';
          output.dataset.state = state;
          output.dataset.reason = state === 'unavailable' ? 'detectors-unavailable' : state;
          output.textContent =
            support === null
              ? messages.pending
              : state === 'unavailable'
                ? messages.unavailable
                : state === 'available'
                  ? messages.available
                  : support.face
                    ? messages.faceOnly
                    : messages.textOnly;
        }

        get isOpen(): boolean {
          return !!this.root && !!this.root.open;
        }

        open(): void {
          this.update();
          this.modal.open();
        }

        close(): void {
          if (this.root) {
            this.modal.close();
          }
        }

        toggle(): void {
          this.init();
          if (this.isOpen) {
            this.close();
          } else {
            this.open();
          }
        }
      }
      window.customElements.define(`${PRODUCT.toLowerCase()}-dialog`, MaskedWatchDialog);
      return document.createElement(`${PRODUCT.toLowerCase()}-dialog`) as MaskedWatchDialog;
    })(config);
    MaskedWatch.dialog = dialog;

    const createToggleButton = (config: MaskedWatchConfig, dialog: { toggle(): void }): HTMLElement => {
      class ToggleButton extends HTMLElement {
        private shadow!: ShadowRoot;
        private root!: HTMLElement;
        constructor() {
          super();
          this.init();
        }
        init(): void {
          if (this.shadow) {
            return;
          }
          this.shadow = this.attachShadow({ mode: 'open' });
          this.shadow.innerHTML = this.getTemplate();
          this.root = this.shadow.querySelector('#root') as HTMLElement;
          this.root.addEventListener('click', (e: Event) => {
            dialog.toggle();
            e.stopPropagation();
            e.preventDefault();
          });
        }
        getTemplate(): string {
          return `
          <style>
          .controlButton {
            position: relative;
            display: inline-block;
            transition: opacity 0.4s ease, margin-left 0.2s ease, margin-top 0.2s ease;
            box-sizing: border-box;
            text-align: center;
            cursor: pointer;
            color: #fff;
            opacity: 0.8;
            vertical-align: middle;
          }
          .controlButton:hover {
            cursor: pointer;
            opacity: 1;
          }
          .controlButton .controlButtonInner {
            filter: grayscale(100%);
          }
          .switch {
            font-size: 16px;
            width: 32px;
            height: 32px;
            line-height: 30px;
            cursor: pointer;
          }
          .is-Enabled .controlButtonInner {
            color: #aef;
            filter: none;
          }

          .controlButton .tooltip {
            display: none;
            pointer-events: none;
            position: absolute;
            left: 16px;
            top: -30px;
            transform:  translate(-50%, 0);
            font-size: 12px;
            line-height: 16px;
            padding: 2px 4px;
            border: 1px solid #000;
            background: #ffc;
            color: #000;
            text-shadow: none;
            white-space: nowrap;
            z-index: 100;
            opacity: 0.8;
          }

          .controlButton:hover {
            background: #222;
          }

          .controlButton:hover .tooltip {
            display: block;
            opacity: 1;
          }

        </style>
        <div id="root" class="switch controlButton root">
          <div class="controlButtonInner" title="MaskedWatch">&#9787;</div>
          <div class="tooltip">Masked Watch</div>
        </div>
            `;
        }
      }
      window.customElements.define(`${PRODUCT.toLowerCase()}-toggle-button`, ToggleButton);
      return document.createElement(`${PRODUCT.toLowerCase()}-toggle-button`);
    };

    const FutatsumeDetector = ((): { detect(): Promise<unknown> } => {
      const futatsumeWindow = window as unknown as { FutatsumeWatch?: { ready?: unknown } };
      const promise =
        futatsumeWindow.FutatsumeWatch && futatsumeWindow.FutatsumeWatch.ready
          ? Promise.resolve(futatsumeWindow.FutatsumeWatch)
          : new Promise((resolve) => {
              [window, document.body || document.documentElement].forEach((e) =>
                e.addEventListener(
                  'FutatsumeWatchInitialize',
                  () => {
                    resolve(futatsumeWindow.FutatsumeWatch);
                  },
                  { once: true }
                )
              );
            });
      return { detect: () => promise };
    })();

    const vmap = new WeakMap<object, unknown>();
    let timer: ReturnType<typeof setInterval>;
    const watch = (): void => {
      if (!config.enabled || document.visibilityState !== 'visible') {
        return;
      }
      [...document.querySelectorAll('video, futatsume-video')]
        .filter((video) => !(video as HTMLVideoElement).paused && !vmap.has(video))
        .forEach((video) => {
          // 対応プレイヤー増やすならココ
          let layer: Element | null = null,
            type = 'UNKNOWN';
          if (video.closest('#MainVideoPlayer')) {
            layer = document.querySelector('.CommentRenderer');
            type = 'NICO VIDEO';
          } else if (video.closest('#rootElementId')) {
            layer = document.querySelector('#comment canvas');
            type = 'NICO EMBED';
          } else if (video.closest('#watchVideoContainer')) {
            layer = document.querySelector('#jsPlayerCanvasComment canvas');
            type = 'NICO SP';
          } else if (video.closest('.futatsumePlayerContainer')) {
            layer = document.querySelector('.commentLayerFrame');
            type = 'FutatsumeWatch';
          } else if (video.closest('[class*="__leo"]')) {
            layer = document.querySelector('#comment-layer-container canvas');
            type = 'NICO LIVE';
          } else if (video.closest('#bilibiliPlayer')) {
            layer = (document.querySelector('.bilibili-player-video-danmaku') as Element).parentElement;
            type = 'BILI BILI [´ω`]';
          } else if (video.id === 'js-video') {
            layer = document.querySelector('#cmCanvas');
            type = 'HIMAWARI';
          }

          console.log('%ctype: "%s"', 'font-weight: bold', layer ? type : 'UNKNOWN???');
          if (layer) {
            Object.assign((layer as HTMLElement).style, {
              backgroundSize: 'contain',
              maskSize: 'contain',
              webkitMaskSize: 'contain',
              maskRepeat: 'no-repeat',
              webkitMaskRepeat: 'no-repeat',
              maskPosition: 'center center',
              webkitMaskPosition: 'center center',
            });
          }
          if (layer) {
            video.dispatchEvent(
              new CustomEvent(`${PRODUCT}-start`, { detail: { type, video, layer }, bubbles: true, composed: true })
            );
          }

          vmap.set(
            video,
            layer
              ? createDetector({
                  video: ((video as unknown as { drawableElement?: HTMLVideoElement }).drawableElement ||
                    video) as HTMLVideoElement,
                  layer: layer as HTMLElement,
                  interval: config.interval,
                  type,
                })
              : type
          );
          if (layer && !location.href.startsWith('https://www.nicovideo.jp/watch/')) {
            clearInterval(timer);
          }
        });
    };

    const init = (): void => {
      (css as unknown as MaskedWatchCss).registerProps(
        { name: '--json-args', syntax: '*', initialValue: '{}', inherits: false },
        { name: '--config', syntax: '*', initialValue: '{}', inherits: false }
      );
      timer = setInterval(watch, 1000);

      document.body.append(dialog);

      window.setTimeout(
        () => {
          const li = document.createElement('li');
          li.innerHTML = `<a href="javascript:;">${PRODUCT}設定</a>`;
          li.style.whiteSpace = 'nowrap';
          li.addEventListener('click', () => dialog.toggle());
          if (document.querySelector('#siteHeaderRightMenuContainer')) {
            document.querySelector('#siteHeaderRightMenuContainer')!.append(li);
          }
        },
        document.querySelector('#siteHeaderRightMenuContainer') ? 1000 : 15000
      );

      void FutatsumeDetector.detect().then((futatsume) => {
        console.log('FutatsumeWatch found ver.%s', (futatsume as { version?: unknown })?.version);
        FutatsumeWatch = futatsume as MaskedWatchFutatsume;
        void FutatsumeWatch.emitter.promise('videoControBar.addonMenuReady').then((result) => {
          const { container } = result as { container: Element };
          container.append(createToggleButton(config, dialog));
        });
        void FutatsumeWatch.emitter.promise('videoContextMenu.addonMenuReady.list').then((result) => {
          const { container } = result as { container: Element };
          const faceMenu = document.createElement('li');
          faceMenu.className = 'command';
          faceMenu.dataset.command = 'nop';
          faceMenu.textContent = '顔の検出';
          faceMenu.classList.toggle('selected', config.faceDetection);
          faceMenu.addEventListener('click', () => {
            config.faceDetection = !config.faceDetection;
          });
          const textMenu = document.createElement('li');
          textMenu.className = 'command';
          textMenu.dataset.command = 'nop';
          textMenu.textContent = 'テキストの検出';
          textMenu.classList.toggle('selected', config.textDetection);
          textMenu.addEventListener('click', () => {
            config.textDetection = !config.textDetection;
          });
          FutatsumeWatch!.emitter.on('showMenu', () => {
            faceMenu.classList.toggle('selected', config.faceDetection);
            textMenu.classList.toggle('selected', config.textDetection);
          });

          container.append(faceMenu, textMenu);
        });
      });
    };
    init();

    console.log('%cMasked Watch', 'font-size: 200%;', `ver ${VER}`, '\nconfig: ', JSON.stringify({ ...config }));
  };

  const loadGm = (): void => {
    monkey(PRODUCT);
  };

  loadGm();
})();
