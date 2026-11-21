import type { Campus } from '../types/campus';
import type { Fixture } from './fixtures';
import type { InteriorLayout } from './interior';
import { dialogueOutcomes, dialogueProblems } from './dialogue';
import { dialogueSchema, tasksDocumentSchema } from './task-schema';
import type { DialogueTree, Place, Step, TasksDocument } from './task-schema';

// M10: validate data/tasks.json and data/dialogue/*.json against the campus
// (run by `npm run validate:campus` and the unit tests). Every reference must
// resolve, and every use/sit step must have a fixture to use.

export interface TaskIssue {
  path: string;
  message: string;
}

export interface TaskValidation {
  issues: TaskIssue[];
  doc?: TasksDocument;
  dialogues: Map<string, DialogueTree>;
}

export function validateTasks(
  campus: Campus,
  layouts: InteriorLayout[],
  fixtures: Fixture[],
  tasksInput: unknown,
  dialogueInputs: Record<string, unknown>,
): TaskValidation {
  const issues: TaskIssue[] = [];
  const report = (path: string, message: string) =>
    issues.push({ path, message });
  const dialogues = new Map<string, DialogueTree>();

  for (const [file, input] of Object.entries(dialogueInputs)) {
    const parsed = dialogueSchema.safeParse(input);
    if (!parsed.success) {
      for (const i of parsed.error.issues)
        report(`${file}.${i.path.join('.')}`, i.message);
      continue;
    }
    const expected = file.replace(/^.*[\\/]/, '').replace(/\.json$/, '');
    if (parsed.data.id !== expected)
      report(`${file}.id`, `id must match the file name (${expected})`);
    for (const p of dialogueProblems(parsed.data)) report(file, p);
    dialogues.set(parsed.data.id, parsed.data);
  }

  const parsed = tasksDocumentSchema.safeParse(tasksInput);
  if (!parsed.success) {
    for (const i of parsed.error.issues)
      report(`tasks.${i.path.join('.')}`, i.message);
    return { issues, dialogues };
  }
  const doc = parsed.data;

  const rooms = layouts.flatMap((l) => l.floors.flatMap((f) => f.rooms));
  const spaceIds = new Set(
    campus.buildings.flatMap((b) =>
      b.floors.flatMap((f) => f.spaces.map((s) => s.id)),
    ),
  );
  const roomIds = new Set(rooms.map((r) => r.spaceId));
  const areas = new Map(campus.areas.map((a) => [a.id, a]));
  const buildings = new Set(campus.buildings.map((b) => b.id));
  const gates = new Set(campus.gates.map((g) => g.id));
  const departments = new Set(campus.departments.map((d) => d.id));

  /** Static fixtures in a place, or undefined for parameter places. */
  const fixturesIn = (p: Place): Fixture[] | undefined => {
    if (p.param) return undefined;
    return fixtures.filter((f) => {
      if (p.space) return f.spaceId === p.space;
      if (p.area) return f.areaId === p.area;
      if (p.building) return f.buildingId === p.building;
      if (p.areaKind)
        return (
          f.areaId !== undefined && areas.get(f.areaId)?.kind === p.areaKind
        );
      if (p.spaceKind) {
        const r = rooms.find((x) => x.spaceId === f.spaceId);
        return (
          r?.kind === p.spaceKind &&
          (!p.namePattern || new RegExp(p.namePattern).test(r.code ?? r.name))
        );
      }
      return false;
    });
  };

  const checkPlace = (p: Place, path: string) => {
    if (p.space && !spaceIds.has(p.space))
      report(path, `Unknown space "${p.space}"`);
    else if (p.space && !roomIds.has(p.space))
      report(path, `Space "${p.space}" has no generated interior`);
    if (p.area && !areas.has(p.area)) report(path, `Unknown area "${p.area}"`);
    if (p.area && areas.has(p.area) && !areas.get(p.area)!.polygon)
      report(path, `Area "${p.area}" has no polygon`);
    if (p.building && !buildings.has(p.building))
      report(path, `Unknown building "${p.building}"`);
    if (p.gate && !gates.has(p.gate)) report(path, `Unknown gate "${p.gate}"`);
    if (
      p.areaKind &&
      ![...areas.values()].some((a) => a.kind === p.areaKind && a.polygon)
    )
      report(path, `No area of kind "${p.areaKind}"`);
    if (p.spaceKind) {
      let pattern: RegExp | undefined;
      try {
        pattern = p.namePattern ? new RegExp(p.namePattern) : undefined;
      } catch {
        report(path, `Bad namePattern "${p.namePattern}"`);
      }
      if (
        !rooms.some(
          (r) =>
            r.kind === p.spaceKind &&
            (!pattern || pattern.test(r.code ?? r.name)),
        )
      )
        report(
          path,
          `No room of kind "${p.spaceKind}"${p.namePattern ? ` matching ${p.namePattern}` : ''}`,
        );
    }
  };

  const ids = new Set<string>();
  doc.tasks.forEach((task, t) => {
    const base = `tasks.tasks.${t}`;
    if (ids.has(task.id))
      report(`${base}.id`, `Duplicate task id "${task.id}"`);
    ids.add(task.id);
    const actors = new Map((task.actors ?? []).map((a) => [a.id, a]));
    (task.actors ?? []).forEach((a, i) => {
      checkPlace(a.at, `${base}.actors.${i}.at`);
      const inPlace = fixturesIn(a.at);
      if (inPlace && !inPlace.some((f) => f.kind === a.fixture))
        report(
          `${base}.actors.${i}`,
          `No ${a.fixture} for actor "${a.id}" there`,
        );
    });
    if (
      task.viaMessages &&
      !(task.actors ?? []).some((a) => a.at.param === 'meet')
    )
      report(base, 'Message tasks need an actor at {param: "meet"}');
    const usesParam = (s: Step, name: string): boolean =>
      [s.at, s.places]
        .flat()
        .some((p) => (p as Place | undefined)?.param === name) ||
      Object.values(s.branches ?? {}).some((b) =>
        b.some((x) => usesParam(x, name)),
      );
    const stepIds = new Set<string>();
    const walk = (steps: Step[], path: string, first: boolean) =>
      steps.forEach((s, i) => {
        const sp = `${path}.${i}`;
        if (stepIds.has(s.id))
          report(`${sp}.id`, `Duplicate step id "${s.id}"`);
        stepIds.add(s.id);
        const at = s.at ? (Array.isArray(s.at) ? s.at : [s.at]) : [];
        at.forEach((p, j) =>
          checkPlace(p, `${sp}.at${Array.isArray(s.at) ? `.${j}` : ''}`),
        );
        (s.places ?? []).forEach((p, j) => checkPlace(p, `${sp}.places.${j}`));
        if (first && i === 0 && at.some((p) => p.param === 'here'))
          report(sp, '"here" needs an earlier step');
        if ((s.kind === 'use' || s.kind === 'sit') && s.fixture) {
          const kinds: string[] = Array.isArray(s.fixture)
            ? s.fixture
            : [s.fixture];
          for (const [j, p] of at.entries()) {
            const inPlace = fixturesIn(p);
            if (inPlace && !inPlace.some((f) => kinds.includes(f.kind)))
              report(
                `${sp}.at${Array.isArray(s.at) ? `.${j}` : ''}`,
                `No ${kinds.join('/')} fixture there`,
              );
          }
          if (
            s.code &&
            s.code !== '{book}' &&
            !fixtures.some((f) => f.code === s.code)
          )
            report(`${sp}.code`, `No fixture has code "${s.code}"`);
          if (s.code === '{book}' && !(task.params ?? []).includes('book'))
            report(`${sp}.code`, 'Uses {book} without the "book" parameter');
        }
        if (s.dialogue) {
          const tree = dialogues.get(s.dialogue);
          if (!tree)
            report(`${sp}.dialogue`, `Unknown dialogue "${s.dialogue}"`);
          else
            for (const outcome of Object.keys(s.branches ?? {})) {
              const trees =
                s.actor === 'friend'
                  ? doc.friends.map((f) => dialogues.get(f.dialogue))
                  : [tree];
              for (const tr of trees)
                if (tr && !dialogueOutcomes(tr).has(outcome))
                  report(
                    `${sp}.branches.${outcome}`,
                    `Dialogue "${tr.id}" never ends with "${outcome}"`,
                  );
            }
        }
        if (
          s.kind === 'talk' &&
          s.actor &&
          s.actor !== 'friend' &&
          !actors.has(s.actor)
        )
          report(`${sp}.actor`, `Unknown actor "${s.actor}"`);
        if (s.kind === 'talk' && s.actor === 'friend' && !task.viaMessages)
          report(`${sp}.actor`, 'Only message tasks have a friend');
        for (const [outcome, branch] of Object.entries(s.branches ?? {}))
          walk(branch, `${sp}.branches.${outcome}`, false);
      });
    walk(task.steps, `${base}.steps`, true);
    for (const p of task.params ?? [])
      if (p === 'class' && !task.steps.some((s) => usesParam(s, 'class')))
        report(`${base}.params`, '"class" parameter is never used');
  });

  doc.friends.forEach((f, i) => {
    const base = `tasks.friends.${i}`;
    if (!departments.has(f.departmentId))
      report(`${base}.departmentId`, `Unknown department "${f.departmentId}"`);
    if (!dialogues.has(f.dialogue))
      report(`${base}.dialogue`, `Unknown dialogue "${f.dialogue}"`);
    f.spots.forEach((p, j) => {
      checkPlace(p, `${base}.spots.${j}`);
      if (!p.space && !p.area)
        report(`${base}.spots.${j}`, 'Meet spots are a space or an area');
      const inPlace = fixturesIn(p);
      if (inPlace && !inPlace.some((x) => x.kind === 'bench'))
        report(`${base}.spots.${j}`, 'Meet spots need a bench to meet at');
    });
  });
  if (!doc.tasks.some((t) => t.viaMessages))
    report('tasks.tasks', 'Friend meetups need a message task');

  return { issues, doc, dialogues };
}
