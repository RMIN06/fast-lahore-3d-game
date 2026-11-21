import tasksJson from '../../data/tasks.json';
import type { Campus } from '../types/campus';
import { campusFixtures } from '../systems/fixtures';
import { validateTasks } from '../systems/task-validation';
import { interiorLayouts } from './interiors';

// M10: tasks and dialogue trees from data/, validated against the campus at
// load time. Invalid data fails loudly with the offending path.

const dialogueFiles = import.meta.glob('../../data/dialogue/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

export function loadTasks(campus: Campus) {
  const layouts = interiorLayouts(campus);
  const fixtures = campusFixtures(campus, layouts);
  const result = validateTasks(
    campus,
    layouts,
    fixtures,
    tasksJson,
    dialogueFiles,
  );
  if (result.issues.length || !result.doc)
    throw new Error(
      `Invalid task data:\n${result.issues.map((i) => `${i.path}: ${i.message}`).join('\n')}`,
    );
  return { doc: result.doc, dialogues: result.dialogues, fixtures, layouts };
}
