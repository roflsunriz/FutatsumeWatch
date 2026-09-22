// FutatsumeWatch のユーザースクリプト生成に関する小さく型安全な基盤。
// 配布版と開発版は同じ自己完結ファイルを使用する。

export const VERSION = '0.0.21';
export const STABLE_USERSCRIPT_FILE = 'dist/FutatsumeWatch.user.js';

const VERSION_LINE_PATTERN = /^\s*\/\/\s*@version\s+(.+?)\s*$/m;

export function parseUserscriptVersion(headerText: string): string | null {
  const match = VERSION_LINE_PATTERN.exec(headerText);
  if (match === null || match[1] === undefined) {
    return null;
  }
  const version = match[1].trim();
  return version.length > 0 ? version : null;
}
