import type { Building, Campus, Confidence, Vec2 } from '../types/campus';

// Pure exterior-greybox maths (M3). No three.js here so it stays unit testable.
// World axes: +X east, +Y up, +Z south; polygons are [x, z] in meters.

export interface FloorSlab {
  floorId: string;
  level: number;
  base: number;
  top: number;
}

export interface BuildingMass {
  id: string;
  label: string;
  footprint: Vec2[];
  floors: FloorSlab[];
  aboveGround: number;
  basements: number;
  height: number;
  confidence: Confidence;
  floorsConfidence: Confidence;
}

export interface WallSegment {
  from: Vec2;
  to: Vec2;
}

export type StaticCollider =
  | {
      kind: 'prism';
      id: string;
      polygon: Vec2[];
      minY: number;
      maxY: number;
    }
  | {
      kind: 'box';
      id: string;
      center: [number, number, number];
      halfExtents: [number, number, number];
      rotationY: number;
    };

const RANK: Record<Confidence, number> = {
  placeholder: 0,
  estimated: 1,
  traced: 2,
  measured: 3,
};

/** Lowest (least certain) of several confidence levels. */
export function weakest(...levels: Confidence[]): Confidence {
  return levels.reduce((a, b) => (RANK[b] < RANK[a] ? b : a));
}

/** Stack floors from ground level: levels >= 0 go up, basements go down. */
export function floorStack(
  building: Building,
  defaults: Campus['meta']['defaults'],
): FloorSlab[] {
  const sorted = [...building.floors].sort((a, b) => a.level - b.level);
  const heightOf = (floor: Building['floors'][number]) =>
    floor.height ??
    (floor.level < 0 ? defaults.basementHeight : defaults.floorHeight);
  const slabs: FloorSlab[] = [];
  let top = 0;
  for (const floor of sorted.filter((f) => f.level >= 0)) {
    const base = top;
    top += heightOf(floor);
    slabs.push({ floorId: floor.id, level: floor.level, base, top });
  }
  let bottom = 0;
  for (const floor of sorted.filter((f) => f.level < 0).reverse()) {
    const ceiling = bottom;
    bottom -= heightOf(floor);
    slabs.unshift({
      floorId: floor.id,
      level: floor.level,
      base: bottom,
      top: ceiling,
    });
  }
  return slabs;
}

export function buildingMasses(campus: Campus): BuildingMass[] {
  return campus.buildings.flatMap((building) => {
    if (!building.footprint) return [];
    const floors = floorStack(building, campus.meta.defaults);
    const above = floors.filter((f) => f.level >= 0);
    return [
      {
        id: building.id,
        label: building.label,
        footprint: building.footprint,
        floors,
        aboveGround: above.length,
        basements: floors.length - above.length,
        height: above.at(-1)?.top ?? 0,
        confidence: building.confidence,
        floorsConfidence: building.floorsConfidence ?? 'placeholder',
      },
    ];
  });
}

/** "3 + B1" style floor-count summary used by labels and tests. */
export function floorSummary(mass: BuildingMass): string {
  const basements =
    mass.basements > 0
      ? ` + ${mass.basements} basement${mass.basements > 1 ? 's' : ''}`
      : '';
  return `${mass.aboveGround} above ground${basements}`;
}

const distanceToSegment = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq),
  );
  return {
    distance: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz)),
    along: t * Math.sqrt(lengthSq),
  };
};

/**
 * Split the boundary into wall segments, leaving an opening of `gateWidth`
 * centred on every gate that lies on the boundary (within `tolerance` m).
 */
export function boundaryWallSegments(
  campus: Campus,
  tolerance = 0.5,
): WallSegment[] {
  const polygon = campus.boundary.polygon;
  if (!polygon) return [];
  const gateWidth = campus.meta.defaults.gateWidth ?? 0;
  const segments: WallSegment[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const openings = campus.gates
      .flatMap((gate) => {
        if (!gate.position || gateWidth <= 0) return [];
        const hit = distanceToSegment(gate.position, a, b);
        return hit.distance <= tolerance
          ? [
              [
                Math.max(0, hit.along - gateWidth / 2),
                Math.min(length, hit.along + gateWidth / 2),
              ] as [number, number],
            ]
          : [];
      })
      .sort((x, y) => x[0] - y[0]);
    const at = (d: number): Vec2 => [
      a[0] + ((b[0] - a[0]) * d) / length,
      a[1] + ((b[1] - a[1]) * d) / length,
    ];
    let cursor = 0;
    for (const [start, end] of openings) {
      if (start > cursor + 1e-6)
        segments.push({ from: at(cursor), to: at(start) });
      cursor = Math.max(cursor, end);
    }
    if (length > cursor + 1e-6) segments.push({ from: at(cursor), to: b });
  });
  return segments;
}

const wallBox = (
  id: string,
  from: Vec2,
  to: Vec2,
  height: number,
  thickness: number,
): StaticCollider => {
  const dx = to[0] - from[0],
    dz = to[1] - from[1];
  return {
    kind: 'box',
    id,
    center: [(from[0] + to[0]) / 2, height / 2, (from[1] + to[1]) / 2],
    halfExtents: [Math.hypot(dx, dz) / 2, height / 2, thickness / 2],
    // three.js Y rotation that maps local +X onto the segment direction.
    rotationY: Math.atan2(-dz, dx),
  };
};

/** Unit vector (x, z) a person faces walking into campus through a gate. */
export const inwardOf = (headingDeg: number): Vec2 => {
  const h = (headingDeg * Math.PI) / 180;
  return [Math.sin(h), -Math.cos(h)];
};

/**
 * Simplified static colliders (never from render meshes): one prism per
 * building footprint above ground, one oriented box per wall segment, and a
 * closed barrier across each gate opening (no off-campus areas exist; PRD §2).
 * Consumed by the physics world from M4.
 */
export function staticColliders(campus: Campus): StaticCollider[] {
  const wallHeight = campus.meta.defaults.boundaryWallHeight ?? 0;
  const thickness = campus.meta.defaults.wallThickness;
  const gateWidth = campus.meta.defaults.gateWidth ?? 0;
  const buildings: StaticCollider[] = buildingMasses(campus).map((mass) => ({
    kind: 'prism',
    id: `building:${mass.id}`,
    polygon: mass.footprint,
    minY: 0,
    maxY: mass.height,
  }));
  if (wallHeight <= 0) return buildings;
  const walls = boundaryWallSegments(campus).map((segment, i) =>
    wallBox(`wall:${i}`, segment.from, segment.to, wallHeight, thickness),
  );
  const gates = campus.gates.flatMap((gate) => {
    if (!gate.position || gate.heading === undefined || gateWidth <= 0)
      return [];
    const [ix, iz] = inwardOf(gate.heading);
    // The wall runs perpendicular to the inward direction.
    const half: Vec2 = [(-iz * gateWidth) / 2, (ix * gateWidth) / 2];
    return [
      wallBox(
        `gate:${gate.id}`,
        [gate.position[0] - half[0], gate.position[1] - half[1]],
        [gate.position[0] + half[0], gate.position[1] + half[1]],
        wallHeight,
        thickness,
      ),
    ];
  });
  return [...buildings, ...walls, ...gates];
}

/** Even-odd point-in-polygon test on [x, z] coordinates. */
export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!,
      [xj, zj] = polygon[j]!;
    if (
      zi > point[1] !== zj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - zi)) / (zj - zi) + xi
    )
      inside = !inside;
  }
  return inside;
}

/**
 * Default spawn for M4: just inside the origin gate (Gate-5), facing inward.
 * M6 replaces this with the department spawn anchor.
 */
export function gateSpawn(campus: Campus, distance = 4) {
  const gate = campus.gates.find((g) => g.id === campus.meta.origin);
  if (!gate?.position || gate.heading === undefined)
    throw new Error('Origin gate needs a position and heading to spawn');
  const [ix, iz] = inwardOf(gate.heading);
  return {
    position: [
      gate.position[0] + ix * distance,
      gate.position[1] + iz * distance,
    ] as Vec2,
    // Camera yaw (three.js, rotation about +Y; 0 looks toward -Z / north).
    yaw: (-gate.heading * Math.PI) / 180,
  };
}

/** Initial orbit camera that frames the whole campus from the south. */
export function campusCamera(campus: Campus) {
  const { center, size } = campusBounds(campus);
  return {
    position: [
      center[0] + size * 0.15,
      size * 0.75,
      center[1] + size * 0.85,
    ] as [number, number, number],
    fov: 50,
    near: 1,
    far: size * 8,
  };
}

/** Axis-aligned bounds of the boundary for camera framing. */
export function campusBounds(campus: Campus) {
  const points = campus.boundary.polygon ?? [];
  if (!points.length) return { center: [0, 0] as Vec2, size: 100 };
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  return {
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as Vec2,
    size: Math.max(maxX - minX, maxZ - minZ),
  };
}

/** Outward unit normal (x, z) of polygon edge i -> i+1. */
export function edgeOutward(polygon: Vec2[], i: number): Vec2 {
  const a = polygon[i]!,
    b = polygon[(i + 1) % polygon.length]!;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let n: Vec2 = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
  const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (pointInPolygon([mid[0] + n[0] * 0.01, mid[1] + n[1] * 0.01], polygon))
    n = [-n[0], -n[1]];
  return n;
}

const nearAnyFootprint = (campus: Campus, p: Vec2, margin: number) =>
  campus.buildings.some((b) => {
    const f = b.footprint;
    if (!f) return false;
    if (pointInPolygon(p, f)) return true;
    return f.some((a, i) => {
      const q = f[(i + 1) % f.length]!;
      const dx = q[0] - a[0],
        dz = q[1] - a[1];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz),
        ),
      );
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) < margin;
    });
  });

/**
 * Procedural lamp-post layout (PLACEHOLDER: real lamp positions are unknown,
 * OPEN_QUESTIONS #40). Derived only from campus data: outside each entrance, inside
 * each gate, then along the edges of path areas every `spacing` m.
 */
export function lampPositions(campus: Campus, spacing = 22): Vec2[] {
  const candidates: Vec2[] = [];
  for (const building of campus.buildings) {
    const fp = building.footprint;
    if (!fp) continue;
    for (const entry of building.entries) {
      if (!entry.position) continue;
      let best = 0,
        bestDistance = Infinity;
      fp.forEach((a, i) => {
        const b = fp[(i + 1) % fp.length]!;
        const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const d = Math.hypot(
          mid[0] - entry.position![0],
          mid[1] - entry.position![1],
        );
        if (d < bestDistance) [best, bestDistance] = [i, d];
      });
      const n = edgeOutward(fp, best);
      candidates.push([
        entry.position[0] + n[0] * 3,
        entry.position[1] + n[1] * 3,
      ]);
    }
  }
  for (const gate of campus.gates) {
    if (!gate.position || gate.heading === undefined) continue;
    const [ix, iz] = inwardOf(gate.heading);
    for (const side of [-1, 1])
      candidates.push([
        gate.position[0] + ix * 3 - iz * side * 5,
        gate.position[1] + iz * 3 + ix * side * 5,
      ]);
  }
  for (const area of campus.areas) {
    if (area.kind !== 'path' || !area.polygon) continue;
    const poly = area.polygon;
    let carry = spacing / 2;
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = edgeOutward(poly, i);
      for (let d = carry; d < length; d += spacing)
        candidates.push([
          a[0] + ((b[0] - a[0]) * d) / length + n[0] * 0.6,
          a[1] + ((b[1] - a[1]) * d) / length + n[1] * 0.6,
        ]);
      carry = (((carry - length) % spacing) + spacing) % spacing;
    });
  }
  const boundary = campus.boundary.polygon;
  const lamps: Vec2[] = [];
  for (const p of candidates) {
    if (boundary && !pointInPolygon(p, boundary)) continue;
    if (nearAnyFootprint(campus, p, 1)) continue;
    if (lamps.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 6)) continue;
    lamps.push(p);
  }
  return lamps;
}

export interface WindowBand {
  from: Vec2;
  to: Vec2;
  outward: Vec2;
  base: number;
  top: number;
}

/**
 * Procedural window bands (one per facade edge per above-ground floor) for
 * the greybox; real window rhythm comes with the M13 realism pass.
 */
export function windowBands(
  masses: BuildingMass[],
  minEdge = 2.5,
): WindowBand[] {
  const bands: WindowBand[] = [];
  for (const mass of masses) {
    const fp = mass.footprint;
    fp.forEach((a, i) => {
      const b = fp[(i + 1) % fp.length]!;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < minEdge) return;
      const outward = edgeOutward(fp, i);
      // No windows on a wall shared with another block (e.g. the C/D split).
      const probe: Vec2 = [
        (a[0] + b[0]) / 2 + outward[0] * 0.5,
        (a[1] + b[1]) / 2 + outward[1] * 0.5,
      ];
      if (masses.some((m) => m !== mass && pointInPolygon(probe, m.footprint)))
        return;
      for (const floor of mass.floors.filter((f) => f.level >= 0)) {
        const height = floor.top - floor.base;
        bands.push({
          from: a,
          to: b,
          outward,
          base: floor.base + height * 0.3,
          top: floor.base + height * 0.72,
        });
      }
    });
  }
  return bands;
}

/**
 * Spawn for a department (GAMEPLAY_SPEC §1): its `spawnAnchor` from campus
 * data, outdoors at ground level, facing the anchor's heading.
 */
export function departmentSpawn(campus: Campus, departmentId: string) {
  const department = campus.departments.find((d) => d.id === departmentId);
  if (!department) throw new Error(`Unknown department ${departmentId}`);
  const anchor = campus.anchors.find((a) => a.id === department.spawnAnchor);
  if (!anchor?.position)
    throw new Error(`Spawn anchor ${department.spawnAnchor} has no position`);
  return {
    position: [anchor.position[0], anchor.position[2]] as Vec2,
    yaw: (-(anchor.heading ?? 0) * Math.PI) / 180,
    anchorId: anchor.id,
  };
}
