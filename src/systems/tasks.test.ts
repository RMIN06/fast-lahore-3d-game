import { describe, expect, test } from 'vitest';
import campusJson from '../../data/campus.json';
import tasksJson from '../../data/tasks.json';
import { loadCampus } from '../world/campus-loader';
import { loadTasks } from '../world/tasks-data';
import { DialogueRunner, solveDialogue } from './dialogue';
import { validateTasks } from './task-validation';
import { friendMessages, TaskEngine, toMinutes } from './tasks';
import type { Loc } from './tasks';
import type { TaskDef } from './task-schema';
import { currentClass, SLOTS, timetable } from './timetable';
import { DAYS } from './time';
import { saveSchemaKeys } from './save';

const campus = loadCampus(campusJson, { mode: 'site-plan' }).campus;
const { doc, dialogues, fixtures, layouts } = loadTasks(campus);
const rooms = layouts.flatMap((l) =>
  l.floors.flatMap((f) => f.rooms.map((r) => ({ l, r }))),
);
const tt = timetable(campus, layouts, 'cs', '23L-1234');

/** A day and time inside a task's window. */
function timeFor(task: TaskDef) {
  const w = task.window;
  if (!w) return { day: 0, minutes: 10 * 60 };
  if (w === 'timetable') return { day: tt[0]!.day, minutes: tt[0]!.from - 10 };
  return {
    day: w.days ? DAYS.indexOf(w.days[0]!) : 0,
    minutes: toMinutes(w.from) + 5,
  };
}

const locOf = (key: string): Loc => {
  const [kind, id] = key.split(':') as [string, string];
  if (kind === 'space') {
    const x = rooms.find((y) => y.r.spaceId === id)!;
    return {
      buildingId: x.l.buildingId,
      floorId: x.r.floorId,
      spaceId: id,
      areaIds: [],
      nearGates: [],
    };
  }
  if (kind === 'area') return { areaIds: [id], nearGates: [] };
  if (kind === 'building')
    return { buildingId: id, areaIds: [], nearGates: [] };
  return { areaIds: [], nearGates: [id] };
};

/** Play the active task to the end, the way the e2e test does it in game. */
function play(engine: TaskEngine, prefer?: string) {
  for (let guard = 0; guard < 60 && engine.active; guard += 1) {
    if (engine.pendingDialogue) {
      const tree = dialogues.get(engine.pendingDialogue.dialogue)!;
      const runner = new DialogueRunner(tree, engine.pendingDialogue.vars);
      const path = solveDialogue(
        tree,
        prefer && tree.id.startsWith('friend-') ? prefer : undefined,
      )!;
      let outcome: string | undefined;
      for (const i of path) outcome = runner.choose(i);
      engine.dialogueEnded(outcome!);
      continue;
    }
    const step = engine.step!,
      hint = engine.hint()!;
    if (step.kind === 'go' || step.kind === 'visit') {
      expect(hint.places.length, step.id).toBeGreaterThan(0);
      engine.location(locOf(hint.places[0]!));
    } else if (step.kind === 'use') {
      const f = fixtures.find((x) => x.id === hint.fixtures[0]);
      expect(f, `${step.id}: no target fixture`).toBeDefined();
      expect(engine.use(f!)).toBe(true);
    } else if (step.kind === 'sit') {
      const f = fixtures.find((x) => x.id === hint.fixtures[0]);
      expect(f, `${step.id}: no seat`).toBeDefined();
      engine.sat(f);
      engine.tick(1, (step.minutes ?? 0) + 1);
      if (!step.minutes) continue;
    } else if (step.kind === 'talk') {
      expect(
        engine.actorFixture(step.actor!) ?? step.actor === 'friend',
        step.actor,
      ).toBeTruthy();
      expect(engine.talk(step.actor!)).toBe(true);
    }
  }
}

describe('task and dialogue data', () => {
  test('tasks.json and every dialogue validate against the campus', () => {
    const files = Object.fromEntries(
      [...dialogues].map(([id, t]) => [`${id}.json`, t]),
    );
    const result = validateTasks(campus, layouts, fixtures, tasksJson, files);
    expect(result.issues).toEqual([]);
    expect(doc.tasks.length).toBeGreaterThanOrEqual(16);
    expect(doc.friends.length).toBeGreaterThanOrEqual(4);
    expect(doc.friends.length).toBeLessThanOrEqual(6);
  });

  test('the validator reports broken references', () => {
    const broken = structuredClone(tasksJson) as typeof tasksJson;
    (broken.tasks[0]!.steps[0] as { at: unknown }).at = {
      space: 'Z-9-NOWHERE',
    };
    (broken.tasks[1]!.steps[2] as { dialogue: string }).dialogue =
      'missing-tree';
    (broken.tasks[6]!.steps[1] as { fixture: string }).fixture = 'shelf';
    broken.friends[0]!.departmentId = 'physics';
    const files = Object.fromEntries(
      [...dialogues].map(([id, t]) => [`${id}.json`, t]),
    );
    const messages = validateTasks(
      campus,
      layouts,
      fixtures,
      broken,
      files,
    ).issues.map((i) => `${i.path}: ${i.message}`);
    expect(messages.join('\n')).toMatch(/Unknown space "Z-9-NOWHERE"/);
    expect(messages.join('\n')).toMatch(/Unknown dialogue "missing-tree"/);
    expect(messages.join('\n')).toMatch(/No shelf fixture there/);
    expect(messages.join('\n')).toMatch(/Unknown department "physics"/);
    // Progression fields are rejected by the strict schema.
    const xp = {
      ...structuredClone(tasksJson),
      tasks: [{ ...tasksJson.tasks[0], xp: 10 }],
    };
    expect(
      validateTasks(campus, layouts, fixtures, xp, files).issues.length,
    ).toBeGreaterThan(0);
  });

  test('dialogue runner: options move or end; quizzes need the right answer', () => {
    const lecture = new DialogueRunner(dialogues.get('lecture')!, {
      course: 'Data Structures',
      actor: 'Lecturer',
    });
    expect(lecture.current.text).toContain('Data Structures');
    lecture.choose(0);
    lecture.choose(0); // wrong answer
    expect(lecture.node).toBe('wrong');
    lecture.choose(0); // try again
    lecture.choose(1); // right
    expect(lecture.choose(0)).toBe('done');
    expect(solveDialogue(dialogues.get('friend-hira')!, 'bench')).toBeDefined();
  });
});

describe('timetable (placeholder template)', () => {
  test('3–4 classes a weekday in the department blocks, deterministic per roll number', () => {
    expect(timetable(campus, layouts, 'cs', '23L-1234')).toEqual(tt);
    for (let d = 0; d < 5; d += 1) {
      const n = tt.filter((s) => s.day === d).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(4);
    }
    const cs = campus.departments.find((d) => d.id === 'cs')!;
    for (const s of tt) {
      const x = rooms.find((y) => y.r.spaceId === s.spaceId)!;
      expect(cs.buildingIds).toContain(x.l.buildingId);
      expect(SLOTS.some((slot) => slot.from === s.from)).toBe(true);
    }
    expect(currentClass(tt, tt[0]!.day, tt[0]!.from - 20)).toEqual(tt[0]);
    expect(currentClass(tt, tt[0]!.day, tt[0]!.from + 30)).toBeUndefined();
  });
});

describe('task engine', () => {
  const ctx = (task: TaskDef, params?: Record<string, string>) => ({
    ...timeFor(task),
    timetable: tt,
    ...(params ? { params } : {}),
  });

  for (const task of doc.tasks.filter((t) => !t.viaMessages))
    test(`"${task.title}" can be started and completed`, () => {
      const engine = new TaskEngine(doc, { campus, layouts, fixtures });
      expect(
        engine.availability(task, { ...timeFor(task), timetable: tt }).ok,
      ).toBe(true);
      expect(engine.start(task.id, ctx(task))).toBe(true);
      play(engine);
      expect(engine.active).toBeUndefined();
      expect(engine.last?.result).toBe('completed');
      expect(engine.completed).toEqual([task.id]);
    });

  for (const branch of ['bench', 'drink', 'done'])
    test(`"Meet a friend" from a phone message (${branch})`, () => {
      const engine = new TaskEngine(doc, { campus, layouts, fixtures });
      const message = friendMessages(doc, 0, '23L-1234')[0]!;
      const task = engine.task('meet-friend')!;
      expect(
        engine.start(
          'meet-friend',
          ctx(task, {
            friend: message.friendId,
            meet: message.meet,
            time: message.time,
          }),
        ),
      ).toBe(true);
      expect(engine.hint()!.text).toContain(message.name);
      expect(engine.actorFixture('friend')?.kind).toBe('bench');
      play(engine, branch);
      expect(engine.last?.result).toBe('completed');
    });

  test('tasks outside their window cannot start; the book hunt fails when time runs out', () => {
    const engine = new TaskEngine(doc, { campus, layouts, fixtures });
    const jummah = engine.task('jummah')!;
    expect(
      engine.availability(jummah, { day: 0, minutes: 13 * 60, timetable: tt })
        .ok,
    ).toBe(false);
    expect(
      engine.start('jummah', { day: 0, minutes: 13 * 60, timetable: tt }),
    ).toBe(false);
    expect(
      engine.start('book-hunt', { day: 0, minutes: 10 * 60, timetable: tt }),
    ).toBe(true);
    expect(engine.hint()!.text).toMatch(/s left/);
    engine.tick(181, 3);
    expect(engine.active).toBeUndefined();
    expect(engine.last).toMatchObject({
      result: 'failed',
      reason: "Time's up",
    });
  });

  test('sitting must last: standing up early resets the timer', () => {
    const engine = new TaskEngine(doc, { campus, layouts, fixtures });
    engine.start('relax', { day: 0, minutes: 10 * 60, timetable: tt });
    engine.location({ areaIds: ['highway'], nearGates: [] });
    const bench = fixtures.find((f) => f.id === engine.hint()!.fixtures[0])!;
    engine.sat(bench);
    engine.tick(1, 3);
    engine.sat(undefined);
    engine.sat(bench);
    engine.tick(1, 3);
    expect(engine.active).toBeDefined();
    engine.tick(1, 3);
    expect(engine.last?.result).toBe('completed');
  });

  test('friend messages: deterministic, one per friend on weekdays, none on Sundays', () => {
    expect(friendMessages(doc, 0)).toEqual(friendMessages(doc, 0));
    expect(friendMessages(doc, 0)).toHaveLength(doc.friends.length);
    expect(friendMessages(doc, 6)).toHaveLength(0);
  });

  test('no progression: completion is never part of the save', () => {
    expect(
      saveSchemaKeys().some((k) => /task|xp|score|complete|achiev/i.test(k)),
    ).toBe(false);
  });
});
