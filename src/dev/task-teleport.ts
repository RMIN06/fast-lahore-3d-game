import { loadedCampus } from '../world/campus';
import { interiorLayouts } from '../world/interiors';
import { inwardOf, pointInPolygon } from '../systems/campus-geometry';
import { centroid } from '../systems/geometry-utils';
import { approach } from '../systems/interaction';
import type { Vec3 } from '../systems/fixtures';
import { actorPoses, taskData, useTaskStore } from '../state/task-store';

// Dev-only: resolve "fixture:<id>", "actor:<id>", "space:<id>", "area:<id>",
// "building:<id>" or "gate:<id>" to a place to stand (and face), for the
// task debug panel and the scripted task runs (M10).

export function taskTeleport(
  target: string,
): { position: Vec3; yaw: number } | undefined {
  const { campus } = loadedCampus;
  const at = target.indexOf(':');
  const kind = target.slice(0, at),
    id = target.slice(at + 1);
  const rooms = interiorLayouts(campus).flatMap((l) =>
    l.floors.flatMap((f) => f.rooms.map((r) => ({ l, r }))),
  );
  if (kind === 'fixture') {
    const f = taskData().fixtures.find((x) => x.id === id);
    return f ? approach(f) : undefined;
  }
  if (kind === 'actor') {
    const pose = actorPoses(useTaskStore.getState().engine).find(
      (p) => p.id === id,
    );
    return pose
      ? approach({ position: pose.position, yaw: pose.yaw })
      : undefined;
  }
  if (kind === 'space') {
    const x = rooms.find((y) => y.r.spaceId === id);
    return x ? { position: x.r.anchor, yaw: 0 } : undefined;
  }
  if (kind === 'building') {
    const x = rooms.find((y) => y.l.buildingId === id);
    return x ? { position: x.r.anchor, yaw: 0 } : undefined;
  }
  if (kind === 'area') {
    const area = campus.areas.find((a) => a.id === id);
    if (!area?.polygon) return undefined;
    const c = centroid(area.polygon);
    const p = area.polygon;
    const inside = pointInPolygon(c, p)
      ? c
      : ([
          (p[0]![0] + p[1]![0] + p[2]![0]) / 3,
          (p[0]![1] + p[1]![1] + p[2]![1]) / 3,
        ] as const);
    return { position: [inside[0], 0, inside[1]], yaw: 0 };
  }
  if (kind === 'gate') {
    const gate = campus.gates.find((g) => g.id === id);
    if (!gate?.position || gate.heading === undefined) return undefined;
    const [ix, iz] = inwardOf(gate.heading);
    return {
      position: [gate.position[0] + ix * 4, 0, gate.position[1] + iz * 4],
      yaw: Math.atan2(-ix, -iz),
    };
  }
  return undefined;
}
