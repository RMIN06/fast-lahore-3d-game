import { readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCampusJson } from '../src/world/campus-loader';

try {
  const input = process.argv[2];
  if (!input)
    throw new Error('Usage: npm run apply:site-plan -- <exported-campus.json>');
  const { campus, warnings } = loadCampusJson(
    await readFile(resolve(input), 'utf8'),
    { mode: 'site-plan' },
  );
  const target = fileURLToPath(new URL('../data/campus.json', import.meta.url));
  try {
    await copyFile(target, `${target}.backup`);
  } catch (error) {
    if (!(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ))
      throw error;
  }
  await writeFile(`${target}.tmp`, JSON.stringify(campus, null, 2) + '\n');
  await rename(`${target}.tmp`, target);
  console.log(
    `Applied M2 site plan to data/campus.json; ${warnings.length} documented interior/placeholder warnings. Previous data, if any, is in campus.json.backup.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
