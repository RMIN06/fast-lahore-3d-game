import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateCampus } from '../src/systems/campus-validation';

const root = new URL('../', import.meta.url);
const requested = process.argv
  .slice(2)
  .find((argument) => !argument.startsWith('--'));
const readJson = async (url: URL | string): Promise<unknown> =>
  JSON.parse(await readFile(url, 'utf8'));
const optionalJson = async (name: string) => {
  try {
    return await readJson(new URL(`data/${name}.json`, root));
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return undefined;
    throw error;
  }
};

try {
  const referenceDocuments: Record<string, unknown> = {};
  for (const name of ['tasks', 'npcs']) {
    const document = await optionalJson(name);
    if (document !== undefined) referenceDocuments[name] = document;
    else
      console.log(
        `data/${name}.json: not authored yet (reference checks run when present).`,
      );
  }
  const sources: {
    name: string;
    input: unknown;
    mode: 'seed' | 'site-plan' | 'curated';
  }[] = [];
  if (requested)
    sources.push({
      name: requested,
      input: await readJson(resolve(requested)),
      mode: process.argv.includes('--seed')
        ? 'seed'
        : process.argv.includes('--site-plan')
          ? 'site-plan'
          : 'curated',
    });
  else {
    sources.push({
      name: 'data/campus.seed.json',
      input: await readJson(new URL('data/campus.seed.json', root)),
      mode: 'seed',
    });
    const curated = await optionalJson('campus');
    if (curated !== undefined)
      sources.push({
        name: 'data/campus.json',
        input: curated,
        mode: process.argv.includes('--complete') ? 'curated' : 'site-plan',
      });
  }
  for (const source of sources) {
    const result = validateCampus(source.input, {
      mode: source.mode,
      referenceDocuments,
    });
    for (const issue of result.issues) {
      const line = `${source.name}:${issue.path}: ${issue.severity} [${issue.code}] ${issue.message}`;
      if (issue.severity === 'error') console.error(line);
      else console.warn(line);
    }
    const errors = result.issues.filter(
      (issue) => issue.severity === 'error',
    ).length;
    console.log(
      `${source.name}: ${errors} errors, ${result.issues.length - errors} warnings (${source.mode} mode).`,
    );
    if (errors) process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `Campus validation failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
