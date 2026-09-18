import { textUtil } from '../text/textUtil';
import { netUtil } from '../infra/netUtil';

export interface RssItemData {
  _format: string;
  id: string;
  uniq_id: string;
  title: string | null;
  length_seconds: number;
  num_res?: number;
  mylist_counter?: number;
  view_counter?: number;
  thumbnail_url: string;
  first_retrieve: string;
  description: string | null;
}

interface RankingParams {
  genre?: string;
  term?: string;
  tag?: string;
}

interface NetFetchInit {
  method?: string;
  headers?: Record<string, string | number>;
  credentials?: string;
  body?: string;
  mode?: string;
  timeout?: number;
  signal?: AbortSignal | null;
  [key: string]: unknown;
}

interface NetUtilLike {
  fetch: (url: string | URL, init?: NetFetchInit) => Promise<Response>;
  jsonp: (url: string) => Promise<unknown>;
}

//===BEGIN===
const NicoRssLoader = (() => {
  const parseItem = (item: Element): RssItemData => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- DOMのnull可能性はtsc(strict)で検査するための非null表明であり、ランタイムは消去により同一
    const id = item.querySelector('link')!.textContent!;
    const watchIdTarget = id.replace(/^.+\//, '');
    let watchId = watchIdTarget;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- DOMのnull可能性はtsc(strict)で検査するための非null表明であり、ランタイムは消去により同一
    const guid = item.querySelector('guid')!.textContent!;
    const desc = new DOMParser().parseFromString(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- DOMのnull可能性はtsc(strict)で検査するための非null表明であり、ランタイムは消去により同一
      item.querySelector('description')!.textContent!,
      'text/html'
    );
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- DOMのnull可能性はtsc(strict)で検査するための非null表明であり、ランタイムは消去により同一
    const [min, sec] = desc.querySelector('.nico-info-length')!.textContent!.split(':');
    const dtMatch = guid.match(/,([\d]+-[\d]+-[\d]+):/);
    if (dtMatch === null) {
      throw new Error('guid match not found');
    }
    const dt = dtMatch[1]!;
    const dateInfoEl = desc.querySelector('.nico-info-date');
    if (dateInfoEl === null) {
      throw new Error('nico-info-date element not found');
    }
    const dateText = dateInfoEl.textContent || '';
    const dateMatch = dateText.replace(/[：]/g, ':').match(/([\d]+:[\d]+:[\d]+)/);
    if (dateMatch === null) {
      throw new Error('nico-info-date match not found');
    }
    const tm = dateMatch[0];
    const date = new Date(`${dt} ${tm}`);
    const thumbnail_url = (desc.querySelector('.nico-thumbnail img') as HTMLImageElement).src;
    const idForWatch = watchIdTarget;
    const vm = thumbnail_url.match(/(\d+)\.(\d+)/);
    if (vm && /^\d+$/.test(idForWatch)) {
      watchId = `so${vm[1]!}`;
    }

    const result: RssItemData = {
      _format: 'nicorss',
      id: watchId,
      uniq_id: idForWatch,
      title: item.querySelector('title')!.textContent,
      length_seconds: Number(min) * 60 + Number(sec) * 1,
      thumbnail_url,
      first_retrieve: textUtil.dateToString(date),
      description: desc.querySelector('.nico-description')!.textContent,
    };
    if (desc.querySelector('.nico-info-total-res')) {
      Object.assign(result, {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- DOMのnull可能性はtsc(strict)で検査するための非null表明であり、ランタイムは消去により同一
        num_res: parseInt(desc.querySelector('.nico-info-total-res')!.textContent!.replace(/,/g, ''), 10),
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- DOMのnull可能性はtsc(strict)で検査するための非null表明であり、ランタイムは消去により同一
        mylist_counter: parseInt(desc.querySelector('.nico-info-total-mylist')!.textContent!.replace(/,/g, ''), 10),
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- DOMのnull可能性はtsc(strict)で検査するための非null表明であり、ランタイムは消去により同一
        view_counter: parseInt(desc.querySelector('.nico-info-total-view')!.textContent!.replace(/,/g, ''), 10),
      });
    }
    return result;
  };

  const load = async (url: string): Promise<RssItemData[]> => {
    const fetched: unknown = await (netUtil as unknown as NetUtilLike).fetch(url).then((r: Response) => r.text());
    const rssText = fetched as string;
    const xml = new DOMParser().parseFromString(rssText, 'application/xml');
    const items = Array.from(xml.querySelectorAll('item')).map((i: Element) => parseItem(i));
    return items;
  };

  const loadRanking = ({ genre = 'all', term = 'hour', tag = '' }: RankingParams = {}) => {
    const url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}&rss=2.0`;
    return load(url);
  };

  return {
    load,
    loadRanking,
  };
})();

//===END===

export { NicoRssLoader };
