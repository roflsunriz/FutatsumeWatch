import _ from 'lodash';
// import {browser} from '../browser';
// const window = browser.window;

//===BEGIN===

const CustomElements: { initialize?: () => void } = {};

CustomElements.initialize = () => {
  if (!window.customElements) {
    return;
  }

  class PlaylistAppend extends HTMLElement {
    declare _shadow: ShadowRoot;
    static get observedAttributes(): string[] {
      return [];
    }

    // 末尾に追加するという意味合では add より append らしい
    static template(): string {
      return `
        <style>
        * {
          box-sizing: border-box;
          user-select: none;
        }

        :host {
          background: none !important;
          border: none !important;
        }

        .playlistAppend {
          display: inline-block;
          font-size: 16px;
          line-height: 22px;
          width: 24px;
          height: 24px;
          background: #666;
          color: #ccc;
          text-decoration: none;
          border: 1px outset;
          border-radius: 3px;
          cursor: pointer;
          text-align: center;
        }

        .playlistAppend:active {
          border: 1px inset;
        }

        .label {
          text-shadow: 1px 1px #333;
          display: inline-block;
        }

        :host-context(.videoList) .playlistAppend {
          width: 24px;
          height: 20px;
          line-height: 18px;
          border-radius: unset;
        }

        :host-context(.videoOwnerInfoContainer) {
        }

      </style>
      <div class="playlistAppend">
        <div class="label">▶</div></div>
       `;
    }

    constructor() {
      super();
      const shadow = (this._shadow = this.attachShadow({ mode: 'open' }));
      shadow.innerHTML = (this.constructor as unknown as { template(): string }).template();
    }

    disconnectedCallback(): void {
      this._shadow.textContent = '';
    }
  }

  window.customElements.define('futatsume-playlist-append', PlaylistAppend);

  class SeekbarLabel extends HTMLElement {
    declare _shadow: ShadowRoot;
    declare _root: HTMLElement;
    declare _label: HTMLElement;
    declare props: { time: number; duration: number; text: string | null };
    static get observedAttributes(): string[] {
      return ['time', 'duration', 'text'];
    }

    static template(): string {
      return `
        <style>
*, *::after, *::before {
  box-sizing: border-box;
  user-select: none;
}

:host(.owner-comment) * {
  --color: #efa;
  --pointer-color: rgba(128, 255, 128, 0.6);
}

.root * {
  pointer-events: none;
}

.root {
  position: absolute;
  width: 16px;
  height: 16px;
  top: calc(100% - 2px);
  left: 50%;
  color: var(--color, #fea);
  border-style: solid;
  border-width: 8px;
  border-color:
    var(--pointer-color, rgba(255, 128, 128, 0.6))
    transparent
    transparent
    transparent;
}

.label {
  display: inline-block;
  visibility: hidden;
  position: absolute;
  left: -8px;
  bottom: 8px;
  white-space: nowrap;
  padding: 2px 4px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 4px;
  border-color: var(--pointer-color, rgba(255, 128, 128, 0.6));
  border-style: solid;
  opacity: 0.5;
}

.root:hover .label {
  visibility: visible;
}

      </style>
      <div class="root">
        <span class="label"></span>
      </div>
       `;
    }

    constructor() {
      super();
      const shadow = (this._shadow = this.attachShadow({ mode: 'open' }));
      shadow.innerHTML = (this.constructor as unknown as { template(): string }).template();
      this._root = shadow.querySelector('.root') as HTMLElement;
      this._label = shadow.querySelector('.label') as HTMLElement;

      this._updatePos = _.debounce(this._updatePos.bind(this), 100);

      this.props = {
        time: -1,
        duration: 1,
        text: this.getAttribute('text') || this.getAttribute('data-text'),
      };
      this._label.textContent = this.props.text;
    }

    _updateTime(t: number): void {
      this.props.time = isNaN(t) ? -1 : t;
      this._updatePos();
    }

    _updateDuration(d: number): void {
      this.props.duration = isNaN(d) ? 1 : d;
      this._updatePos();
    }

    _updatePos(): void {
      const per = (this.props.time / Math.max(this.props.duration, 1)) * 100;
      this.hidden = per <= 0;
      this.setAttribute('data-param', String(this.props.time));
      this._root.style.transform = `translate(${per}vw, 0) translateX(-50%) scale(var(--scale-pp, 1.2))`;
      this._label.style.transform = `translate(-${per}%, 0)`;
    }

    _clear(): void {
      this._root.classList.toggle('has-screenshot', false);
      this.props.time = -1;
      this.props.duration = 1;
      this.hidden = true;
    }

    hide(): void {
      this.hidden = true;
    }

    attributeChangedCallback(attr: string, oldValue: string | null, newValue: string | null): void {
      switch (attr) {
        case 'time':
          this._updateTime(parseFloat(newValue ?? ''));
          break;
        case 'duration':
          this._updateDuration(parseFloat(newValue ?? ''));
          break;
        case 'text':
          this._label.textContent = newValue;
          break;
      }
    }
  }
  window.customElements.define('futatsume-seekbar-label', SeekbarLabel);
};

//===END===

export { CustomElements };
