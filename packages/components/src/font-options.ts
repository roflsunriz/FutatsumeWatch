export interface FontOption {
  label: string;
  value: string;
  localName?: string;
  disabled?: boolean;
}

type MeasureFont = (fontFamily: string) => number;

const sample = 'mmmmmmmmWWWWiiii1111漢字かなカナ';
const fallbacks = ['monospace', 'serif', 'sans-serif'] as const;
const localFonts = [
  'Yu Gothic',
  'Yu Mincho',
  'Meiryo',
  'MS Gothic',
  'MS Mincho',
  'Hiragino Kaku Gothic ProN',
  'Hiragino Mincho ProN',
  'Osaka',
  'Noto Sans JP',
  'Noto Serif JP',
  'Noto Sans CJK JP',
  'Noto Serif CJK JP',
  'Segoe UI',
  'Arial',
  'Arial Black',
  'Times New Roman',
  'Courier New',
  'Consolas',
  'Menlo',
  'DejaVu Sans',
  'Liberation Sans',
] as const;

const quoteFamily = (name: string): string => `'${name.replaceAll("'", "\\'")}'`;

export function isFontAvailable(name: string, measure: MeasureFont): boolean {
  return fallbacks.some(
    (fallback) => Math.abs(measure(`${quoteFamily(name)}, ${fallback}`) - measure(fallback)) > 0.01
  );
}

function splitFamilies(value: string): string[] {
  return value
    .split(',')
    .map((family) => family.trim().replace(/^(['"])(.*)\1$/, '$2'))
    .filter(Boolean);
}

function isCurrentValueAvailable(value: string, measure: MeasureFont): boolean {
  return splitFamilies(value).some(
    (family) => fallbacks.includes(family as (typeof fallbacks)[number]) || isFontAvailable(family, measure)
  );
}

export function buildFontOptions(currentValue: string, measure: MeasureFont, language = 'ja'): FontOption[] {
  const japanese = language.startsWith('ja');
  const options: FontOption[] = [
    { label: japanese ? 'ブラウザの既定' : 'Browser default', value: '' },
    { label: 'sans-serif', value: 'sans-serif' },
    { label: 'serif', value: 'serif' },
    { label: 'monospace', value: 'monospace' },
    ...localFonts
      .filter((name) => isFontAvailable(name, measure))
      .map((name) => ({ label: name, value: quoteFamily(name), localName: name })),
  ];
  if (currentValue && !options.some((option) => option.value === currentValue)) {
    options.push({
      label: isCurrentValueAvailable(currentValue, measure)
        ? `${currentValue} (${japanese ? '現在の設定' : 'current setting'})`
        : `${currentValue} (${japanese ? '利用不可' : 'unavailable'})`,
      value: currentValue,
      disabled: !isCurrentValueAvailable(currentValue, measure),
    });
  }
  return options;
}

export function getAvailableFontOptions(
  currentValue: string,
  ownerDocument: Document = document,
  language = navigator.language
): FontOption[] {
  const canvas = ownerDocument.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return buildFontOptions(currentValue, () => 0, language);
  return buildFontOptions(
    currentValue,
    (fontFamily) => {
      context.font = `72px ${fontFamily}`;
      return context.measureText(sample).width;
    },
    language
  );
}
