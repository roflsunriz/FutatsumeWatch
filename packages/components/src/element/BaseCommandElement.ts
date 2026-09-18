// import {html, render} from 'lit/html.js';
// import * as lit from 'https://esm.run/lit';
import * as lit from '../../../../node_modules/lit/html.js';
// import * as lit from 'https://esm.run/lit';
// const {html, render} = lit;
const dll: { lit: typeof lit } = { lit };
import { util } from '../util/util.js';

import type { TemplateResult } from '../../../../node_modules/lit/html.js';

export type PropsMap = Record<string, unknown>;
export type StateMap = Record<string, unknown>;
export type ElementEvents = Record<string, EventListener>;

export interface CommandDetail {
  command: string;
  param: unknown;
  originalEvent?: Event | null;
}

export interface LitModule {
  html(this: void, strings: TemplateStringsArray, ...values: unknown[]): TemplateResult;
  render(value: unknown, container: Element | DocumentFragment, options?: Record<string, unknown>): void;
}
//===BEGIN===

class BaseCommandElement extends HTMLElement {
  props: PropsMap;
  state: StateMap;
  events: ElementEvents;
  protected _isConnected = false;
  protected _root: Element | null = null;
  private _boundOnUIEvent: EventListener;
  private _boundOnCommand: EventListener;
  private _idleRenderCallback: () => unknown;
  private _idleCallbackId: ReturnType<typeof setTimeout> | undefined = undefined;

  static toAttributeName(camel: string): string {
    return 'data-' + camel.replace(/([A-Z])/g, (s: string): string => '-' + s.toLowerCase());
  }

  static toPropName(snake: string): string {
    return snake.replace(/^data-/, '').replace(/(-.)/g, (s: string): string => s.charAt(1).toUpperCase());
  }

  static async importLit(): Promise<typeof lit> {
    if (dll.lit) {
      return dll.lit;
    }
    dll.lit = (await util.dimport('https://esm.run/lit')) as typeof lit;
    return dll.lit;
  }

  static get observedAttributes(): string[] {
    return [];
  }

  static get propTypes(): PropsMap {
    return {};
  }

  static get defaultProps(): PropsMap {
    return {};
  }

  static get defaultState(): StateMap {
    return {};
  }

  static async getTemplate(
    state: StateMap = {},
    props: PropsMap = {},
    events: ElementEvents = {}
  ): Promise<TemplateResult> {
    const { html } = dll.lit || (await this.importLit());
    return html`<div
      id="root"
      data-state="${JSON.stringify(state)}"
      data-props="${JSON.stringify(props)}"
      @click=${events.onClick}
    ></div>`;
  }

  constructor() {
    super();
    this._isConnected = false;
    this.props = Object.assign({}, (this.constructor as typeof BaseCommandElement).defaultProps, this._initialProps);
    this.state = Object.assign({}, (this.constructor as typeof BaseCommandElement).defaultState);
    this._boundOnUIEvent = this.onUIEvent.bind(this);
    this._boundOnCommand = this.onCommand.bind(this);
    this.events = {
      onClick: this._boundOnUIEvent,
    };

    this._idleRenderCallback = async (): Promise<void> => {
      this._idleCallbackId = undefined;
      return await this.render();
    };
  }

  get _initialProps(): PropsMap {
    const ctor = this.constructor as typeof BaseCommandElement;
    const props: PropsMap = {};
    for (const key of Object.keys(ctor.propTypes)) {
      const raw = this.dataset[key];
      if (!raw) {
        continue;
      }
      const type = typeof ctor.propTypes[key];
      props[key] = type !== 'string' ? (JSON.parse(raw) as unknown) : raw;
    }
    return props;
  }

  async render(): Promise<void> {
    const ctor = this.constructor as typeof BaseCommandElement;
    const { render } = dll.lit || (await ctor.importLit());
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    const shadowRoot = this.shadowRoot as ShadowRoot;
    const tmpl = await ctor.getTemplate(this.state, this.props, this.events);
    render(tmpl, shadowRoot, { isConnected: this._isConnected });

    if (!this._root) {
      const root = shadowRoot.querySelector('#root');
      if (!root) {
        return;
      }
      this._root = root;
      this._root.addEventListener('command', this._boundOnCommand);
    }
  }

  requestRender(isImmediate = false): void {
    if (this._idleCallbackId) {
      clearTimeout(this._idleCallbackId);
    }
    if (isImmediate) {
      void this._idleRenderCallback();
    } else {
      this._idleCallbackId = setTimeout(this._idleRenderCallback, 0);
    }
  }

  async connectedCallback(): Promise<void> {
    this._isConnected = true;
    await this.render();
  }

  async disconnectedCallback(): Promise<void> {
    this._isConnected = false;
    if (this._root) {
      this._root.removeEventListener('click', this._boundOnUIEvent);
      this._root.removeEventListener('command', this._boundOnCommand);
      this._root = null;
    }
    const ctor = this.constructor as typeof BaseCommandElement;
    const { render } = dll.lit || (await ctor.importLit());
    render('', this.shadowRoot as ShadowRoot, { isConnected: this._isConnected });
  }

  attributeChangedCallback(attr: string, oldValue: string | null, newValue: string | null): void {
    const ctor = this.constructor as typeof BaseCommandElement;
    const prop = attr.startsWith('data-') ? ctor.toPropName(attr) : attr;
    // const defProp = this.constructor.defaultProps[attr];
    const type = typeof ctor.propTypes[prop];
    let value: unknown = newValue;
    if (type !== 'string') {
      value = JSON.parse(newValue as string) as unknown;
    }
    if (this.props[prop] === value) {
      return;
    }
    this.props[prop] = value;
    this.requestRender();
  }

  setProp(prop: string, value: string): void {
    this.setAttribute(prop, value);
  }

  setState(key: string | StateMap, value?: unknown): boolean {
    if (this._setState(key, value)) {
      this.requestRender();
      return true;
    }
    return false;
  }

  _setState(key: string | StateMap, value?: unknown): boolean {
    if (typeof key !== 'string') {
      return this._setStates(key);
    }
    if (!Object.prototype.hasOwnProperty.call(this.state, key)) {
      return false;
    }
    if (this.state[key] === value) {
      return false;
    }
    this.state[key] = value;
    return true;
  }

  _setStates(states: StateMap): boolean {
    return Object.keys(states).filter((key) => this._setState(key, states[key])).length > 0;
  }

  onUIEvent(e: Event): boolean | undefined {
    const target = (e.target as HTMLElement).closest('[data-command]') as unknown as HTMLElement | null;
    if (!target) {
      return;
    }
    const { command, type } = target.dataset;
    let param: unknown = target.dataset.param;
    if (type !== undefined && ['number', 'boolean', 'json'].includes(type)) {
      param = JSON.parse(param as string) as unknown;
    }
    e.preventDefault();
    e.stopPropagation();
    return this.dispatchCommand(command as string, param, e, target);
  }

  dispatchCommand(
    command: string,
    param: unknown,
    originalEvent: Event | null = null,
    target: Element | null = null
  ): boolean {
    return (target || this).dispatchEvent(
      new CustomEvent<CommandDetail>('command', {
        detail: { command, param, originalEvent },
        bubbles: true,
        composed: true,
      })
    );
  }

  onCommand(e: Event): void {
    //console.log('on-command', e.detail.command, e.detail.param);
  }

  get propset(): PropsMap {
    return Object.assign({}, this.props);
  }

  set propset(props: PropsMap) {
    const keys = Object.keys(props).filter((key) => Object.prototype.hasOwnProperty.call(this.props, key));
    const changed =
      keys.filter((key) => {
        if (this.props[key] === props[key]) {
          return false;
        }
        this.props[key] = props[key];
        return true;
      }).length > 0;

    if (changed) {
      this.requestRender();
    }
  }
}

//===END===

export { BaseCommandElement };
