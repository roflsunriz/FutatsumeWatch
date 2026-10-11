/** 初期HLSの画質を選び、API上の利用可能な最大解像度を越えないようにする。 */
export function applyWatchHlsQuality(
  hls: Pick<HlsInstance, 'currentLevel' | 'autoLevelCapping'>,
  levels: ReadonlyArray<Pick<HlsLevel, 'height'>>,
  height: number,
  maxHeight: number
): boolean {
  if (!(maxHeight > 0)) return true;
  const allowed = levels
    .map((level, index) => ({ height: level.height ?? 0, index }))
    .filter((level) => level.height > 0 && level.height <= maxHeight)
    .sort((a, b) => b.height - a.height);
  if (!allowed.length) return false;
  hls.autoLevelCapping = allowed[0]!.index;
  hls.currentLevel = height > 0 ? (allowed.find((level) => level.height <= height) ?? allowed.at(-1)!).index : -1;
  return true;
}
