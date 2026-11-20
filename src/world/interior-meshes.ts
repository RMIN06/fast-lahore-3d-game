import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Confidence } from '../types/campus';
import { toWorld } from '../systems/interior';
import type { InteriorLayout, RoomLayout } from '../systems/interior';

// three.js builders for generated interiors (M7). Inputs: InteriorLayout only.

const merge = (parts: BufferGeometry[]): BufferGeometry | null => {
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
};
const yawOf = (layout: InteriorLayout) =>
  Math.atan2(-layout.frame.u[1], layout.frame.u[0]);

export function interiorWallGeometry(layout: InteriorLayout) {
  const f = layout.frame;
  return merge(
    layout.walls.map((w) => {
      const a = toWorld(f, w.a[0], w.a[1]),
        b = toWorld(f, w.b[0], w.b[1]);
      const dx = b[0] - a[0],
        dz = b[1] - a[1];
      const box = new BoxGeometry(
        Math.hypot(dx, dz) + w.thickness,
        w.y1 - w.y0,
        w.thickness,
      );
      box.rotateY(Math.atan2(-dz, dx));
      box.translate((a[0] + b[0]) / 2, (w.y0 + w.y1) / 2, (a[1] + b[1]) / 2);
      return box;
    }),
  );
}

export function interiorSlabGeometry(layout: InteriorLayout) {
  const f = layout.frame;
  const yaw = yawOf(layout);
  const slabs = layout.slabs.map((s) => {
    const c = toWorld(
      f,
      (s.rect.u0 + s.rect.u1) / 2,
      (s.rect.v0 + s.rect.v1) / 2,
    );
    const box = new BoxGeometry(
      s.rect.u1 - s.rect.u0,
      s.thickness,
      s.rect.v1 - s.rect.v0,
    );
    box.rotateY(yaw);
    box.translate(c[0], s.top - s.thickness / 2, c[1]);
    return box;
  });
  const ramps = layout.ramps.map((r) => {
    const t = 0.2;
    const run = r.rect.u1 - r.rect.u0,
      rise = r.y1 - r.y0;
    const angle = Math.atan2(rise, run);
    const box = new BoxGeometry(
      Math.hypot(run, rise),
      t,
      r.rect.v1 - r.rect.v0,
    );
    box.rotateZ(angle);
    box.rotateY(yaw);
    const c = toWorld(
      f,
      (r.rect.u0 + r.rect.u1) / 2 + Math.sin(angle) * (t / 2),
      (r.rect.v0 + r.rect.v1) / 2,
    );
    box.translate(c[0], (r.y0 + r.y1) / 2 - Math.cos(angle) * (t / 2), c[1]);
    return box;
  });
  return merge([...slabs, ...ramps]);
}

/** Thin floor overlays per room, grouped by the room's data confidence. */
export function roomFloorGeometry(layout: InteriorLayout) {
  const groups = new Map<Confidence, BufferGeometry[]>();
  for (const floor of layout.floors)
    for (const room of floor.rooms) {
      const positions: number[] = [];
      for (const [x, z] of room.polygon)
        positions.push(x, floor.base + 0.012, z);
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(positions, 3));
      g.setIndex([0, 2, 1, 0, 3, 2, 0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      const list = groups.get(room.confidence) ?? [];
      list.push(g);
      groups.set(room.confidence, list);
    }
  return [...groups].map(([confidence, parts]) => ({
    confidence,
    geometry: merge(parts)!,
  }));
}

const PLATE_W = 256,
  PLATE_H = 96,
  COLUMNS = 4;

/** Door plates: one canvas atlas and one merged mesh per building. */
export function doorPlates(layout: InteriorLayout): {
  geometry: BufferGeometry;
  texture: CanvasTexture;
  rooms: RoomLayout[];
} | null {
  const rooms = layout.floors.flatMap((f) => f.rooms);
  if (!rooms.length || typeof document === 'undefined') return null;
  const rows = Math.ceil(rooms.length / COLUMNS);
  const canvas = document.createElement('canvas');
  canvas.width = PLATE_W * COLUMNS;
  canvas.height = PLATE_H * rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const parts: BufferGeometry[] = [];
  const yawFace = (room: RoomLayout) => {
    // Plate faces into the corridor: local facing → world direction.
    const f = layout.frame;
    const dx = f.u[0] * room.doorFacing.u + f.v[0] * room.doorFacing.v;
    const dz = f.u[1] * room.doorFacing.u + f.v[1] * room.doorFacing.v;
    return Math.atan2(dx, dz);
  };
  rooms.forEach((room, i) => {
    const col = i % COLUMNS,
      row = Math.floor(i / COLUMNS);
    const x = col * PLATE_W,
      y = row * PLATE_H;
    ctx.fillStyle = '#1f3b52';
    ctx.fillRect(x + 2, y + 2, PLATE_W - 4, PLATE_H - 4);
    ctx.fillStyle = '#f4efe2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(room.code ?? room.name, x + PLATE_W / 2, y + 36, PLATE_W - 16);
    ctx.font = '20px sans-serif';
    ctx.fillText(
      room.code ? room.name : room.kind.replace('_', ' '),
      x + PLATE_W / 2,
      y + 72,
      PLATE_W - 16,
    );
    // Plate quad beside the door, on the corridor side, at 1.9 m.
    const plate = new PlaneGeometry(0.75, 0.28);
    const uv = plate.getAttribute('uv');
    for (let k = 0; k < uv.count; k += 1) {
      const u = uv.getX(k),
        v = uv.getY(k);
      uv.setXY(k, (col + u) / COLUMNS, 1 - (row + 1 - v) / rows);
    }
    plate.rotateY(yawFace(room));
    const along = { u: -room.doorFacing.v, v: room.doorFacing.u };
    const lu = room.door.u + room.doorFacing.u * 0.13 + along.u * 1.2;
    const lv = room.door.v + room.doorFacing.v * 0.13 + along.v * 1.2;
    const p = toWorld(layout.frame, lu, lv);
    plate.translate(p[0], room.anchor[1] + 1.9, p[1]);
    parts.push(plate);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { geometry: merge(parts)!, texture, rooms };
}

/** Dark doorway quads on the facades so entrances are visible from outside. */
export function doorwayGeometry(layouts: InteriorLayout[]) {
  return merge(
    layouts.map((l) => {
      const plane = new PlaneGeometry(l.door.width, l.door.height);
      const [cu, cv] = [
        (l.vestibule.u0 + l.vestibule.u1) / 2,
        (l.vestibule.v0 + l.vestibule.v1) / 2,
      ];
      const centre = toWorld(l.frame, cu, cv);
      // Face outward: from the vestibule centre toward the door.
      const dx = l.door.position[0] - centre[0],
        dz = l.door.position[1] - centre[1];
      const len = Math.hypot(dx, dz) || 1;
      plane.rotateY(Math.atan2(dx, dz));
      plane.translate(
        l.door.position[0] + (dx / len) * 0.08,
        l.door.height / 2,
        l.door.position[1] + (dz / len) * 0.08,
      );
      return plane;
    }),
  );
}
