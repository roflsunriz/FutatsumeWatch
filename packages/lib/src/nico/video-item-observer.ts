import { ThumbInfoLoader } from './thumb-info-loader';

type InviewHandler = (item: Element, watchId: string) => Promise<void>;

interface ObserveParams {
  query?: string;
  container?: Element | Document;
}

//===BEGIN===

const VideoItemObserver = (() => {
  let intersectionObserver: IntersectionObserver | undefined;
  const mutationMap = new WeakMap<object, MutationObserver>();
  const observedItems = new WeakSet<Element>();

  const onItemInview = async (item: Element, watchId: string): Promise<void> => {
    const result = await ThumbInfoLoader.load(watchId).catch(() => null);
    item.classList.remove('is-fetch-current');
    if (!result || result.status === 'fail' || result.code === 'DELETED') {
      if (result && result.code !== 'COMMUNITY') {
        /* 取得失敗時はクラス付与のみ行う */
      }
      item.classList.add('is-fetch-failed', result ? String(result.code) : 'is-no-data');
    } else {
      (item as HTMLElement).dataset.thumbInfo = JSON.stringify(result);
    }
  };

  const initIntersectionObserver = (onItemInview: InviewHandler) => {
    if (intersectionObserver) {
      return intersectionObserver;
    }
    const _onInview = (item: Element) => {
      item.classList.add('is-fetch-current');
      void onItemInview(item, (item as HTMLElement).dataset.videoId as string);
    };

    intersectionObserver = new window.IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry) => {
            const item = entry.target;
            intersectionObserver!.unobserve(item);
            _onInview(item);
          });
      },
      { rootMargin: '200px' }
    );

    return intersectionObserver;
  };

  const initMutationObserver = ({ query, container }: { query: string; container: Element | Document }) => {
    const mutationObserver = mutationMap.get(container);
    if (mutationObserver) {
      return mutationObserver;
    }
    const update = () => {
      const items = (container || document).querySelectorAll(query);
      for (const item of items) {
        if (
          observedItems.has(item) ||
          item.classList.contains('is-fetch-ignore') ||
          !/^(?:sm|nm|so|ss)[0-9]+$/.test((item as HTMLElement).dataset.videoId || '')
        ) {
          continue;
        }
        observedItems.add(item);
        item.classList.add('is-fetch-wait');
        intersectionObserver!.observe(item);
      }
    };
    const observer = new window.MutationObserver((mutations) => {
      const isAdded = mutations.find((mutation) => mutation.addedNodes && mutation.addedNodes.length > 0);
      if (isAdded) {
        update();
      }
    });

    observer.observe(container, { childList: true, characterData: false, attributes: false, subtree: true });
    mutationMap.set(container, observer);
    update();
    return observer;
  };

  const observe = ({ query, container }: ObserveParams = {}): void => {
    if (!window.IntersectionObserver || !window.MutationObserver) {
      return;
    }
    if (!container) {
      return;
    }
    query = query || 'futatsume-video-item';
    initIntersectionObserver(onItemInview);
    initMutationObserver({ query, container });
  };

  const unobserve = ({ container }: ObserveParams): void => {
    const mutationObserver = container !== undefined ? mutationMap.get(container) : undefined;
    if (!mutationObserver) {
      return;
    }
    mutationObserver.disconnect();
    if (container !== undefined) {
      mutationMap.delete(container);
    }
  };

  return { observe, unobserve };
})();
//===END===

export { VideoItemObserver };
