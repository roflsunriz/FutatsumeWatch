import { netUtil } from '../infra/net-util';

export interface EditableTag {
  name: string;
  isLocked?: boolean;
  isNicodicArticleExists?: boolean;
}

interface TagResponse {
  meta?: { status?: number; errorCode?: string };
  data?: { tags?: EditableTag[] };
}

function parseTags(value: unknown): EditableTag[] {
  if (!Array.isArray(value)) throw new Error('タグ一覧の応答形式が不正です。画面を再読み込みしてください。');
  return value.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('name' in entry) || typeof entry.name !== 'string')
      throw new Error('タグ一覧の応答形式が不正です。画面を再読み込みしてください。');
    return {
      name: entry.name,
      isLocked: 'isLocked' in entry && entry.isLocked === true,
      isNicodicArticleExists: 'isNicodicArticleExists' in entry && entry.isNicodicArticleExists === true,
    };
  });
}

export class TagEditApi {
  async change(
    method: 'POST' | 'DELETE',
    videoId: string,
    tag: string,
    editKey: string
  ): Promise<{ tags: EditableTag[]; editKey: string }> {
    try {
      return { tags: await this.request(method, videoId, tag, editKey), editKey };
    } catch (error) {
      if (!(error instanceof TagRequestError) || error.code !== 'KEY_EXPIRED') throw error;
      // 公式プレイヤーと同様にwatch応答から一度だけ新しいキーを取り直す。
      const fresh = await this.refreshKey(videoId);
      return { tags: await this.request(method, videoId, tag, fresh), editKey: fresh };
    }
  }

  private async request(
    method: 'POST' | 'DELETE',
    videoId: string,
    tag: string,
    editKey: string
  ): Promise<EditableTag[]> {
    if (!videoId || !tag.trim() || !editKey) throw new Error('タグを編集できません。ログイン状態を確認してください。');
    const url = new URL(`https://nvapi.nicovideo.jp/v2/videos/${encodeURIComponent(videoId)}/tags`);
    url.searchParams.set('tag', tag);
    const response = (await netUtil.fetch(url.href, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json;charset=utf-8',
        'X-Tag-Edit-Key': editKey,
        'X-Request-With': 'https://www.nicovideo.jp',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
      },
    })) as Response;
    const body = (await response.json()) as TagResponse;
    if (!response.ok || (body.meta?.status ?? 200) >= 400) {
      throw new TagRequestError(body.meta?.errorCode, response.status);
    }
    if (body.data?.tags) return parseTags(body.data.tags);
    // 書込み成功応答が一覧を含まない世代では、読み取り要求で確定状態を得る。
    const loaded = (await netUtil.fetch(`https://nvapi.nicovideo.jp/v2/videos/${encodeURIComponent(videoId)}/tags`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json;charset=utf-8',
        'X-Tag-Edit-Key': editKey,
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
      },
    })) as Response;
    if (!loaded.ok)
      throw new Error(`タグ一覧の再取得に失敗しました (HTTP ${loaded.status})。画面を再読み込みしてください。`);
    const refreshed = (await loaded.json()) as TagResponse;
    return parseTags(refreshed.data?.tags);
  }

  private async refreshKey(videoId: string): Promise<string> {
    const response = (await netUtil.fetch(
      `https://www.nicovideo.jp/watch/${encodeURIComponent(videoId)}?responseType=json`,
      {
        credentials: 'include',
      }
    )) as Response;
    if (!response.ok)
      throw new Error(`タグ編集キーを更新できませんでした (HTTP ${response.status})。画面を再読み込みしてください。`);
    const body = (await response.json()) as {
      data?: { response?: { tag?: { edit?: { editKey?: string; isEditable?: boolean } } } };
    };
    const edit = body.data?.response?.tag?.edit;
    if (!edit?.editKey || edit.isEditable === false)
      throw new Error('タグ編集キーを更新できませんでした。ログイン状態を確認してください。');
    return edit.editKey;
  }
}

class TagRequestError extends Error {
  constructor(
    readonly code: string | undefined,
    status: number
  ) {
    super(`タグの処理に失敗しました (${code ?? `HTTP ${status}`})。状態を確認してください。`);
  }
}
