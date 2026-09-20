/** ローカルの判定のみ。通信・保存・ログ出力をせず、認証値を許可や結果へ保持しない。 */
type BasePermit = { readonly id: string };
export type LiveWritePermit = BasePermit &
  (
    | {
        readonly kind: 'comment-post';
        readonly videoId: string;
        readonly threadId: string;
        readonly body: string;
        readonly commands: readonly string[];
        readonly vposMs: { readonly min: number; readonly max: number };
      }
    | { readonly kind: 'tag-add' | 'tag-remove'; readonly videoId: string; readonly tag: string }
    | {
        readonly kind: 'mylist-create';
        readonly name: string;
        readonly description: string;
        readonly isPublic: false;
        readonly defaultSortKey: 'addedAt';
        readonly defaultSortOrder: 'asc' | 'desc';
        readonly encoding: 'form';
      }
    | { readonly kind: 'mylist-add'; readonly mylistId: string; readonly videoId: string; readonly description: string }
    | { readonly kind: 'mylist-item-remove'; readonly mylistId: string; readonly itemId: string }
    | { readonly kind: 'mylist-remove'; readonly mylistId: string }
  );
export type LiveWriteKind = LiveWritePermit['kind'];
export interface LiveWriteRequest {
  readonly method: string;
  readonly url: string;
  readonly postData?: string;
  /** Content-Typeだけを渡す。Cookie/Authorizationなどのヘッダーは不要。 */
  readonly contentType?: string;
  /** OPTIONSの場合だけAccess-Control-Request-Methodの値を渡す。 */
  readonly preflightMethod?: string;
}
export type LiveWriteDecision =
  | { readonly action: 'allow-write' | 'allow-preflight'; readonly permitId: string; readonly kind: LiveWriteKind }
  | { readonly action: 'not-write' }
  | {
      readonly action: 'deny';
      readonly reason:
        | 'invalid-url'
        | 'invalid-request'
        | 'no-matching-permit'
        | 'already-consumed'
        | 'unknown-fields'
        | 'invalid-body'
        | 'content-type';
    };
export interface CreatedMylistReceipt {
  readonly status: 200 | 201;
  readonly mylistId: string;
  readonly name: string;
  readonly description: string;
  readonly isPublic: false;
}
export interface AddedMylistItemReceipt {
  readonly status: 200 | 201;
  readonly mylistId: string;
  readonly itemId: string;
  readonly videoId: string;
}
type Denial = Extract<LiveWriteDecision, { action: 'deny' }>['reason'];
interface Entry {
  permit: LiveWritePermit;
  consumed: boolean;
}
const nvapi = 'https://nvapi.nicovideo.jp';
const commentApi = 'https://public.nvcomment.nicovideo.jp';
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const fields = (value: Record<string, unknown>, names: readonly string[]) =>
  Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
const decimalId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value);
const videoId = (value: unknown): value is string => typeof value === 'string' && /^[a-z]{2}[1-9]\d{0,19}$/.test(value);
const itemId = (value: unknown): value is string => decimalId(value) || videoId(value);
const text = (value: unknown): value is string => typeof value === 'string';
const command = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && !/\s/.test(value);
const nonempty = (value: unknown): value is string => text(value) && value.trim().length > 0;
function validPermit(value: unknown): value is LiveWritePermit {
  if (!record(value) || typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value.id)) return false;
  const exact = (...names: string[]) => fields(value, ['id', 'kind', ...names]);
  switch (value.kind) {
    case 'comment-post':
      return (
        exact('videoId', 'threadId', 'body', 'commands', 'vposMs') &&
        videoId(value.videoId) &&
        decimalId(value.threadId) &&
        nonempty(value.body) &&
        value.body.length <= 75 &&
        Array.isArray(value.commands) &&
        (value.commands as unknown[]).every(command) &&
        record(value.vposMs) &&
        fields(value.vposMs, ['min', 'max']) &&
        typeof value.vposMs.min === 'number' &&
        typeof value.vposMs.max === 'number' &&
        Number.isSafeInteger(value.vposMs.min) &&
        Number.isSafeInteger(value.vposMs.max) &&
        value.vposMs.min >= 0 &&
        value.vposMs.max >= value.vposMs.min
      );
    case 'tag-add':
    case 'tag-remove':
      return exact('videoId', 'tag') && videoId(value.videoId) && nonempty(value.tag);
    case 'mylist-create':
      return (
        exact('name', 'description', 'isPublic', 'defaultSortKey', 'defaultSortOrder', 'encoding') &&
        nonempty(value.name) &&
        text(value.description) &&
        value.isPublic === false &&
        value.defaultSortKey === 'addedAt' &&
        (value.defaultSortOrder === 'asc' || value.defaultSortOrder === 'desc') &&
        value.encoding === 'form'
      );
    case 'mylist-add':
      return (
        exact('mylistId', 'videoId', 'description') &&
        decimalId(value.mylistId) &&
        videoId(value.videoId) &&
        text(value.description)
      );
    case 'mylist-item-remove':
      return exact('mylistId', 'itemId') && decimalId(value.mylistId) && itemId(value.itemId);
    case 'mylist-remove':
      return exact('mylistId') && decimalId(value.mylistId);
    default:
      return false;
  }
}
function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    // URL再解釈（dot path、userinfo、既定port、未エスケープ文字）による別表現も拒否する。
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !raw.includes('#') &&
      url.href === raw &&
      !/^https:\/\/[^/]*:/.test(raw)
      ? url
      : null;
  } catch {
    return null;
  }
}
function form(raw: string): Record<string, string> | null {
  try {
    decodeURIComponent(raw.replaceAll('+', ' '));
    const result: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [key, value] of new URLSearchParams(raw)) {
      if (Object.hasOwn(result, key)) return null;
      result[key] = value;
    }
    return result;
  } catch {
    return null;
  }
}
function query(url: URL, expected: Record<string, string>): boolean {
  const actual = form(url.search.slice(1));
  return (
    actual !== null &&
    fields(actual, Object.keys(expected)) &&
    Object.keys(expected).every((key) => actual[key] === expected[key])
  );
}
function jsonObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value)) return null;
    // JSON.parseは重複キーを上書きするため、flatな要求のキー重複も別途拒否する。
    const names = new Set<string>();
    let depth = 0;
    for (let at = 0; at < raw.length; at++) {
      const character = raw[at];
      if (character === '"') {
        const start = at++;
        while (at < raw.length && raw[at] !== '"') {
          if (raw[at] === '\\') at++;
          at++;
        }
        let next = at + 1;
        while (next < raw.length && /\s/.test(raw[next]!)) next++;
        if (depth === 1 && raw[next] === ':') {
          const key: unknown = JSON.parse(raw.slice(start, at + 1));
          if (typeof key !== 'string' || names.has(key)) return null;
          names.add(key);
        }
      } else if (character === '{' || character === '[') depth++;
      else if (character === '}' || character === ']') depth--;
    }
    return value;
  } catch {
    return null;
  }
}
function target(permit: LiveWritePermit): {
  origin: string;
  path: string;
  method: string;
  query: Record<string, string>;
} {
  switch (permit.kind) {
    case 'comment-post':
      return {
        origin: commentApi,
        path: `/v1/threads/${permit.threadId}/comments`,
        method: 'POST',
        query: { pc: '1' },
      };
    case 'tag-add':
    case 'tag-remove':
      return {
        origin: nvapi,
        path: `/v2/videos/${permit.videoId}/tags`,
        method: permit.kind === 'tag-add' ? 'POST' : 'DELETE',
        query: { tag: permit.tag },
      };
    case 'mylist-create':
      return { origin: nvapi, path: '/v1/users/me/mylists', method: 'POST', query: {} };
    case 'mylist-add':
      return {
        origin: nvapi,
        path: `/v1/users/me/mylists/${permit.mylistId}/items`,
        method: 'POST',
        query: { itemId: permit.videoId, description: permit.description },
      };
    case 'mylist-item-remove':
      return {
        origin: nvapi,
        path: `/v1/users/me/mylists/${permit.mylistId}/items`,
        method: 'DELETE',
        query: { itemIds: permit.itemId },
      };
    case 'mylist-remove':
      return { origin: nvapi, path: `/v1/users/me/mylists/${permit.mylistId}`, method: 'DELETE', query: {} };
  }
}
function bodyMatches(permit: LiveWritePermit, request: LiveWriteRequest): Denial | null {
  const raw = request.postData ?? '';
  const mime = request.contentType
    ?.match(/^\s*(application\/(?:json|x-www-form-urlencoded))\s*(?:;\s*charset\s*=\s*(?:utf-8|"utf-8")\s*)?$/i)?.[1]
    ?.toLowerCase();
  if (
    permit.kind === 'tag-add' ||
    permit.kind === 'tag-remove' ||
    permit.kind === 'mylist-item-remove' ||
    permit.kind === 'mylist-remove'
  )
    return raw === '' ? null : 'invalid-body';
  const encoding = permit.kind === 'comment-post' ? 'json' : permit.kind === 'mylist-create' ? permit.encoding : 'form';
  if (mime !== (encoding === 'json' ? 'application/json' : 'application/x-www-form-urlencoded')) return 'content-type';
  const body = encoding === 'json' ? jsonObject(raw) : form(raw);
  if (!body) return 'invalid-body';
  if (permit.kind === 'comment-post') {
    if (!fields(body, ['body', 'commands', 'vposMs', 'postKey', 'videoId'])) return 'unknown-fields';
    // postKeyは今回生成された非空文字列であることだけを確認し、比較値・結果・状態には保存しない。
    return body.body === permit.body &&
      body.videoId === permit.videoId &&
      nonempty(body.postKey) &&
      Array.isArray(body.commands) &&
      body.commands.length === permit.commands.length &&
      (body.commands as unknown[]).every((value, index) => value === permit.commands[index]) &&
      typeof body.vposMs === 'number' &&
      Number.isSafeInteger(body.vposMs) &&
      body.vposMs >= permit.vposMs.min &&
      body.vposMs <= permit.vposMs.max
      ? null
      : 'invalid-body';
  }
  if (permit.kind === 'mylist-create') {
    if (!fields(body, ['name', 'description', 'isPublic', 'defaultSortKey', 'defaultSortOrder']))
      return 'unknown-fields';
    return body.name === permit.name &&
      body.description === permit.description &&
      body.isPublic === 'false' &&
      body.defaultSortKey === permit.defaultSortKey &&
      body.defaultSortOrder === permit.defaultSortOrder
      ? null
      : 'invalid-body';
  }
  if (!fields(body, ['itemId', 'description'])) return 'unknown-fields';
  if (permit.kind !== 'mylist-add') return 'invalid-body';
  return body.itemId === permit.videoId && body.description === permit.description ? null : 'invalid-body';
}

/** 1回の承認済み検証で同じインスタンスを使う。再起動時の実行済み記録は呼出側で管理する。 */
export class LiveWritePermitGuard {
  readonly #entries = new Map<string, Entry>();
  readonly #kinds = new Set<LiveWriteKind>();
  #created: { permitId: string; mylistId: string } | undefined;
  #added: { permitId: string; mylistId: string; itemId: string; videoId: string } | undefined;

  arm(permit: LiveWritePermit): void {
    if (!validPermit(permit)) throw new Error('invalid-permit');
    if (this.#entries.has(permit.id) || this.#kinds.has(permit.kind)) throw new Error('permit-already-armed');
    if ('mylistId' in permit && this.#created?.mylistId !== permit.mylistId)
      throw new Error('mylist-not-created-by-this-run');
    if (
      permit.kind === 'mylist-item-remove' &&
      (this.#added?.mylistId !== permit.mylistId || this.#added.itemId !== permit.itemId)
    )
      throw new Error('item-not-added-by-this-run');
    this.#entries.set(permit.id, { permit: structuredClone(permit), consumed: false });
    this.#kinds.add(permit.kind);
  }
  /** 成功応答を確認した呼出側が非認証メタデータだけを渡す。失敗応答では呼ばない。 */
  recordCreatedMylist(permitId: string, receipt: CreatedMylistReceipt): void {
    const entry = this.#entries.get(permitId),
      permit = entry?.permit;
    if (
      !entry?.consumed ||
      permit?.kind !== 'mylist-create' ||
      !record(receipt) ||
      !fields(receipt, ['status', 'mylistId', 'name', 'description', 'isPublic']) ||
      ![200, 201].includes(receipt.status) ||
      !decimalId(receipt.mylistId) ||
      receipt.name !== permit.name ||
      receipt.description !== permit.description ||
      receipt.isPublic !== false
    )
      throw new Error('invalid-created-mylist-receipt');
    if (this.#created && (this.#created.permitId !== permitId || this.#created.mylistId !== receipt.mylistId))
      throw new Error('created-mylist-already-bound');
    this.#created = { permitId, mylistId: receipt.mylistId };
  }
  recordAddedItem(permitId: string, receipt: AddedMylistItemReceipt): void {
    const entry = this.#entries.get(permitId),
      permit = entry?.permit;
    if (
      !entry?.consumed ||
      permit?.kind !== 'mylist-add' ||
      !record(receipt) ||
      !fields(receipt, ['status', 'mylistId', 'itemId', 'videoId']) ||
      ![200, 201].includes(receipt.status) ||
      !itemId(receipt.itemId) ||
      receipt.mylistId !== permit.mylistId ||
      receipt.mylistId !== this.#created?.mylistId ||
      receipt.videoId !== permit.videoId
    )
      throw new Error('invalid-added-item-receipt');
    if (this.#added && (this.#added.permitId !== permitId || this.#added.itemId !== receipt.itemId))
      throw new Error('added-item-already-bound');
    this.#added = { permitId, mylistId: receipt.mylistId, itemId: receipt.itemId, videoId: receipt.videoId };
  }
  decide(request: LiveWriteRequest): LiveWriteDecision {
    if (
      typeof request.method !== 'string' ||
      typeof request.url !== 'string' ||
      (request.postData !== undefined && (typeof request.postData !== 'string' || request.postData.length > 65536)) ||
      (request.contentType !== undefined && typeof request.contentType !== 'string')
    )
      return { action: 'deny', reason: 'invalid-request' };
    const url = parseUrl(request.url);
    if (!url) return { action: 'deny', reason: 'invalid-url' };
    // not-writeは許可ではない。GET/HEADにも呼出側の読み取りポリシーを必ず適用する。
    if (request.method === 'GET' || request.method === 'HEAD')
      return request.postData ? { action: 'deny', reason: 'invalid-request' } : { action: 'not-write' };
    const preflight = request.method === 'OPTIONS';
    if (preflight && request.postData) return { action: 'deny', reason: 'invalid-request' };
    const method = preflight ? request.preflightMethod : request.method;
    for (const entry of this.#entries.values()) {
      const permit = entry.permit,
        expected = target(permit);
      if (
        method !== expected.method ||
        url.origin !== expected.origin ||
        url.pathname !== expected.path ||
        !query(url, expected.query)
      )
        continue;
      if (entry.consumed) return { action: 'deny', reason: 'already-consumed' };
      if (preflight) return { action: 'allow-preflight', permitId: permit.id, kind: permit.kind };
      const reason = bodyMatches(permit, request);
      if (reason) return { action: 'deny', reason };
      // 応答待ちにせず、通すと決めた瞬間に消費する。失敗/取消/応答喪失でも戻さない。
      entry.consumed = true;
      return { action: 'allow-write', permitId: permit.id, kind: permit.kind };
    }
    return { action: 'deny', reason: 'no-matching-permit' };
  }
  status(): ReadonlyArray<{ id: string; kind: LiveWriteKind; consumed: boolean }> {
    return [...this.#entries.values()].map(({ permit, consumed }) => ({ id: permit.id, kind: permit.kind, consumed }));
  }
}
