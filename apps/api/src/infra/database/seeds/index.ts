import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isFailure, tryCatchAsync } from '../../../lib/either.js';

type SeedFn = () => Promise<void>;

async function main(): Promise<void> {
  const dir = path.dirname(fileURLToPath(import.meta.url));

  const seedFilesResult = await tryCatchAsync(() => fs.readdir(dir));

  if (isFailure(seedFilesResult)) {
    console.error('Could not read seed directory.', seedFilesResult.error);
    process.exitCode = 1;
    return;
  }

  const seedFiles = seedFilesResult.value
    .filter((file) => /^\d{3}-.*\.(?:ts|js)$/.test(file) && !file.endsWith('.d.ts'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of seedFiles) {
    const fileUrl = pathToFileURL(path.join(dir, file)).href;

    const seedModuleResult = await tryCatchAsync(() => import(fileUrl));

    if (isFailure(seedModuleResult)) {
      console.error(`Could not load seed "${file}".`, seedModuleResult.error);
      process.exitCode = 1;
      return;
    }

    const runSeed = seedModuleResult.value.default;

    if (typeof runSeed !== 'function') {
      console.error(`Seed "${file}" must have a default export: () => Promise<void>.`);
      process.exitCode = 1;
      return;
    }

    const runResult = await tryCatchAsync(() => (runSeed as SeedFn)());

    if (isFailure(runResult)) {
      console.error(`Seed "${file}" failed.`, runResult.error);
      process.exitCode = 1;
      return;
    }

    console.info(`Seed completed: ${file}`);
  }
}

await main();
