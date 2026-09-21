import base from '../test/fixtures/functionality/watch-response.json';
import { resolve } from 'node:path';
import { createLibraryRoutes } from './offline-library';
import { mediaSpec } from '../test/fixtures/functionality/media-spec';

export interface FixtureRequest {
  url: string;
  method: string;
  postData?: string;
  headers?: Record<string, string>;
}
export interface FixtureReply {
  status: number;
  mime: string;
  body: string | Uint8Array;
}
const root = resolve(import.meta.dir, '../test/fixtures/functionality');
const ids = ['sm9', 'sm2057168', 'sm100'] as const;
type WatchId = (typeof ids)[number];
const isWatch = (id: string): id is WatchId => ids.some((value) => value === id);
const threadId = (id: WatchId) => String(1173108780 + ids.indexOf(id));
const videoForThread = (id: string) => ids.find((video) => threadId(video) === id);
const key = (kind: 'thread' | 'post', id: WatchId) => 'fixture-' + kind + '-key' + (id === 'sm9' ? '' : '-' + id);
const json = (body: object, status = 200): FixtureReply => ({
  status,
  mime: 'application/json',
  body: JSON.stringify(body),
});
const poster =
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#315c79"/><text x="20" y="80" fill="white" font-size="40">Fixture</text></svg>';
const comment = (id: string, no: number, body: string, vposMs: number, commands: string[] = []) => ({
  id,
  no,
  body,
  vposMs,
  commands,
  userId: 'fixture-user',
  isPremium: false,
  score: 0,
  postedAt: new Date(Date.UTC(2026, 8, 19, 15, 0, no % 60)).toISOString(),
  nicoruCount: no % 5,
  nicoruId: null as string | null,
  source: 'thread',
  isMyPost: false,
});
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function bodyOf(request: FixtureRequest): Record<string, unknown> | null {
  try {
    const body: unknown = JSON.parse(request.postData ?? 'null');
    return record(body) ? body : null;
  } catch {
    return null;
  }
}
const header = (request: FixtureRequest, name: string): string =>
  Object.entries(request.headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? '';
const keys = (body: Record<string, unknown>, names: readonly string[]) =>
  Object.keys(body).length === names.length && names.every((name) => Object.hasOwn(body, name));
function query(url: URL, expected: Record<string, string> = {}): boolean {
  const actual = new URLSearchParams(url.search),
    wanted = new URLSearchParams(expected);
  actual.sort();
  wanted.sort();
  return actual.toString() === wanted.toString();
}
const images = new Set([
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank_s.jpg',
  'https://nicovideo.cdn.nimg.jp/uni/img/common/video_deleted.jpg',
  'https://nicovideo.cdn.nimg.jp/web/img/series/no_thumbnail.png',
  'https://nicovideo.cdn.nimg.jp/web/images/bundle/nicovideo/components/Thumbnail/Thumbnail-placeholder.jpg',
]);
export function createOfflineSite() {
  const library = createLibraryRoutes();
  // 追加機能の固定文書も同じ通信監査を通す。URL単位で明示登録する。
  const documents = new Map<string, string>();
  const resources = new Map<string, FixtureReply>();
  const auth = { isLogin: true, isPremium: false, postKeyStatus: 200, pageMetadata: true };
  const faults = {
    postStatus: 200,
    postDelayMs: 0,
    watchDelayMs: 0,
    commentDelayMs: 0,
    deleteStatus: 200,
    nicoruStatus: 200,
    hlsStatus: 200,
    hlsBodyStatus: undefined as number | undefined,
  };
  const commentsByVideo = new Map(
    ids.map((id) => [
      id,
      Array.from({ length: Math.floor(128 / (ids.indexOf(id) + 1)) }, (_, index) =>
        comment(id + '-fixture-' + index, index + 1, '検証コメント ' + index, (index % mediaSpec[id].duration) * 1000)
      ),
    ])
  );
  const comments = commentsByVideo.get('sm9')!;
  const nextCommentNo = new Map(ids.map((id) => [id, commentsByVideo.get(id)!.length + 1]));
  const writes: FixtureRequest[] = [];
  const deliveries: Array<{ videoId: string; outputs: string[]; variant: string }> = [];
  function watch(id: WatchId) {
    const data = structuredClone(base);
    const spec = mediaSpec[id];
    data.data.response.tag.items = library.tags.get(id) ?? data.data.response.tag.items;
    data.data.response.client.watchId = id;
    data.data.response.video.id = id;
    data.data.response.video.title = '機能テスト映像 ' + (ids.indexOf(id) + 1);
    data.data.response.video.duration = spec.duration;
    data.data.response.media.domand.videos = (['high', 'low'] as const).map((quality, index) => ({
      id: `video-h264-${spec[quality].height}p`,
      isAvailable: true,
      label: `${spec[quality].height}p`,
      bitRate: index === 0 ? 300000 : 100000,
      ...spec[quality],
      qualityLevel: 1 - index,
    }));
    const info = data.data.response.comment;
    for (const thread of info.threads) {
      thread.videoId = id;
      thread.id = Number(threadId(id));
    }
    for (const layer of info.layers) for (const thread of layer.threadIds) thread.id = Number(threadId(id));
    info.nvComment.threadKey = key('thread', id);
    for (const target of info.nvComment.params.targets) target.id = threadId(id);
    return {
      ...data,
      data: {
        ...data.data,
        response: {
          ...data.data.response,
          viewer: auth.isLogin ? { ...data.data.response.viewer, isPremium: auth.isPremium } : null,
        },
      },
    };
  }
  async function html(path: string): Promise<string> {
    const row = await Bun.file(resolve(root, 'watch-row.html')).text();
    const search = ids.map((id) => `<article><a href="/watch/${id}">検証動画 ${id}</a></article>`).join('');
    const markup = path.startsWith('/watch/') ? row : search;
    // 採取元のserver-responseではokReason="PURELY"。視聴ページとして
    // 初期化される契約も保持し、検索ページ扱いで検証をすり抜けない。
    const watchMeta =
      auth.pageMetadata && path.startsWith('/watch/')
        ? '<meta name="server-response" content="{&quot;meta&quot;:{&quot;status&quot;:200},&quot;data&quot;:{&quot;response&quot;:{&quot;okReason&quot;:&quot;PURELY&quot;}}}">'
        : '';
    // ページ側の最小SPA契約。製品のopen/seek等には触れない。
    const commonHeader = JSON.stringify({
      initConfig: { user: { isLogin: auth.isLogin, isPremium: auth.isLogin && auth.isPremium } },
    });
    const header = auth.pageMetadata ? `<header id="CommonHeader" data-common-header='${commonHeader}'></header>` : '';
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8">${watchMeta}<link rel="icon" href="data:,"><style>body{margin:0;background:#eee}main{padding:24px}main>div{display:flex;align-items:center;gap:16px}h1{font-size:20px}img{width:48px}article{padding:20px}</style></head><body>${header}<div id="root"><main id="fixture-host" aria-label="nicovideo-content">${markup}</main></div><script>const row=${JSON.stringify(row)},search=${JSON.stringify(search)};function render(){document.querySelector('#fixture-host').innerHTML=location.pathname.startsWith('/watch/')?row:search;}document.addEventListener('click',e=>{const a=e.target.closest('main a[href^="/watch/"]');if(a&&!e.defaultPrevented){e.preventDefault();history.pushState({fixture:true},'',a.getAttribute('href'));render();}});addEventListener('popstate',render);</script></body></html>`;
  }
  return {
    writes,
    deliveries,
    documents,
    resources,
    auth,
    comments,
    commentsByVideo,
    library,
    faults,
    async reply(request: FixtureRequest): Promise<FixtureReply | null> {
      let url: URL;
      try {
        url = new URL(request.url);
      } catch {
        return null;
      }
      if (url.username || url.password) return null;
      const method = request.method.toUpperCase(),
        path = url.pathname;
      if (['GET', 'OPTIONS'].includes(method) && request.postData) return null;
      if (method === 'GET' && resources.has(url.href)) return resources.get(url.href)!;
      if (method === 'GET' && documents.has(url.href))
        return { status: 200, mime: 'text/html; charset=utf-8', body: documents.get(url.href)! };
      if (url.protocol !== 'https:' || url.port) return null;
      // 外部メニューは遷移先URLだけを検証する。GitHub本文を取得・模倣しない。
      if (method === 'GET' && url.href === 'https://github.com/roflsunriz/FutatsumeWatch')
        return {
          status: 200,
          mime: 'text/html',
          body: '<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Offline navigation fixture</body></html>',
        };
      // プロフィール画像のクリック先だけを検証し、外部のプロフィール内容は取得しない。
      if (method === 'GET' && url.href === 'https://www.nicovideo.jp/user/4')
        return {
          status: 200,
          mime: 'text/html',
          body: '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body></body></html>',
        };
      const libraryReply = await library.reply(request);
      if (libraryReply) return libraryReply;
      const hlsPath = /^\/v1\/watch\/(sm9|sm2057168|sm100)\/access-rights\/hls$/.exec(path);
      const storyboardPath = /^\/v1\/watch\/(sm9|sm2057168|sm100)\/access-rights\/storyboard$/.exec(path);
      const postPath = /^\/v1\/threads\/(117310878[012])\/comments$/.exec(path);
      const actionPath = /^\/v1\/threads\/(117310878[012])\/(nicorus|comment-comment-owner-deletions)$/.exec(path);
      const requestedThread = url.searchParams.get('threadId') ?? '';
      const requestedVideo = url.searchParams.get('videoId') ?? '';
      if (method === 'OPTIONS') {
        const registered =
          (url.origin === 'https://nvapi.nicovideo.jp' &&
            (((hlsPath || storyboardPath) && query(url, { actionTrackId: 'fixture-track' })) ||
              (path === '/v1/comment/keys/post' &&
                videoForThread(requestedThread) &&
                query(url, { threadId: requestedThread, pc: '1' })) ||
              (path === '/v1/comment/keys/thread' &&
                isWatch(requestedVideo) &&
                query(url, { videoId: requestedVideo })) ||
              (path === '/v1/comment/keys/nicoru' &&
                videoForThread(requestedThread) &&
                query(url, { threadId: requestedThread })) ||
              (path === '/v1/comment/keys/delete' &&
                videoForThread(requestedThread) &&
                query(url, { threadId: requestedThread, fork: 'main' })) ||
              (path === '/v2/series/575910' && query(url, { pageSize: '100', page: '1' })))) ||
          (url.origin === 'https://public.nvcomment.nicovideo.jp' &&
            ((path === '/v1/threads' && query(url)) ||
              (postPath && query(url, { pc: '1' })) ||
              (actionPath && query(url))));
        return registered ? { status: 204, mime: 'text/plain', body: '' } : null;
      }
      if (method === 'GET' && url.origin === 'https://ext.nicovideo.jp' && path === '/' && query(url))
        return {
          status: 200,
          mime: 'text/html',
          body: '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body></body></html>',
        };
      if (
        method === 'GET' &&
        url.origin === 'https://ext.nicovideo.jp' &&
        /^\/api\/getthumbinfo\/(sm9|sm2057168|sm100)$/.test(path) &&
        query(url)
      ) {
        const id = path.split('/').at(-1)! as WatchId;
        const length =
          Math.floor(mediaSpec[id].duration / 60) + ':' + String(mediaSpec[id].duration % 60).padStart(2, '0');
        return {
          status: 200,
          mime: 'text/xml',
          body:
            '<?xml version="1.0"?><nicovideo_thumb_response status="ok"><thumb><video_id>' +
            id +
            '</video_id><title>検証動画 ' +
            id +
            '</title><description>生成映像</description><thumbnail_url>https://fixture.invalid/poster.svg</thumbnail_url><first_retrieve>2026-09-20T00:00:00+09:00</first_retrieve><length>' +
            length +
            '</length><movie_type>mp4</movie_type><view_counter>10</view_counter><comment_num>128</comment_num><mylist_counter>2</mylist_counter><last_res_body>検証</last_res_body><watch_url>https://www.nicovideo.jp/watch/' +
            id +
            '</watch_url><thumb_type>video</thumb_type><embeddable>1</embeddable><no_live_play>0</no_live_play><tags domain="jp"><tag>検証</tag></tags><user_id>4</user_id><user_nickname>検証投稿者</user_nickname><user_icon_url>https://fixture.invalid/poster.svg</user_icon_url></thumb></nicovideo_thumb_response>',
        };
      }
      if (
        method === 'GET' &&
        url.origin === 'https://nvapi.nicovideo.jp' &&
        path === '/v1/comment/keys/thread' &&
        isWatch(requestedVideo) &&
        query(url, { videoId: requestedVideo })
      )
        return json({ meta: { status: 200 }, data: { threadKey: key('thread', requestedVideo) } });
      if (
        method === 'GET' &&
        url.origin === 'https://nvapi.nicovideo.jp' &&
        path === '/v2/series/575910' &&
        query(url, { pageSize: '100', page: '1' })
      )
        return json({
          meta: { status: 200 },
          data: {
            detail: { id: 575910, title: '機能テストシリーズ' },
            totalCount: ids.length,
            items: ids.map((id) => ({ video: watch(id).data.response.video })),
          },
        });
      if (
        method === 'GET' &&
        url.origin === 'https://live.nicovideo.jp' &&
        path === '/img/2012/watch/tag_icon003.png' &&
        query(url)
      )
        return { status: 200, mime: 'image/svg+xml', body: poster };
      if (
        method === 'GET' &&
        url.origin === 'https://api.nicoad.nicovideo.jp' &&
        /^\/v1\/contents\/video\/(sm9|sm2057168|sm100)\/thanks$/.test(path) &&
        query(url, { limit: '50' })
      )
        return json({ meta: { status: 200 }, data: { sponsors: [] } });
      if (method === 'GET' && url.origin === 'https://www.nicovideo.jp') {
        const match = /^\/watch\/(sm9|sm2057168|sm100)$/.exec(path),
          id = match?.[1];
        if (id && isWatch(id)) {
          if (query(url, { responseType: 'json' }) || query(url, { responseType: 'json', eco: '1' })) {
            if (faults.watchDelayMs) await Bun.sleep(faults.watchDelayMs);
            return json(watch(id));
          }
          return query(url) ? { status: 200, mime: 'text/html; charset=utf-8', body: await html(path) } : null;
        }
        const search = /^\/(search|tag)\/([^/]+)$/.exec(path);
        if (
          search &&
          decodeURIComponent(search[2]!) === 'レッツゴー！陰陽師' &&
          query(url, { sort: 'viewCount', order: 'desc' })
        )
          return { status: 200, mime: 'text/html; charset=utf-8', body: await html(path) };
      }
      if (method === 'GET' && url.origin === 'https://fixture.invalid' && query(url)) {
        if (path === '/poster.svg') return { status: 200, mime: 'image/svg+xml', body: poster };
        if (/^\/(sm9|sm2057168|sm100)\/storyboard\/poster\.png$/.test(path))
          return {
            status: 200,
            mime: 'image/png',
            body: Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              'base64'
            ),
          };
        const storyboard = /^\/(sm9|sm2057168|sm100)\/storyboard\/storyboard\.json$/.exec(path);
        if (storyboard)
          return json({
            thumbnailWidth: 160,
            thumbnailHeight: 90,
            columns: 4,
            rows: 4,
            count: 480,
            interval: 1000,
            images: Array.from({ length: 30 }, () => ({ url: 'poster.png' })),
          });
        const media = /^\/(sm9|sm2057168|sm100)\/((?:master|low|high)\.m3u8|(?:low|high)-\d{2}\.mpegts)$/.exec(path);
        if (media) {
          const name = media[2]!;
          const file = Bun.file(resolve(root, 'media', media[1]!, name));
          if (!(await file.exists())) return null;
          return {
            status: 200,
            mime: name.endsWith('.mpegts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
            body: new Uint8Array(await file.arrayBuffer()),
          };
        }
      }
      if (
        method === 'POST' &&
        url.origin === 'https://nvapi.nicovideo.jp' &&
        storyboardPath &&
        query(url, { actionTrackId: 'fixture-track' })
      )
        return json(
          {
            meta: { status: 201 },
            data: {
              contentUrl: `https://fixture.invalid/${storyboardPath[1]}/storyboard/storyboard.json`,
              expireTime: '2099-01-01T00:00:00Z',
            },
          },
          201
        );
      if (
        method === 'POST' &&
        url.origin === 'https://nvapi.nicovideo.jp' &&
        hlsPath &&
        query(url, { actionTrackId: 'fixture-track' })
      ) {
        const body = bodyOf(request);
        if (
          !body ||
          !keys(body, ['outputs']) ||
          !Array.isArray(body.outputs) ||
          body.outputs.length < 1 ||
          body.outputs.length > 2
        )
          return null;
        const outputs: string[] = [];
        const videoId = hlsPath[1] as WatchId;
        const spec = mediaSpec[videoId];
        const videoIds = [spec.high, spec.low].map((size) => `video-h264-${size.height}p`);
        for (const value of body.outputs as unknown[]) {
          if (
            !Array.isArray(value) ||
            value.length !== 2 ||
            typeof value[0] !== 'string' ||
            !videoIds.includes(value[0]) ||
            value[1] !== 'audio-aac-128kbps' ||
            outputs.includes(value[0])
          )
            return null;
          outputs.push(value[0]);
        }
        const variant = outputs.length > 1 ? 'master' : outputs[0] === videoIds[0] ? 'high' : 'low';
        const contentUrl = `https://fixture.invalid/${videoId}/${variant}.m3u8`;
        deliveries.push({ videoId: path.split('/')[3]!, outputs: [...outputs], variant });
        if (faults.hlsStatus !== 200) {
          const status = faults.hlsBodyStatus ?? faults.hlsStatus;
          return json(
            {
              meta: { status, ...(status >= 300 ? { errorCode: 'FORBIDDEN' } : {}) },
              data: { contentUrl, expireTime: '2099-01-01T00:00:00Z' },
            },
            faults.hlsStatus
          );
        }
        return json(
          {
            meta: { status: 201 },
            data: { contentUrl, expireTime: '2099-01-01T00:00:00Z' },
          },
          201
        );
      }
      if (
        url.origin === 'https://public.nvcomment.nicovideo.jp' &&
        path === '/v1/threads' &&
        method === 'POST' &&
        query(url)
      ) {
        const data = bodyOf(request);
        const additionalsValue = data?.additionals;
        if (
          !data ||
          (!keys(data, ['threadKey', 'params']) && !keys(data, ['threadKey', 'params', 'additionals'])) ||
          !record(data.params) ||
          !keys(data.params, ['targets', 'language']) ||
          (additionalsValue !== undefined && !record(additionalsValue)) ||
          header(request, 'content-type') !== 'application/json' ||
          header(request, 'x-client-os-type') !== 'others' ||
          header(request, 'x-frontend-id') !== '6' ||
          header(request, 'x-frontend-version') !== '0'
        )
          return null;
        const params = data.params,
          additionals: Record<string, unknown> = record(additionalsValue) ? additionalsValue : {};
        if (
          !Array.isArray(params.targets) ||
          params.targets.length < 1 ||
          params.targets.length > 3 ||
          params.language !== 'ja-jp'
        )
          return null;
        if (
          !keys(additionals, []) &&
          !(
            keys(additionals, ['when']) &&
            typeof additionals.when === 'number' &&
            Number.isSafeInteger(additionals.when) &&
            additionals.when > 0
          )
        )
          return null;
        const targets: Array<{ id: string; fork: string }> = [];
        for (const target of params.targets as unknown[]) {
          if (
            !record(target) ||
            !keys(target, ['id', 'fork']) ||
            typeof target.id !== 'string' ||
            typeof target.fork !== 'string' ||
            !['main', 'owner', 'easy'].includes(target.fork) ||
            targets.some((value) => value.fork === target.fork)
          )
            return null;
          targets.push({ id: target.id, fork: target.fork });
        }
        const id = videoForThread(targets[0]!.id);
        if (!id || targets.some((target) => target.id !== threadId(id)) || data.threadKey !== key('thread', id))
          return null;
        const visible = commentsByVideo
          .get(id)!
          .filter(
            (value) =>
              typeof additionals.when !== 'number' || new Date(value.postedAt).getTime() / 1000 <= additionals.when
          )
          .map((value) => ({ ...value }));
        const response = json({
          meta: { status: 200 },
          data: {
            globalComments: [{ id: threadId(id), count: visible.length }],
            threads: targets.map((target) => ({
              id: target.id,
              fork: target.fork,
              commentCount: target.fork === 'main' ? visible.length : 0,
              comments: target.fork === 'main' ? visible : [],
            })),
          },
        });
        if (faults.commentDelayMs) await Bun.sleep(faults.commentDelayMs);
        return response;
      }
      const postVideo = videoForThread(requestedThread);
      // 削除/ニコるは現行実装契約の人工応答。公開サーバーでの受理確認とは区別する。
      if (url.origin === 'https://nvapi.nicovideo.jp' && method === 'GET' && postVideo) {
        if (path === '/v1/comment/keys/nicoru' && query(url, { threadId: requestedThread }))
          return json({ meta: { status: 200 }, data: { nicoruKey: `fixture-nicoru-${postVideo}` } });
        if (path === '/v1/comment/keys/delete' && query(url, { threadId: requestedThread, fork: 'main' }))
          return json({ meta: { status: 200 }, data: { deleteKey: `fixture-delete-${postVideo}` } });
      }
      if (url.origin === 'https://public.nvcomment.nicovideo.jp' && actionPath && query(url)) {
        const data = bodyOf(request),
          id = videoForThread(actionPath[1]!);
        if (!data || !id || data.videoId !== id || data.fork !== 'main') return null;
        const stored = commentsByVideo.get(id)!;
        if (actionPath[2] === 'nicorus' && method === 'POST') {
          if (
            !keys(data, ['content', 'fork', 'no', 'nicoruKey', 'videoId']) ||
            data.nicoruKey !== `fixture-nicoru-${id}` ||
            typeof data.no !== 'number' ||
            !Number.isSafeInteger(data.no) ||
            typeof data.content !== 'string'
          )
            return null;
          const target = stored.find((value) => value.no === data.no && value.body === data.content);
          if (!target) return json({ meta: { status: 404, errorCode: 'NOT_FOUND' } }, 404);
          writes.push(request);
          if (faults.nicoruStatus !== 200)
            return json({ meta: { status: faults.nicoruStatus, errorCode: 'FORBIDDEN' } }, faults.nicoruStatus);
          if (target.nicoruId) return json({ meta: { status: 409, errorCode: 'CONFLICT' } }, 409);
          target.nicoruId = `fixture-nicoru-${id}-${target.no}`;
          target.nicoruCount++;
          return json({ meta: { status: 200 }, data: { nicoruId: target.nicoruId, nicoruCount: target.nicoruCount } });
        }
        if (actionPath[2] === 'comment-comment-owner-deletions' && method === 'PUT') {
          if (
            !keys(data, ['deleteKey', 'fork', 'language', 'targets', 'videoId']) ||
            data.deleteKey !== `fixture-delete-${id}` ||
            data.language !== 'ja-jp' ||
            !Array.isArray(data.targets) ||
            data.targets.length < 1
          )
            return null;
          const targets: number[] = [];
          for (const target of data.targets as unknown[]) {
            if (
              !record(target) ||
              !keys(target, ['no', 'operation']) ||
              typeof target.no !== 'number' ||
              !Number.isSafeInteger(target.no) ||
              target.operation !== 'DELETE' ||
              targets.includes(target.no)
            )
              return null;
            targets.push(target.no);
          }
          writes.push(request);
          if (faults.deleteStatus !== 200)
            return json({ meta: { status: faults.deleteStatus, errorCode: 'FORBIDDEN' } }, faults.deleteStatus);
          if (targets.some((no) => !stored.some((value) => value.no === no && value.isMyPost)))
            return json({ meta: { status: 403, errorCode: 'FORBIDDEN' } }, 403);
          for (let index = stored.length - 1; index >= 0; index--)
            if (targets.includes(stored[index]!.no)) stored.splice(index, 1);
          return json({ meta: { status: 200 }, data: {} });
        }
        return null;
      }
      if (
        url.origin === 'https://nvapi.nicovideo.jp' &&
        method === 'GET' &&
        path === '/v1/comment/keys/post' &&
        postVideo &&
        query(url, { threadId: requestedThread, pc: '1' })
      ) {
        const status = auth.isLogin ? auth.postKeyStatus : 401;
        if (status !== 200)
          return json({ meta: { status, errorCode: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' } }, status);
        return json({ meta: { status: 200 }, data: { postKey: key('post', postVideo) } });
      }
      if (
        url.origin === 'https://public.nvcomment.nicovideo.jp' &&
        postPath &&
        method === 'POST' &&
        query(url, { pc: '1' })
      ) {
        const data = bodyOf(request),
          id = videoForThread(postPath[1]!);
        if (
          !data ||
          !id ||
          !keys(data, ['postKey', 'videoId', 'body', 'commands', 'vposMs']) ||
          data.postKey !== key('post', id) ||
          data.videoId !== id ||
          typeof data.body !== 'string' ||
          !data.body.trim() ||
          data.body.length > 75 ||
          !Array.isArray(data.commands) ||
          !data.commands.every(
            (value: unknown) => typeof value === 'string' && value.length > 0 && !/\s/.test(value)
          ) ||
          typeof data.vposMs !== 'number' ||
          !Number.isSafeInteger(data.vposMs) ||
          data.vposMs < 0
        )
          return null;
        writes.push(request);
        if (faults.postDelayMs) await Bun.sleep(faults.postDelayMs);
        if (faults.postStatus !== 200)
          return json({ meta: { status: faults.postStatus, errorCode: 'FORBIDDEN' } }, faults.postStatus);
        const stored = commentsByVideo.get(id)!;
        const no = nextCommentNo.get(id)!;
        const value = comment(id + '-posted-' + no, no, data.body, data.vposMs, data.commands as string[]);
        nextCommentNo.set(id, no + 1);
        stored.push({ ...value, isMyPost: true });
        return json({ meta: { status: 200 }, data: { id: value.id, no: value.no } });
      }
      if (method === 'GET' && images.has(url.href)) return { status: 200, mime: 'image/svg+xml', body: poster };
      return null;
    },
  };
}
