// FutatsumeWatch のユーザースクリプト生成に関する小さく型安全な基盤。
// 既存の build.js（// @version ヘッダー連結方式）と将来の Bun バンドラー移行の橋渡しを担う。

export const STABLE_USERSCRIPT_FILE = 'dist/ZenzaWatch.user.js';
export const DEV_USERSCRIPT_FILE = 'dist/ZenzaWatch-dev.user.js';

const VERSION_LINE_PATTERN = /^\s*\/\/\s*@version\s+(.+?)\s*$/m;

export function parseUserscriptVersion(headerText: string): string | null {
  const match = VERSION_LINE_PATTERN.exec(headerText);
  if (match === null || match[1] === undefined) {
    return null;
  }
  const version = match[1].trim();
  return version.length > 0 ? version : null;
}

export function isDevUserscript(fileName: string): boolean {
  return fileName.endsWith('-dev.user.js');
}

export function resolveUserscriptOutFile(isDev: boolean): string {
  return isDev ? DEV_USERSCRIPT_FILE : STABLE_USERSCRIPT_FILE;
}
