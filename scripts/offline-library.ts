import type { FixtureReply, FixtureRequest } from './offline-site';
import dictionary from '../test/fixtures/functionality/nicodic-articles.json';
import { mediaSpec } from '../test/fixtures/functionality/media-spec';
import type { MediaWatchId } from '../test/fixtures/functionality/media-spec';

const ids = ['sm9', 'sm2057168', 'sm100'];
const json = (data: object, status = 200): FixtureReply => ({
  status,
  mime: 'application/json',
  body: JSON.stringify({ meta: { status }, data }),
});
export function createLibraryRoutes() {
  const writes: FixtureRequest[] = [];
  const watchLater = new Map<string, string>();
  const mylist = new Map<string, string>();
  const item = (id: string) => ({
    id,
    watchId: id,
    itemId: id,
    contentType: 'video',
    content: {
      id,
      title: `機能テスト映像 ${ids.indexOf(id) + 1}`,
      duration: mediaSpec[id as MediaWatchId].duration,
      count: { view: (ids.indexOf(id) + 1) * 10, comment: 128, mylist: 2, like: 1 },
      thumbnail: { url: 'https://fixture.invalid/poster.svg' },
      registeredAt: `2026-09-${18 + ids.indexOf(id)}T00:00:00+09:00`,
      latestCommentSummary: '検証',
    },
  });
  function reply(request: FixtureRequest): FixtureReply | null {
    const url = new URL(request.url),
      method = request.method.toUpperCase(),
      path = url.pathname;
    if (
      url.origin === 'https://api.dic.nicovideo.jp' &&
      method === 'GET' &&
      path.startsWith('/v1/articles/article/') &&
      !url.search
    ) {
      const title = decodeURIComponent(path.slice('/v1/articles/article/'.length));
      const article = dictionary.articles.find((value) => value.name === title);
      if (!article) return null;
      return {
        status: article.status,
        mime: 'application/json',
        body: JSON.stringify(
          article.status === 200
            ? { id: article.id, title: article.name, url: article.url }
            : { error: `resource not found '${title}'` }
        ),
      };
    }
    if (url.origin === 'https://live.nicovideo.jp' && method === 'GET' && path === '/img/2012/watch/tag_icon002.png')
      return {
        status: 200,
        mime: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#900"/></svg>',
      };
    if (url.origin !== 'https://nvapi.nicovideo.jp') return null;
    if (
      method === 'OPTIONS' &&
      /^\/v1\/(recommend|playlist\/user-uploaded\/4|users\/me\/(watch-later|mylists(?:\/42(?:\/items)?)?))$/.test(path)
    )
      return { status: 204, mime: 'text/plain', body: '' };
    if (method === 'GET' && path === '/v1/recommend') {
      if (
        url.searchParams.size !== 4 ||
        url.searchParams.get('site') !== 'nicovideo' ||
        url.searchParams.get('_frontendId') !== '6' ||
        url.searchParams.get('_frontendVersion') !== '0'
      )
        return null;
      const recipe: unknown = JSON.parse(Buffer.from(url.searchParams.get('recipe') ?? '', 'base64').toString());
      if (
        typeof recipe !== 'object' ||
        recipe === null ||
        !('id' in recipe) ||
        recipe.id !== 'video_playlist_common' ||
        !('videoId' in recipe) ||
        typeof recipe.videoId !== 'string' ||
        !ids.includes(recipe.videoId)
      )
        return null;
      return json({ items: ids.filter((id) => id !== recipe.videoId).map(item) });
    }
    if (
      method === 'GET' &&
      path === '/v1/playlist/user-uploaded/4' &&
      url.searchParams.size === 4 &&
      url.searchParams.get('sortOrder') === 'desc' &&
      url.searchParams.get('sortKey') === 'registeredAt'
    ) {
      const page = Number(url.searchParams.get('page')),
        size = Number(url.searchParams.get('pageSize'));
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(size) || size < 1 || size > 100) return null;
      return json({
        totalCount: ids.length,
        items: [...ids]
          .reverse()
          .slice((page - 1) * size, page * size)
          .map(item),
      });
    }
    if (method === 'GET' && path === '/v1/users/me/mylists' && !url.search)
      return json({
        mylists: [
          { id: 42, name: '検証マイリスト', isPublic: false, defaultSortKey: 'registeredAt', defaultSortOrder: 'asc' },
        ],
      });
    const isLater = path === '/v1/users/me/watch-later';
    const isMylist = path === '/v1/users/me/mylists/42/items';
    if ((isLater || path === '/v1/users/me/mylists/42') && method === 'GET') {
      const store = isLater ? watchLater : mylist;
      if (
        url.searchParams.size !== (isLater ? 4 : 2) ||
        (isLater && (url.searchParams.get('sortKey') !== 'addedAt' || url.searchParams.get('sortOrder') !== 'desc'))
      )
        return null;
      if (url.searchParams.get('page') !== '1' || url.searchParams.get('pageSize') !== '100') return null;
      return json({
        [isLater ? 'watchLater' : 'mylist']: {
          hasNext: false,
          hasInvisibleItems: false,
          items: [...store.keys()].map(item),
        },
      });
    }
    if ((isLater || isMylist) && method === 'POST') {
      const body = new URLSearchParams(request.postData);
      const id = body.get(isLater ? 'watchId' : 'itemId');
      if (!id || !ids.includes(id) || body.size !== 2 || !body.has(isLater ? 'memo' : 'description')) return null;
      if ((isLater && url.search) || (isMylist && url.searchParams.toString() !== body.toString())) return null;
      const store = isLater ? watchLater : mylist;
      if (store.has(id)) return json({}, 409);
      store.set(id, body.get(isLater ? 'memo' : 'description')!);
      writes.push(request);
      return json({}, 201);
    }
    if ((isLater || isMylist) && method === 'DELETE' && url.searchParams.size === 1) {
      const id = url.searchParams.get('itemIds'),
        store = isLater ? watchLater : mylist;
      if (!id || !store.has(id)) return json({}, 404);
      store.delete(id);
      writes.push(request);
      return json({});
    }
    return null;
  }
  return { writes, watchLater, mylist, reply: (request: FixtureRequest) => Promise.resolve(reply(request)) };
}
