import { netUtil } from '../infra/net-util';

interface CachedArticle {
  expires: number;
  result: Promise<boolean | undefined>;
}
const cache = new Map<string, CachedArticle>();
// 公式watch資産はwatch応答のフラグではなく、この記事APIを照会する。
// 採取根拠と200/404の実測は test/fixtures/functionality/nicodic-articles.json。
export function getNicodicArticleExists(title: string): Promise<boolean | undefined> {
  const cached = cache.get(title);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = (async () => {
    try {
      const raw = await netUtil.fetch(`https://api.dic.nicovideo.jp/v1/articles/article/${encodeURIComponent(title)}`, {
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      });
      const response = raw as Response;
      if (response.status === 404) return false;
      if (!response.ok) return undefined;
      return true;
    } catch {
      return undefined;
    }
  })();
  cache.set(title, { expires: Date.now() + 300000, result });
  if (cache.size > 256) cache.delete(cache.keys().next().value!);
  void result.then((exists) => {
    if (exists === undefined && cache.get(title)?.result === result) cache.delete(title);
  });
  return result;
}
