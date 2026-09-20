interface UQueryArray {
  [index: number]: Element;
  length: number;
  independency: Element[];
  query(selector: string, ...args: unknown[]): UQueryArray;
  find(selector: string, ...args: unknown[]): UQueryArray;
  filter(callback: (elm: Element) => boolean): UQueryArray;
  forEach(callback: (elm: Element, index: number) => void): void;
  map<U>(callback: (elm: Element, index: number) => U): U[];
  on(event: string, listener: (...args: never[]) => void): UQueryArray;
  off(event: string, listener: (...args: never[]) => void): UQueryArray;
  nodeWalk(filter?: number): Node[];
  dump(): UQueryArray;
  readonly a: UQueryPropFn;
  readonly i: UQueryPropFn;
  readonly q: UQueryPropFn;
  readonly v: UQueryPropFn;
  readonly t: UQueryPropFn;
  readonly tx: UQueryPropFn;
  [Symbol.iterator](): Iterator<Element>;
  [key: string]: unknown;
}

interface UQueryPropFn {
  (...args: unknown[]): unknown;
}

interface UQueryStatic {
  (query: unknown, ...args: unknown[]): UQueryArray;
  $Array: {
    prototype: UQueryArray;
    from<T>(items: ArrayLike<T> | Iterable<T>): UQueryArray;
  };
  isTL(query: unknown, ...args: unknown[]): boolean;
  fn: Record<string, unknown>;
}

interface UuFunction {
  (query: unknown, ...args: unknown[]): UQueryArray;
}

interface UQueryUtil {
  $: UQueryStatic;
  nodeWalk(node: Node, filter?: number): Node[];
  groupLog(
    list: UQueryArray | unknown[],
    template?: {
      title?: string;
      callback?: (item: unknown) => unknown[];
    }
  ): void;
  groupDump(
    obj: Record<string, unknown>,
    template?: {
      title?: string;
      callback?: (key: string, item: unknown) => unknown[];
    }
  ): void;
  escapeRegs(text: string): string;
  propFunc(
    func: (name?: string) => unknown,
    options?: {
      self?: unknown;
      callback?: (prop: string) => unknown;
      ownKeys?: () => string[];
    }
  ): UQueryPropFn;
  [key: string]: unknown;
}

import { AntiPrototypeJs } from '../packages/lib/src/infra/AntiPrototype-js';
import { uQuery as nativeUQuery } from '../packages/lib/src/uQuery';
const uQuery = nativeUQuery as unknown as UQueryStatic;
void AntiPrototypeJs().then(() => {
  // Promise.resolve().then(() => {
  const PRODUCT = 'uQuery';
  const util = {} as UQueryUtil;
  const Array = (window as unknown as { PureArray?: typeof globalThis.Array }).PureArray || window.Array;
  let gname = (window.localStorage['uu-global-name'] || 'uu') as string;
  gname = (window as unknown as Record<string, unknown>)[gname] ? '$uu' : gname;
  // const console = {};
  // for (const k of Object.keys(window.console)) {
  //   if (typeof window.console[k] !== 'function') {continue;}
  //   console[k] = window.console[k].bind(window.console);
  // }
  // console.log = window.console.log.bind(window.console, '%c[LOG]', 'background: cyan');

  const $: UQueryStatic = (util.$ = uQuery);
  uQuery.fn.uQuery = VER;

  const docFunc = (
    text: string,
    func?: ((...args: never[]) => unknown) | Record<string, unknown>
  ): UuFunction & Record<string, unknown> => {
    func = func || (() => {});
    if (typeof func !== 'function') {
      func = Object.assign(() => {}, func);
    }
    text = text
      .trim()
      .split(/\n/)
      .map((line) => line.replace(/^[\s]*?>/g, ' '))
      .join('\n');
    func.toString = () => text;
    return func as unknown as UuFunction & Record<string, unknown>;
  };

  util.nodeWalk = (node: Node, filter: number = NodeFilter.SHOW_ELEMENT): Node[] => {
    const walker = document.createTreeWalker(node, filter, null);
    const nodes: Node[] = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    return nodes;
  };
  util.groupLog = (
    list: UQueryArray | unknown[],
    template: {
      title?: string;
      callback?: (item: unknown) => unknown[];
    } = {}
  ): void => {
    if (!list.forEach) {
      list = Array.from(list);
    }
    console.groupCollapsed(template.title || '');
    list.forEach((item) => {
      console.log(...(template.callback ? template.callback(item) : [item]));
    });
    console.groupEnd();
  };

  util.groupDump = (
    obj: Record<string, unknown>,
    template: {
      title?: string;
      callback?: (key: string, item: unknown) => unknown[];
    } = {}
  ): void => {
    console.groupCollapsed(template.title || '');
    Object.keys(obj).forEach((key) => {
      const item = obj[key];
      console.log(...(template.callback ? template.callback(key, item) : [key, ': ', item]));
    });
    console.groupEnd();
  };

  util.escapeRegs = (text: string): string => {
    const match = /[\\^$.*+?()[\]{}|]/g;
    return text.replace(match, '\\$&');
  };

  util.propFunc = (
    func: (name?: string) => unknown,
    {
      self,
      callback,
      ownKeys,
    }: {
      self?: unknown;
      callback?: (prop: string) => unknown;
      ownKeys?: () => string[];
    } = {}
  ): UQueryPropFn => {
    const callbackFn: (prop: string) => unknown = callback || func;
    self = self || null;
    const handler: ProxyHandler<(name?: string) => unknown> = {
      get: function (target, prop) {
        return callbackFn.apply(self, [prop as string]);
      },
    };
    if (ownKeys) {
      handler.ownKeys = function () {
        return ownKeys();
      };
    }
    return new Proxy(func, handler) as unknown as UQueryPropFn;
  };

  Object.assign(util.$.$Array.prototype, {
    nodeWalk: function (this: UQueryArray, filter: number = NodeFilter.SHOW_ELEMENT): Node[] {
      const target = this.independency;
      return [...new Set(target.map((elm) => util.nodeWalk(elm, filter)).flat())];
    },
    dump: function (this: UQueryArray): UQueryArray {
      const callback = (elm: unknown): unknown[] => [
        '%c%s%c%s%c%s',
        'color: #909;',
        (elm as Element).tagName || (elm as Element).nodeName,
        'color: #009;',
        (elm as HTMLElement).id ? `#${(elm as HTMLElement).id}` : '',
        'color: #900;',
        (elm as { className?: unknown }).className ? '.' + Array.from((elm as Element).classList).join('.') : '',
        '\n',
        elm,
      ];
      if (this.length <= 3) {
        this.forEach((elm) => console.log(...callback(elm)));
      }
      util.groupLog(this, { title: `${this.length} Elements`, callback });
      return this;
    },
  });

  Object.defineProperties(util.$.$Array.prototype, {
    a: {
      get: function (this: UQueryArray): UQueryPropFn {
        return util.propFunc(
          function (this: UQueryArray, name = '') {
            return this.query(`[${name}]`);
          },
          {
            self: this,
          }
        );
      },
    },
    i: {
      get: function (this: UQueryArray): UQueryPropFn {
        return util.propFunc(
          function (this: UQueryArray, name = '') {
            name = name.toString().trim();
            if (!name) {
              return this.query('[id]');
            }
            const result = this.query(`#${name}`);
            if (result.length) {
              return new (this.constructor as unknown as new (items: UQueryArray) => UQueryArray)(result);
            }
            return this.query(`[id*="${name}" i]`);
          },
          {
            self: this,
            // ownKeys: function() { return UniqNames.id; }
          }
        );
      },
    },
    q: {
      get: function (this: UQueryArray): UQueryPropFn {
        return util.propFunc(
          function (this: UQueryArray, query = '') {
            query = query.toString().trim();
            return this.query(query);
          },
          { self: this }
        );
      },
    },
    v: {
      get: function (this: UQueryArray): UQueryPropFn {
        return util.propFunc(
          function (this: UQueryArray, name = '') {
            if (!name.toString()) {
              return this.query('*');
            }
            return this.query(`[class*="${name}" i], [id*="${name}" i], ${name}`);
          },
          {
            self: this,
            // ownKeys: function() { return UniqNames.vprops; }
          }
        );
      },
    },
    t: {
      get: function (this: UQueryArray): UQueryPropFn {
        return util.propFunc(
          function (this: UQueryArray, name = '') {
            name = name.toString().toUpperCase();
            return this.query('*').filter((elm) => elm.tagName === name);
          },
          {
            self: this,
            // ownKeys: function() { return UniqNames.tag; }
          }
        );
      },
    },
    tx: {
      get: function (this: UQueryArray): UQueryPropFn {
        return util.propFunc(
          function (this: UQueryArray, text = '') {
            const textNodes = this.nodeWalk(NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
            const reg = new RegExp(`${util.escapeRegs(text.toString())}`, 'i');
            return util.$(textNodes.filter((node) => reg.test(node.textContent as string)));
          },
          { self: this }
        );
      },
    },
  });

  const $doc = util.$(document.documentElement);
  const uu = docFunc(
    `
  ${gname}\`hoge\`
    id、class名、タグ名にhogeを含む$Arrayを返す。 大小文字の区別なし。
    とりあえず名前が曖昧なやつをざっくり探す時に。
    `,
    (q: unknown, ...args: unknown[]): UQueryArray => {
      const isTL = $.isTL(q, ...args);
      const query = isTL ? String.raw(q as TemplateStringsArray, ...args) : q;
      if (typeof query === 'string') {
        if (isTL && query.startsWith('<')) {
          return $(q, ...args);
        } else if (/[[.#<>:()+~]/.test(query)) {
          return $doc.find(q as string, ...args);
        } else {
          return $doc.v(query) as UQueryArray;
        }
      } else {
        return util.$(q);
      }
    }
  );

  const noop = (): void => {
    /*          ( ˘ω˘ ) ｽﾔｧ…          */
  };
  const con = (...args: unknown[]): void => /* 呼んだ？ */ console.log(...args);
  const evlog = (e: Event): void =>
    /*   ＜●＞ ＜●＞   */
    console.log('%cevent: %s', 'font-weight: bold;', e.type || 'unknown', e);

  Object.assign(uu, {
    profile: docFunc(`計測系のやつ`, {
      timer: docFunc(
        `
        /**
         * console.profile をタイマー実効するやつ
         * @param {number} msec プロファイルを取る時間
         * @param {number} delay 開始までの時間
         * @param {string?} title
         */`,
        (msec: number = 10000, delay: number = 3000, title: string | null = null): void => {
          console.log(`${delay}ms 後から ${msec}ms 間プロファイル開始`);
          title = title || `${new Date().toLocaleString()}`;
          setTimeout(() => console.profile(title), delay);
          setTimeout(() => console.profileEnd(title), msec + delay);
        }
      ),
      func: docFunc(
        `
        /**
         * パフォーマンス計測用に関数をラップするやつ
         * @param {function} func
         * @param {object?} thisObj
         * @param {string?} title
         * @returns {function}
         */`,
        (
          func: (...args: unknown[]) => unknown,
          thisObj: unknown = null,
          title: string | null = null
        ): ((...args: unknown[]) => unknown) => {
          if (thisObj) {
            func = func.bind(thisObj);
          }
          title = title || `profile: ${(func as { name?: string }).name || 'function'}`;
          return (...args: unknown[]): unknown => {
            console.profile(title);
            const result = func(...args);
            console.profileEnd(title);
            return result;
          };
        }
      ),
    }),
    watch: docFunc(`監視系のやつ`, {
      event: docFunc(
        `
        /**
        * element の eventName をウォッチしてコンソールに吐くやつ.
        * 解除は eventOff
        * @param {Element} element
        * @param {string} eventName
        */`,
        (element: Element, eventName: string): UQueryArray => uu(element).on(eventName, evlog)
      ),
      eventEnd: (element: Element, eventName: string): UQueryArray => uu(element).off(eventName, evlog),
    }),
    dump: docFunc(`cookie や localStorage の中身ダンプしてくれるやつ`, {
      cookie(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        const cookies = document.cookie.split(';').sort();
        cookies.forEach((cookie) => {
          const [key, val] = cookie.split('=').map((k) => k.trim());
          result[decodeURIComponent(key as string)] = decodeURIComponent(val as string);
        });
        console.table(result);
        return result;
      },
      localStorage(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(localStorage).sort()) {
          try {
            result[key] = JSON.parse(localStorage[key] as string);
          } catch {
            result[key] = localStorage[key];
          }
        }
        console.table(result);
        return result;
      },
      sessionStorage(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(sessionStorage).sort()) {
          try {
            result[key] = JSON.parse(sessionStorage[key] as string);
          } catch {
            result[key] = sessionStorage[key];
          }
        }
        console.table(result);
        return result;
      },
    }),
    $: util.$,
    d: $doc,
    a: util.propFunc(function (...args: unknown[]): unknown {
      return $doc.a(...args);
    }),
    i: util.propFunc(function (...args: unknown[]): unknown {
      return $doc.i(...args);
    }),
    q: util.propFunc(function (...args: unknown[]): unknown {
      return $doc.q(...args);
    }),
    v: util.propFunc(function (...args: unknown[]): unknown {
      return $doc.v(...args);
    }),
    t: util.propFunc(function (...args: unknown[]): unknown {
      return $doc.t(...args);
    }),
    tx: util.propFunc(function (...args: unknown[]): unknown {
      return $doc.tx(...args);
    }),
    noop,
    con,
  });

  (window as unknown as Record<string, unknown>)[gname] = uu;

  /* eslint-disable no-irregular-whitespace */

  console.log(
    `%c
  　　 _,,....,,_　 ＿人人人人人人人人人人人人人人人＿
  -''":::::::::::::｀''＞　　　${PRODUCT}していってね！！！　　　＜
  ヽ:::::::::::::::::::::￣^Ｙ^Ｙ^Ｙ^Ｙ^Ｙ^Ｙ^Ｙ^Ｙ^Ｙ^Ｙ^Ｙ^Ｙ^Ｙ^Ｙ^￣
  　|::::::;ノ´￣＼:::::::::::＼_,. -‐ｧ　　　　　＿_　　 _____　　 ＿_____
  　|::::ﾉ　　　ヽ､ヽr-r'"´　　（.__　　　　,´　_,, '-´￣￣｀-ゝ 、_ イ、
  _,.!イ_　　_,.ﾍｰｧ'二ﾊ二ヽ､へ,_7　　　'r ´　　　　　　　　　　ヽ、ﾝ、
  ::::::rｰ''7ｺ-‐'"´　 　 ;　 ',　｀ヽ/｀7　,'＝=─-　　　 　 -─=＝',　i
  r-'ｧ'"´/　 /!　ﾊ 　ハ　 !　　iヾ_ﾉ　i　ｲ　iゝ、ｲ人レ／_ルヽｲ i　|
  !イ´ ,' |　/__,.!/　V　､!__ﾊ　 ,'　,ゝ　ﾚﾘｲi (ﾋ_] 　　 　ﾋ_ﾝ ).| .|、i .||
  \`! 　!/ﾚi'　(ﾋ_] 　　 　ﾋ_ﾝ ﾚ'i　ﾉ　　　!Y!""　 ,＿__, 　 "" 「 !ﾉ i　|
  ,'　 ﾉ 　 !'"　 　 ,＿__,　 "' i .ﾚ'　　　　L.',.　 　ヽ _ﾝ　　　　L」 ﾉ| .|
  　（　　,ﾊ　　　　ヽ _ﾝ　 　人! 　　　　 | ||ヽ、　　　　　　 ,ｲ| ||ｲ| /
  ,.ﾍ,）､　　）＞,､ _____,　,.イ　 ハ　　　　レ ル｀ ー--─ ´ルﾚ　ﾚ´         v${VER}
  `,
    `
    font-size: 8px;
    font-family:
      'Mona','IPAMonaPGothic',
      'IPA モナー Pゴシック','MS PGothic AA',
      'MS PGothic','ＭＳ Ｐゴシック',sans-serif;
  `
  );

  // window.util = uu;
  if (!(window as unknown as { uQuery?: unknown }).uQuery) {
    (window as unknown as { uQuery?: unknown }).uQuery = uQuery;
  }
});
