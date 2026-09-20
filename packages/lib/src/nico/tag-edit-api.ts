import { netUtil } from '../infra/net-util';
interface TagFetch {
  fetch(url: string, options: RequestInit): Promise<Response>;
}

export interface TagData {
  name: string;
  isNicodicArticleExists?: boolean;
  isLocked?: boolean;
}
export interface TagApiResult {
  tags: TagData[];
}
interface TagEditParams {
  videoId: string;
  tag?: string;
  editKey?: string;
}

function parseTags(value: unknown): TagData[] | null {
  if (!Array.isArray(value)) return null;
  const tags: TagData[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null || !('name' in entry) || typeof entry.name !== 'string')
      return null;
    tags.push({
      name: entry.name,
      ...('isNicodicArticleExists' in entry && typeof entry.isNicodicArticleExists === 'boolean'
        ? { isNicodicArticleExists: entry.isNicodicArticleExists }
        : {}),
      ...('isLocked' in entry && typeof entry.isLocked === 'boolean' ? { isLocked: entry.isLocked } : {}),
    });
  }
  return tags;
}

class TagEditApi {
  async load(videoId: string, editKey = ''): Promise<TagApiResult> {
    const tags = await this.request(videoId, editKey, 'GET');
    if (!tags) throw new Error('タグ一覧の応答形式が不正です。再読み込みしてください。');
    return { tags };
  }
  async add({ videoId, tag = '', editKey = '' }: TagEditParams): Promise<TagApiResult> {
    const tags = await this.request(videoId, editKey, 'POST', tag);
    return tags ? { tags } : this.load(videoId, editKey);
  }
  async remove({ videoId, tag = '', editKey = '' }: TagEditParams): Promise<TagApiResult> {
    const tags = await this.request(videoId, editKey, 'DELETE', tag);
    return tags ? { tags } : this.load(videoId, editKey);
  }
  private async request(
    videoId: string,
    editKey: string,
    method: 'GET' | 'POST' | 'DELETE',
    tag?: string
  ): Promise<TagData[] | null> {
    if (!videoId || (method !== 'GET' && (!editKey || !tag?.trim()))) {
      throw new Error('タグを編集できません。動画とログイン状態を確認してください。');
    }
    const url = new URL(`https://nvapi.nicovideo.jp/v2/videos/${encodeURIComponent(videoId)}/tags`);
    if (tag !== undefined) url.searchParams.set('tag', tag);
    const response = await (netUtil as unknown as TagFetch).fetch(url.toString(), {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'X-Request-With': 'https://www.nicovideo.jp',
        'X-Niconico-Language': 'ja-jp',
        'X-Tag-Edit-Key': editKey,
      },
    });
    if (!response.ok)
      throw new Error(`タグの処理に失敗しました (HTTP ${response.status})。状態を確認して再試行してください。`);
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) throw new Error('タグの応答形式が不正です。');
    if (
      'meta' in body &&
      typeof body.meta === 'object' &&
      body.meta !== null &&
      'status' in body.meta &&
      typeof body.meta.status === 'number' &&
      body.meta.status >= 400
    ) {
      throw new Error(`タグの処理が拒否されました (${body.meta.status})。状態を確認してください。`);
    }
    if (!('data' in body) || typeof body.data !== 'object' || body.data === null) return null;
    if (!('tags' in body.data)) return null;
    const tags = parseTags(body.data.tags);
    if (!tags) throw new Error('タグ一覧の応答形式が不正です。再読み込みしてください。');
    return tags;
  }
}
export { TagEditApi };
