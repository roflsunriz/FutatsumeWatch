import { expect, test } from 'bun:test';
import { applyWatchHlsQuality } from '../../src/hls/watch-hls-quality';

test('初期HLSで明示画質を選択し、利用可能な最大画質へ自動画質を制限する', () => {
  const hls = { currentLevel: -1, autoLevelCapping: -1 };
  const levels = [180, 360, 720, 1080].map((height) => ({ height }));
  expect(applyWatchHlsQuality(hls, levels, 360, 720)).toBe(true);
  expect(hls.currentLevel).toBe(1);
  expect(hls.autoLevelCapping).toBe(2);
  expect(applyWatchHlsQuality(hls, levels, 0, 720)).toBe(true);
  expect(hls.currentLevel).toBe(-1);
  expect(hls.autoLevelCapping).toBe(2);
  expect(applyWatchHlsQuality(hls, levels, 480, 720)).toBe(true);
  expect(hls.currentLevel).toBe(1);
});

test('従来の単一画質HLSには干渉せず、対応する画質がない場合は失敗する', () => {
  const hls = { currentLevel: 7, autoLevelCapping: 8 };
  expect(applyWatchHlsQuality(hls, [{ height: 1080 }], 0, 0)).toBe(true);
  expect(hls).toEqual({ currentLevel: 7, autoLevelCapping: 8 });
  expect(applyWatchHlsQuality(hls, [{ height: 1080 }], 360, 720)).toBe(false);
  expect(hls).toEqual({ currentLevel: 7, autoLevelCapping: 8 });
});
