import { readFile, writeFile } from 'node:fs/promises';
import prettier from 'prettier';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('input と output を指定してください');
const source = await readFile(input, 'utf8');
await writeFile(output, await prettier.format(source, { parser: 'babel' }), 'utf8');
console.log(`${input} => ${output}`);
