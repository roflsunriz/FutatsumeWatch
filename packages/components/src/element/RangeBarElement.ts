import { throttle } from '../../../lib/src/infra/bounce';
import { uq } from '../../../lib/src/uQuery';
import { cssUtil } from '../../../lib/src/css/css';
import { domEvent } from '../../../lib/src/dom/domEvent';

interface UqWrapper {
  appendTo(target: ShadowRoot | Element): void;
  find(selector: string): HTMLElement[];
  on(name: string, listener: EventListener): void;
  after(elm: Element): void;
}

interface UqCallable {
  (query: Element | string): UqWrapper;
  html(strings: TemplateStringsArray, ...values: unknown[]): UqWrapper;
}

interface RangeInputElement extends HTMLInputElement {
  view: RangeBarElement;
}
//===BEGIN===

class RangeBarElement extends HTMLElement {
  private _rangeInput: RangeInputElement | undefined = undefined;
  private _value = '';
  private lastValue: number | undefined = undefined;
  private meter: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private $tpl: UqWrapper | null = null;
  private onKey: (e: Event) => void;
  private onFocus: (e: Event) => void;

  getTemplate(): UqWrapper {
    return (uq as unknown as UqCallable).html`
      <div id="root">
      <style>
        * {
          box-sizing: border-box;
          user-select: none;
          --back-color: #333;
          --fore-color: #ccc;
          --width: 64px;
          --height: 8px;
          --range-percent: 0%;
        }
        #root {
          width: var(--width);
          height: 100%;
          display: flex;
          align-items: center;
        }
        input, .meter {
          width: var(--width);
          height: var(--height);
        }
        input {
          -webkit-appearance: none;
          pointer-events: auto;
          opacity: 0;
          outline: none;
          cursor: pointer;
        }
        input::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: var(--height);
          width: 2px;
        }
        input::-moz-range-thumb {
          height: var(--height);
          width: 2px;
        }
        .meter {
          position: absolute;
          display: inline-block;
          vertical-align: middle;
          background-color: var(--back-color) !important;
          contain: style layout size;
          pointer-events: none;
        }
        .tooltip {
          display: none;
          pointer-events: none;
          position: absolute;
          left: 50%;
          top: -24px;
          transform: translateX(-50%);
          font-size: 12px;
          line-height: 16px;
          padding: 2px 4px;
          border: 1px solid #000;
          background: #ffc;
          color: black;
          text-shadow: none;
          white-space: nowrap;
          z-index: 100;
        }
        .tooltip:empty { display: none !mportant; }
        #root:active .tooltip { display: inline-block; }
      </style>
      <div class="meter" style="background:
      linear-gradient(to right,
        var(--fore-color), var(--fore-color) var(--range-percent),
        var(--back-color) 0, var(--back-color)
      ) !important;"><div class="tooltip"></div></div>
    </div>`;
  }

  constructor() {
    super();
    this.update = throttle.raf(this.update.bind(this));
    this.onChange = this.onChange.bind(this);
    this.onKey = (e: Event): void => e.preventDefault();
    this.onFocus = (e: Event): void => {
      console.warn('focus');
      (e.target as HTMLElement).blur();
    };
    this._value = this.getAttribute('value') || '';
  }

  connectedCallback(): void {
    if (this._rangeInput) {
      return;
    }
    const range = this.querySelector('input[type=range]');
    if (range) {
      this.rangeInput = range as RangeInputElement;
    }
  }

  onChange(): void {
    this.update();
    domEvent.dispatchCustomEvent(this, 'input', { value: this.value }, { bubbles: true, composed: true });
  }

  update(): unknown {
    if (!this.rangeInput) {
      return;
    }
    this.rangeInput.blur();
    const range = this.rangeInput;
    const min = Number(range.min);
    const max = Number(range.max);
    const value = Number(range.value);
    if (this.lastValue === value) {
      return;
    }
    this.lastValue = value;
    const per = (value / Math.abs(max - min)) * 100;
    (this.meter as HTMLElement).style.setProperty('--range-percent', cssUtil.percent(per) as string);
    (this.tooltip as HTMLElement).textContent = `${Math.round(per)}%`;
  }

  initShadow(): void {
    if (this.shadowRoot) {
      return;
    }
    const shadowRoot = this.attachShadow({ mode: 'open' });
    const $tpl = (this.$tpl = this.getTemplate());
    $tpl.appendTo(shadowRoot);
    this.meter = $tpl.find('.meter')[0] as HTMLElement;
    this.tooltip = $tpl.find('.tooltip')[0] as HTMLElement;
  }

  get rangeInput(): RangeInputElement | undefined {
    return this._rangeInput;
  }

  set rangeInput(range: RangeInputElement) {
    this._rangeInput = range;
    range.view = this;
    if (this._value) {
      range.value = this._value;
    }
    this.initShadow();
    (this.meter as HTMLElement).after(range);
    this.update();
    (uq as unknown as UqCallable)(range).on('input', () => this.onChange());
  }

  get value(): string {
    return this.rangeInput ? this.rangeInput.value : this._value;
  }

  set value(v: string) {
    this._value = v;
    if (this.rangeInput) {
      this.rangeInput.value = v;
      this.update();
    }
  }
}
cssUtil.registerProps({
  name: '--range-percent',
  syntax: '<percentage>',
  initialValue: cssUtil.percent(0) as string,
  inherits: true,
});
if (window.customElements) {
  if (!customElements.get('futatsume-range-bar')) {
    window.customElements.define('futatsume-range-bar', RangeBarElement);
  }
}

//===END===

export { RangeBarElement };
