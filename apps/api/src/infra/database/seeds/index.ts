import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs/promises';
import { dirname } from 'path';
import { isFailure, tryCatchAsync } from '../../../lib/either.js';
import path from 'node:path';

await (async function () {
  const dir = dirname(fileURLToPath(import.meta.url));

  const seedFilesResult = await tryCatchAsync(() => fs.readdir(dir));

  if (isFailure(seedFilesResult)) {
    console.error(seedFilesResult.error);
    return;
  }

  const seedFiles = seedFilesResult.value
    .filter((file) => file !== 'index.ts')
    .sort((a, b) => a.localeCompare(b));

  for (const file of seedFiles) {
    const seedResult = await tryCatchAsync(() => import(path.resolve(dir, file)));

    if (isFailure(seedResult)) {
      console.error(`Error running seed: ${file}`);
      continue;
    }

    const { default: fn } = seedResult.value;

    if (!fn) {
      console.error(`Error running seed: ${file}`);
      continue;
    }

    fn();
  }
})();
