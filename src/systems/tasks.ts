import type { Campus } from '../types/campus';
import type { Fixture } from './fixtures';
import type { InteriorLayout, RoomLayout } from './interior';
import { fill } from './dialogue';
import { hash, rng } from './npc';
import type {
  Friend,
  Place,
  Step,
  TaskDef,
  TasksDocument,
} from './task-schema';
import type { ClassSlot } from './timetable';
import { clock, currentClass } from './timetable';
import { DAYS } from './time';

// M10 task engine (GAMEPLAY_SPEC §6). Pure and event-driven: the game feeds
// it the player's location, fixtures used or sat on, and dialogue outcomes.
// Completion is SESSION STATE ONLY: nothing here is ever saved (no
// progression, AGENTS.md rule 6).

export interface Loc {
  buildingId?: string;
  floorId?: string;
  spaceId?: string;
  /** Outdoor areas containing the player. */
  areaIds: string[];
  /** Gates within 8 m. */
  nearGates: string[];
}

export interface TaskWorld {
  campus: Campus;
  layouts: InteriorLayout[];
  fixtures: Fixture[];
}

export interface Clock {
  day: number;
  minutes: number;
}

export interface StartContext extends Clock {
  timetable: ClassSlot[];
  /** Extra parameters (friend meetups: friend, meet, time). */
  params?: Record<string, string>;
  /** Seed for picks (book); defaults to the day and time. */
  seed?: number;
}

type StepState = 'pending' | 'dialogue';

export interface ActiveTask {
  task: TaskDef;
  steps: Step[];
  index: number;
  state: StepState;
  /** Place keys ("space:X" / "area:Y") and display values. */
  params: Record<string, string>;
  vars: Record<string, string>;
  /** Where the last matching step happened (for {param: "here"}). */
  here?: string;
  seatedFor?: number;
  visited: Set<number>;
  elapsedSeconds: number;
}

export interface Hint {
  text: string;
  /** Fixture ids that complete the step (use/sit), when known. */
  fixtures: string[];
  /** Places that complete the step (go/visit), as keys "space:X"/"area:Y"/... */
  places: string[];
  /** Talk: the actor to speak to. */
  actor?: string;
}

const roomsOf = (w: TaskWorld) =>
  w.layouts.flatMap((l) =>
    l.floors.flatMap((f) => f.rooms.map((r) => ({ layout: l, room: r }))),
  );

/** Display name of a place key. */
export function placeLabel(world: TaskWorld, key: string): string {
  const [kind, id] = key.split(':') as [string, string];
  if (kind === 'space') {
    const r = roomsOf(world).find((x) => x.room.spaceId === id)?.room;
    return r ? `${r.code ?? r.name} (${id.split('-')[0]} block)` : id;
  }
  if (kind === 'area')
    return world.campus.areas.find((a) => a.id === id)?.label ?? id;
  if (kind === 'building')
    return world.campus.buildings.find((b) => b.id === id)?.label ?? id;
  if (kind === 'gate')
    return world.campus.gates.find((g) => g.id === id)?.label ?? id;
  return id;
}

const list = (p: Place | Place[] | undefined): Place[] =>
  p ? (Array.isArray(p) ? p : [p]) : [];

export class TaskEngine {
  active?: ActiveTask;
  /** Task ids finished this session (never saved). */
  readonly completed: string[] = [];
  /** Last task that ended (for the HUD): completed or failed with a reason. */
  last?: {
    taskId: string;
    title: string;
    result: 'completed' | 'failed' | 'abandoned';
    reason?: string;
  };
  /** A dialogue the UI should open now (auto talk, or a counter conversation). */
  pendingDialogue?: {
    dialogue: string;
    actor: string;
    vars: Record<string, string>;
  };
  /** Seated fixture, as reported by the game. */
  private seat?: Fixture;
  private readonly rooms = new Map<string, RoomLayout>();

  constructor(
    readonly doc: TasksDocument,
    readonly world: TaskWorld,
  ) {
    for (const { room } of roomsOf(world)) this.rooms.set(room.spaceId, room);
  }

  task(id: string) {
    return this.doc.tasks.find((t) => t.id === id);
  }

  friend(id: string): Friend | undefined {
    return this.doc.friends.find((f) => f.id === id);
  }

  /** Can the task be started now? */
  availability(
    task: TaskDef,
    ctx: Clock & { timetable: ClassSlot[] },
  ): { ok: boolean; why: string } {
    const w = task.window;
    if (!w) return { ok: true, why: 'Any time' };
    if (w === 'timetable') {
      const c = currentClass(ctx.timetable, ctx.day, ctx.minutes);
      if (c)
        return {
          ok: true,
          why: `${c.course} in ${c.room} at ${clock(c.from)}`,
        };
      const next = ctx.timetable.find(
        (s) => s.day === ctx.day && s.from > ctx.minutes,
      );
      return {
        ok: false,
        why: next
          ? `Next class ${clock(next.from)} (${next.room})`
          : 'No more classes today',
      };
    }
    const from = toMinutes(w.from),
      to = toMinutes(w.to);
    const dayOk = !w.days || w.days.includes(DAYS[ctx.day]!);
    const timeOk = ctx.minutes >= from && ctx.minutes < to;
    const when = `${w.days ? w.days.join(', ') + ' ' : ''}${w.from}–${w.to}`;
    return { ok: dayOk && timeOk, why: when };
  }

  /** Start a task (replacing any active one). False if it can't start now. */
  start(taskId: string, ctx: StartContext): boolean {
    const task = this.task(taskId);
    if (!task) return false;
    if (!task.viaMessages && !this.availability(task, ctx).ok) return false;
    const params: Record<string, string> = { ...ctx.params };
    const vars: Record<string, string> = {};
    const r = rng(
      ctx.seed ?? hash(`${taskId}:${ctx.day}:${Math.floor(ctx.minutes)}`),
    );
    for (const p of task.params ?? []) {
      if (p === 'class') {
        const c = currentClass(ctx.timetable, ctx.day, ctx.minutes);
        if (!c) return false;
        params.class = `space:${c.spaceId}`;
        Object.assign(vars, {
          room: c.room,
          course: c.course,
          time: clock(c.from),
        });
      }
      if (p === 'book') {
        const shelves = this.world.fixtures.filter(
          (f) => f.kind === 'shelf' && f.code,
        );
        const shelf = shelves[Math.floor(r() * shelves.length)];
        if (!shelf) return false;
        // Call number: shelf code, then a fictional item number.
        params.book = shelf.code!;
        vars.book = `${shelf.code}-${100 + Math.floor(r() * 900)}`;
        vars.shelf = shelf.code!;
      }
    }
    if (params.meet) vars.place = placeLabel(this.world, params.meet);
    if (params.friend)
      vars.friend = this.friend(params.friend)?.name ?? params.friend;
    if (params.time) vars.time = params.time;
    this.active = {
      task,
      steps: [...task.steps],
      index: 0,
      state: 'pending',
      params,
      vars,
      visited: new Set(),
      elapsedSeconds: 0,
    };
    this.pendingDialogue = undefined;
    this.last = undefined;
    this.enterStep();
    return true;
  }

  abandon() {
    if (!this.active) return;
    this.last = {
      taskId: this.active.task.id,
      title: this.active.task.title,
      result: 'abandoned',
    };
    this.active = undefined;
    this.pendingDialogue = undefined;
  }

  get step(): Step | undefined {
    return this.active ? this.active.steps[this.active.index] : undefined;
  }

  /** Does a place match where the player is? */
  matchesLoc(place: Place, loc: Loc): string | undefined {
    const a = this.active;
    if (place.param) {
      const key = place.param === 'here' ? a?.here : a?.params[place.param];
      if (!key) return undefined;
      const [kind, id] = key.split(':');
      return (kind === 'space' && loc.spaceId === id) ||
        (kind === 'area' && loc.areaIds.includes(id!))
        ? key
        : undefined;
    }
    if (place.space)
      return loc.spaceId === place.space ? `space:${place.space}` : undefined;
    if (place.spaceKind) {
      const room = loc.spaceId ? this.rooms.get(loc.spaceId) : undefined;
      if (!room || room.kind !== place.spaceKind) return undefined;
      if (
        place.namePattern &&
        !new RegExp(place.namePattern).test(room.code ?? room.name)
      )
        return undefined;
      return `space:${room.spaceId}`;
    }
    if (place.building)
      return loc.buildingId === place.building
        ? `building:${place.building}`
        : undefined;
    if (place.area)
      return loc.areaIds.includes(place.area)
        ? `area:${place.area}`
        : undefined;
    if (place.areaKind) {
      const area = this.world.campus.areas.find(
        (x) => loc.areaIds.includes(x.id) && x.kind === place.areaKind,
      );
      return area ? `area:${area.id}` : undefined;
    }
    if (place.gate)
      return loc.nearGates.includes(place.gate)
        ? `gate:${place.gate}`
        : undefined;
    return undefined;
  }

  /** Is a fixture in a place? Returns the place key. */
  fixtureIn(place: Place, f: Fixture): string | undefined {
    return this.matchesLoc(place, {
      ...(f.buildingId ? { buildingId: f.buildingId } : {}),
      ...(f.spaceId ? { spaceId: f.spaceId } : {}),
      areaIds: f.areaId ? [f.areaId] : [],
      nearGates: [],
    });
  }

  /** Fixtures that would complete the current use/sit step. */
  targets(step = this.step): Fixture[] {
    if (!step || !(step.kind === 'use' || step.kind === 'sit') || !step.fixture)
      return [];
    const code = step.code ? fill(step.code, this.active!.params) : undefined;
    const kinds: string[] = Array.isArray(step.fixture)
      ? step.fixture
      : [step.fixture];
    const taken = this.occupied();
    return this.world.fixtures.filter(
      (f) =>
        kinds.includes(f.kind) &&
        !taken.has(f.id) &&
        (!code || f.code === code) &&
        list(step.at).some((p) => this.fixtureIn(p, f)),
    );
  }

  /** Fixtures the active task's actors are using (not targets for the player). */
  occupied(): Set<string> {
    const ids = new Set<string>();
    for (const actor of this.active?.task.actors ?? []) {
      const f = this.actorFixture(actor.id);
      if (f) ids.add(f.id);
    }
    return ids;
  }

  /** Where an actor stands: the first fixture of its kind in its place. */
  actorFixture(actorId: string): Fixture | undefined {
    const actor = this.active?.task.actors?.find((x) => x.id === actorId);
    if (!actor) return undefined;
    return this.world.fixtures.find(
      (f) => f.kind === actor.fixture && this.fixtureIn(actor.at, f),
    );
  }

  hint(): Hint | undefined {
    const a = this.active,
      step = this.step;
    if (!a || !step) return undefined;
    const keys = (places: Place[]) =>
      places.flatMap((p) => {
        if (p.param) {
          const k = p.param === 'here' ? a.here : a.params[p.param];
          return k ? [k] : [];
        }
        if (p.space) return [`space:${p.space}`];
        if (p.area) return [`area:${p.area}`];
        if (p.building) return [`building:${p.building}`];
        if (p.gate) return [`gate:${p.gate}`];
        if (p.spaceKind)
          return [...this.rooms.values()]
            .filter(
              (r) =>
                r.kind === p.spaceKind &&
                (!p.namePattern ||
                  new RegExp(p.namePattern).test(r.code ?? r.name)),
            )
            .map((r) => `space:${r.spaceId}`);
        if (p.areaKind)
          return this.world.campus.areas
            .filter((x) => x.kind === p.areaKind)
            .map((x) => `area:${x.id}`);
        return [];
      });
    let text = fill(step.text, a.vars);
    if (step.kind === 'sit' && step.minutes && a.seatedFor !== undefined)
      text += ` (${Math.min(step.minutes, Math.floor(a.seatedFor))}/${step.minutes} min)`;
    if (step.kind === 'visit')
      text += ` (${a.visited.size}/${step.places!.length})`;
    if (a.task.timeLimitSeconds)
      text += ` · ${Math.max(0, Math.ceil(a.task.timeLimitSeconds - a.elapsedSeconds))} s left`;
    return {
      text,
      fixtures: this.targets(step).map((f) => f.id),
      places:
        step.kind === 'visit'
          ? keys(step.places!.filter((_, i) => !a.visited.has(i)))
          : keys(list(step.at)),
      ...(step.kind === 'talk' ? { actor: step.actor! } : {}),
    };
  }

  /** Player location update (called a few times a second). */
  location(loc: Loc) {
    const a = this.active,
      step = this.step;
    if (!a || !step || a.state !== 'pending') return;
    if (step.kind === 'go') {
      for (const p of list(step.at)) {
        const key = this.matchesLoc(p, loc);
        if (key) {
          if (!key.startsWith('building:') && !key.startsWith('gate:'))
            a.here = key;
          this.advance();
          return;
        }
      }
    }
    if (step.kind === 'visit') {
      step.places!.forEach((p, i) => {
        if (!a.visited.has(i) && this.matchesLoc(p, loc)) a.visited.add(i);
      });
      if (a.visited.size === step.places!.length) this.advance();
    }
  }

  /** The player pressed E on a fixture. True if the active task used it. */
  use(f: Fixture): boolean {
    const a = this.active,
      step = this.step;
    if (!a || !step || a.state !== 'pending' || step.kind !== 'use')
      return false;
    if (!this.targets(step).some((t) => t.id === f.id)) return false;
    a.here = f.spaceId
      ? `space:${f.spaceId}`
      : f.areaId
        ? `area:${f.areaId}`
        : a.here;
    if (step.dialogue) {
      a.state = 'dialogue';
      this.pendingDialogue = {
        dialogue: step.dialogue,
        actor: f.label,
        vars: { ...a.vars, actor: f.label },
      };
    } else this.advance();
    return true;
  }

  /** The player sat on a fixture (or stood up: undefined). */
  sat(f: Fixture | undefined) {
    this.seat = f;
    const a = this.active,
      step = this.step;
    if (!a || !step || step.kind !== 'sit') return;
    if (f && this.targets(step).some((t) => t.id === f.id)) {
      a.here = f.spaceId
        ? `space:${f.spaceId}`
        : f.areaId
          ? `area:${f.areaId}`
          : a.here;
      a.seatedFor = 0;
      if (!step.minutes) this.advance();
    } else a.seatedFor = undefined;
  }

  /** The player pressed E on an actor (task NPC or friend). */
  talk(actorId: string): boolean {
    const a = this.active,
      step = this.step;
    if (
      !a ||
      !step ||
      step.kind !== 'talk' ||
      step.actor !== actorId ||
      a.state !== 'pending'
    )
      return false;
    this.openTalk(step);
    return true;
  }

  /** The dialogue UI finished a conversation. */
  dialogueEnded(outcome: string) {
    const a = this.active,
      step = this.step;
    this.pendingDialogue = undefined;
    if (!a || !step || a.state !== 'dialogue') return;
    a.state = 'pending';
    // Walked away mid-conversation: press E on them (or the counter) again.
    if (outcome === 'leave') return;
    const extra = step.branches?.[outcome];
    if (extra) a.steps.splice(a.index + 1, 0, ...extra);
    this.advance();
  }

  /** Time passes: real seconds (unpaused) and game minutes. */
  tick(realSeconds: number, gameMinutes: number) {
    const a = this.active,
      step = this.step;
    if (!a || !step) return;
    a.elapsedSeconds += realSeconds;
    if (a.task.timeLimitSeconds && a.elapsedSeconds > a.task.timeLimitSeconds) {
      this.last = {
        taskId: a.task.id,
        title: a.task.title,
        result: 'failed',
        reason: "Time's up",
      };
      this.active = undefined;
      this.pendingDialogue = undefined;
      return;
    }
    if (step.kind === 'sit' && a.seatedFor !== undefined && this.seat) {
      a.seatedFor += gameMinutes;
      if (step.minutes && a.seatedFor >= step.minutes) this.advance();
    }
  }

  private openTalk(step: Step) {
    const a = this.active!;
    const actor = a.task.actors?.find((x) => x.id === step.actor);
    const friend = a.params.friend ? this.friend(a.params.friend) : undefined;
    const name =
      step.actor === 'friend'
        ? (friend?.name ?? 'Friend')
        : actor
          ? fill(actor.name, a.vars)
          : step.actor!;
    a.state = 'dialogue';
    this.pendingDialogue = {
      dialogue:
        step.actor === 'friend' && friend ? friend.dialogue : step.dialogue!,
      actor: name,
      vars: { ...a.vars, actor: name },
    };
  }

  private enterStep() {
    const a = this.active,
      step = this.step;
    if (!a || !step) return;
    a.seatedFor = undefined;
    a.visited = new Set();
    if (step.kind === 'talk' && step.auto) this.openTalk(step);
    // Already sitting where the step wants (e.g. eat after ordering at a table).
    if (step.kind === 'sit' && this.seat) this.sat(this.seat);
  }

  private advance() {
    const a = this.active!;
    a.index += 1;
    a.state = 'pending';
    if (a.index >= a.steps.length) {
      if (!this.completed.includes(a.task.id)) this.completed.push(a.task.id);
      this.last = {
        taskId: a.task.id,
        title: a.task.title,
        result: 'completed',
      };
      this.active = undefined;
      this.pendingDialogue = undefined;
      return;
    }
    this.enterStep();
  }
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** Friend meetup invitations for a day (deterministic; at most one per friend). */
export function friendMessages(
  doc: TasksDocument,
  day: number,
  rollNumber = '',
) {
  const out: {
    friendId: string;
    name: string;
    time: string;
    meet: string;
    sentAt: number;
  }[] = [];
  for (const f of doc.friends) {
    const r = rng(hash(`meet:${f.id}:${day}:${rollNumber}`));
    // Friends text on weekdays and sometimes on Saturdays.
    if (day === 6 || (day === 5 && r() < 0.5)) continue;
    const time = f.times[Math.floor(r() * f.times.length)]!;
    const spot = f.spots[Math.floor(r() * f.spots.length)]!;
    const meet = spot.area
      ? `area:${spot.area}`
      : spot.space
        ? `space:${spot.space}`
        : undefined;
    if (!meet) continue;
    out.push({
      friendId: f.id,
      name: f.name,
      time,
      meet,
      sentAt: Math.max(0, toMinutes(time) - 90),
    });
  }
  return out.sort((a, b) => a.sentAt - b.sentAt);
}
