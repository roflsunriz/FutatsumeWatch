import { workerUtil } from '../infra/workerUtil';
//===BEGIN===

interface TextLabelStyle {
  widthPx?: number;
  heightPx?: number;
  ratio?: number;
  fontWeight?: string;
  fontSizePx?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  textAlign?: CanvasTextAlign;
  font?: string;
  width?: number;
  height?: number;
}

interface StoredLabelStyle extends TextLabelStyle {
  ratio: number;
}

interface TextLabelItem {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  style: StoredLabelStyle;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  text: string;
}

type TextLabelWorkerMessage =
  | { command: 'create'; params: { canvas: HTMLCanvasElement | OffscreenCanvas; style: TextLabelStyle; name?: string } }
  | { command: 'style'; params: { id?: string; style: TextLabelStyle; name?: string } }
  | { command: 'drawText'; params: { id?: string; text?: string } }
  | { command: 'dispose'; params: { id?: string } };

interface ChromeTextMetrics extends TextMetrics {
  readonly height?: number;
}

interface TextLabelFuncScope {
  onmessage: (message: TextLabelWorkerMessage) => unknown;
}

interface TextLabelPostOptions {
  transfer?: unknown;
  timeout?: number;
  name?: string;
}

interface TextLabelFallbackWorker {
  name: string;
  onmessage: (message: TextLabelWorkerMessage) => unknown;
  post: (message: TextLabelWorkerMessage, options?: TextLabelPostOptions) => unknown;
}

type CrossMessageWorker = ReturnType<typeof workerUtil.createCrossMessageWorker>;

interface TextLabelCreateParams {
  container?: HTMLElement;
  canvas?: HTMLCanvasElement;
  ratio?: number;
  name?: string;
  style?: TextLabelStyle;
  text?: string;
}

interface TextLabelCreateResult {
  id: string;
  text: string;
}

const TextLabel = (() => {
  const func = function (self: TextLabelFuncScope): void {
    const items: Record<string, TextLabelItem> = {};

    const getId = function (this: { id: number }): string {
      return `id-${this.id++}${Math.random()}`;
    }.bind({ id: 0 });

    const create = ({
      canvas,
      style,
    }: {
      canvas: HTMLCanvasElement | OffscreenCanvas;
      style: TextLabelStyle;
    }): { id: string; text: string } => {
      const id = getId();
      const ctx = canvas.getContext('2d', {
        desynchronized: true,
        // preserveDrawingBuffer: true
      })!;
      items[id] = {
        canvas,
        style: style as StoredLabelStyle,
        ctx,
        text: '',
      };
      return setStyle({ id, style });
    };

    const setStyle = ({
      id,
      style,
    }: {
      id?: string;
      style: TextLabelStyle;
      name?: string;
    }): { id: string; text: string } => {
      if (id === undefined) {
        throw new Error(`unknown id: ${id}`);
      }
      const item = items[id];
      if (!item) {
        throw new Error(`unknown id: ${id}`);
      }
      const { canvas, ctx } = item;
      item.text = '';
      if (style.widthPx) {
        canvas.width = style.widthPx * style.ratio!;
      }
      if (style.heightPx) {
        canvas.height = style.heightPx * style.ratio!;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return { id, text: '' };
    };

    const drawText = ({ id, text }: { id?: string; text?: string }): { id: string; text: string } | undefined => {
      if (id === undefined) {
        throw new Error(`unknown id: ${id}`);
      }
      const item = items[id];
      if (!item) {
        throw new Error(`unknown id: ${id}`);
      }
      const { canvas, ctx, style } = item;
      if (item.text === text) {
        return undefined;
      }
      ctx.beginPath();
      ctx.font =
        `${style.fontWeight ?? ''} ${style.fontSizePx ? `${style.fontSizePx * style.ratio}px` : ''} ${style.fontFamily ?? ''}`.trim();
      const measured: ChromeTextMetrics = ctx.measureText(text ?? '');
      const width: number = measured.width;
      const height: number = Number(measured.height || style.fontSizePx) * style.ratio;
      const left = (canvas.width - width) / 2;
      const top = canvas.height - (canvas.height - height) / 2;
      if (style.color !== undefined) {
        ctx.fillStyle = style.color;
      }
      if (style.textAlign !== undefined) {
        ctx.textAlign = style.textAlign;
      }
      ctx.textBaseline = 'bottom';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillText(text ?? '', left, top);
      // ctx.commit && ctx.commit();
      return { id, text: text ?? '' };
    };

    const dispose = ({ id }: { id?: string }): void => {
      if (id !== undefined) {
        delete items[id];
      }
    };

    self.onmessage = ({ command, params }: TextLabelWorkerMessage) => {
      switch (command) {
        case 'create':
          return create(params);
        case 'style':
          return setStyle(params);
        case 'drawText':
          return drawText(params);
        case 'dispose':
          return dispose(params);
      }
    };
  };

  const isOffscreenCanvasAvailable = !!HTMLCanvasElement.prototype.transferControlToOffscreen;
  const getContainerStyle = ({
    container,
    canvas,
    ratio,
  }: {
    container?: HTMLElement;
    canvas: HTMLCanvasElement;
    ratio?: number;
  }): StoredLabelStyle & { font: string; width: number; height: number; fontSizePx: number } => {
    let style = window.getComputedStyle(container ?? document.body);
    ratio = ratio ?? window.devicePixelRatio;
    const width = (container?.offsetWidth ?? canvas.width) * ratio;
    const height = (container?.offsetHeight ?? canvas.height) * ratio;
    if (!width || !height) {
      style = window.getComputedStyle(document.body);
    }
    return {
      width,
      height,
      font: style.font,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontSizePx: Number(style.fontSize.replace(/[a-z]/g, '')),
      color: style.color,
      backgroundColor: style.backgroundColor,
      textAlign: style.textAlign as CanvasTextAlign,
      ratio,
    };
  };

  const NAME = 'TextLabelWorker';

  let worker: TextLabelFallbackWorker | CrossMessageWorker | undefined;
  const initWorker = (): TextLabelFallbackWorker | CrossMessageWorker => {
    if (worker) {
      return worker;
    }
    if (!isOffscreenCanvasAvailable) {
      if (!worker) {
        const fallback: TextLabelFallbackWorker = {
          name: NAME,
          onmessage: () => undefined,
          post: (message) => fallback.onmessage(message),
        };
        func(fallback);
        worker = fallback;
      }
    } else {
      worker = worker ?? workerUtil.createCrossMessageWorker(func, { name: NAME });
    }
    return worker;
  };
  const create = ({ container, canvas, ratio, name, style, text }: TextLabelCreateParams) => {
    style = style ?? {};
    // 大した負荷じゃないしRetina前提にしてしまう
    ratio = Math.max(ratio ?? window.devicePixelRatio ?? 2, 2);
    style.ratio = style.ratio ?? ratio;
    name = name ?? 'label';
    if (!canvas) {
      canvas = document.createElement('canvas');
      Object.assign(canvas.style, {
        width: `${style.widthPx}px`,
        height: `${style.heightPx}px`,
        backgroundColor: style.backgroundColor || '',
      });
      if (container) {
        container.append(canvas);
      }
      if (style.widthPx) {
        canvas.width = Math.max(style.widthPx * ratio);
      }
      if (style.heightPx) {
        canvas.height = Math.max(style.heightPx * ratio);
      }
    }
    canvas.dataset.name = name;

    const containerStyle = getContainerStyle({ container, canvas, ratio });
    style.fontFamily = style.fontFamily ?? containerStyle.fontFamily;
    style.fontWeight = style.fontWeight ?? containerStyle.fontWeight;
    style.color = style.color ?? containerStyle.color;

    const promiseSetup = (async () => {
      const layer = isOffscreenCanvasAvailable ? canvas.transferControlToOffscreen() : canvas;
      const w = initWorker();
      const result = (await w.post(
        { command: 'create', params: { canvas: layer, style, name } },
        {
          transfer: typeof OffscreenCanvas !== 'undefined' && layer instanceof OffscreenCanvas ? [layer] : [],
        }
      )) as TextLabelCreateResult;
      return result.id;
    })();
    const init = { text };
    const post = async (message: TextLabelWorkerMessage, transfer: TextLabelPostOptions = {}): Promise<unknown> => {
      const id: string = await promiseSetup;
      // プロトコル上の id 付与のみ行う（相関は呼び出し側のリテラルで保証される）。
      const withId = { ...message, params: { ...message.params, id } } as TextLabelWorkerMessage;
      return worker!.post(withId, transfer);
    };

    const result = {
      container,
      canvas,
      style() {
        init.text = '';
        const style = getContainerStyle({ container, canvas });
        return post({ command: 'style', params: { style, name } });
      },
      async drawText(text: string) {
        if (init.text === text) {
          return;
        }
        const result = (await post({ command: 'drawText', params: { text } })) as { text: string };
        init.text = result.text;
      },
      get text(): string | undefined {
        return init.text;
      },
      set text(t: string | undefined) {
        if (t !== undefined) {
          void this.drawText(t);
        }
      },
      dispose: () => worker!.post({ command: 'dispose', params: {} }),
    };
    if (text) {
      result.text = text;
    }
    return result;
  };
  return { create };
})();

//===END===
// (() => {
//   const ddd = document.createElement('div');
//   const ccc = document.createElement('canvas');
//   ddd.id = 'AAAAAAAAAAAAAAAA';
//   Object.assign(ddd.style, {
//     display: 'inline-block', position: 'fixed', left: 0, top: 0, zIndex: 10000, background: '#666',
//     width: '44px', height: '24px', fontSize: '12px', color: '#fff'
//   });
//   Object.assign(ccc.style, {
//     width: '100%', height: '100%'
//   });
//   ddd.append(ccc);
//   document.body.append(ddd);
//   TextLabel.create({
//     container: ddd,
//     canvas: ccc,
//     name: 'currentTimeLabelTest',
//     style: {
//       widthPx: 44,
//       heightPx: 24,
//       fontFamily: '\'Yu Gothic\', \'YuGothic\', \'Courier New\', Osaka-mono, \'ＭＳ ゴシック\', monospace',
//       fontWeight: '',
//       fontSizePx: 12,
//       color: '#fff'
//     }
//   }).then(label => {
//     label.text = '00:00';
//   });

// })();

// u = uu`<div style="display:inline-block; background: #888; color: red; width: 200px; height: 80px;font-size: 24px;"><canvas></canvas></div>`; c = u.find('canvas'); document.body.append(u[0]);lbl = await ZenzaWatch.modules.TextLabel.create({container: u[0], canvas: c[0]}); lbl.text = 'hogehoge'
export { TextLabel };
