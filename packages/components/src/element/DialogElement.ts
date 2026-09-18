import { BaseCommandElement } from './BaseCommandElement.js';
import { textUtil } from '../../../lib/src/text/textUtil';
import { cssUtil } from '../../../lib/src/css/css';

import type { TemplateResult } from '../../../../node_modules/lit/html.js';
import type { CommandDetail, ElementEvents, LitModule, PropsMap, StateMap } from './BaseCommandElement.js';

const dll: { list?: LitModule } = {};

interface CssUtilPropsShape {
  name: string;
  syntax: string;
  initialValue: number;
  inherits: boolean;
}

interface CssUtilShape {
  registerProps(props: CssUtilPropsShape): void;
}

export type HtmlTag = LitModule['html'];
//===BEGIN===

const { DialogElement, DialogProps } = (() => {
  const DialogProps: PropsMap = {};
  const DialogAttributes = Object.keys(DialogProps).map((prop) => BaseCommandElement.toAttributeName(prop));

  class DialogElement extends BaseCommandElement {
    private _dialog: Element | null = null;

    static get propTypes(): PropsMap {
      return DialogProps;
    }

    static get defaultProps(): PropsMap {
      return DialogProps;
    }

    static get observedAttributes(): string[] {
      return DialogAttributes;
    }

    static get defaultState(): StateMap {
      return {
        isOpen: false,
      };
    }

    static getContentsTemplate(
      html: HtmlTag,
      state: StateMap = {},
      props: PropsMap = {},
      events: ElementEvents = {}
    ): Promise<TemplateResult | null> {
      return Promise.resolve(null);
    }

    static async getTemplate(
      state: StateMap = {},
      props: PropsMap = {},
      events: ElementEvents = {}
    ): Promise<TemplateResult> {
      const { html } = (dll.list || (await this.importLit())) as LitModule;
      const body = html`
        <style>
          * {
            box-sizing: border-box;
            overscroll-behavior: none;
          }

          *::-webkit-scrollbar {
            background: transparent;
            /*bordedr-radius: 6px;*/
            width: 16px;
          }

          *::-webkit-scrollbar-thumb {
            /*border-radius: 4px;*/
            background: var(--scrollbar-thumb-color, #999);
            box-shadow: 0 0 4px #333 inset;
            will-change: transform;
          }

          *::-webkit-scrollbar-button {
            display: none;
          }

          #root {
            --dialog-border-width: 12px;
            --dialog-background-color: rgba(48, 48, 48, 0.9);
            --dialog-text-color: #ccc;
            text-align: left;
          }

          button {
            cursor: pointer;
            outline: none;
          }

          .dialog {
            position: fixed;
            top: 50%;
            left: 50%;
            width: var(--dialog-width, 60vw);
            height: var(--dialog-height, 80vh);
            z-index: 1000000;
            will-change: transform;
            visibility: hidden;
            user-select: none;
            transform: translate(-50%, -50%);
            border-radius: 16px;
            transform-origin: center top;
            animation-name: closing;
            animation-fill-mode: forwards;
            animation-iteration-count: 1;
            animation-duration: 0.5s;
            animation-timing-function: linear;
            border: 1px solid rgba(128, 128, 128, 0.5);
          }

          .dialog.is-open::before {
            content: '';
            position: fixed;
            top: calc(-50vh + 50%);
            left: calc(-50vw + 50%);
            width: 100vw;
            height: 100vh;
            animation-name: opening-shadow;
            visibility: hidden;
            animation-delay: 1s;
            animation-fill-mode: forwards;
            animation-iteration-count: 1;
            animation-duration: 1s;
            animation-timing-function: linear;
          }

          @keyframes opening-shadow {
            0% {
              visibility: hidden;
            }
            100% {
              visibility: visible;
            }
          }

          .dialog.is-open {
            visibility: visible;
            animation-name: opening;
          }

          @keyframes closing {
            0% {
              visibility: visible;
              overflow: hidden;
              transform: translate(-50%, -50%);
            }
            10% {
              visibility: visible;
              transform: translate(-50%, -50%) skew(-20deg) translate(20vw, 0);
            }
            45% {
              visibility: hidden;
              transform: translate(-50%, -50%) skew(-20deg) translate(100vw, 0);
            }
            100% {
            }
          }

          @keyframes opening {
            0% {
              visibility: visible;
              overflow: hidden;
              transform: translate(-50%, -50%) skew(20deg) translate(200vw, 0);
            }
            90% {
              transform: translate(-50%, -50%) skew(20deg);
            }
            93% {
              transform: translate(-50%, -50%) skew(-10deg);
            }
            95% {
              transform: translate(-50%, -50%) skew(5deg);
            }
            100% {
              overflow: visible;
              transform: translate(-50%, -50%);
            }
          }

          .dialog-background {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 16px;
            border-width: 16px;
            border-style: solid;
            --hue: calc(var(--current-hue, 0) + 120);
            --hsl: hsla(var(--hue, 0), 50%, 80%, 0.5);
            color: var(--hsl, hsla(120, 50%, 30%, 0.8));
            box-shadow:
              0 0 8px hsl(var(--hue, 0), 50%, 30%),
              0 0 4px hsl(var(--hue, 0), 50%, 50%);
            border-color: currentcolor;
          }

          .dialog.is-open .dialog-background {
            animation-name: hue-roll;
            animation-delay: 1s;
            animation-fill-mode: forwards;
            animation-iteration-count: infinite;
            animation-duration: 30s;
            animation-timing-function: linear;
          }
          @keyframes hue-roll {
            0% {
              --current-hue: 0;
            }
            100% {
              --current-hue: 360;
            }
          }

          .dialog-inner {
            position: absolute;
            background: hsla(var(--hue, 120), 10%, 15%, 0.9);
            opacity: 1;
            z-index: 100;
            top: -4px;
            left: -4px;
            bottom: -4px;
            right: -4px;
            padding-right: 16px;
            color: var(--dialog-text-color, #ccc);
            overflow: auto;
            overscroll-behavior: none;
            border-radius: 8px;
            border: 12px solid transparent;
            box-shadow: 0 0 0 1px hsla(var(--hue, 0), 50%, 10%, 0.5);
          }

          h1,
          h2,
          h3,
          h4,
          h5,
          h6,
          h7,
          summary {
            background: rgba(3, 147, 147, 1);
            /*box-shadow: 0 0 8px rgba(0, 0, 0, 0.5) inset;*/
            text-shadow: 1px 1px #999;
            border-radius: 4px;
            font-weight: bold;
            color: #333;
            padding: 4px 8px;
            margin: 0 8px 0 0;
            text-align: left;
          }

          h3,
          h4 {
            margin: 0 auto;
            background: rgba(192, 192, 192, 0.8);
            box-shadow: none;
          }

          h3 {
            width: calc(100% - 16px);
          }

          h4 {
            width: calc(100% - 32px);
          }

          summary {
            margin: 0 0 16px;
            cursor: pointer;
            outline: none;
            font-size: 150%;
          }
          summary::-webkit-details-marker {
            color: #f39393;
            text-shadow: 0 0 1px red;
          }
          details: {
            margin: 0 0 16px;
          }
          p {
            padding: 8px;
            margin: 0;
          }

          button,
          input[type='button'] {
            cursor: pointer;
          }

          textarea,
          input,
          select,
          option {
            background: transparent;
            color: var(--dialog-text-color, #ccc);
          }
        </style>
        <div class="dialog-background" data-command="nop">
          <div class="dialog-inner">${this.getContentsTemplate(html, state, props, events)}</div>
        </div>
      `;

      return html`
        <div id="root" @click=${events.onClick}>
          <div class="dialog ${state.isOpen ? 'is-open' : ''}" data-command="close">
            <form @change=${events.onChange} @keydown=${events.onKeyDown} @keyup=${events.onKeyUp}>
              ${state.isOpen ? body : ''}
            </form>
          </div>
        </div>
      `;
    }

    constructor() {
      super();
      const onKey = this.onKey.bind(this);
      Object.assign(this.events, {
        onChange: this.onChange.bind(this),
        onKeyDown: onKey,
        onKeyUp: onKey,
      });
      Object.assign(this.state, this.props);

      (cssUtil as unknown as CssUtilShape).registerProps({
        name: '--current-hue',
        syntax: '<number>',
        initialValue: 0,
        inherits: true,
      });
    }

    async connectedCallback(): Promise<void> {
      await super.connectedCallback();
      if (!this._root) {
        return;
      }
      this._dialog = this._root.querySelector('.dialog');
      (this._dialog as Element).addEventListener('animationend', (e: Event) => {
        if ((e as AnimationEvent).animationName !== 'opening') {
          return;
        }
        if (this.state.isOpen) {
          this.onOpen();
        }
      });
    }

    get isOpen(): boolean {
      return this.state.isOpen as boolean;
    }

    set isOpen(v: boolean) {
      if (this.isOpen === v) {
        return;
      }
      if (v) {
        this.open();
      } else {
        this.close();
      }
    }

    get dialog(): Element | null {
      return this._dialog;
    }

    open(): void {
      this.setState({ isOpen: true });
      if (this._dialog) {
        this._dialog.classList.add('is-open');
      }
    }

    close(): void {
      if (this._dialog) {
        this._dialog.classList.remove('is-open');
      }
      setTimeout(() => this.setState({ isOpen: false }), 1000);
    }

    toggle(): void {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }

    onCommand(e: Event): void {
      const { command } = (e as CustomEvent<CommandDetail>).detail;
      switch (command) {
        case 'close':
          this.close();
          break;
        default:
          return;
      }
      e.stopPropagation();
      e.preventDefault();
    }

    onChange(e: Event): void {}

    onOpen(): void {}

    onKey(e: Event): void {
      const path = (e as unknown as { path?: EventTarget[] }).path;
      const target = path && path[0] ? path[0] : e.target;
      const tagName = (target as Element).tagName;
      if (tagName === 'SELECT' || tagName === 'INPUT' || tagName === 'TEXTAREA') {
        e.stopPropagation();
      }
    }

    attributeChangedCallback(attr: string, oldValue: string | null, newValue: string | null): void {}
  }
  return { DialogElement, DialogProps };
})();

//===END===

export { DialogElement, DialogProps };
