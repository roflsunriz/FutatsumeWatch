// Product constraints belong at the Config import boundary, not in the generic
// DataStorage transaction. Older exports used numeric strings in select boxes.
const ranges: Readonly<Record<string, readonly [number, number]>> = {
  volume: [0, 1],
  speakLarkVolume: [0, 1],
  menuScale: [0.8, 2],
  baseChatScale: [0.5, 2],
  commentSpeedRate: [0.5, 2],
  commentLayerOpacity: [0.1, 1],
  'commentLayer.easyCommentOpacity': [0.1, 1],
  'commentLayer.aiCommentOpacity': [0.1, 1],
  playbackRate: [0.1, 10],
  'search.limit': [1, 1600],
};
const enums: Readonly<Record<string, readonly string[]>> = {
  sharedNgLevel: ['NONE', 'LOW', 'MID', 'HIGH', 'MAX'],
  'commentLayer.textShadowType': ['', 'shadow-type2', 'shadow-type3', 'shadow-stroke', 'shadow-dokaben'],
  fullscreenControlBarMode: ['auto', 'always-show', 'always-hide'],
};
const stringLists = new Set(['wordFilter', 'commandFilter', 'userIdFilter']);
const stepped = new Set([
  'baseChatScale',
  'commentLayerOpacity',
  'commentLayer.easyCommentOpacity',
  'commentLayer.aiCommentOpacity',
]);

export function validateImportedConfig(
  data: Record<string, unknown>,
  defaults: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, input] of Object.entries(data)) {
    // Old releases exported retired keys. Preserve the previous ignore contract.
    if (!Object.hasOwn(defaults, key)) continue;
    const expected = defaults[key];
    let value = input;
    if (
      typeof expected === 'number' &&
      typeof value === 'string' &&
      /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
    )
      value = Number(value);
    const validType = stringLists.has(key)
      ? typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
      : Array.isArray(expected)
        ? Array.isArray(value)
        : typeof value === typeof expected && value !== null;
    if (!validType || (typeof value === 'number' && !Number.isFinite(value)))
      throw new TypeError(`設定「${key}」の値の型が正しくありません。`);
    const range = ranges[key];
    if (range && (typeof value !== 'number' || value < range[0] || value > range[1]))
      throw new RangeError(`設定「${key}」は ${range[0]} から ${range[1]} の範囲で指定してください。`);
    if (stepped.has(key) && typeof value === 'number' && Math.abs(value * 10 - Math.round(value * 10)) > 1e-8)
      throw new RangeError(`設定「${key}」は 0.1 刻みで指定してください。`);
    if (enums[key] && !enums[key].includes(value as string))
      throw new RangeError(`設定「${key}」の選択肢が正しくありません。`);
    if (
      key === 'commentLayer.ownerCommentShadowColor' &&
      (typeof value !== 'string' || !/^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]+)$/i.test(value))
    )
      throw new TypeError('投稿者コメントの影の色が正しくありません。');
    result[key] = value;
  }
  const source = result.wordRegFilter ?? defaults.wordRegFilter;
  const flags = result.wordRegFilterFlags ?? defaults.wordRegFilterFlags;
  if (typeof source === 'string' && typeof flags === 'string') {
    try {
      new RegExp(source, flags);
    } catch (cause) {
      throw new TypeError('NGの正規表現またはフラグが正しくありません。', { cause });
    }
  }
  return result;
}
