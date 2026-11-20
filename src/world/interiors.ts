import type { Campus } from '../types/campus';
import { generateInterior } from '../systems/interior';
import type { InteriorLayout } from '../systems/interior';
import { staticColliders } from '../systems/campus-geometry';
import { campusPhysicsInput } from '../systems/interior';

/**
 * Blocks with walkable interiors, in the M7 delivery order
 * (F, D, C, B, A, E — Library last). Blocks not listed stay solid.
 */
export const INTERIOR_BLOCKS: readonly string[] = ['F', 'D', 'C', 'B', 'A'];

const cache = new WeakMap<Campus, InteriorLayout[]>();

/** Generated interior layouts for the enabled blocks (cached per campus). */
export function interiorLayouts(campus: Campus): InteriorLayout[] {
  let layouts = cache.get(campus);
  if (!layouts) {
    layouts = INTERIOR_BLOCKS.map((id) => {
      const building = campus.buildings.find((b) => b.id === id);
      if (!building) throw new Error(`Unknown interior block ${id}`);
      return generateInterior(building, campus.meta.defaults);
    });
    cache.set(campus, layouts);
  }
  return layouts;
}

/** Colliders and ground holes for the whole campus including interiors. */
export const campusPhysics = (campus: Campus) =>
  campusPhysicsInput(campus, interiorLayouts(campus), staticColliders);
