import type { Crowd, CrowdAgent, NavMeshQuery } from 'recast-navigation';
import { planDay } from './npc';
import type { Activity, NpcDay, NpcWorldInfo, Vec3 } from './npc';

// M9 NPC simulation. The nearest NPCs (≤ ACTIVE_CAP) are DetourCrowd agents
// with collision avoidance; the rest are simulated abstractly along the same
// navmesh paths (location + progress), materialising when the player is near.

export const ACTIVE_CAP = 60;
export const ACTIVE_RADIUS = 90;
export const WALK_SPEED = 1.3;
/** Counter service per person, in game minutes (two staff, a quick order). */
const SERVICE_MINUTES = 0.5;
/** Queues fold into rows of this many people beside the counter. */
const QUEUE_ROW = 8;
const QUEUE_ROW_GAP = 1.2;
const ARRIVE_DISTANCE = 0.8;
const QUEUE_SPACING = 0.9;
const STUCK_SECONDS = 20;
/** Blocked this long in a jam: yield (walk abstractly) for YIELD_SECONDS. */
const BLOCKED_SECONDS = 4;
const YIELD_SECONDS = 3;
const CURFEW = 23 * 60 + 30;
/** Spawning this late (loaded save, time jump): start at the current activity. */
const WARM_START_MINUTES = 15;
const HALF_EXTENTS = { x: 2, y: 1.5, z: 2 };
// Targets snap within the same floor only: a wider vertical search can land on
// furniture tops (walkable islands on counters and tables).
const SNAP_EXTENTS = { x: 2, y: 0.4, z: 2 };

type Status = 'off' | 'travel' | 'queue' | 'dwell' | 'gone';

export interface NpcState {
  day: NpcDay;
  status: Status;
  index: number;
  position: Vec3;
  /** Current leg target and abstract path along the navmesh. */
  target: Vec3;
  path: Vec3[];
  pathIndex: number;
  agent?: CrowdAgent;
  /** Facing (radians) and speed for rendering/animation. */
  heading: number;
  speed: number;
  queue?: { counter: 'cafe' | 'library'; slotTarget: Vec3 };
  servedAt?: number;
  /** Where the NPC was when it last made real progress (stuck detection). */
  anchor: Vec3;
  noProgress: number;
  /** Not re-activated before this time (yielding out of a crowd jam). */
  yieldUntil: number;
  /** Seconds without moving, across yields (true stuck detection). */
  stalled: number;
  /** Placed off the navmesh (a street-side shop): never a crowd agent. */
  offMesh: boolean;
  arrivals: { kind: Activity['kind']; spaceId?: string; at: number }[];
}

export interface Counter {
  position: Vec3;
  /** Unit direction (x, z) the queue extends along. */
  direction: [number, number];
}

const dist2 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const v3 = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z];
const xyz = (p: Vec3) => ({ x: p[0], y: p[1], z: p[2] });

export class NpcSim {
  npcs: NpcState[] = [];
  day = -1;
  elapsed = 0;
  readonly stats = { stuck: 0, pathFailures: 0, maxActive: 0, yields: 0 };
  private readonly queues = new Map<'cafe' | 'library', string[]>();
  private observerAgent?: CrowdAgent;

  constructor(
    private readonly query: NavMeshQuery,
    private readonly crowd: Crowd,
    private readonly info: NpcWorldInfo,
    private readonly counters: Partial<Record<'cafe' | 'library', Counter>>,
    private readonly options = {
      activeCap: ACTIVE_CAP,
      activeRadius: ACTIVE_RADIUS,
    },
  ) {}

  /** Start a new day's plans (also called at midnight). */
  setDay(day: number) {
    for (const npc of this.npcs) this.deactivate(npc);
    this.day = day;
    this.queues.clear();
    this.npcs = planDay(this.info, day).map((plan) => ({
      day: plan,
      status: 'off',
      index: -1,
      position: plan.spawn,
      target: plan.spawn,
      path: [],
      pathIndex: 0,
      heading: 0,
      speed: 0,
      anchor: plan.spawn,
      noProgress: 0,
      yieldUntil: 0,
      stalled: 0,
      offMesh: false,
      arrivals: [],
    }));
  }

  get present() {
    return this.npcs.filter((n) => n.status !== 'off' && n.status !== 'gone');
  }
  get active() {
    return this.npcs.filter((n) => n.agent);
  }

  /** Snap a point onto the navmesh. */
  private snap(p: Vec3): Vec3 {
    const r = this.query.findClosestPoint(xyz(p), {
      halfExtents: SNAP_EXTENTS,
    });
    return r.success ? v3(r.point) : p;
  }

  private startLeg(npc: NpcState, target: Vec3) {
    npc.target = npc.offMesh ? target : this.snap(target);
    npc.anchor = npc.position;
    npc.noProgress = 0;
    npc.stalled = 0;
    npc.pathIndex = 0;
    npc.status = 'travel';
    if (dist2(npc.position, npc.target) < ARRIVE_DISTANCE) {
      // Already there (a post or counter at the spawn point): nothing to path.
      npc.path = [npc.target];
      npc.agent?.requestMoveTarget(xyz(npc.target));
      return;
    }
    const result = this.query.computePath(xyz(npc.position), xyz(npc.target), {
      halfExtents: HALF_EXTENTS,
    });
    const end = result.path?.at(-1);
    if (!result.success || !end || dist2(v3(end), npc.target) > 1.5) {
      this.stats.pathFailures += 1;
      npc.path = [npc.position, npc.target];
    } else npc.path = result.path.map(v3);
    npc.pathIndex = 0;
    npc.status = 'travel';
    npc.agent?.requestMoveTarget(xyz(npc.target));
  }

  private nextActivity(npc: NpcState, minutes: number) {
    npc.index += 1;
    const activity = npc.day.activities[npc.index];
    if (!activity) {
      this.leave(npc);
      return;
    }
    this.startLeg(npc, activity.position);
    void minutes;
  }

  private leave(npc: NpcState) {
    this.deactivate(npc);
    npc.status = 'gone';
    npc.speed = 0;
  }

  private slot(counter: 'cafe' | 'library', index: number): Vec3 {
    const c = this.counters[counter]!;
    // Snake back and forth in rows so a long line stays inside the room.
    const row = Math.floor(index / QUEUE_ROW);
    const col = index % QUEUE_ROW;
    const along =
      1 + (row % 2 === 0 ? col : QUEUE_ROW - 1 - col) * QUEUE_SPACING;
    const side = row * QUEUE_ROW_GAP;
    const [du, dv] = c.direction;
    return this.snap([
      c.position[0] + du * along - dv * side,
      c.position[1],
      c.position[2] + dv * along + du * side,
    ]);
  }

  private arrived(npc: NpcState, minutes: number) {
    const activity = npc.day.activities[npc.index];
    if (!activity) return;
    if (npc.queue) {
      // Reached a queue slot; service happens at the front (see update).
      npc.status = 'queue';
      return;
    }
    npc.arrivals.push({
      kind: activity.kind,
      ...(activity.spaceId ? { spaceId: activity.spaceId } : {}),
      at: minutes,
    });
    if (activity.kind === 'leave') {
      this.leave(npc);
      return;
    }
    if (
      activity.queue &&
      this.counters[activity.queue] &&
      npc.servedAt === undefined
    ) {
      const line = this.queues.get(activity.queue) ?? [];
      line.push(npc.day.id);
      this.queues.set(activity.queue, line);
      npc.queue = {
        counter: activity.queue,
        slotTarget: this.slot(activity.queue, line.length - 1),
      };
      this.startLeg(npc, npc.queue.slotTarget);
      return;
    }
    npc.status = 'dwell';
  }

  /** Advance along the abstract path at walking speed. */
  private walkAbstract(npc: NpcState, dt: number) {
    let budget = WALK_SPEED * dt;
    while (budget > 0 && npc.pathIndex < npc.path.length) {
      const next = npc.path[npc.pathIndex]!;
      const d = Math.hypot(
        next[0] - npc.position[0],
        next[1] - npc.position[1],
        next[2] - npc.position[2],
      );
      if (d <= budget) {
        npc.position = next;
        npc.pathIndex += 1;
        budget -= d;
      } else {
        const k = budget / d;
        npc.heading = Math.atan2(
          -(next[0] - npc.position[0]),
          -(next[2] - npc.position[2]),
        );
        npc.position = [
          npc.position[0] + (next[0] - npc.position[0]) * k,
          npc.position[1] + (next[1] - npc.position[1]) * k,
          npc.position[2] + (next[2] - npc.position[2]) * k,
        ];
        budget = 0;
      }
    }
    npc.speed = WALK_SPEED;
  }

  private activate(npc: NpcState) {
    if (npc.agent) return;
    npc.agent = this.crowd.addAgent(xyz(this.snap(npc.position)), {
      radius: 0.28,
      height: 1.75,
      maxAcceleration: 6,
      maxSpeed: WALK_SPEED,
      collisionQueryRange: 2.5,
      pathOptimizationRange: 15,
      separationWeight: 0.6,
      obstacleAvoidanceType: 3,
    });
    if (npc.status === 'travel') npc.agent.requestMoveTarget(xyz(npc.target));
  }

  private deactivate(npc: NpcState) {
    if (!npc.agent) return;
    npc.position = v3(npc.agent.position());
    this.crowd.removeAgent(npc.agent);
    npc.agent = undefined;
    // Continue abstractly from here along a fresh path.
    if (npc.status === 'travel') {
      const target = npc.target;
      this.startLeg(npc, target);
    }
  }

  update(dt: number, clock: { day: number; minutes: number }, observer: Vec3) {
    if (clock.day !== this.day) this.setDay(clock.day);
    this.elapsed += dt;
    const minutes = clock.minutes;

    for (const npc of this.npcs) {
      const plan = npc.day;
      if (npc.status === 'gone') continue;
      if (npc.status === 'off') {
        if (minutes >= plan.spawnAt && minutes < CURFEW) {
          const r = this.query.findClosestPoint(xyz(plan.spawn), {
            halfExtents: SNAP_EXTENTS,
          });
          npc.offMesh = !r.success || dist2(v3(r.point), plan.spawn) > 0.5;
          npc.position = npc.offMesh ? plan.spawn : v3(r.point);
          if (minutes - plan.spawnAt > WARM_START_MINUTES)
            this.warmStart(npc, minutes);
          else this.nextActivity(npc, minutes);
        }
        continue;
      }
      if (minutes >= CURFEW && npc.day.archetype !== 'guard') {
        this.leave(npc);
        continue;
      }
      if (npc.status === 'travel') {
        if (npc.agent) {
          const p = v3(npc.agent.position());
          const v = npc.agent.velocity();
          npc.speed = Math.hypot(v.x, v.z);
          if (npc.speed > 0.1) npc.heading = Math.atan2(-v.x, -v.z);
          npc.position = p;
          const d = dist2(p, npc.target);
          // Progress = actually moving (paths may detour away from the target).
          if (dist2(p, npc.anchor) > 1) {
            npc.anchor = p;
            npc.noProgress = 0;
            npc.stalled = 0;
          } else {
            npc.noProgress += dt;
            npc.stalled += dt;
          }
          // Crowded at a shared spot: close enough counts as arrived.
          const settled = d < 2.5 && npc.noProgress > 3;
          if (d < ARRIVE_DISTANCE || settled) {
            npc.agent.resetMoveTarget();
            this.arrived(npc, minutes);
          } else if (npc.stalled > STUCK_SECONDS) {
            this.stats.stuck += 1;
            npc.stalled = 0;
          } else if (npc.noProgress > BLOCKED_SECONDS) {
            // Crowd jam (head-on in a corridor or on a stair landing): yield by
            // walking abstractly along the path for a moment, then rejoin.
            this.stats.yields += 1;
            npc.yieldUntil = this.elapsed + YIELD_SECONDS;
            this.deactivate(npc);
          }
        } else {
          const before = npc.position;
          this.walkAbstract(npc, dt);
          if (dist2(before, npc.position) > 0.01) npc.stalled = 0;
          if (npc.pathIndex >= npc.path.length) this.arrived(npc, minutes);
        }
        continue;
      }
      npc.speed = 0;
      if (npc.status === 'queue' && npc.queue) {
        const line = this.queues.get(npc.queue.counter) ?? [];
        const place = line.indexOf(plan.id);
        if (place === 0) {
          npc.servedAt ??= minutes;
          if (minutes - npc.servedAt >= SERVICE_MINUTES) {
            line.shift();
            const counter = npc.queue.counter;
            npc.queue = undefined;
            // Everyone behind moves up one slot.
            line.forEach((id, i) => {
              const other = this.npcs.find((n) => n.day.id === id);
              if (other?.queue) {
                other.queue.slotTarget = this.slot(counter, i);
                this.startLeg(other, other.queue.slotTarget);
              }
            });
            // Served: go to a place in the room to sit.
            this.startLeg(npc, plan.activities[npc.index]!.position);
          }
        }
        continue;
      }
      if (npc.status === 'dwell') {
        const activity = plan.activities[npc.index]!;
        if (minutes >= activity.until) {
          npc.servedAt = undefined;
          this.nextActivity(npc, minutes);
        }
      }
    }

    // Activate the nearest present NPCs (within range, capped).
    const present = this.present
      .map((n) => ({ n, d: dist2(n.position, observer) }))
      .filter(
        (x) =>
          x.d <= this.options.activeRadius &&
          x.n.yieldUntil <= this.elapsed &&
          !x.n.offMesh,
      )
      .sort((a, b) => a.d - b.d)
      .slice(0, this.options.activeCap)
      .map((x) => x.n);
    const keep = new Set(present);
    for (const npc of this.npcs)
      if (npc.agent && !keep.has(npc)) this.deactivate(npc);
    for (const npc of present) this.activate(npc);
    this.stats.maxActive = Math.max(this.stats.maxActive, this.active.length);

    // The player is an obstacle NPCs steer around.
    this.observerAgent ??= this.crowd.addAgent(xyz(this.snap(observer)), {
      radius: 0.35,
      height: 1.75,
      maxSpeed: 0,
      maxAcceleration: 0,
    });
    this.observerAgent.teleport(xyz(this.snap(observer)));
    this.crowd.update(dt);
  }

  /** Place an NPC straight into the activity it should be doing now. */
  private warmStart(npc: NpcState, minutes: number) {
    const activities = npc.day.activities;
    let index = 0;
    activities.forEach((a, i) => {
      if (a.from <= minutes) index = i;
    });
    const activity = activities[index];
    if (!activity || activity.kind === 'leave') {
      npc.status = 'gone';
      return;
    }
    npc.index = index;
    npc.position = npc.offMesh
      ? activity.position
      : this.snap(activity.position);
    npc.target = npc.position;
    npc.path = [];
    npc.pathIndex = 0;
    npc.servedAt = minutes; // already served: no queue
    npc.arrivals.push({
      kind: activity.kind,
      ...(activity.spaceId ? { spaceId: activity.spaceId } : {}),
      at: minutes,
    });
    npc.status = 'dwell';
  }

  /** Is the NPC sitting (dwelling at a seated activity)? */
  sitting(npc: NpcState) {
    return (
      npc.status === 'dwell' && Boolean(npc.day.activities[npc.index]?.sit)
    );
  }
}
