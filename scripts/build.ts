import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { build } from 'vite';
import { parseUserscriptVersion, STABLE_USERSCRIPT_FILE, VERSION } from '../src/version';

await build({ configFile: fileURLToPath(new URL('../vite.config.mts', import.meta.url)) });
const dist = new URL('../dist/', import.meta.url);
const files = await readdir(dist);
if (files.length !== 1 || files[0] !== 'FutatsumeWatch.user.js') {
  throw new Error(`配布物は FutatsumeWatch.user.js の1件である必要があります: ${files.join(', ')}`);
}
const source = await readFile(new URL(files[0], dist), 'utf8');
if (parseUserscriptVersion(source) !== VERSION) throw new Error('配布物のバージョンが一致しません');
// ESM自動検出を使わず、マネージャと同じclassic scriptとして検証する。
new Script(source, { filename: STABLE_USERSCRIPT_FILE });
if (/^\/\/\s*@require\s/m.test(source)) throw new Error('外部スクリプトへの依存が残っています');
console.log(`ビルド成功: ${STABLE_USERSCRIPT_FILE} (${VERSION}, ${source.length}文字)`);
