export interface NgRegexpInput {
  pattern: string;
  flags: string;
}

export function formatNgRegexpInput(pattern: string, flags: string): string {
  let escaped = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;
    if (char === '/') {
      let slashes = 0;
      for (let previous = index - 1; previous >= 0 && pattern[previous] === '\\'; previous--) slashes++;
      if (slashes % 2 === 0) escaped += '\\';
    }
    escaped += char;
  }
  return `/${escaped}/${flags}`;
}

export function parseNgRegexpInput(value: string): NgRegexpInput {
  if (!value.startsWith('/')) throw new SyntaxError('正規表現は /パターン/フラグ の形式で入力してください');
  let delimiter = -1;
  for (let index = value.length - 1; index > 0; index--) {
    if (value[index] !== '/') continue;
    let slashes = 0;
    for (let previous = index - 1; previous >= 0 && value[previous] === '\\'; previous--) slashes++;
    if (slashes % 2 === 0) {
      delimiter = index;
      break;
    }
  }
  if (delimiter < 1) throw new SyntaxError('正規表現は /パターン/フラグ の形式で入力してください');
  const pattern = value.slice(1, delimiter);
  const flags = value.slice(delimiter + 1);
  Reflect.construct(RegExp, [pattern, flags]);
  return { pattern, flags };
}

export function normalizeNgRegexpInputLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parsed = parseNgRegexpInput(line);
      return formatNgRegexpInput(parsed.pattern, parsed.flags);
    });
}

export function escapeNgRegexpLiteral(value: string): string {
  return value
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function formatLiteralNgRegexpInput(value: string): string {
  return formatNgRegexpInput(escapeNgRegexpLiteral(value.trim()), 'i');
}
