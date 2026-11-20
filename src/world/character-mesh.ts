import {
  Bone,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LOD,
  MeshStandardMaterial,
  Color,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Uint16BufferAttribute,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { proportions, standingHipHeight } from '../systems/character';
import type { Body, BoneName, Pose, Proportions } from '../systems/character';
import type { Avatar } from '../systems/save';

// M8 procedural character (own work): a skeleton with rigidly skinned
// primitive parts, merged into ONE skinned mesh per level of detail.

/** What a character looks like: a player avatar, or an NPC in a uniform colour. */
export type Look = Omit<Avatar, 'outfitColor' | 'body'> & {
  outfitColor: string;
};

/** Pre-built LOD geometries and a material shared by many rigs (NPCs). */
export interface SharedCharacter {
  geometries: readonly [BufferGeometry, BufferGeometry, BufferGeometry];
  material: MeshStandardMaterial;
}

type Category = 'skin' | 'top' | 'bottom' | 'shoes' | 'hair' | 'eyes';
const FIXED: Record<Exclude<Category, 'skin' | 'top'>, string> = {
  bottom: '#2f3540',
  shoes: '#1d1f22',
  hair: '#2b211c',
  eyes: '#141414',
};
const SCARF = '#e6dfd2';

/** Segment detail per level of detail (0 = closest). */
const DETAIL = [
  { radial: 12, cap: 4, sphere: [16, 12], eyes: true },
  { radial: 7, cap: 2, sphere: [9, 7], eyes: false },
  { radial: 4, cap: 1, sphere: [6, 4], eyes: false },
] as const;
/** Distances (m) where LOD1 and LOD2 take over. */
export const LOD_DISTANCES = [0, 12, 35] as const;

const BONES: {
  name: BoneName;
  parent?: BoneName;
  offset: (p: Proportions) => [number, number, number];
}[] = [
  { name: 'hips', offset: (p) => [0, standingHipHeight(p), 0] },
  { name: 'spine', parent: 'hips', offset: (p) => [0, p.pelvis, 0] },
  { name: 'chest', parent: 'spine', offset: (p) => [0, p.spine, 0] },
  { name: 'neck', parent: 'chest', offset: (p) => [0, p.chest, 0] },
  { name: 'head', parent: 'neck', offset: (p) => [0, p.neck, 0] },
  {
    name: 'upperArm_L',
    parent: 'chest',
    offset: (p) => [-p.shoulderHalfWidth, p.chest - 0.04, 0],
  },
  {
    name: 'foreArm_L',
    parent: 'upperArm_L',
    offset: (p) => [0, -p.upperArm, 0],
  },
  { name: 'hand_L', parent: 'foreArm_L', offset: (p) => [0, -p.foreArm, 0] },
  {
    name: 'upperArm_R',
    parent: 'chest',
    offset: (p) => [p.shoulderHalfWidth, p.chest - 0.04, 0],
  },
  {
    name: 'foreArm_R',
    parent: 'upperArm_R',
    offset: (p) => [0, -p.upperArm, 0],
  },
  { name: 'hand_R', parent: 'foreArm_R', offset: (p) => [0, -p.foreArm, 0] },
  { name: 'thigh_L', parent: 'hips', offset: (p) => [-p.hipHalfWidth, 0, 0] },
  { name: 'shin_L', parent: 'thigh_L', offset: (p) => [0, -p.thigh, 0] },
  { name: 'foot_L', parent: 'shin_L', offset: (p) => [0, -p.shin, 0] },
  { name: 'thigh_R', parent: 'hips', offset: (p) => [p.hipHalfWidth, 0, 0] },
  { name: 'shin_R', parent: 'thigh_R', offset: (p) => [0, -p.thigh, 0] },
  { name: 'foot_R', parent: 'shin_R', offset: (p) => [0, -p.shin, 0] },
];

/** Rest-pose world position of each joint (no rotations at rest). */
function restPositions(p: Proportions) {
  const world = new Map<BoneName, [number, number, number]>();
  for (const b of BONES) {
    const o = b.offset(p);
    const [px, py, pz] = b.parent ? world.get(b.parent)! : [0, 0, 0];
    world.set(b.name, [px + o[0], py + o[1], pz + o[2]]);
  }
  return world;
}

interface Part {
  bone: BoneName;
  geometry: BufferGeometry;
  category: Category;
}

/** Character geometry for one level of detail, with skin attributes. */
export function characterGeometry(
  body: Body,
  avatar: Look,
  level: 0 | 1 | 2,
): BufferGeometry {
  const p = proportions(body);
  const rest = restPositions(p);
  const d = DETAIL[level];
  const at = (bone: BoneName) => rest.get(bone)!;
  const capsule = (r: number, length: number) =>
    new CapsuleGeometry(r, Math.max(0.001, length), d.cap, d.radial);
  const sphere = (r: number) => new SphereGeometry(r, d.sphere[0], d.sphere[1]);
  const parts: Part[] = [];
  const add = (
    bone: BoneName,
    geometry: BufferGeometry,
    category: Category,
    x: number,
    y: number,
    z: number,
  ) => {
    geometry.translate(x, y, z);
    parts.push({ bone, geometry, category });
  };
  const female = body === 'female';
  const hip = at('hips'),
    spine = at('spine'),
    chest = at('chest'),
    neck = at('neck'),
    head = at('head');
  // Torso.
  add(
    'hips',
    capsule(p.hipHalfWidth + 0.05, 0.02),
    'bottom',
    0,
    hip[1] + p.pelvis * 0.4,
    0,
  );
  add(
    'spine',
    capsule(p.shoulderHalfWidth * 0.62, p.spine * 0.6),
    'top',
    0,
    spine[1] + p.spine / 2,
    0,
  );
  const chestR = p.shoulderHalfWidth * (female ? 0.66 : 0.7);
  add(
    'chest',
    capsule(chestR, p.chest * 0.55),
    'top',
    0,
    chest[1] + p.chest * 0.5,
    0,
  );
  add(
    'neck',
    new CylinderGeometry(0.045, 0.05, p.neck * 1.2, d.radial),
    'skin',
    0,
    neck[1] + p.neck / 2,
    0,
  );
  const headY = head[1] + p.headRadius;
  add('head', sphere(p.headRadius), 'skin', 0, headY, 0);
  if (d.eyes)
    for (const side of [-1, 1])
      add(
        'head',
        new SphereGeometry(0.012, 6, 4),
        'eyes',
        side * p.headRadius * 0.38,
        headY + 0.02,
        -p.headRadius * 0.9,
      );
  // Hair or head covering (avatar option).
  const capR = p.headRadius * 1.07;
  const cap = () =>
    new SphereGeometry(
      capR,
      d.sphere[0],
      d.sphere[1],
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.55,
    );
  if (avatar.hair === 'covered') {
    const shell = new SphereGeometry(
      capR * 1.04,
      d.sphere[0],
      d.sphere[1],
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.8,
    );
    add('head', shell, 'hair', 0, headY + 0.005, 0.01);
    add(
      'neck',
      new CylinderGeometry(capR * 0.95, chestR * 0.9, p.neck * 1.6, d.radial),
      'hair',
      0,
      neck[1] + p.neck * 0.4,
      0,
    );
  } else {
    add('head', cap(), 'hair', 0, headY + 0.01, 0.006);
    if (avatar.hair === 'long')
      add(
        'head',
        new BoxGeometry(capR * 1.7, p.headRadius * 2.2, 0.05),
        'hair',
        0,
        headY - p.headRadius * 0.8,
        capR * 0.75,
      );
    if (avatar.hair === 'tied')
      add(
        'head',
        sphere(p.headRadius * 0.38),
        'hair',
        0,
        headY + 0.03,
        capR * 1.02,
      );
  }
  // Arms.
  for (const side of ['L', 'R'] as const) {
    const ua = at(`upperArm_${side}`),
      fa = at(`foreArm_${side}`),
      hd = at(`hand_${side}`);
    add(
      `upperArm_${side}`,
      capsule(0.048, p.upperArm * 0.7),
      'top',
      ua[0],
      ua[1] - p.upperArm / 2,
      0,
    );
    add(
      `foreArm_${side}`,
      capsule(0.038, p.foreArm * 0.75),
      'skin',
      fa[0],
      fa[1] - p.foreArm / 2,
      0,
    );
    add(`hand_${side}`, sphere(0.045), 'skin', hd[0], hd[1] - p.hand / 2, 0);
    const th = at(`thigh_${side}`),
      sh = at(`shin_${side}`),
      ft = at(`foot_${side}`);
    add(
      `thigh_${side}`,
      capsule(female ? 0.072 : 0.07, p.thigh * 0.7),
      'bottom',
      th[0],
      th[1] - p.thigh / 2,
      0,
    );
    add(
      `shin_${side}`,
      capsule(0.055, p.shin * 0.75),
      'bottom',
      sh[0],
      sh[1] - p.shin / 2,
      0,
    );
    // Shoe: toes point forward (-Z), sole on the ground at rest.
    add(
      `foot_${side}`,
      new BoxGeometry(0.1, p.ankle, 0.26),
      'shoes',
      ft[0],
      ft[1] - p.ankle / 2,
      -0.06,
    );
  }

  const colors: Record<Category, Color> = {
    skin: new Color(avatar.skinTone),
    top: new Color(avatar.outfitColor),
    bottom: new Color(FIXED.bottom),
    shoes: new Color(FIXED.shoes),
    hair: new Color(avatar.hair === 'covered' ? SCARF : FIXED.hair),
    eyes: new Color(FIXED.eyes),
  };
  const boneIndex = new Map(BONES.map((b, i) => [b.name, i]));
  const prepared = parts.map(({ bone, geometry, category }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    const c = colors[category];
    g.setAttribute(
      'color',
      new Float32BufferAttribute(
        new Array(n).fill(0).flatMap(() => [c.r, c.g, c.b]),
        3,
      ),
    );
    const idx = boneIndex.get(bone)!;
    g.setAttribute(
      'skinIndex',
      new Uint16BufferAttribute(
        new Array(n).fill(0).flatMap(() => [idx, 0, 0, 0]),
        4,
      ),
    );
    g.setAttribute(
      'skinWeight',
      new Float32BufferAttribute(
        new Array(n).fill(0).flatMap(() => [1, 0, 0, 0]),
        4,
      ),
    );
    return g;
  });
  const merged = mergeGeometries(prepared);
  prepared.forEach((g) => g.dispose());
  if (!merged) throw new Error('Character geometry merge failed');
  merged.computeBoundingSphere();
  return merged;
}

export const triangleCount = (g: BufferGeometry) =>
  g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;

/** The vertex-coloured character material. */
export const characterMaterial = () =>
  new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });

/** A posable character: bones + three skinned LOD meshes sharing a skeleton. */
export class CharacterRig {
  readonly group = new Group();
  readonly bones = new Map<BoneName, Bone>();
  readonly lod = new LOD();
  readonly levels: SkinnedMesh[] = [];
  private readonly material: MeshStandardMaterial;
  private readonly owned: boolean;

  /** With `shared`, geometry and material are borrowed (not disposed here). */
  constructor(
    readonly body: Body,
    avatar: Look,
    shared?: SharedCharacter,
  ) {
    this.owned = !shared;
    this.material = shared?.material ?? characterMaterial();
    const p = proportions(body);
    for (const b of BONES) {
      const bone = new Bone();
      bone.name = b.name;
      bone.position.set(...b.offset(p));
      this.bones.set(b.name, bone);
      (b.parent ? this.bones.get(b.parent)! : this.group).add(bone);
    }
    this.group.updateMatrixWorld(true);
    const skeleton = new Skeleton(BONES.map((b) => this.bones.get(b.name)!));
    ([0, 1, 2] as const).forEach((level) => {
      const mesh = new SkinnedMesh(
        shared?.geometries[level] ?? characterGeometry(body, avatar, level),
        this.material,
      );
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.bind(skeleton);
      this.levels.push(mesh);
      this.lod.addLevel(mesh, LOD_DISTANCES[level]);
    });
    this.group.add(this.lod);
  }

  /** Apply a pose from the animator (hip height and joint rotations). */
  applyPose(pose: Pose): void {
    const hips = this.bones.get('hips')!;
    hips.position.y = pose.hipHeight;
    hips.position.z = -pose.hipForward;
    for (const [name, bone] of this.bones) {
      const r = pose.rotations[name];
      if (r) bone.rotation.set(r[0], r[1], r[2]);
      else bone.rotation.set(0, 0, 0);
    }
  }

  dispose(): void {
    if (!this.owned) return;
    this.levels.forEach((m) => m.geometry.dispose());
    this.material.dispose();
  }
}
