import { z } from 'zod';

// M10 data contracts for data/tasks.json and data/dialogue/*.json
// (GAMEPLAY_SPEC §6, §8). Zod validates at load time and fails loudly with
// the offending path.

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');
const day = z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const fixtureKind = z.enum([
  'seat',
  'pc',
  'lectern',
  'shelf',
  'counter',
  'desk',
  'bench',
  'prayer',
  'bay',
  'rack',
  'door',
]);

/**
 * A place, by reference only (never coordinates): a room (space), any room of
 * a kind (optionally matching a name pattern), a building, an outdoor area,
 * an area kind, a gate (within 8 m), or a task parameter ("class", "meet",
 * "here" = where the previous matching step happened).
 */
export const placeSchema = z
  .strictObject({
    space: z.string().optional(),
    spaceKind: z.string().optional(),
    namePattern: z.string().optional(),
    building: z.string().optional(),
    area: z.string().optional(),
    areaKind: z.string().optional(),
    gate: z.string().optional(),
    param: z.enum(['class', 'meet', 'here']).optional(),
  })
  .refine(
    (p) =>
      [
        p.space,
        p.spaceKind,
        p.building,
        p.area,
        p.areaKind,
        p.gate,
        p.param,
      ].filter((x) => x !== undefined).length === 1,
    'A place names exactly one of space, spaceKind, building, area, areaKind, gate or param',
  );
export type Place = z.infer<typeof placeSchema>;

const places = z.union([placeSchema, z.array(placeSchema).min(1)]);

interface StepShape {
  id: string;
  kind: 'go' | 'use' | 'sit' | 'talk' | 'visit';
  text: string;
  at?: Place | Place[] | undefined;
  fixture?:
    z.infer<typeof fixtureKind> | z.infer<typeof fixtureKind>[] | undefined;
  code?: string | undefined;
  minutes?: number | undefined;
  dialogue?: string | undefined;
  actor?: string | undefined;
  auto?: boolean | undefined;
  places?: Place[] | undefined;
  branches?: Record<string, StepShape[]> | undefined;
}

export const stepSchema: z.ZodType<StepShape> = z.lazy(() =>
  z
    .strictObject({
      id: z.string().min(1),
      kind: z.enum(['go', 'use', 'sit', 'talk', 'visit']),
      /** HUD line; {room}, {book}, {friend}, {time}, {place} are filled in. */
      text: z.string().min(1),
      at: places.optional(),
      /** Fixture kind(s) that complete a use/sit step. */
      fixture: z.union([fixtureKind, z.array(fixtureKind).min(1)]).optional(),
      /** Shelf code to match; "{book}" uses the task's book parameter. */
      code: z.string().optional(),
      /** Sit steps: stay seated this many game minutes. */
      minutes: z.number().positive().optional(),
      /** Talk: the dialogue to run. Use: a dialogue opened on use. */
      dialogue: z.string().optional(),
      /** Talk: the actor spoken to (task actor id, or "friend"). */
      actor: z.string().optional(),
      /** Talk: opens by itself (a lecture starts once you sit). */
      auto: z.boolean().optional(),
      /** Visit: every place, any order. */
      places: z.array(placeSchema).min(1).optional(),
      /** Dialogue outcome → extra steps inserted next. */
      branches: z.record(z.string(), z.array(stepSchema)).optional(),
    })
    .superRefine((s, ctx) => {
      const need = (ok: boolean, message: string) => {
        if (!ok) ctx.addIssue({ code: 'custom', message });
      };
      if (s.kind === 'go') need(Boolean(s.at), 'go steps need "at"');
      if (s.kind === 'use' || s.kind === 'sit')
        need(
          Boolean(s.at && s.fixture),
          `${s.kind} steps need "at" and "fixture"`,
        );
      if (s.kind === 'talk')
        need(
          Boolean(s.dialogue && s.actor),
          'talk steps need "dialogue" and "actor"',
        );
      if (s.kind === 'visit')
        need(Boolean(s.places), 'visit steps need "places"');
    }),
);
export type Step = z.infer<typeof stepSchema>;

export const actorSchema = z.strictObject({
  id: z.string().min(1),
  role: z.enum([
    'faculty',
    'librarian',
    'cafe_staff',
    'medical',
    'shopkeeper',
    'student',
  ]),
  name: z.string().min(1),
  body: z.enum(['male', 'female']),
  at: placeSchema,
  /** Stands at (or behind) the first fixture of this kind in the place. */
  fixture: fixtureKind,
});

export const taskSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  category: z.enum(['learning', 'daily', 'social', 'faith', 'explore']),
  description: z.string().min(1),
  /** When the task can be started; "timetable" = a class of yours is on. */
  window: z
    .union([
      z.literal('timetable'),
      z.strictObject({
        days: z.array(day).min(1).optional(),
        from: time,
        to: time,
      }),
    ])
    .optional(),
  /** Real seconds (game paused excluded) before the task fails. */
  timeLimitSeconds: z.number().positive().optional(),
  /** Picked when the task starts. */
  params: z.array(z.enum(['class', 'book'])).optional(),
  /** Only offered through phone messages (friend meetups). */
  viaMessages: z.boolean().optional(),
  actors: z.array(actorSchema).optional(),
  steps: z.array(stepSchema).min(1),
});
export type TaskDef = z.infer<typeof taskSchema>;

export const friendSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  body: z.enum(['male', 'female']),
  departmentId: z.string(),
  dialogue: z.string(),
  /** Where they suggest meeting. */
  spots: z.array(placeSchema).min(1),
  /** Meetup times they may suggest (the day picks one or none). */
  times: z.array(time).min(1),
});
export type Friend = z.infer<typeof friendSchema>;

export const tasksDocumentSchema = z.strictObject({
  version: z.literal(1),
  /** Placeholder status of everything authored here (see OPEN_QUESTIONS). */
  confidence: z.literal('placeholder'),
  tasks: z.array(taskSchema).min(1),
  friends: z.array(friendSchema).min(1),
});
export type TasksDocument = z.infer<typeof tasksDocumentSchema>;

export const dialogueSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  start: z.string(),
  nodes: z.record(
    z.string(),
    z.strictObject({
      /** Speaker; "{friend}" and "{actor}" are filled in. */
      speaker: z.string().min(1),
      text: z.string().min(1),
      options: z
        .array(
          z
            .strictObject({
              text: z.string().min(1),
              next: z.string().optional(),
              /** Ends the dialogue with this outcome (e.g. "done", "bench"). */
              end: z.string().optional(),
            })
            .refine((o) => (o.next === undefined) !== (o.end === undefined), {
              message: 'An option has exactly one of "next" or "end"',
            }),
        )
        .min(1)
        .max(9),
    }),
  ),
});
export type DialogueTree = z.infer<typeof dialogueSchema>;
