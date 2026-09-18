import { GateAPI } from '../packages/lib/src/nico/GateAPI';
import { AntiPrototypeJs } from '../packages/lib/src/infra/AntiPrototype-js';

type BootMonkey = (product: string, startPageQuery: string) => unknown;

interface BootWindowExtension {
  ZenzaWatch?: unknown;
  ZenzaLib?: { $: unknown };
  ZenzaJQuery?: unknown;
}

//===BEGIN===

const boot = async (monkey: BootMonkey, PRODUCT: string, START_PAGE_QUERY: string): Promise<void> => {
  if ((window as unknown as BootWindowExtension).ZenzaWatch) {
    return;
  }
  const document = window.document;
  const host = window.location.host || '';
  const name = window.name || '';
  const href = (location.href || '').replace(/#.*$/, '');
  if (href === 'https://www.nicovideo.jp/robots.txt' && name.startsWith(`nicovideoApi${PRODUCT}Loader`)) {
    GateAPI.nicovideo();
  } else if (host.match(/^smile-.*?\.nicovideo\.jp$/)) {
    GateAPI.smile();
  } else if (host === 'api.search.nicovideo.jp' && name.startsWith(`searchApi${PRODUCT}Loader`)) {
    GateAPI.search();
  } else if (host === 'ext.nicovideo.jp' && name.startsWith(`thumbInfo${PRODUCT}Loader`)) {
    void GateAPI.thumbInfo();
  } else if (host === 'ext.nicovideo.jp' && name.startsWith(`videoInfo${PRODUCT}Loader`)) {
    // @ts-expect-error GateAPI.exApi は上流3系統のいずれにも存在しない既知の欠落のため温存する
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    GateAPI.exApi();
  } else if (window === window.top) {
    await AntiPrototypeJs();
    if ((window as unknown as BootWindowExtension).ZenzaLib) {
      (window as unknown as BootWindowExtension).ZenzaJQuery = (window as unknown as BootWindowExtension).ZenzaLib!.$;
      const blob = new Blob(
        [
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `(${monkey})('${PRODUCT}', '${encodeURIComponent(START_PAGE_QUERY)}');`,
        ],
        { type: 'text/javascript' }
      );
      const src = URL.createObjectURL(blob);
      const handler = () => {
        URL.revokeObjectURL(src);
        script.remove();
      };
      const script = Object.assign(document.createElement('script'), {
        id: `${PRODUCT}Loader`,
        type: 'text/javascript',
        src,
        onload: handler,
        onerror: handler,
      });
      // script.append(
      //   `(${monkey})('${PRODUCT}', '${encodeURIComponent(START_PAGE_QUERY)}');`);
      document.head.append(script);
    }
    //@require ../packages/lib/src/nico/modernLazyload.js
  }
};

//===END===

export { boot };
