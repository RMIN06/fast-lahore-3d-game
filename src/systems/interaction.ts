import type { Fixture, FixtureKind, Vec3 } from './fixtures';

// M10 interaction (GAMEPLAY_SPEC §2: E interacts). Pure picking: the thing
// in front of the player within reach, roughly where they look (a cone, so
// you don't have to aim at a chair's exact pixel). Walls are checked by the
// caller with a physics ray.

export interface Interactable {
  id: string;
  type: 'fixture' | 'actor';
  position: Vec3;
  /** Height of the part you look at (for the wall check). */
  height: number;
  label: string;
  verb: string;
  fixture?: Fixture;
}

export const REACH = 2.2;
/** Half-angle of the look cone (radians, about 35°). */
export const CONE = 0.62;

/** Height of the bit you look at, per kind. */
export const FOCUS_HEIGHT: Record<FixtureKind, number> = {
  seat: 0.5,
  pc: 0.9,
  lectern: 1.1,
  shelf: 1.3,
  counter: 1.0,
  desk: 0.8,
  bench: 0.5,
  prayer: 0.1,
  bay: 0.2,
  rack: 0.6,
  door: 1.2,
};

export const VERB: Record<FixtureKind, string> = {
  seat: 'Sit',
  pc: 'Sit at the PC',
  lectern: 'Look',
  shelf: 'Search',
  counter: 'Ask',
  desk: 'Ask',
  bench: 'Sit',
  prayer: 'Pray',
  bay: 'Park',
  rack: 'Park',
  door: 'Open / close',
};

/** Where to stand to use a fixture: in front of counters, behind seats. */
export function approach(
  f: { position: Vec3; yaw: number; kind?: FixtureKind },
  distance = 1,
) {
  // Facing direction of the fixture (three.js yaw: 0 faces -Z).
  const fx = -Math.sin(f.yaw),
    fz = -Math.cos(f.yaw);
  const behind =
    f.kind && ['seat', 'pc', 'bench', 'prayer', 'bay', 'rack'].includes(f.kind);
  const s = behind ? -distance : distance;
  const position: Vec3 = [
    f.position[0] + fx * s,
    f.position[1],
    f.position[2] + fz * s,
  ];
  // Look at the fixture.
  const yaw = Math.atan2(
    -(f.position[0] - position[0]),
    -(f.position[2] - position[2]),
  );
  return { position, yaw };
}

/**
 * The interactable the player is facing: within reach on the same floor and
 * inside the look cone, nearest first (angle breaks ties).
 */
export function pickFocus(
  feet: Vec3,
  yaw: number,
  candidates: Iterable<Interactable>,
  isBlocked?: (c: Interactable, distance: number) => boolean,
): Interactable | undefined {
  const vx = -Math.sin(yaw),
    vz = -Math.cos(yaw);
  let best: Interactable | undefined,
    bestScore = Infinity;
  for (const c of candidates) {
    if (Math.abs(c.position[1] - feet[1]) > 1.5) continue;
    const dx = c.position[0] - feet[0],
      dz = c.position[2] - feet[2];
    const d = Math.hypot(dx, dz);
    if (d > REACH) continue;
    // Standing on it (a seat you are next to) counts as straight ahead.
    const angle =
      d < 0.35
        ? 0
        : Math.acos(Math.max(-1, Math.min(1, (dx * vx + dz * vz) / d)));
    if (angle > CONE) continue;
    // People win over the bench or desk they are at.
    const score = d + angle * 1.5 - (c.type === 'actor' ? 0.4 : 0);
    if (score < bestScore && !isBlocked?.(c, d)) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/** What using a fixture does outside a task: a short line, or a dialogue. */
export function ambientLine(
  f: Fixture,
  campus: { areas: { id: string; kind: string }[] },
): { text: string; dialogue?: string } {
  const area = f.areaId
    ? campus.areas.find((a) => a.id === f.areaId)
    : undefined;
  if (
    f.kind === 'counter' &&
    (f.spaceId === 'F-G-CAFE' || area?.kind === 'cafe')
  )
    return { text: f.label, dialogue: 'order' };
  switch (f.kind) {
    case 'shelf':
      return {
        text: `${f.label}: call numbers ${f.code}-100 to ${f.code}-999.`,
      };
    case 'bay':
      return { text: `${f.label}: free. You came on foot today.` };
    case 'rack':
      return { text: `${f.label}: an empty bike rack.` };
    case 'lectern':
      return { text: 'The lectern. Class notes are pinned to it.' };
    default:
      return {
        text: `${f.label}: open a task from your phone (P) to do something here.`,
      };
  }
}
