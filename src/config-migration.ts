import { formatLiteralNgRegexpInput, formatNgRegexpInput } from './ng-regexp-input';

const renamedConfigKeys: Readonly<Record<string, string>> = {};

function copyStoredValue(storage: Storage, target: string, sources: readonly string[], json = true): void {
  if (storage.getItem(target) !== null) return;
  for (const source of sources) {
    const value = storage.getItem(source);
    if (value === null) continue;
    if (json) {
      try {
        JSON.parse(value);
      } catch {
        continue;
      }
    }
    storage.setItem(target, value);
    return;
  }
}

export function migrateConfig(storage: Storage, keys: readonly string[]): void {
  const versionKey = 'FutatsumeWatch_storageVersion';
  const version = storage.getItem(versionKey);
  if (version === '3') return;
  if (version !== '2') {
    for (const key of keys) {
      const oldKey = renamedConfigKeys[key] ?? key;
      // v1移行後に削除・リセットした設定を復旧用の旧値から復活させない。
      if (version === '1' && oldKey === key) continue;
      const sources = version === '1' ? [] : [`ZenzaWatch_${oldKey}`];
      if (oldKey !== key) sources.unshift(`FutatsumeWatch_${oldKey}`);
      copyStoredValue(storage, `FutatsumeWatch_${key}`, sources);
    }
  }
  const read = (key: string, oldKey = key): unknown => {
    const current = storage.getItem(`FutatsumeWatch_${key}`);
    const source = current ?? (version === null ? storage.getItem(`ZenzaWatch_${oldKey}`) : null);
    if (source === null) return undefined;
    try {
      return JSON.parse(source) as unknown;
    } catch {
      return undefined;
    }
  };
  const expressions: string[] = [];
  const words = read('wordFilter');
  if (typeof words === 'string')
    expressions.push(...words.split(/\r?\n/).filter(Boolean).map(formatLiteralNgRegexpInput));
  else if (Array.isArray(words) && words.every((word) => typeof word === 'string'))
    expressions.push(...words.filter(Boolean).map(formatLiteralNgRegexpInput));
  const oldRegexp = read('wordRegFilter');
  if (Array.isArray(oldRegexp) && oldRegexp.every((expression) => typeof expression === 'string'))
    expressions.push(...oldRegexp);
  else if (typeof oldRegexp === 'string' && oldRegexp) {
    const flags = read('wordRegFilterFlags');
    expressions.push(formatNgRegexpInput(oldRegexp, typeof flags === 'string' ? flags : ''));
  }
  storage.setItem('FutatsumeWatch_wordRegFilter', JSON.stringify([...new Set(expressions)]));
  storage.setItem(versionKey, '3');
}

// 書き出してあった旧設定も読み込めるよう、現行キーを優先して変換する。
export function migrateImportedConfig(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new TypeError('設定データはオブジェクト形式で指定してください');
  }
  const result: Record<string, unknown> = { ...data };
  for (const [key, oldKey] of Object.entries(renamedConfigKeys)) {
    if (!Object.hasOwn(result, key) && Object.hasOwn(result, oldKey)) result[key] = result[oldKey];
    delete result[oldKey];
  }
  const expressions: string[] = [];
  const words = result.wordFilter;
  if (words !== undefined) {
    if (typeof words === 'string')
      expressions.push(...words.split(/\r?\n/).filter(Boolean).map(formatLiteralNgRegexpInput));
    else if (Array.isArray(words) && words.every((word) => typeof word === 'string'))
      expressions.push(...words.filter(Boolean).map(formatLiteralNgRegexpInput));
    else throw new TypeError('旧NGワード設定の値の型が正しくありません。');
  }
  const regexp = result.wordRegFilter;
  if (regexp !== undefined) {
    if (Array.isArray(regexp) && regexp.every((expression) => typeof expression === 'string'))
      expressions.push(...regexp);
    else if (typeof regexp === 'string' && regexp) {
      const flags = result.wordRegFilterFlags;
      if (flags !== undefined && typeof flags !== 'string')
        throw new TypeError('旧NG正規表現フラグの値の型が正しくありません。');
      expressions.push(formatNgRegexpInput(regexp, typeof flags === 'string' ? flags : ''));
    } else if (typeof regexp !== 'string') throw new TypeError('NG正規表現設定の値の型が正しくありません。');
  }
  if (words !== undefined || regexp !== undefined) result.wordRegFilter = [...new Set(expressions)];
  delete result.wordFilter;
  delete result.wordRegFilterFlags;
  return result;
}

export function migrateSharedStorage(local: Storage, session: Storage): void {
  const versionKey = 'FutatsumeWatch_sharedStorageVersion';
  if (local.getItem(versionKey) !== '1') {
    copyStoredValue(local, 'FutatsumeWatch_whiteHost', ['ZenzaWatch_whiteHost'], false);
    copyStoredValue(local, 'MylistPocket_config_ng.syncFutatsume', ['MylistPocket_config_ng.syncZenza']);
    local.setItem(versionKey, '1');
  }
  if (session.getItem(versionKey) !== '1') {
    copyStoredValue(session, 'FutatsumeWatchPlaylist', ['ZenzaWatchPlaylist']);
    copyStoredValue(session, 'FutatsumeWatch_PlayingStatus', ['ZenzaWatch_PlayingStatus']);
    session.setItem(versionKey, '1');
  }
}
