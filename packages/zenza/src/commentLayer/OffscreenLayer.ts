import { Emitter } from '../../../lib/src/Emitter';
import { util } from '../../../../src/util';
import { NicoTextParser } from './NicoTextParser';
// import {NicoChatViewModel} from './NicoChatViewModel';
import { global } from '../../../../src/ZenzaWatchIndex';
import { cssUtil } from '../../../lib/src/css/css';

interface ZenzaConfigProps {
  baseFontFamily?: string;
  baseFontBolder?: unknown;
  cssFontWeight?: string;
  baseChatScale?: unknown;
}

interface ZenzaConfigLike {
  props: ZenzaConfigProps;
  onkey(name: string, handler: (value: unknown) => void): void;
}

interface NicoTextParserLike {
  __css__?: unknown;
}

interface GlobalEmitterLike {
  emitter: { emit(name: string, ...args: unknown[]): void };
}

interface OffscreenTextField {
  setText(text: string): void;
  setType(type: string, size: string, fontCommand: string | null, ver: string): void;
  setFontSizePixel(pixel: number): void;
  getOriginalWidth(): number;
  getWidth(): number;
  getOriginalHeight(): number;
  getHeight(): number;
}

interface OffscreenLayerHandle {
  getTextField(): OffscreenTextField | undefined;
  appendChild(elm: Element): void;
  removeChild(elm: Element): void;
  readonly optionCss: string;
}
//===BEGIN===
// フォントサイズ計算用の非表示レイヤーを取得
// 変なCSSの影響を受けないように、DOM的に隔離されたiframe内で計算する。
const OffscreenLayer = (
  config: ZenzaConfigLike
): {
  get: (config?: ZenzaConfigLike | null) => unknown;
  readonly optionCss: string;
} => {
  const __offscreen_tpl__ = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
    <meta charset="utf-8">
    <title>CommentLayer</title>
    <style type="text/css" id="layoutCss">%LAYOUT_CSS%</style>
    <style type="text/css" id="optionCss">%OPTION_CSS%</style>
    <style type="text/css">
      .nicoChat { visibility: hidden; }
    </style>
    <body>
    <div id="offScreenLayer"
      style="
        width: 4096px;
        height: 384px;
        overflow: visible;
        background: #fff;

        white-space: pre;
        pointer-events: none;
        user-select: none;
        contain: strict;
    "></div>
    </body></html>
      `.trim();

  const emt = new Emitter();
  let offScreenFrame: HTMLIFrameElement | undefined;
  let offScreenLayer: OffscreenLayerHandle | undefined;
  let textField: OffscreenTextField | undefined;
  let optionStyle: Element;

  const initializeOptionCss = (style: Element): void => {
    const update = (): void => {
      const tmp: string[] = [];
      let baseFont = config.props.baseFontFamily;
      const inner = style.innerHTML;
      if (baseFont) {
        baseFont = baseFont.replace(/[;{}*/]/g, '');
        tmp.push(
          ['.gothic    {font-family: %BASEFONT%; }\n', 'han_group {font-family: %BASEFONT%, Arial; }']
            .join('')
            .replace(/%BASEFONT%/g, baseFont)
        );
      }
      tmp.push(
        `.nicoChat { font-weight: ${config.props.baseFontBolder ? (config.props.cssFontWeight as string) : 'normal'} !important; }`
      );
      const newCss = tmp.join('\n');
      if (inner !== newCss) {
        style.innerHTML = newCss;
        (global as unknown as GlobalEmitterLike).emitter.emit('updateOptionCss', newCss);
      }
    };
    update();
    config.onkey('baseFontFamily', update);
    config.onkey('baseFontBolder', update);
  };

  const initialize = (): void => {
    if (offScreenFrame) {
      return;
    }
    window.console.time('createOffscreenLayer');
    const frame = document.createElement('iframe');
    offScreenFrame = frame;
    frame.loading = 'eager';
    frame.className = 'offScreenLayer';
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.style.position = 'fixed';
    frame.style.top = '200vw';
    frame.style.left = '200vh';
    (document.body || document.documentElement).append(frame);

    let layer: Element | null;
    const onload = (): void => {
      frame.onload = null;

      console.log('%conOffScreenLayerLoad', 'background: lightgreen;');
      createTextField();

      const doc = (offScreenFrame as HTMLIFrameElement).contentWindow as Window;
      layer = doc.document.getElementById('offScreenLayer');
      optionStyle = doc.document.getElementById('optionCss') as Element;
      initializeOptionCss(optionStyle);
      offScreenLayer = {
        getTextField: () => textField,
        appendChild: (elm: Element) => {
          (layer as Element).append(elm);
        },
        removeChild: (elm: Element) => {
          (layer as Element).removeChild(elm);
        },
        get optionCss() {
          return optionStyle.innerHTML;
        },
      };

      window.console.timeEnd('createOffscreenLayer');
      void emt.emitResolve('GetReady!', offScreenLayer);
    };

    const html = __offscreen_tpl__
      .replace('%LAYOUT_CSS%', String((NicoTextParser as unknown as NicoTextParserLike).__css__))
      .replace('%OPTION_CSS%', '');
    if (typeof frame.srcdoc === 'string') {
      frame.onload = onload;
      frame.srcdoc = html;
    } else {
      // MS IE/Edge用
      const fcd = (frame.contentWindow as Window).document;
      fcd.open();
      fcd.write(html);
      fcd.close();
      window.setTimeout(onload, 0);
    }
  };

  const getLayer = (_config?: ZenzaConfigLike | null): unknown => {
    config = _config || config;
    initialize();
    return emt.promise('GetReady!');
  };

  const createTextField = (): HTMLSpanElement => {
    const layer = ((offScreenFrame as HTMLIFrameElement).contentWindow as Window).document.getElementById(
      'offScreenLayer'
    ) as Element;

    const span = document.createElement('span');
    span.className = 'nicoChat';
    let scale = config.props.baseChatScale as number; //NicoChatViewModel.BASE_SCALE;
    config.onkey('baseChatScale', (v: unknown) => (scale = v as number));

    textField = {
      setText: (text: string) => {
        span.innerHTML = text;
      },
      setType: (type: string, size: string, fontCommand: string | null, ver: string) => {
        const fontClass = fontCommand ? `cmd-${fontCommand}` : '';
        span.className = `nicoChat ${type} ${size} ${fontClass} ${ver}`;
      },
      setFontSizePixel: (span as unknown as { attributeStyleMap?: { set(name: string, value: unknown): void } })
        .attributeStyleMap
        ? (pixel: number) =>
            (
              span as unknown as { attributeStyleMap: { set(name: string, value: unknown): void } }
            ).attributeStyleMap.set('font-size', CSS.px(pixel))
        : (pixel: number) => (span.style.fontSize = `${pixel}px`),
      getOriginalWidth: () => span.offsetWidth,
      getWidth: () => span.offsetWidth * scale,
      getOriginalHeight: () => span.offsetHeight,
      getHeight: () => span.offsetHeight * scale,
    };

    layer.append(span);

    return span;
  };

  return {
    get: getLayer,
    get optionCss() {
      return optionStyle.innerHTML;
    },
  };
};
//===END===

export { OffscreenLayer };
