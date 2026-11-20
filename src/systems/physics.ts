import RAPIER from '@dimforge/rapier3d-compat';
import type { Vec2 } from '../types/campus';
import type { StaticCollider } from './campus-geometry';

// Rapier physics world built from simplified static colliders (never from
// render meshes). Pure TypeScript so it runs in Node unit tests and the browser.

export type Rapier = typeof RAPIER;
export type World = RAPIER.World;

let ready: Promise<Rapier> | undefined;
/** Load the Rapier WASM module once. */
export function initRapier(): Promise<Rapier> {
  ready ??= RAPIER.init().then(() => RAPIER);
  return ready;
}

const yawQuaternion = (rotationY: number) => ({
  x: 0,
  y: Math.sin(rotationY / 2),
  z: 0,
  w: Math.cos(rotationY / 2),
});

/** Vertical side walls of a footprint prism as a static triangle mesh. */
function prismSides(polygon: Vec2[], minY: number, maxY: number) {
  const vertices: number[] = [];
  const indices: number[] = [];
  polygon.forEach(([x, z]) => vertices.push(x, minY, z, x, maxY, z));
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    const a = i * 2,
      b = ((i + 1) % n) * 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

export interface PhysicsWorldOptions {
  /** Centre and half-size (m) of the flat ground slab. */
  groundCenter: Vec2;
  groundHalfSize: number;
}

/**
 * Build the world. `registry`, when given, receives each static collider by id
 * (e.g. `gate:G-MASJID`) so gameplay can enable or disable it later.
 */
export function createPhysicsWorld(
  R: Rapier,
  colliders: StaticCollider[],
  { groundCenter, groundHalfSize }: PhysicsWorldOptions,
  registry?: Map<string, RAPIER.Collider>,
): World {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
  // Real campus is near-flat (ARCHITECTURE §4): ground top at y = 0.
  world.createCollider(
    R.ColliderDesc.cuboid(groundHalfSize, 0.5, groundHalfSize).setTranslation(
      groundCenter[0],
      -0.5,
      groundCenter[1],
    ),
    fixed,
  );
  for (const collider of colliders) {
    if (collider.kind === 'box') {
      const [hx, hy, hz] = collider.halfExtents;
      const created = world.createCollider(
        R.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(...collider.center)
          .setRotation(yawQuaternion(collider.rotationY)),
        fixed,
      );
      registry?.set(collider.id, created);
    } else {
      const { vertices, indices } = prismSides(
        collider.polygon,
        collider.minY,
        collider.maxY,
      );
      registry?.set(
        collider.id,
        world.createCollider(R.ColliderDesc.trimesh(vertices, indices), fixed),
      );
    }
  }
  return world;
}
