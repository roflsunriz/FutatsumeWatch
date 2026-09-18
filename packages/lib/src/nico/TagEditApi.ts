import { util } from '../../../../src/util';

interface FetchUtilLike {
  fetch: (url: string | URL, init?: RequestInit) => Promise<Response>;
}

interface TagEditLoadParams {
  videoId: string;
  tag?: string;
  id?: string;
  csrfToken?: string;
  editKey?: string;
  ownerLock?: number;
  description?: string;
}

interface TagApiEnvelope {
  data?: unknown;
}

interface TagEditRequestOptions {
  method?: string;
  credentials?: string;
  headers?: Record<string, string | number | undefined>;
  body?: string;
}
//===BEGIN===

class TagEditApi {
  load(videoId: string, editKey: string): Promise<unknown> {
    const url = `https://nvapi.nicovideo.jp/v2/videos/${videoId}/tags`;
    //const url = `/tag_edit/${videoId}/?res_type=json&cmd=tags&_=${Date.now()}`;
    const options = {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Frontend-Id': 6,
        'X-Frontend-Version': 0,
        'X-Request-With': 'https://www.nicovideo.jp',
        'X-Niconico-Language': 'ja-jp',
        'X-Tag-Edit-Key': editKey,
      },
    };
    return this._fetch(url, options)
      .then((result: TagApiEnvelope) => {
        return result.data;
      })
      .catch((err: unknown) => {
        throw new Error('タグ一覧の取得失敗', { result: err, status: 'fail' } as unknown as ErrorOptions);
      });
  }

  async add({ videoId, tag, csrfToken, editKey, ownerLock = 0 }: TagEditLoadParams): Promise<unknown> {
    const encodedTag = encodeURIComponent(tag as string);
    const url = `https://nvapi.nicovideo.jp/v2/videos/${videoId}/tags?tag=${encodedTag}`;
    //const url = `/tag_edit/${videoId}/`;
    /*
    const body = this._buildQuery({
      cmd: 'add',
      tag,
      id: '',
      token: csrfToken,
      watch_auth_key: watchAuthKey,
      owner_lock: ownerLock,
      res_type: 'json'
    });
*/
    const options = {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Frontend-Id': 6,
        'X-Frontend-Version': 0,
        'X-Request-With': 'https://www.nicovideo.jp',
        'X-Niconico-Language': 'ja-jp',
        'X-Tag-Edit-Key': editKey,
      },
    };

    return await this._fetch(url, options)
      .then((result: TagApiEnvelope) => {
        return result.data;
      })
      .catch((err: unknown) => {
        throw new Error('タグの追加失敗', { result: err, status: 'fail' } as unknown as ErrorOptions);
      });

    //return await this.load(videoId);
  }

  async remove({ videoId, tag = '', id, csrfToken, editKey, ownerLock = 0 }: TagEditLoadParams): Promise<unknown> {
    const encodedTag = encodeURIComponent(tag);
    const url = `https://nvapi.nicovideo.jp/v2/videos/${videoId}/tags?tag=${encodedTag}`;

    //const url = `/tag_edit/${videoId}/`;
    /*
    const body = this._buildQuery({
      cmd: 'remove',
      tag, // いらないかも →というかこれだけ必要というか
      id,
      token: csrfToken,
      watch_auth_key: watchAuthKey,
      owner_lock: ownerLock,
      res_type: 'json'
    });
*/
    const options = {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Frontend-Id': 6,
        'X-Frontend-Version': 0,
        'X-Request-With': 'https://www.nicovideo.jp',
        'X-Niconico-Language': 'ja-jp',
        'X-Tag-Edit-Key': editKey,
      },
    };

    return await this._fetch(url, options)
      .then((result: TagApiEnvelope) => {
        return result.data;
      })
      .catch((err: unknown) => {
        throw new Error('タグの削除失敗', { result: err, status: 'fail' } as unknown as ErrorOptions);
      });
    //return await this.load(videoId);
  }

  _buildQuery(params: Record<string, string>): string {
    const t: Array<string> = [];
    Object.keys(params).forEach((key: string) => {
      t.push(`${key}=${encodeURIComponent(params[key] as string)}`);
    });
    return t.join('&');
  }

  async _fetch(url: string, options: TagEditRequestOptions): Promise<TagApiEnvelope> {
    const res: unknown = await (util as unknown as FetchUtilLike)
      .fetch(url, options as unknown as RequestInit)
      .catch((err: unknown) => {
        throw new Error('タグ一覧の取得失敗', { result: err, status: 'fail' } as unknown as ErrorOptions);
      });
    const body: unknown = await (res as Response).json();
    return body as TagApiEnvelope;
  }
}

//===END===
//
export { TagEditApi };

/**

 // タグ一覧取得
 //www.nicovideo.jp/tag_edit/smXXXXXX/?res_type=json&cmd=tags

 { "is_owner": true,
   "is_uneditable_tag": false,
   "tags": [
     // can_cat カテゴリタグにできるか？ cat カテゴリタグか？ dic 大百科があるか？
     {"id": "11111", "tag": "aaa", "owner_lock": 0, "can_cat": false, "cat": null, "dic": true},
     {"id": "22222", "tag": "bbb", "owner_lock": 0, "can_cat": false, "cat": null, "dic": true},
     {"id": "33333", "tag": "ccc", "owner_lock": 0, "can_cat": false, "cat": null, "dic": true},
     {"id": "44444", "tag": "ddd", "owner_lock": 0, "can_cat": false, "cat": null, "dic": true},
     {"id": "55555", "tag": "eee", "owner_lock": 0, "can_cat": false, "cat": null}
   ],
   "status":"ok"
 }

 // タグ追加 レスポンスは一覧取得と同じ
 // URL: http://www.nicovideo.jp/tag_edit/smXXXXXX/
 // request POST
 res_type: json
 cmd: add
 tag: aaa bbb ccc ddd eee
 id: '' 空文字でよさそう
 token: CSRF_TOKEN
 watch_auth_key: WATCH_AUTH_KEY,
 owner_lock:1 ????

 // タグ削除
 res_type: json
 cmd: remove
 tag: eee
 id: 55555  // 削除するタグのID
 token: CSRF_TOKEN
 watch_auth_key: WATCH_AUTH_KEY,
 owner_lock: 1 ????


 // 編集系のエラー時は、statusがfailになるのとerror_msgが入っている以外は同じ 失敗でもタグ一覧は入っている
 { "is_owner":true,
   "is_uneditable_tag":false,
   "error_msg":"エラーメッセージ内容",
   "tags":[], // タグ一覧
   "status":"fail"
 }
 */
