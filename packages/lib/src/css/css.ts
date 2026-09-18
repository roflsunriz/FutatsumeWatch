type CssTask = [element: Element, prop: string, value: unknown];

interface CssRegisterPropertyDefinition {
  name: string;
  syntax: string;
  initialValue: string;
  inherits?: boolean;
  window?: Window;
}

interface CssTypedOM {
  number?: (value: number) => unknown;
  s?: (value: number) => unknown;
  ms?: (value: number) => unknown;
  pt?: (value: number) => unknown;
  px?: (value: number) => unknown;
  percent?: (value: number) => unknown;
  vh?: (value: number) => unknown;
  vw?: (value: number) => unknown;
  paintWorklet?: { addModule: (url: string) => Promise<unknown> };
}

interface CssValueHost {
  CSSStyleValue?: { parse: (prop: string, value: string) => unknown };
  CSSKeywordValue?: new (value: string) => unknown;
}

interface CssAddStyleOptions {
  id?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

interface CssUtil {
  addStyle: (
    styles: { toString: () => string },
    option?: string | CssAddStyleOptions,
    document?: Document
  ) => HTMLStyleElement;
  registerProps: (...args: CssRegisterPropertyDefinition[]) => void;
  setProps: (...tasks: CssTask[]) => Promise<unknown>;
  addModule: (func: (...args: unknown[]) => unknown, options?: { config?: unknown }) => Promise<boolean | undefined>;
  escape: (value: string) => string;
  number: (value: number) => unknown;
  s: (value: number) => unknown;
  ms: (value: number) => unknown;
  pt: (value: number) => unknown;
  px: (value: number) => unknown;
  percent: (value: number) => unknown;
  vh: (value: number) => unknown;
  vw: (value: number) => unknown;
  trans: (value: string) => unknown;
  word: (value: string) => unknown;
  image: (value: string) => unknown;
}

// const PRODUCT = 'Zenza';
import { global } from '../../../../src/ZenzaWatchIndex';
import { bounce, throttle } from '../infra/bounce';
//===BEGIN===
/**
 * @typedef registerPropertyDefinition
 * @property {string} name
 * @property {string} syntax
 * @property {string} initialValue
 * @property {boolean?} inherits
 */

const css: CssUtil = ((): CssUtil => {
  const setPropsTask: CssTask[] = [];
  const typedCSS = CSS as unknown as CssTypedOM;
  const cssValueHost = self as unknown as CssValueHost;
  // let applyCount = 0;
  const applySetProps = throttle.raf(() => {
    const tasks = setPropsTask.concat();
    setPropsTask.length = 0;
    // performance.mark(`applySetProps:${applyCount}`);
    // if (applyCount > 0) {
    //   performance.measure(
    //     'applySetProps',
    //     `applySetProps:${applyCount - 1}`, `applySetProps:${applyCount}`);
    // }
    // applyCount++;
    for (const [element, prop, value] of tasks) {
      try {
        (element as HTMLElement).style.setProperty(prop, value as string);
      } catch (error) {
        console.warn('element.style.setProperty fail', { element, prop, value, error });
      }
    }
  });
  const css: CssUtil = {
    addStyle: (styles, option, document = window.document) => {
      const elm = Object.assign(
        document.createElement('style'),
        {
          type: 'text/css',
        },
        typeof option === 'string' ? { id: option } : option || {}
      );
      if (typeof option === 'string') {
        elm.id = option;
      } else if (option) {
        Object.assign(elm, option);
      }
      elm.classList.add((global as { PRODUCT: string }).PRODUCT);
      elm.append(styles.toString());
      (document.head || document.body || document.documentElement).append(elm);
      elm.disabled = (typeof option === 'object' && option ? option.disabled : undefined) as boolean;
      elm.dataset.switch = elm.disabled ? 'off' : 'on';
      return elm;
    },
    /**
     * @param  {...registerPropertyDefinition} definitions
     */
    registerProps(...args) {
      if (!CSS || !('registerProperty' in CSS)) {
        return;
      }
      /** @type registerPropertyDefinition */
      for (const definition of args) {
        try {
          (
            (definition.window || window) as unknown as { CSS: { registerProperty: (def: unknown) => void } }
          ).CSS.registerProperty(definition);
        } catch (err) {
          console.warn('CSS.registerProperty fail', definition, err);
        }
      }
    },
    /**
     * @param {...{[{Element} element, {string} property, {any} value]}} tasks
     */
    setProps(...tasks) {
      setPropsTask.push(...tasks);
      return setPropsTask.length ? applySetProps() : Promise.resolve();
    },
    addModule: async function (
      this: { set: WeakSet<object> },
      func: (...args: unknown[]) => unknown,
      options: { config?: unknown } = {}
    ) {
      if (!CSS || !('paintWorklet' in CSS) || this.set.has(func)) {
        return;
      }
      this.set.add(func);
      const src = `(${func.toString()})(
        this,
        registerPaint,
        ${JSON.stringify(options.config || {}, null, 2)}
        );`;
      const blob = new Blob([src], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      await typedCSS.paintWorklet!.addModule(url).then(() => URL.revokeObjectURL(url));
      return true;
    }.bind({ set: new WeakSet<object>() }),
    escape: (value: string) => (CSS.escape ? CSS.escape(value) : value.replace(/([.#()[\]])/g, '\\$1')),
    number: (value: number) => (typedCSS.number ? typedCSS.number(value) : value),
    s: (value: number) => (typedCSS.s ? typedCSS.s(value) : `${value}s`),
    ms: (value: number) => (typedCSS.ms ? typedCSS.ms(value) : `${value}ms`),
    pt: (value: number) => (typedCSS.pt ? typedCSS.pt(value) : `${value}pt`),
    px: (value: number) => (typedCSS.px ? typedCSS.px(value) : `${value}px`),
    percent: (value: number) => (typedCSS.percent ? typedCSS.percent(value) : `${value}%`),
    vh: (value: number) => (typedCSS.vh ? typedCSS.vh(value) : `${value}vh`),
    vw: (value: number) => (typedCSS.vw ? typedCSS.vw(value) : `${value}vw`),
    trans: (value: string) =>
      cssValueHost.CSSStyleValue ? cssValueHost.CSSStyleValue.parse('transform', value) : value,
    word: (value: string) => (cssValueHost.CSSKeywordValue ? new cssValueHost.CSSKeywordValue(value) : value),
    image: (value: string) =>
      cssValueHost.CSSStyleValue ? cssValueHost.CSSStyleValue.parse('background-image', value) : value,
  };
  return css;
})();

const cssUtil = css;
//===END===
export { css, cssUtil };
export type { CssUtil, CssTask };
