import { Crowd, NavMeshQuery } from 'recast-navigation';
import type { NavMesh } from 'recast-navigation';
import type { Campus } from '../types/campus';
import { interiorLayouts } from './interiors';
import { ACTIVE_CAP, ACTIVE_RADIUS, NpcSim } from '../systems/npc-sim';
import type { Counter } from '../systems/npc-sim';

/** Counters with queues: the cafe counter and the library desk (rooms from data). */
export function counters(
  campus: Campus,
): Partial<Record<'cafe' | 'library', Counter>> {
  const out: Partial<Record<'cafe' | 'library', Counter>> = {};
  for (const layout of interiorLayouts(campus))
    for (const floor of layout.floors)
      for (const room of floor.rooms) {
        const key =
          room.spaceId === 'F-G-CAFE'
            ? 'cafe'
            : room.spaceId === 'E-G-LIBRARY'
              ? 'library'
              : undefined;
        if (key)
          out[key] = {
            position: room.anchor,
            direction: [layout.frame.u[0], layout.frame.u[1]],
          };
      }
  return out;
}

/** NPC simulation on an imported campus navmesh. */
export function createNpcSim(
  navMesh: NavMesh,
  campus: Campus,
  { activeCap = ACTIVE_CAP, activeRadius = ACTIVE_RADIUS } = {},
) {
  const query = new NavMeshQuery(navMesh);
  // +1 agent slot for the player obstacle.
  const crowd = new Crowd(navMesh, {
    maxAgents: activeCap + 1,
    maxAgentRadius: 0.6,
  });
  const sim = new NpcSim(
    query,
    crowd,
    { campus, layouts: interiorLayouts(campus) },
    counters(campus),
    { activeCap, activeRadius },
  );
  return { sim, query, crowd };
}
