// 人工映像の正本。動画ID別に長さ・比率・識別画素を変え、旧映像の残留を検出する。
export const mediaSpec = {
  sm9: { duration: 64, hue: 0, marker: 'red', channel: 0, frequency: 440, low: { width: 320, height: 180 }, high: { width: 640, height: 360 } },
  sm2057168: { duration: 40, hue: 90, marker: 'lime', channel: 1, frequency: 660, low: { width: 320, height: 240 }, high: { width: 640, height: 480 } },
  sm100: { duration: 24, hue: 180, marker: 'blue', channel: 2, frequency: 880, low: { width: 240, height: 320 }, high: { width: 480, height: 640 } },
} as const;
export type MediaWatchId = keyof typeof mediaSpec;
