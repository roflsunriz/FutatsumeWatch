import { expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourceRoot = resolve(import.meta.dir, '../../src');
const sourceExtensions = new Set(['.css', '.js', '.ts', '.tsx']);

test('srcのソースは1000行以下で、フォルダは直下1階層に整理する', async () => {
  const oversizedFiles: Array<{ path: string; lines: number }> = [];
  const rootFiles: string[] = [];

  async function visit(directory: string, depth: number): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        expect(depth, `${path} は src 直下の1階層に置く`).toBe(0);
        await visit(path, depth + 1);
        continue;
      }

      const extension = entry.name.slice(entry.name.lastIndexOf('.'));
      if (!entry.isFile() || !sourceExtensions.has(extension)) {
        continue;
      }

      if (depth === 0) {
        rootFiles.push(entry.name);
      }

      const content = await readFile(path, 'utf8');
      const normalized = content.replace(/\r\n?/gu, '\n').replace(/\n$/u, '');
      const lines = normalized === '' ? 0 : normalized.split('\n').length;
      if (lines > 1000) {
        oversizedFiles.push({ path, lines });
      }
    }
  }

  await visit(sourceRoot, 0);
  expect(rootFiles).toEqual([]);
  expect(oversizedFiles).toEqual([]);
});
