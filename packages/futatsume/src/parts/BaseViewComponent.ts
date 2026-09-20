import { Emitter } from '../../../lib/src/Emitter';
import { PRODUCT } from '../../../../src/FutatsumeWatchIndex';
import { cssUtil } from '../../../lib/src/css/css';
import { ClassList } from '../../../lib/src/dom/ClassListWrapper';

interface BaseViewParams {
  parentNode?: Element | null;
  name?: string;
  template?: string;
  shadow?: string;
  css?: string;
}

interface CssUtilLike {
  addStyle(css: string, id: string): void;
}

interface ClassListWrapper {
  toggle(name: string, force?: boolean): boolean;
  contains(name: string): boolean;
  add(...names: string[]): void;
  remove(...names: string[]): void;
}

interface ClassListFactory {
  (view: Element | DocumentFragment): ClassListWrapper;
}
interface ShadowHost extends Element {
  createShadowRoot?(): ShadowRoot;
}

type ViewTemplateStore = Record<string, HTMLTemplateElement | undefined>;
//===BEGIN===

class BaseViewComponent extends Emitter {
  declare _params: BaseViewParams;
  declare _bound: Record<string, (e: Event) => void>;
  declare _state: Record<string, unknown>;
  declare _props: Record<string, unknown>;
  declare _elm: Record<string, unknown>;
  declare _view: Element | DocumentFragment;
  declare _parentNode: Element | null;
  declare _shadow: Element | null;
  declare _shadowRoot: ShadowRoot | Element | null;
  declare _isDummyShadow: boolean;
  constructor({ parentNode = null, name = '', template = '', shadow = '', css = '' }: BaseViewParams) {
    super();

    this._params = { parentNode, name, template, shadow, css };
    this._bound = {};
    this._state = {};
    this._props = {};
    this._elm = {};

    this._initDom({
      parentNode,
      name,
      template,
      shadow,
      css,
    });
  }

  _initDom(params: BaseViewParams): void {
    const { parentNode, name, template, css: style, shadow } = params;
    const css = cssUtil as unknown as CssUtilLike;
    const templates = BaseViewComponent as unknown as ViewTemplateStore;
    const tplId = `${PRODUCT}${name}Template`;
    let tpl = templates[tplId];
    if (!tpl) {
      if (style) {
        css.addStyle(style, `${name}Style`);
      }
      tpl = document.createElement('template');
      tpl.innerHTML = template as string;
      tpl.id = tplId;
      templates[tplId] = tpl;
    }
    const onClick = (this._bound.onClick = this._onClick.bind(this));

    const view = document.importNode(tpl.content, true);
    this._view = view.querySelector('*') || document.createDocumentFragment();
    this._view.addEventListener('click', onClick);
    this.appendTo(parentNode ?? null);

    if (shadow) {
      this._attachShadow({ host: this._view as unknown as ShadowHost, name: name as string, shadow });
      if (!this._isDummyShadow) {
        (this._shadow as Element).addEventListener('click', onClick);
      }
    }
  }

  _attachShadow({
    host,
    shadow,
    name,
    mode = 'open',
  }: {
    host: ShadowHost;
    shadow: string;
    name: string;
    mode?: ShadowRootMode;
  }): void {
    const templates = BaseViewComponent as unknown as ViewTemplateStore;
    const tplId = `${PRODUCT}${name}Shadow`;
    let tpl = templates[tplId];
    if (!tpl) {
      tpl = document.createElement('template');
      tpl.innerHTML = shadow;
      tpl.id = tplId;
      templates[tplId] = tpl;
    }

    if (!host.attachShadow && !host.createShadowRoot) {
      return this._fallbackNoneShadowDom({ host, tpl, name });
    }

    const root = host.attachShadow ? host.attachShadow({ mode }) : (host.createShadowRoot as () => ShadowRoot)();
    const node = document.importNode(tpl.content, true);
    root.append(node);
    this._shadowRoot = root;
    this._shadow = root.querySelector('.root');
    this._isDummyShadow = false;
  }

  _fallbackNoneShadowDom({ host, tpl, name }: { host: Element; tpl: HTMLTemplateElement; name: string }): void {
    const css = cssUtil as unknown as CssUtilLike;
    const node = document.importNode(tpl.content, true);
    const style = node.querySelector('style') as HTMLStyleElement;
    style.remove();
    css.addStyle(style.innerHTML, `${name}Shadow`);
    host.append(node);
    this._shadow = this._shadowRoot = host.querySelector('.root');
    this._isDummyShadow = true;
  }

  setState(key: string | Record<string, unknown>, val?: unknown): void {
    if (typeof key === 'string') {
      return this._setState(key, val);
    }
    for (const k of Object.keys(key)) {
      this._setState(k, key[k]);
    }
  }

  _setState(key: string, val: unknown): void {
    let m: RegExpExecArray | null;
    if (this._state[key] !== val) {
      this._state[key] = val;
      if ((m = /^is(.*)$/.exec(key)) !== null) {
        this.toggleClass(`is-${m[1]}`, !!val);
      }
      this.emit('update', { key, val });
    }
  }

  _onClick(e: Event): void {
    const eventTarget = e.target as unknown as Element;
    const target = eventTarget.closest('[data-command]') as unknown as HTMLElement | null;

    if (!target) {
      return;
    }

    const { command, type = 'string', param } = target.dataset;
    e.stopPropagation();
    e.preventDefault();
    this._onCommand(command as string, type !== 'string' ? JSON.parse(param as string) : param);
  }

  appendTo(parentNode: Element | null): void {
    if (!parentNode) {
      return;
    }
    this._parentNode = parentNode;
    parentNode.appendChild(this._view);
  }

  _onCommand(command: string, param: unknown): void {
    this.dispatchCommand(command, param);
  }

  dispatchCommand(command: string, param: unknown): void {
    this._view.dispatchEvent(new CustomEvent('command', { detail: { command, param }, bubbles: true, composed: true }));
  }

  toggleClass(className: string, v: boolean): void {
    const classListFactory = ClassList as unknown as ClassListFactory;
    const vc = classListFactory(this._view);
    const sc = this._shadow ? classListFactory(this._shadow) : null;
    (className || '')
      .trim()
      .split(/\s+/)
      .forEach((c) => {
        vc.toggle(c, v);
        if (sc) {
          sc.toggle(c, vc.contains(c));
        }
      });
  }

  addClass(name: string): void {
    const classListFactory = ClassList as unknown as ClassListFactory;
    const names = name.trim().split(/[\s]+/);
    classListFactory(this._view).add(...names);
    if (this._shadow) {
      classListFactory(this._shadow).add(...names);
    }
  }

  removeClass(name: string): void {
    const classListFactory = ClassList as unknown as ClassListFactory;
    const names = name.trim().split(/[\s]+/);
    classListFactory(this._view).remove(...names);
    if (this._shadow) {
      classListFactory(this._shadow).remove(...names);
    }
  }
}

//===END===
export { BaseViewComponent };
