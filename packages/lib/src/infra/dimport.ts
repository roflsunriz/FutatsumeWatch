type DynamicImport = (url: string) => Promise<unknown>;

//===BEGIN===
const dimport: DynamicImport = (() => {
  try {
    // google先生の真似
    // 動的 import のフォールバック実装のため Function コンストラクタを使う
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory: unknown = new Function('u', 'return import(u)');
    return factory as DynamicImport;
  } catch {
    const map: Record<string, Promise<unknown>> = {};
    let count = 0;
    return (url: string): Promise<unknown> => {
      const cached = map[url];
      if (cached) {
        return cached;
      }
      try {
        const now = Date.now();
        const callbackName = `dimport_${now}_${count++}`;
        const loader = `
          import * as module${now} from "${url}";
          console.log('%cdynamic import from "${url}"',
            'font-weight: bold; background: #333; color: #ff9; display: block; padding: 4px; width: 100%;');
          window.${callbackName}(module${now});
          `.trim();
        window.console.time(`"${url}" import time`);
        const p = new Promise((ok, ng) => {
          const s = document.createElement('script');
          s.type = 'module';
          s.onerror = ng;
          s.append(loader);
          s.dataset.import = url;
          (window as unknown as Record<string, unknown>)[callbackName] = (module: unknown) => {
            window.console.timeEnd(`"${url}" import time`);
            ok(module);
            delete (window as unknown as Record<string, unknown>)[callbackName];
          };
          document.head.append(s);
        });
        map[url] = p;
        return p;
      } catch (e) {
        console.warn(url, e);
        // import 失敗理由をそのまま透過させるため Error 限定しない
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(e);
      }
    };
  }
})();

//===END===

export { dimport };
export type { DynamicImport };
