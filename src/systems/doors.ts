import type { Vec3 } from './fixtures';

// M10 room doors. Open by default; E toggles. A closed door blocks the player
// (its physics collider is enabled). NPCs open a closed door when they reach
// it and it swings shut again behind them. Pure state; rendering and physics
// read it.

export const SWING_SECONDS = 0.6;
/** NPCs this close to a closed door open it. */
export const NPC_OPEN_DISTANCE = 1.3;
/** How long an NPC-opened door stays open. */
export const NPC_HOLD_SECONDS = 3;

export interface DoorState {
  /** What the player last chose (doors start open). */
  closed: boolean;
  /** Seconds left of an NPC holding it open. */
  held: number;
  /** 0 = shut, 1 = fully open (animated). */
  openness: number;
}

export class DoorSystem {
  readonly doors = new Map<string, DoorState>();
  /** Blocking state last reported to physics (doors start open). */
  private readonly reported = new Map<string, boolean>();

  constructor(readonly positions: ReadonlyMap<string, Vec3>) {
    for (const id of positions.keys())
      this.doors.set(id, { closed: false, held: 0, openness: 1 });
  }

  toggle(id: string): boolean | undefined {
    const d = this.doors.get(id);
    if (!d) return undefined;
    d.closed = !d.closed;
    d.held = 0;
    return d.closed;
  }

  /** Physically shut (blocks the player) right now? */
  blocking(id: string) {
    const d = this.doors.get(id);
    return Boolean(d && d.closed && d.held <= 0);
  }

  /**
   * Advance animation and NPC holds. Returns ids whose blocking state changed
   * (for the physics colliders) and whether anything is still moving.
   */
  update(
    dt: number,
    npcs: readonly Vec3[],
  ): { changed: string[]; moving: boolean } {
    const changed: string[] = [];
    let moving = false;
    for (const [id, d] of this.doors) {
      if (d.closed) {
        const p = this.positions.get(id)!;
        const near = npcs.some(
          (n) =>
            Math.abs(n[1] - p[1]) < 1.5 &&
            Math.hypot(n[0] - p[0], n[2] - p[2]) < NPC_OPEN_DISTANCE,
        );
        d.held = near ? NPC_HOLD_SECONDS : Math.max(0, d.held - dt);
      }
      const target = d.closed && d.held <= 0 ? 0 : 1;
      if (d.openness !== target) {
        const step = dt / SWING_SECONDS;
        d.openness =
          target > d.openness
            ? Math.min(1, d.openness + step)
            : Math.max(0, d.openness - step);
        moving = true;
      }
      const now = this.blocking(id);
      if (now !== (this.reported.get(id) ?? false)) {
        this.reported.set(id, now);
        changed.push(id);
      }
    }
    return { changed, moving };
  }
}
