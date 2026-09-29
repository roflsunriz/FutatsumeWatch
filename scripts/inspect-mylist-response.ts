import { attach, listTargets } from './dev-cdp';

const target = (await listTargets()).find(
  (entry) => entry.type === 'page' && entry.url.startsWith('https://www.nicovideo.jp/my/mylist')
);
if (!target) throw new Error('9222 に公式マイリスト管理画面がありません');
const session = await attach(target);
try {
  const expression = `(async () => {
    const urls = [
      'https://nvapi.nicovideo.jp/v1/users/me/mylists',
      'https://nvapi.nicovideo.jp/v1/users/me/watch-later?page=1&pageSize=1',
    ];
    return await Promise.all(urls.map(async url => {
      const response = await fetch(url, {credentials:'include', headers:{'X-Frontend-Id':'6','X-Frontend-Version':'0'}});
      const body = await response.json().catch(() => null);
      const data = body?.data ?? {};
      const collection = data.mylists ?? data.watchLater ?? [];
      const first = Array.isArray(collection) ? collection[0] : collection?.items?.[0];
      return {path:new URL(url).pathname,status:response.status,meta:body?.meta?.status,dataKeys:Object.keys(data),collectionKeys:collection && !Array.isArray(collection) ? Object.keys(collection) : [],firstKeys:first ? Object.keys(first) : [],firstTypes:first ? Object.fromEntries(Object.entries(first).map(([k,v])=>[k,typeof v])) : {}};
    }));
  })()`;
  const result = (await session.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
    result?: { value?: unknown };
    exceptionDetails?: unknown;
  };
  if (result.exceptionDetails) throw new Error('ブラウザー内の読み取り専用 API 要求に失敗しました');
  console.log(JSON.stringify(result.result?.value));
} finally {
  await session.close();
}
