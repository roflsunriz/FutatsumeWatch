import { PromiseHandler } from '../../../lib/src/Emitter';

interface FramePromiseLike {
  resolve(value: Window | null): void;
  then(onFulfilled: (w: Window) => void): void;
}

type PromiseHandlerConstructor = new () => FramePromiseLike;

interface FrameContentWindow extends Window {
  isVisible: boolean;
}

interface FrameLayerParams {
  container: Element;
  className?: string;
  html: string;
}

//===BEGIN===
class FrameLayer {
  declare promise: FramePromiseLike;
  declare container: Element;
  declare intersectionObserver: IntersectionObserver;
  declare iframe: HTMLIFrameElement;
  declare contentWindow: FrameContentWindow | null;
  declare bridgeFunc: ((e: Event) => void) | undefined;
  declare _html: string;
  declare _isVisible: boolean | null;
  constructor(params: FrameLayerParams) {
    this.promise = new (PromiseHandler as unknown as PromiseHandlerConstructor)();
    this.container = params.container;
    this._initialize(params);
    this._isVisible = null;

    this.intersectionObserver = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first === undefined) {
        return;
      }
      const win = this.contentWindow;
      if (win === null) {
        return;
      }
      const isVisible = first.isIntersecting;
      if (this._isVisible !== isVisible) {
        this._isVisible = win.isVisible = isVisible;
        this.iframe.dispatchEvent(new CustomEvent('visibilitychange', { detail: { isVisible, name: win.name } }));
      }
    });
  }
  get isVisible() {
    return this._isVisible;
  }
  get frame() {
    return this.iframe;
  }
  /**
   * @returns Promise<window>
   */
  wait(): FramePromiseLike {
    return this.promise;
  }
  _initialize(params: FrameLayerParams): void {
    const iframe = this._getIframe();
    iframe.className = params.className || '';
    iframe.loading = 'eager';

    const onload = (): void => {
      iframe.onload = null;
      this.iframe = iframe;
      const contentWindow = (this.contentWindow = iframe.contentWindow as unknown as FrameContentWindow | null);
      this.intersectionObserver.observe(iframe);
      this.bridgeFunc = (e: Event) => {
        this.iframe.dispatchEvent(
          new (e.constructor as unknown as new (target: EventTarget, event: Event) => Event)(this.iframe, e)
        );
      };
      this.promise.resolve(contentWindow);
    };

    const html = (this._html = params.html);
    this.container.append(iframe);
    if ('srcdoc' in iframe.constructor.prototype) {
      iframe.onload = onload;
      iframe.srcdoc = html;
    } else {
      // MS IE/Edge用
      const d = (iframe.contentWindow as unknown as FrameContentWindow).document;
      d.open();
      d.write(html);
      d.close();
      window.setTimeout(onload, 0);
    }
  }
  _getIframe(): HTMLIFrameElement {
    const iframe = Object.assign(document.createElement('iframe'), {
      loading: 'eager',
      srcdoc: '<html></html>',
      sandbox: 'allow-same-origin allow-scripts',
    });
    return iframe;
  }
  addEventBridge(name: string, options?: AddEventListenerOptions): this {
    this.wait().then((w) => w.addEventListener(name, this.bridgeFunc as EventListener, options));
    return this;
  }
  removeEventBridge(name: string): this {
    this.wait().then((w) => w.removeEventListener(name, this.bridgeFunc as EventListener));
    return this;
  }
}
//===END===
export { FrameLayer };
