import { BaseLoader } from 'hls.js';
import { netUtil } from '../../packages/lib/src/infra/net-util';

export function isDomandDeliveryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['delivery.domand.nicovideo.jp', 'asset.domand.nicovideo.jp'].includes(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

// HLSの文書・鍵・映像を同じ通信経路へ通す。GoogleなどをOriginにすると
// 配信サーバーがCORSを許可しないため、既存のニコニコiframeから取得する。
export class GateHlsLoader extends BaseLoader {
  private controller: AbortController | null = null;
  private response: Response | null = null;
  private generation = 0;

  protected loadInternal(): void {
    const { context, config, stats } = this;
    if (!context || !config) return;
    const generation = ++this.generation;
    const controller = (this.controller = new AbortController());
    stats.aborted = false;
    stats.loaded = stats.loading.first = 0;
    const headers = { ...context.headers };
    if (context.rangeEnd !== undefined && context.rangeEnd > 0)
      headers.Range = `bytes=${context.rangeStart ?? 0}-${context.rangeEnd - 1}`;
    const timeout = config.loadPolicy.maxLoadTimeMs;
    if (Number.isFinite(timeout) && timeout > 0)
      this.requestTimeout = self.setTimeout(() => this.loadtimeout(), timeout);
    void (async () => {
      try {
        if (!isDomandDeliveryUrl(context.url)) throw new Error('動画配信URLが不正です');
        const response = (await netUtil.fetch(context.url, {
          credentials: 'include',
          headers,
          signal: controller.signal,
        })) as Response;
        if (generation !== this.generation) return;
        this.response = response;
        stats.loading.first = Math.max(performance.now(), stats.loading.start);
        if (!response.ok) {
          clearTimeout(this.requestTimeout);
          this.callbacks?.onError({ code: response.status, text: response.statusText }, context, response, stats);
          return;
        }
        const data = context.responseType === 'arraybuffer' ? await response.arrayBuffer() : await response.text();
        if (generation !== this.generation) return;
        clearTimeout(this.requestTimeout);
        stats.loading.end = Math.max(performance.now(), stats.loading.first);
        stats.loaded = stats.total =
          typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength;
        stats.chunkCount = 1;
        stats.bwEstimate = (stats.total * 8000) / Math.max(1, stats.loading.end - stats.loading.start);
        this.callbacks?.onProgress?.(stats, context, data, response);
        if (generation !== this.generation) return;
        this.callbacks?.onSuccess({ url: context.url, data, code: response.status }, stats, context, response);
      } catch (error) {
        if (generation !== this.generation) return;
        clearTimeout(this.requestTimeout);
        this.callbacks?.onError(
          { code: 0, text: error instanceof Error ? error.message : '動画配信の取得に失敗しました' },
          context,
          this.response,
          stats
        );
      }
    })();
  }
  protected abortInternal(): void {
    this.generation++;
    clearTimeout(this.requestTimeout);
    clearTimeout(this.retryTimeout);
    if (this.controller && !this.stats.loading.end) {
      this.stats.aborted = true;
      this.controller.abort();
    }
  }
  protected resetInternalLoader(): void {
    this.response = null;
  }
  protected getNetworkDetails(): Response | null {
    return this.response;
  }
  getCacheAge(): number | null {
    const age = this.response?.headers.get('Age');
    return age && Number.isFinite(Number(age)) ? Number(age) : null;
  }
  getResponseHeader(name: string): string | null {
    return this.response?.headers.get(name) ?? null;
  }
}
