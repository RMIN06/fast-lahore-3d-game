import RAPIER from '@dimforge/rapier3d-compat';
import { ShapeUtils, Vector2 } from 'three';
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

/** Quaternion for a yaw about +Y followed by a tilt about the local Z axis. */
const rotation = (rotationY: number, tiltZ = 0) => {
  const cy = Math.cos(rotationY / 2),
    sy = Math.sin(rotationY / 2);
  const cz = Math.cos(tiltZ / 2),
    sz = Math.sin(tiltZ / 2);
  // q = qY * qZ
  return { x: sy * sz, y: sy * cz, z: cy * sz, w: cy * cz };
};

type Prism = Extract<StaticCollider, { kind: 'prism' }>;

/** Vertical side walls of a footprint prism, leaving door openings. */
export function prismSides(prism: Prism) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const quad = (a: Vec2, b: Vec2, y0: number, y1: number) => {
    const k = vertices.length / 3;
    vertices.push(
      a[0],
      y0,
      a[1],
      b[0],
      y0,
      b[1],
      b[0],
      y1,
      b[1],
      a[0],
      y1,
      a[1],
    );
    indices.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  const { polygon, minY, maxY } = prism;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    const opening = prism.openings?.find((o) => o.edge === i);
    if (!opening) {
      quad(a, b, minY, maxY);
      return;
    }
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const along =
      ((opening.center[0] - a[0]) * (b[0] - a[0]) +
        (opening.center[1] - a[1]) * (b[1] - a[1])) /
      length;
    const at = (d: number): Vec2 => [
      a[0] + ((b[0] - a[0]) * d) / length,
      a[1] + ((b[1] - a[1]) * d) / length,
    ];
    const g0 = Math.max(0, along - opening.width / 2),
      g1 = Math.min(length, along + opening.width / 2);
    if (g0 > 0.01) quad(a, at(g0), minY, maxY);
    quad(at(g0), at(g1), Math.min(maxY, minY + opening.height), maxY); // lintel
    if (length - g1 > 0.01) quad(at(g1), b, minY, maxY);
  });
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

export interface PhysicsWorldOptions {
  /** Centre and half-size (m) of the flat ground. */
  groundCenter: Vec2;
  groundHalfSize: number;
  /** Holes in the ground where interiors (and their basements) are (M7). */
  groundHoles?: Vec2[][];
}

/** Flat ground at y = 0 with holes, as a triangle mesh. */
function groundWithHoles(
  center: Vec2,
  half: number,
  holes: Vec2[][],
): { vertices: Float32Array; indices: Uint32Array } {
  const contour = [
    new Vector2(center[0] - half, center[1] - half),
    new Vector2(center[0] + half, center[1] - half),
    new Vector2(center[0] + half, center[1] + half),
    new Vector2(center[0] - half, center[1] + half),
  ];
  const holeVectors = holes.map((h) => h.map(([x, z]) => new Vector2(x, z)));
  const triangles = ShapeUtils.triangulateShape(contour, holeVectors);
  const all = [contour, ...holeVectors].flat();
  return {
    vertices: new Float32Array(all.flatMap((p) => [p.x, 0, p.y])),
    indices: new Uint32Array(triangles.flat()),
  };
}

/**
 * Build the world. `registry`, when given, receives each static collider by id
 * (e.g. `gate:G-MASJID`) so gameplay can enable or disable it later.
 */
export function createPhysicsWorld(
  R: Rapier,
  colliders: StaticCollider[],
  { groundCenter, groundHalfSize, groundHoles = [] }: PhysicsWorldOptions,
  registry?: Map<string, RAPIER.Collider>,
): World {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
  // Real campus is near-flat (ARCHITECTURE §4): ground top at y = 0.
  if (groundHoles.length) {
    const { vertices, indices } = groundWithHoles(
      groundCenter,
      groundHalfSize,
      groundHoles,
    );
    world.createCollider(R.ColliderDesc.trimesh(vertices, indices), fixed);
  } else
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
          .setRotation(rotation(collider.rotationY, collider.tiltZ)),
        fixed,
      );
      // Room doors start open (M10): their colliders block only once shut.
      if (collider.id.startsWith('door:')) created.setEnabled(false);
      registry?.set(collider.id, created);
    } else {
      const { vertices, indices } = prismSides(collider);
      registry?.set(
        collider.id,
        world.createCollider(R.ColliderDesc.trimesh(vertices, indices), fixed),
      );
    }
  }
  return world;
}
