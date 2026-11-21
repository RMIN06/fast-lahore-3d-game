import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
import { validateCampus } from '../src/systems/campus-validation';
import { validateTasks } from '../src/systems/task-validation';
import { campusFixtures } from '../src/systems/fixtures';
import { loadCampus } from '../src/world/campus-loader';
import { interiorLayouts } from '../src/world/interiors';

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
  // tasks.json has its own validator (below): references, fixtures, dialogue.
  for (const name of ['npcs']) {
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
  if (!requested) {
    // M10: tasks and dialogue trees against the site-plan campus.
    const tasks = await readJson(new URL('data/tasks.json', root));
    const dialogueDir = new URL('data/dialogue/', root);
    const dialogues: Record<string, unknown> = {};
    for (const file of (await readdir(dialogueDir)).filter((f) =>
      f.endsWith('.json'),
    ))
      dialogues[`data/dialogue/${file}`] = await readJson(
        new URL(file, dialogueDir),
      );
    const campus = loadCampus(
      await readJson(new URL('data/campus.json', root)),
      {
        mode: 'site-plan',
      },
    ).campus;
    const layouts = interiorLayouts(campus);
    const result = validateTasks(
      campus,
      layouts,
      campusFixtures(campus, layouts),
      tasks,
      dialogues,
    );
    for (const issue of result.issues)
      console.error(`data/${issue.path}: error ${issue.message}`);
    console.log(
      `data/tasks.json + ${Object.keys(dialogues).length} dialogues: ${result.issues.length} errors (${result.doc?.tasks.length ?? 0} tasks, ${result.doc?.friends.length ?? 0} friends).`,
    );
    if (result.issues.length) process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `Campus validation failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
