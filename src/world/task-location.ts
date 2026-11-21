import { loadedCampus } from './campus';
import { pointInPolygon } from '../systems/campus-geometry';
import type { Loc } from '../systems/tasks';
import { usePlayerStore } from '../state/player-store';
import { useWorldStore } from '../state/world-store';

/** Gates count as "reached" within this distance (m). */
const GATE_RADIUS = 8;

/** Where the player is, in task terms (room, building, outdoor areas, gates). */
export function currentLoc(): Loc {
  const { campus } = loadedCampus;
  const where = useWorldStore.getState().location;
  const [x, , z] = usePlayerStore.getState().position;
  return {
    ...(where.buildingId ? { buildingId: where.buildingId } : {}),
    ...(where.floorId ? { floorId: where.floorId } : {}),
    ...(where.spaceId ? { spaceId: where.spaceId } : {}),
    areaIds: where.buildingId
      ? []
      : campus.areas
          .filter((a) => a.polygon && pointInPolygon([x, z], a.polygon))
          .map((a) => a.id),
    nearGates: campus.gates
      .filter(
        (g) =>
          g.position &&
          Math.hypot(g.position[0] - x, g.position[1] - z) < GATE_RADIUS,
      )
      .map((g) => g.id),
  };
}
