import { expect, test } from 'bun:test';
import { buildFontOptions, isFontAvailable } from '../../packages/components/src/font-options';

const widths = { monospace: 100, serif: 110, 'sans-serif': 120 } as const;
function measure(installed: ReadonlySet<string>): (fontFamily: string) => number {
  return (fontFamily) => {
    const quoted = /^'([^']+)'/.exec(fontFamily)?.[1];
    if (quoted && installed.has(quoted)) return 200 + quoted.length;
    const fallback = fontFamily.split(',').at(-1)?.trim() as keyof typeof widths;
    return widths[fallback] ?? 0;
  };
}

test('利用可能なローカルフォントと汎用ファミリーだけを選択肢にする', () => {
  const available = measure(new Set(['Yu Gothic', 'Arial']));
  expect(isFontAvailable('Yu Gothic', available)).toBe(true);
  expect(isFontAvailable('Meiryo', available)).toBe(false);
  const options = buildFontOptions('', available, 'ja-JP');
  expect(options.map((option) => option.value)).toEqual([
    '',
    'sans-serif',
    'serif',
    'monospace',
    "'Yu Gothic'",
    "'Arial'",
  ]);
});

test('旧保存値を勝手に消さず、利用不能なら選択中の無効項目として示す', () => {
  const available = measure(new Set(['Yu Gothic']));
  const usable = buildFontOptions("'Yu Gothic', monospace", available, 'ja-JP').at(-1)!;
  expect(usable).toMatchObject({ value: "'Yu Gothic', monospace", disabled: false });
  const unavailable = buildFontOptions("'Missing Font'", available, 'ja-JP').at(-1)!;
  expect(unavailable).toMatchObject({ value: "'Missing Font'", disabled: true });
  expect(unavailable.label).toContain('利用不可');
});
