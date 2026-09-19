type UQueryArray = ReturnType<typeof uq>;

type UQueryCallback = (...args: unknown[]) => unknown;

type RafTask = (...args: unknown[]) => unknown;

interface UQueryStatics {
  $Array: new (...args: unknown[]) => UQueryArray;
  createDom: (template: unknown, ...args: unknown[]) => DocumentFragment;
  html: (...args: unknown[]) => UQueryArray;
  isTL: (t: unknown, ...args: unknown[]) => boolean;
  ready: (func?: () => void) => Promise<unknown>;
  complete: (func?: () => void) => Promise<unknown>;
  each: (arr: ArrayLike<unknown>, callback: (this: unknown, index: number, value: unknown) => void) => void;
  proxy: (func: (...args: unknown[]) => unknown, ...args: unknown[]) => (...args: unknown[]) => unknown;
  fn: Record<string, unknown>;
}

interface UQueryFunction extends UQueryStatics {
  (q: unknown, ...args: unknown[]): UQueryArray;
}

// Arrayを継承したjQuery劣化版
//
// walkから全要素に適用できる
// $('div').find('.thumbnail').walk.src = '';
// $('.message').walk.textContent = 'hello';
// $('span').walk.style.color = 'blue';
import { throttle } from './infra/bounce';
import { Emitter, PromiseHandler } from './Emitter';
import type { AnyPromiseHandler } from './Emitter';
//===BEGIN===
const uQuery = (() => {
  const endMap: WeakMap<object, $Array> = new WeakMap();
  const emptyMap: Map<string, Set<UQueryCallback>> = new Map();
  const emptySet: Set<UQueryCallback> = new Set();
  const elementsEventMap: WeakMap<object, Map<string, Set<UQueryCallback>>> = new WeakMap();
  const HAS_CSSTOM = window.CSS && (CSS as unknown as { number?: unknown }).number ? true : false;
  const toCamel = (p: string): string => p.replace(/-./g, (s) => s.charAt(1).toUpperCase());
  const toSnake = (p: string): string => p.replace(/[A-Z]/g, (s) => `-${s.charAt(1).toLowerCase()}`);
  const isStyleValue = (val: unknown): boolean => 'px' in CSS && val instanceof CSSStyleValue;
  const emitter = new Emitter();
  const UNDEF = Symbol('undefined');
  const waitForDom = (resolve: (...args: unknown[]) => void): void => {
    if (['interactive', 'complete'].includes(document.readyState)) {
      return resolve();
    }
    document.addEventListener('DOMContentLoaded', resolve, { once: true });
  };
  const waitForComplete = (resolve: (...args: unknown[]) => void): void => {
    if (['complete'].includes(document.readyState)) {
      return resolve();
    }
    window.addEventListener('load', resolve, { once: true });
  };

  const isTagLiteral = (t: unknown, ...args: unknown[]): t is TemplateStringsArray =>
    Array.isArray(t) &&
    Array.isArray((t as unknown[] & { raw?: unknown }).raw) &&
    (t as unknown[]).length === (t as unknown as { raw: unknown[] }).raw.length &&
    args.length === (t as unknown[]).length - 1;

  const templateMap: WeakMap<object, HTMLTemplateElement> = new WeakMap();
  const createDom = (template: unknown, ...args: unknown[]): DocumentFragment => {
    const isTL = isTagLiteral(template, ...args);
    if (isTL && templateMap.has(template)) {
      const tpl = templateMap.get(template)!;
      return document.importNode(tpl.content, true);
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = isTL ? String.raw(template, ...args) : (template as string);
    if (isTL) {
      templateMap.set(template, tpl);
    }
    return document.importNode(tpl.content, true);
  };

  const walkingHandler: ProxyHandler<$Array> = {
    set: function (target, prop, value) {
      for (const elm of target) {
        (elm as unknown as Record<string | symbol, unknown>)[prop] = value;
      }
      return true;
    },
    get: function (target, prop) {
      const isFunc = target.some(
        (elm) => typeof (elm as unknown as Record<string | symbol, unknown>)[prop] === 'function'
      );

      if (!isFunc) {
        const isObj = target.some(
          (elm) => (elm as unknown as Record<string | symbol, unknown>)[prop] instanceof Object
        );
        const result = target.map((elm) =>
          typeof (elm as unknown as Record<string | symbol, unknown>)[prop] === 'function'
            ? ((elm as unknown as Record<string | symbol, unknown>)[prop] as RafTask).bind(elm)
            : (elm as unknown as Record<string | symbol, unknown>)[prop]
        );
        return isObj ? (result as unknown as $Array).walk : result;
      }
      return (...args: unknown[]) => {
        const result = target.map((elm, index) => {
          try {
            const propVal = (elm as unknown as Record<string | symbol, unknown>)[prop];
            return (typeof propVal === 'function' ? (propVal as RafTask).apply(elm, args) : propVal) || elm;
          } catch (error) {
            console.warn('Exception: ', { target, prop, index, error });
          }
        });
        const isObj = result.some((r) => r instanceof Object);
        return isObj ? (result as unknown as $Array).walk : result;
      };
    },
  };

  const isHTMLElement = (elm: unknown): elm is HTMLElement => {
    return !!(
      elm instanceof HTMLElement ||
      ((elm as Element).ownerDocument &&
        elm instanceof
          ((elm as Element).ownerDocument.defaultView as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement)
    );
  };

  const isNode = (elm: unknown): elm is Node => {
    return !!(
      elm instanceof Node ||
      ((elm as Element).ownerDocument &&
        elm instanceof ((elm as Element).ownerDocument.defaultView as unknown as { Node: typeof Node }).Node)
    );
  };

  const isDocument = (d: unknown): d is Document => {
    const o = d as {
      [Symbol.toStringTag]?: unknown;
      documentElement?: { ownerDocument: { defaultView: unknown } } | null;
    };
    return !!(
      d instanceof Document ||
      (d && o[Symbol.toStringTag] === 'HTMLDocument') ||
      (o.documentElement && d instanceof (o.documentElement.ownerDocument.defaultView as { Node: typeof Node }).Node)
    );
  };

  const isEventTarget = (e: unknown): e is EventTarget => {
    return (
      e instanceof EventTarget ||
      (e as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag] === 'EventTarget' ||
      !!(
        (e as Partial<EventTarget>).addEventListener &&
        (e as Partial<EventTarget>).removeEventListener &&
        (e as Partial<EventTarget>).dispatchEvent
      )
    );
  };

  const isHTMLCollection = (e: unknown): e is HTMLCollection => {
    return (
      e instanceof HTMLCollection ||
      (e != null && (e as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag] === 'HTMLCollection')
    );
  };

  const isNodeList = (e: unknown): e is NodeList => {
    return (
      e instanceof NodeList ||
      (e != null && (e as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag] === 'NodeList')
    );
  };

  class RafCaller {
    elm: $Array;
    static promise: AnyPromiseHandler;
    static taskList: [task: RafTask, ...args: unknown[]][];
    static exec: (...args: unknown[]) => unknown;
    constructor(elm: $Array, methods: string[] = []) {
      this.elm = elm;
      methods.forEach((method) => {
        const task = ((elm as unknown as Record<string, RafTask>)[method] as RafTask).bind(elm);
        (task as unknown as Record<string, unknown>)._name = method;
        (this as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
          this.enqueue(task, ...args);
          return elm;
        };
      });
    }
    get promise(): AnyPromiseHandler {
      return (this.constructor as unknown as typeof RafCaller).promise;
    }
    enqueue(task: RafTask, ...args: unknown[]): void {
      (this.constructor as unknown as typeof RafCaller).taskList.push([task, ...args]);
      (this.constructor as unknown as typeof RafCaller).exec();
    }
    cancel(): void {
      (this.constructor as unknown as typeof RafCaller).taskList.length = 0;
    }
  }
  RafCaller.promise = new PromiseHandler();
  RafCaller.taskList = [];
  RafCaller.exec = throttle.raf(
    function (this: typeof RafCaller) {
      const taskList = this.taskList.concat();
      this.taskList.length = 0;
      for (const [task, ...args] of taskList) {
        try {
          task(...args);
        } catch (err) {
          console.warn('RafCaller task fail', { task, args });
        }
      }
      void this.promise.resolve();
      this.promise = new PromiseHandler();
    }.bind(RafCaller)
  );

  class $Array extends Array<Node> {
    _walker?: $Array;
    _raf?: RafCaller;
    get [Symbol.toStringTag](): string {
      return '$Array';
    }

    get na(): Node | undefined {
      return this[0];
    }

    get nz(): Node | undefined {
      return this[this.length - 1];
    }

    get walk(): $Array {
      const p = this._walker || new Proxy(this, walkingHandler);
      this._walker = p;
      return p;
    }

    get array(): Node[] {
      return [...this];
    }

    toArray(): Node[] {
      return this.array;
    }

    constructor(...args: unknown[]) {
      super();
      if (args.length === 0) {
        return;
      }
      const elm = args.length > 1 ? args : args[0];
      if (isHTMLCollection(elm) || isNodeList(elm)) {
        for (const e of elm) {
          super.push(e);
        }
      } else if (typeof elm === 'number') {
        this.length = elm;
      } else {
        this[0] = elm as Node;
      }
    }
    get raf(): RafCaller {
      if (!this._raf) {
        this._raf = new RafCaller(this, [
          'addClass',
          'removeClass',
          'toggleClass',
          'css',
          'setAttribute',
          'attr',
          'data',
          'prop',
          'val',
          'focus',
          'blur',
          'insert',
          'append',
          'appendChild',
          'prepend',
          'after',
          'before',
          'text',
          'appendTo',
          'prependTo',
          'remove',
          'show',
          'hide',
        ]);
      }
      return this._raf;
    }
    get htmls(): HTMLElement[] {
      return this.filter(isHTMLElement);
    }

    *getHtmls(): Generator<HTMLElement> {
      for (const elm of this) {
        if (isHTMLElement(elm)) {
          yield elm;
        }
      }
    }

    get firstElement(): HTMLElement | null {
      for (const elm of this) {
        if (isHTMLElement(elm)) {
          return elm;
        }
      }
      return null;
    }

    get nodes(): Node[] {
      return this.filter(isNode);
    }

    *getNodes(): Generator<Node> {
      for (const n of this) {
        if (isNode(n)) {
          yield n;
        }
      }
    }

    get firstNode(): Node | null {
      for (const n of this) {
        if (isNode(n)) {
          return n;
        }
      }
      return null;
    }

    get independency(): $Array {
      const nodes = this.nodes;
      if (nodes.length <= 1) {
        return nodes as unknown as $Array;
      }
      // 他の要素の子孫じゃないやつを返す
      return this.filter((elm) => nodes.every((e) => e === elm || !e.contains(elm))) as unknown as $Array;
    }

    get uniq(): $Array {
      return (this.constructor as unknown as typeof $Array).from([...new Set(this)]) as unknown as $Array;
    }

    clone(): $Array {
      return (this.constructor as unknown as typeof $Array).from(
        // cloneNode の存在チェック (unbind のまま参照する)
        // eslint-disable-next-line @typescript-eslint/unbound-method
        this.independency.filter((e) => (e as Element).cloneNode).map((e) => (e as Element).cloneNode(true))
      ) as unknown as $Array;
    }

    find(query: string): $Array;
    find(query: (value: Node, index: number, obj: Node[]) => unknown): Node | undefined;
    find(query: string | ((value: Node, index: number, obj: Node[]) => unknown)): Node | undefined | $Array {
      if (typeof query !== 'string') {
        return super.find(query as (value: Node, index: number, obj: Node[]) => boolean);
      }
      return this.query(query);
    }

    query(query: string): $Array {
      const found = this.independency
        // querySelectorAll の存在チェック (unbind のまま参照する)
        // eslint-disable-next-line @typescript-eslint/unbound-method
        .filter((elm) => (elm as Element).querySelectorAll)
        .map((elm) =>
          ($Array as unknown as { from: (items: unknown) => Element[] }).from((elm as Element).querySelectorAll(query))
        )
        .flat();
      endMap.set(found, this);
      return found as unknown as $Array;
    }

    mapQuery(map: Record<string, string>): {
      result: Record<string, unknown>;
      $: Record<string, unknown>;
      e: Record<string, unknown>;
    } {
      // querySelectorAll の存在チェック (unbind のまま参照する)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const $tmp = this.independency.filter((elm) => (elm as Element).querySelectorAll);
      const result = [] as unknown as Record<string, unknown>,
        e = [] as unknown as Record<string, unknown>,
        $ = {} as unknown as Record<string, unknown>;

      for (const key of Object.keys(map)) {
        const query = map[key] as string;
        const found = $tmp
          .map((elm) =>
            ($Array as unknown as { from: (items: unknown) => Element[] }).from(
              (elm as Element).querySelectorAll(query)
            )
          )
          .flat();
        result[key] = key.match(/^_?\$/) ? found : found[0];
        $[key.replace(/^(_?)/, '$1$')] = found;
        e[key.replace(/^(_?)\$/, '$1')] = found[0];
      }
      return { result, $, e };
    }

    end(): $Array {
      return endMap.has(this) ? endMap.get(this)! : this;
    }

    each(callback: (this: Element, index: number, elm: Element) => void): void {
      this.htmls.forEach((elm, index) => callback.apply(elm, [index, elm]));
    }

    closest(selector: string): $Array | null {
      const result = this.query(((elm: Element) => elm.closest(selector)) as unknown as string);
      return result ? ((this.constructor as unknown as typeof $Array).from(result) as unknown as $Array) : null;
    }
    parent(): $Array {
      const found = this.independency.filter((e) => e.parentNode).map((e) => e.parentNode);
      return found as unknown as $Array;
    }
    parents(selector?: string): $Array {
      const h = (selector ? this.parent().closest(selector) : this.parent()) as $Array;
      const found = [h];
      let current: $Array | null = h;
      while (current && current.length) {
        current = selector ? current.parent().closest(selector) : current.parent();
        found.push(current as $Array);
      }
      return ($Array as unknown as { from: (items: unknown) => $Array }).from(h.flat());
    }

    toggleClass(className: string, v?: boolean): this {
      if (typeof v === 'boolean') {
        return v ? this.addClass(className) : this.removeClass(className);
      }
      const classes = className.trim().split(/\s+/);
      const htmls = this.getHtmls();
      for (const elm of htmls) {
        for (const c of classes) {
          elm.classList.toggle(c, v);
        }
      }
      return this;
    }

    addClass(className: string): this {
      const names = className.split(/\s+/);
      const htmls = this.getHtmls();
      for (const elm of htmls) {
        elm.classList.add(...names);
      }
      return this;
    }

    removeClass(className: string): this {
      const names = className.split(/\s+/);
      const htmls = this.getHtmls();
      for (const elm of htmls) {
        elm.classList.remove(...names);
      }
      return this;
    }

    hasClass(className: string): boolean {
      const names = className.trim().split(/[\s]+/);
      const htmls = this.htmls;
      return names.every((name) => htmls.every((elm) => elm.classList.contains(name)));
    }

    _css(props: Map<string, unknown> | Record<string, unknown>): this {
      const htmls = this.getHtmls();

      for (const element of htmls) {
        const style = element.style;
        const map = (element as unknown as { attributeStyleMap: Map<string, unknown> }).attributeStyleMap;
        for (const [k, val] of props instanceof Map ? props : Object.entries(props)) {
          let key: string = k;
          let value: unknown = val;
          const isNumber = /^[0-9+.]+$/.test(value as string);
          if (isNumber && /(width|height|top|left)$/i.test(key)) {
            value = HAS_CSSTOM ? (CSS as unknown as { px: (v: unknown) => unknown }).px(value) : `${value as string}px`;
          }
          try {
            if (HAS_CSSTOM && isStyleValue(value)) {
              key = toSnake(key);
              map.set(key, value);
            } else {
              key = toCamel(key);
              (style as unknown as Record<string, unknown>)[key] = value;
            }
          } catch (err) {
            console.warn('uQuery.css fail', { key, val, isNumber });
          }
        }
      }
      return this;
    }

    css(key: string | Record<string, unknown>, val: unknown = UNDEF): unknown {
      if (typeof key === 'string') {
        if (val !== UNDEF) {
          return this._css({ [key]: val });
        } else {
          const element = this.firstElement;
          if (HAS_CSSTOM) {
            return (element as unknown as { attributeStyleMap: Map<string, unknown> }).attributeStyleMap.get(
              toSnake(key)
            );
          } else {
            return ((element as HTMLElement).style as unknown as Record<string, unknown>)[toCamel(key)];
          }
        }
      } else if (key !== null && typeof key === 'object') {
        return this._css(key);
      }
      return this;
    }

    on(eventName: string, callback: UQueryCallback, options?: AddEventListenerOptions | boolean): this {
      if (typeof callback !== 'function') {
        return this;
      }
      eventName = eventName.trim();
      const elementEventName = eventName.split('.')[0] as string;
      // window.console.log({eventName, callback, options}, this.concat());
      for (const element of this.filter(isEventTarget)) {
        const elementEvents = elementsEventMap.get(element) || new Map<string, Set<UQueryCallback>>();
        const listenerSet = elementEvents.get(eventName) || new Set<UQueryCallback>();
        elementEvents.set(eventName, listenerSet);
        elementsEventMap.set(element, elementEvents);

        if (!listenerSet.has(callback)) {
          listenerSet.add(callback);
          element.addEventListener(elementEventName, callback, options);
        }
      }
      return this;
    }
    click(...args: unknown[]): this {
      if (args.length) {
        const f = this.firstElement;
        if (f) {
          f.click();
        }
        return this;
      }
      const callback = args.find((a): a is UQueryCallback => typeof a === 'function');
      const data = args[0] !== callback ? args[0] : null;
      return this.on('click', (e) => {
        const ev = e as { data?: Record<string, unknown> };
        if (data) {
          ev.data = ev.data || {};
          Object.assign(ev.data, data as Record<string, unknown>);
        }
        callback!(e);
      });
    }
    dblclick(...args: unknown[]): this {
      const callback = args.find((a): a is UQueryCallback => typeof a === 'function');
      const data = args[0] !== callback ? args[0] : null;
      return this.on('dblclick', (e) => {
        const ev = e as { data?: Record<string, unknown> };
        if (data) {
          ev.data = ev.data || {};
          Object.assign(ev.data, data as Record<string, unknown>);
        }
        callback!(e);
      });
    }

    off(eventName: string | typeof UNDEF = UNDEF, callback: UQueryCallback | typeof UNDEF = UNDEF): this {
      if (eventName === UNDEF) {
        for (const element of this.filter(isEventTarget)) {
          const eventListenerMap = elementsEventMap.get(element) || emptyMap;
          for (const [eventName, listenerSet] of eventListenerMap) {
            for (const listener of listenerSet) {
              element.removeEventListener(eventName, listener);
            }
            listenerSet.clear();
          }
          eventListenerMap.clear();
          elementsEventMap.delete(element);
        }
        return this;
      }

      eventName = eventName.trim();
      const [elementEventName, eventKey] = eventName.split('.');
      if (callback === UNDEF) {
        for (const element of this.filter(isEventTarget)) {
          const eventListenerMap = elementsEventMap.get(element) || emptyMap;
          const listenerSet = eventListenerMap.get(eventName) || emptySet;
          for (const listener of listenerSet) {
            element.removeEventListener(elementEventName as string, listener);
          }

          listenerSet.clear();
          eventListenerMap.delete(eventName);

          for (const [key] of eventListenerMap) {
            if (
              (!eventKey && key.startsWith(`${elementEventName}.`)) ||
              (!elementEventName && key.endsWith(`.${eventKey}`))
            ) {
              this.off(key);
            }
          }
        }
        return this;
      }

      for (const element of this.filter(isEventTarget)) {
        const eventListenerMap = elementsEventMap.get(element) || new Map<string, Set<UQueryCallback>>();
        eventListenerMap.set(eventName, eventListenerMap.get(eventName) || new Set<UQueryCallback>());
        for (const [key, listenerSet] of eventListenerMap) {
          if (key !== eventName && !key.startsWith(`${elementEventName}.`)) {
            continue;
          }
          if (!listenerSet.has(callback)) {
            continue;
          }
          listenerSet.delete(callback);
          element.removeEventListener(elementEventName as string, callback);
        }
      }

      return this;
    }

    _setAttribute(key: string, val: unknown = UNDEF): this {
      const htmls = this.getHtmls();
      if (val === null || val === '' || val === UNDEF) {
        for (const e of htmls) {
          e.removeAttribute(key);
        }
      } else {
        for (const e of htmls) {
          e.setAttribute(key, val as string);
        }
      }
      return this;
    }

    setAttribute(key: string | Record<string, unknown>, val: unknown = UNDEF): this {
      if (typeof key === 'string') {
        return this._setAttribute(key, val);
      }
      for (const k of Object.keys(key)) {
        this._setAttribute(k, key[k]);
      }
      return this;
    }

    attr(key: string, val: unknown = UNDEF): unknown {
      if (val !== UNDEF || typeof key === 'object') {
        return this.setAttribute(key, val);
      }
      const found = this.find((e: Node) => (e as Element).hasAttribute && (e as Element).hasAttribute(key));
      return found ? (found as Element).getAttribute(key) : null;
    }

    data(key: string | Record<string, unknown>, val: unknown = UNDEF): unknown {
      if (typeof key === 'object') {
        for (const k of Object.keys(key)) {
          this.data(k, JSON.stringify(key[k]));
        }
        return this;
      }
      key = `data-${toSnake(key)}`;
      if (val !== UNDEF) {
        return this.setAttribute(key, JSON.stringify(val));
      }
      const found = this.find((e: Node) => (e as Element).hasAttribute && (e as Element).hasAttribute(key));
      const attr = (found as Element).getAttribute(key);
      try {
        return JSON.parse(attr as string);
      } catch (e) {
        return attr;
      }
    }

    prop(key: string | Record<string, unknown>, val: unknown = UNDEF): unknown {
      if (typeof key === 'object') {
        for (const k of Object.keys(key)) {
          this.prop(k, key[k]);
        }
        return this;
      } else if (val !== UNDEF) {
        for (const elm of this) {
          (elm as unknown as Record<string, unknown>)[key] = val;
        }
        return this;
      } else {
        const found = this.find((e: Node) => Object.prototype.hasOwnProperty.call(e, key));
        return found ? (found as unknown as Record<string, unknown>)[key] : null;
      }
    }

    val(v: unknown = UNDEF): unknown {
      const htmls = this.getHtmls();
      for (const elm of htmls) {
        if (!('value' in elm)) {
          continue;
        }
        if (v === UNDEF) {
          return (elm as unknown as { value?: unknown }).value;
        } else {
          (elm as unknown as { value?: unknown }).value = v;
        }
      }
      return v === UNDEF ? '' : this;
    }

    hasFocus(): boolean {
      return this.some((e) => e === document.activeElement);
    }
    focus(): this {
      const fe = this.firstElement;
      if (fe) {
        fe.focus();
      }
      return this;
    }
    blur(): this {
      const htmls = this.getHtmls();
      for (const elm of htmls) {
        if (elm === document.activeElement) {
          elm.blur();
        }
      }
      return this;
    }

    insert(where: string, ...args: unknown[]): this {
      const fn = this.firstNode;
      if (!fn) {
        return this;
      }
      if (args.every((a) => typeof a === 'string' || isNode(a))) {
        ((fn as unknown as Record<string, (...args: unknown[]) => unknown>)[where] as (...args: unknown[]) => unknown)(
          ...args
        );
      } else {
        const $d = uQuery(...(args as [unknown, ...unknown[]]));
        if ($d instanceof $Array) {
          (
            (fn as unknown as Record<string, (...args: unknown[]) => unknown>)[where] as (...args: unknown[]) => unknown
          )(...$d.filter((a) => typeof a === 'string' || isNode(a)));
        }
      }
      return this;
    }
    append(...args: unknown[]): this {
      return this.insert('append', ...args);
    }
    appendChild(...args: unknown[]): this {
      return this.append(...args);
    }
    prepend(...args: unknown[]): this {
      return this.insert('prepend', ...args);
    }
    after(...args: unknown[]): this {
      return this.insert('after', ...args);
    }
    before(...args: unknown[]): this {
      return this.insert('before', ...args);
    }

    text(text: string | typeof UNDEF = UNDEF): unknown {
      const fn = this.firstNode;
      if (text !== UNDEF) {
        if (fn) {
          (fn as unknown as Record<string, unknown>).textContent = text;
        }
      } else {
        return this.htmls.find((e) => e.textContent) || '';
      }
      return this;
    }

    appendTo(target: string | Element | ShadowRoot): this {
      if (typeof target === 'string') {
        const e = document.querySelector(target);
        if (e) {
          e.append(...this.nodes);
        }
      } else {
        target.append(...this.nodes);
      }
      return this;
    }
    prependTo(target: string | Element | ShadowRoot): this {
      if (typeof target === 'string') {
        const e = document.querySelector(target);
        if (e) {
          e.prepend(...this.nodes);
        }
      } else {
        target.prepend(...this.nodes);
      }
      return this;
    }

    remove(): this {
      for (const elm of this) {
        (elm as Element).remove?.();
      }
      return this;
    }

    show(): this {
      for (const elm of this) {
        (elm as HTMLElement).hidden = false;
      }
      return this;
    }

    hide(): this {
      for (const elm of this) {
        (elm as HTMLElement).hidden = true;
      }
      return this;
    }

    shadow(...args: unknown[]): $Array {
      const elm = this.firstElement;
      if (!elm) {
        return this;
      }
      if (args.length === 0) {
        if (!elm.shadowRoot) {
          elm.attachShadow({ mode: 'open' });
        }
        return ($Array as unknown as (children: unknown) => $Array)(elm.shadowRoot);
      }
      const $d = uQuery(...(args as [unknown, ...unknown[]]));
      if ($d instanceof $Array) {
        if (!elm.shadowRoot) {
          elm.attachShadow({ mode: 'open' });
        }
        $d.appendTo(elm.shadowRoot!);
        return $d;
      }
      return this;
    }
  }

  const uQuery = (q: unknown, ...args: unknown[]): $Array => {
    const isTL = isTagLiteral(q, ...args);

    if (isTL || typeof q === 'string') {
      const query = isTL ? String.raw(q, ...args) : q;
      return query.startsWith('<')
        ? new $Array(createDom(q, ...args).children)
        : new $Array(document.querySelectorAll(query));
    } else if (q instanceof Window) {
      return $Array.from(q.document as unknown as Iterable<Node>) as unknown as $Array;
    } else if (q instanceof $Array) {
      return q.concat() as unknown as $Array;
    } else if ((q as Record<symbol, unknown>)[Symbol.iterator]) {
      return $Array.from(q as Iterable<Node>) as unknown as $Array;
    } else if (isDocument(q)) {
      return $Array.from(q.documentElement as unknown as Iterable<Node>) as unknown as $Array;
    } else {
      // console.warn('unknown type q', q);/
      return new $Array(q);
    }
  };

  Object.assign(uQuery, {
    $Array,
    createDom,
    html: (...args: unknown[]) => new $Array(createDom(...(args as [unknown, ...unknown[]])).children),
    isTL: isTagLiteral,
    ready: (func: () => void = () => {}) => emitter.promise('domReady', waitForDom).then(() => func()),
    complete: (func: () => void = () => {}) => emitter.promise('domComplete', waitForComplete).then(() => func()),
    each: (arr: ArrayLike<unknown>, callback: (this: unknown, index: number, value: unknown) => void) =>
      Array.from(arr).forEach((a, i) => callback.apply(a, [i, a])),
    proxy: (func: (...args: unknown[]) => unknown, ...args: unknown[]) =>
      func.bind(...(args as [unknown, ...unknown[]])),
    fn: {},
  } satisfies UQueryStatics);

  return uQuery;
})();
const uq = uQuery;
//===END===
const $ = uQuery;
export { uQuery, $, uq };
export type { UQueryArray, UQueryFunction };
