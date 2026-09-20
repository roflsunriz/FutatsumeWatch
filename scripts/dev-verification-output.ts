import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

export const verificationDirectory = pathToFileURL(
  resolve(process.env.FUTATSUME_TEST_OUTPUT ?? resolve(import.meta.dir, '../dev-assets/verification')) + sep
);
mkdirSync(verificationDirectory, { recursive: true });
