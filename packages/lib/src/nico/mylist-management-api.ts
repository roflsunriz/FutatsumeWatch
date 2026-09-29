import { netUtil } from '../infra/net-util';

export interface ManagedMylist {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  defaultSortKey: string;
  defaultSortOrder: string;
}

export interface ManagedMylistItem {
  itemId: string;
  watchId: string;
  description: string;
  title: string;
}

export interface MylistFields {
  name: string;
  description: string;
  isPublic: boolean;
  defaultSortKey: string;
  defaultSortOrder: string;
}

const origin = 'https://nvapi.nicovideo.jp';
const headers = {
  'X-Frontend-Id': '6',
  'X-Frontend-Version': '0',
  'X-Request-With': 'https://www.nicovideo.jp',
};
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const stringValue = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

interface ApiResult {
  status: number;
  data: Record<string, unknown>;
}

async function request(path: string, method = 'GET', fields?: URLSearchParams): Promise<ApiResult> {
  const url = new URL(path, origin);
  const response = (await netUtil.fetch(url.href, {
    method,
    credentials: 'include',
    headers: fields ? { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } : headers,
    body: fields?.toString(),
  })) as Response;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`マイリストAPIの応答を読み取れませんでした (HTTP ${response.status})。`);
  }
  if (!record(body) || !record(body.meta) || typeof body.meta.status !== 'number')
    throw new Error('マイリストAPIの応答形式が不正です。');
  const status = body.meta.status;
  if (!response.ok || status < 200 || status >= 300) {
    const error = record(body.error) ? body.error : {};
    const description = stringValue(error.description);
    throw new Error(description || `マイリストの操作に失敗しました (HTTP ${response.status} / ${status})。`);
  }
  return { status, data: record(body.data) ? body.data : {} };
}

function listFrom(value: unknown): ManagedMylist[] {
  if (!Array.isArray(value)) throw new Error('マイリスト一覧の形式が不正です。');
  return value.map((entry: unknown) => {
    if (!record(entry) || !stringValue(entry.id) || typeof entry.name !== 'string')
      throw new Error('マイリスト情報の形式が不正です。');
    return {
      id: stringValue(entry.id),
      name: entry.name,
      description: stringValue(entry.description),
      isPublic: entry.isPublic === true,
      defaultSortKey: stringValue(entry.defaultSortKey) || 'addedAt',
      defaultSortOrder: stringValue(entry.defaultSortOrder) || 'desc',
    };
  });
}

function itemFrom(value: unknown): ManagedMylistItem {
  if (!record(value) || !stringValue(value.itemId) || !stringValue(value.watchId))
    throw new Error('マイリスト動画の形式が不正です。');
  const video = record(value.video) ? value.video : record(value.content) ? value.content : {};
  return {
    itemId: stringValue(value.itemId),
    watchId: stringValue(value.watchId),
    description: stringValue(value.description ?? value.memo),
    title: stringValue(video.title ?? value.title) || stringValue(value.watchId),
  };
}

async function pagedItems(path: string): Promise<ManagedMylistItem[]> {
  const result: ManagedMylistItem[] = [];
  for (let page = 1; page <= 100; page++) {
    const query = new URLSearchParams({ page: String(page), pageSize: '100' });
    const { data } = await request(`${path}?${query}`);
    const collection = data.mylist ?? data.watchLater;
    if (!record(collection) || !Array.isArray(collection.items) || typeof collection.hasNext !== 'boolean')
      throw new Error('マイリスト動画一覧の形式が不正です。');
    result.push(...collection.items.map(itemFrom));
    if (!collection.hasNext) return result;
  }
  throw new Error('マイリストが100ページを超えました。操作を中止します。');
}

function mylistPath(id: string): string {
  if (!/^\d+$/.test(id)) throw new Error('マイリストIDが不正です。');
  return `/v1/users/me/mylists/${id}`;
}
function itemPath(id: string): string {
  if (!/^[\w-]+$/.test(id)) throw new Error('動画項目IDが不正です。');
  return encodeURIComponent(id);
}
function fieldsBody(fields: MylistFields): URLSearchParams {
  const body = new URLSearchParams();
  body.set('name', fields.name.trim());
  body.set('description', fields.description);
  body.set('isPublic', String(fields.isPublic));
  body.set('defaultSortKey', fields.defaultSortKey);
  body.set('defaultSortOrder', fields.defaultSortOrder);
  if (!body.get('name')) throw new Error('マイリスト名を入力してください。');
  return body;
}

export const MylistManagementApi = {
  async list(): Promise<ManagedMylist[]> {
    const { data } = await request('/v1/users/me/mylists');
    return listFrom(data.mylists);
  },
  async create(fields: MylistFields): Promise<ManagedMylist> {
    const { data } = await request('/v1/users/me/mylists', 'POST', fieldsBody(fields));
    const created = record(data.mylist) ? listFrom([data.mylist])[0] : undefined;
    if (!created) throw new Error('作成結果を確認できませんでした。再取得してください。');
    return created;
  },
  async update(id: string, fields: MylistFields): Promise<ManagedMylist> {
    const { data } = await request(mylistPath(id), 'PUT', fieldsBody(fields));
    const updated = record(data.mylist) ? listFrom([data.mylist])[0] : undefined;
    if (!updated) throw new Error('保存結果を確認できませんでした。再取得してください。');
    return updated;
  },
  async remove(id: string): Promise<void> {
    await request(mylistPath(id), 'DELETE');
  },
  items: (id: string): Promise<ManagedMylistItem[]> => pagedItems(mylistPath(id)),
  watchLaterItems: (): Promise<ManagedMylistItem[]> => pagedItems('/v1/users/me/watch-later'),
  async addItem(id: string, watchId: string, description: string): Promise<number> {
    const query = new URLSearchParams({ itemId: watchId, description });
    const { status } = await request(`${mylistPath(id)}/items?${query}`, 'POST');
    return status;
  },
  async removeItem(id: string, itemId: string): Promise<void> {
    const query = new URLSearchParams({ itemIds: itemId });
    await request(`${mylistPath(id)}/items?${query}`, 'DELETE');
  },
  async updateItem(id: string, itemId: string, description: string): Promise<void> {
    await request(`${mylistPath(id)}/items/${itemPath(itemId)}`, 'PUT', new URLSearchParams({ description }));
  },
  async addWatchLater(watchId: string, memo: string): Promise<number> {
    const { status } = await request('/v1/users/me/watch-later', 'POST', new URLSearchParams({ watchId, memo }));
    return status;
  },
  async removeWatchLater(itemId: string): Promise<void> {
    const query = new URLSearchParams({ itemIds: itemId });
    await request(`/v1/users/me/watch-later?${query}`, 'DELETE');
  },
  async updateWatchLater(itemId: string, memo: string): Promise<void> {
    await request(`/v1/users/me/watch-later/${itemPath(itemId)}`, 'PUT', new URLSearchParams({ memo }));
  },
};
