// 旧名称を知るのはこの移行境界だけ。元データは復旧用に残す。
const renamedConfigKeys: Readonly<Record<string, string>> = {
  autoFutatsumeTube: 'autoZenTube',
  bestFutatsumeTube: 'bestZenTube',
};

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
  if (version === '2') return;
  for (const key of keys) {
    const oldKey = renamedConfigKeys[key] ?? key;
    // v1移行後に削除・リセットした設定を復旧用の旧値から復活させない。
    if (version === '1' && oldKey === key) continue;
    const sources = version === '1' ? [] : [`ZenzaWatch_${oldKey}`];
    if (oldKey !== key) sources.unshift(`FutatsumeWatch_${oldKey}`);
    copyStoredValue(storage, `FutatsumeWatch_${key}`, sources);
  }
  storage.setItem(versionKey, '2');
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
  return result;
}

export function migrateAddonConfig(storage: Storage, addon: 'hls' | 'gamepad', keys: readonly string[]): void {
  const prefix = addon === 'hls' ? 'FutatsumeWatch_video.hls.' : 'FutatsumeGamePad_config_';
  const oldPrefix = addon === 'hls' ? 'ZenzaWatch_video.hls.' : 'ZenzaGamePad_config_';
  const versionKey = `FutatsumeWatch_${addon}StorageVersion`;
  if (storage.getItem(versionKey) === '1') return;
  for (const key of keys) copyStoredValue(storage, prefix + key, [oldPrefix + key]);
  storage.setItem(versionKey, '1');
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
