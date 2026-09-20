import { netUtil } from '../infra/net-util';
import { textUtil } from '../text/text-util';

interface RecommendRecipe {
  id: string;
  videoId?: string;
  seriesId?: string;
  frontendId?: number;
  seriesTitle?: string;
}

interface RecommendLoadParams {
  videoId?: string;
  recipe?: RecommendRecipe;
}

interface RecommendSeriesOptions {
  title?: string;
}

interface RecommendApiEnvelope {
  meta?: { status?: number };
  data?: unknown;
}

interface RecommendAPILoaderApi {
  load: (params: RecommendLoadParams) => Promise<Record<string, unknown>>;
  loadSeries: (seriesId: string, options?: RecommendSeriesOptions) => Promise<Record<string, unknown>>;
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
const RecommendAPILoader: RecommendAPILoaderApi = (() => {
  const load = ({ videoId, recipe }: RecommendLoadParams): Promise<Record<string, unknown>> => {
    const source: RecommendRecipe = recipe || { id: 'video_playlist_common', videoId };
    const encoded: unknown = textUtil.encodeBase64(JSON.stringify(source));
    const recipeText = encoded as string;
    const url = `https://nvapi.nicovideo.jp/v1/recommend?recipe=${encodeURIComponent(recipeText)}&site=nicovideo&_frontendId=6&_frontendVersion=0`;
    const result: unknown = (netUtil as unknown as NetUtilLike)
      .fetch(url, { credentials: 'include' })
      .then((res: Response) => res.json())
      .then((res: RecommendApiEnvelope) => {
        if (!res.meta || res.meta.status !== 200) {
          window.console.warn('load recommend fail', res);
          throw new Error('load recommend fail');
        }
        const data: unknown = res.data;
        return data as Record<string, unknown>;
      });
    return result as Promise<Record<string, unknown>>;
  };

  return {
    load,
    loadSeries: (seriesId: string, options: RecommendSeriesOptions = {}) => {
      const recipe = {
        id: 'video_watch_playlist_series',
        seriesId,
        frontendId: 6,
        seriesTitle: options.title || `series/${seriesId}`,
      };
      return load({ recipe });
    },
  };
})();

//===END===

export { RecommendAPILoader };
