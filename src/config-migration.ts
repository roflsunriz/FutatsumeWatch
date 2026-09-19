// 旧設定はバックアップとして残し、新名称側に値がある場合は上書きしない。
export function migrateConfig(storage: Storage, keys: readonly string[]): void {
  const versionKey = 'FutatsumeWatch_storageVersion';
  if (storage.getItem(versionKey) === '1') return;
  for (const key of keys) {
    const oldValue = storage.getItem(`ZenzaWatch_${key}`);
    const newKey = `FutatsumeWatch_${key}`;
    if (oldValue === null || storage.getItem(newKey) !== null) continue;
    try {
      JSON.parse(oldValue);
    } catch {
      continue;
    }
    storage.setItem(newKey, oldValue);
  }
  storage.setItem(versionKey, '1');
}
