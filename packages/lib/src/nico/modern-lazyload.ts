// ==UserScript==
// @name         modern lazyload
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://www.nicovideo.jp/*
// @grant        none
// @run-at       document-body
// @noframes
// ==/UserScript==

export {};

interface LazyImageShape {
  pageObserver?: number;
  isInitialized?: boolean;
  intersectionObserver?: IntersectionObserver;
  mutationObserver?: MutationObserver;
  className: string;
  attrName: string;
  adjustAttrName: string;
  errorEventName: string;
  margin: number;
  waitings: { length: number; push: (v: unknown) => unknown; splice: () => Array<unknown> };
  initialize: (this: LazyImageShape) => void;
  reset: (this: LazyImageShape) => void;
  enqueue: (this: LazyImageShape) => void;
  _loadImage: (this: LazyImageShape, item: Element) => void;
  _adjustSizeAndLoad: (this: LazyImageShape, item: HTMLElement, src: string) => void;
  _setPageObserver: (this: LazyImageShape) => void;
  _getBottomLoadingThreshold: (this: LazyImageShape) => number;
  _sortWaitings: (this: LazyImageShape) => void;
}

interface NicoWindow {
  Nico?: {
    LazyImage?: LazyImageShape;
  };
}

//===BEGIN===
(() => {
  // 古いページで使われているがパフォーマンス的にちょっとアレなのでリプレースする
  const nicoWindow = window as unknown as NicoWindow;
  if (window !== top || location.host !== 'www.nicovideo.jp') {
    return;
  }
  const override = (): void => {
    const LazyImage = nicoWindow.Nico && nicoWindow.Nico.LazyImage;
    if (!LazyImage) {
      return;
    }
    const isInitialized = !!LazyImage.pageObserver;
    if (isInitialized) {
      clearInterval(LazyImage.pageObserver);
    }
    Object.assign(LazyImage, {
      isInitialized: false,
      waitings: {
        get length(): number {
          return 0;
        },
        push(v: unknown): unknown {
          return v;
        },
        splice(): Array<unknown> {
          return [];
        },
      },
      initialize(this: LazyImageShape): void {
        this.isInitialized = true;
        this._setPageObserver();
      },
      reset(this: LazyImageShape): void {
        if (this.isInitialized) {
          return;
        }
        this.initialize();
      },
      enqueue(this: LazyImageShape): void {
        if (!this.intersectionObserver) {
          this.initialize();
        }
        const items = document.querySelectorAll(`.${this.className}:not(.is-lazy-loading)`);
        for (const item of items) {
          item.classList.add('is-lazy-loading');
          this.intersectionObserver!.observe(item);
        }
      },
      _loadImage(this: LazyImageShape, item: Element): void {
        if (!(item instanceof HTMLElement)) {
          throw new Error('無視していいエラー'); // override前のメソッドから呼ばれたので例外を投げて強制ストップ
        }
        const src = item.getAttribute(this.attrName);
        item.classList.remove(this.className, 'is-lazy-loading');
        if (src && item.getAttribute(this.adjustAttrName)) {
          this._adjustSizeAndLoad(item, src);
        } else if (src) {
          item.setAttribute('src', src);
        }
        item.setAttribute(this.attrName, '');
        item.addEventListener('error', (e) => {
          console.warn('error', e.target);
          (e.target || item).dispatchEvent(
            new CustomEvent(this.errorEventName, { detail: { src }, bubbles: true, composed: true })
          );
        });
      },
      _adjustSizeAndLoad(this: LazyImageShape, item: HTMLElement, src: string): void {
        const img = new Image();
        img.src = src;
        void (img.decode as unknown as Promise<void>).then(() => {
          requestAnimationFrame(() => {
            item.style.objectFit = 'contain';
            item.setAttribute('src', src);
          });
        });
      },
      _setPageObserver(this: LazyImageShape): void {
        if (!this.intersectionObserver) {
          const intersectionObserver = (this.intersectionObserver = new IntersectionObserver(
            (entries) => {
              const inviews = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target);
              for (const item of inviews) {
                intersectionObserver.unobserve(item);
                this._loadImage(item);
              }
            },
            { rootMargin: `${this.margin}px` }
          ));
        }

        if (!this.mutationObserver) {
          const mutationObserver = (this.mutationObserver = new MutationObserver((mutations) => {
            const isAdded = mutations.find((mutation) => mutation.addedNodes && mutation.addedNodes.length > 0);
            if (isAdded) {
              this.enqueue();
            }
          }));
          mutationObserver.observe(
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- DOMのnull可能性はtsc(strict)で検査するための非null表明であり、ランタイムは消去により同一
            document.body!,
            { childList: true, characterData: false, attributes: false, subtree: true }
          );
        }

        this.enqueue();
      },
      _getBottomLoadingThreshold(this: LazyImageShape): number {
        return Number.MAX_SAFE_INTEGER;
      },
      _sortWaitings(this: LazyImageShape): void {},
    });

    if (isInitialized) {
      LazyImage.initialize();
    }
    // window.addEventListener('scroll', () => {LazyImage.initialize();}, {passive: true, once: true});
  };

  if (nicoWindow.Nico && nicoWindow.Nico.LazyImage && IntersectionObserver && MutationObserver) {
    override();
  } else if (IntersectionObserver && MutationObserver) {
    window.addEventListener('DOMContentLoaded', override, { once: true, bubbles: true } as AddEventListenerOptions);
  }
})();

//===END===
