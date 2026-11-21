import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { CharacterRig } from '../world/character-mesh';
import {
  doorLeaf,
  fixtureGeometry,
  markerGeometry,
} from '../world/fixture-meshes';
import { NpcGeometryCache, npcLook } from '../world/npc-meshes';
import { CharacterAnimator, proportions } from '../systems/character';
import type { Fixture, FixtureKind } from '../systems/fixtures';
import { DOOR_LEAF_HEIGHT, DOOR_WIDTH } from '../systems/interior';
import type { Archetype } from '../systems/npc';
import { useDebugStore } from '../state/debug-store';
import { usePlayerStore } from '../state/player-store';
import { useWorldStore } from '../state/world-store';
import { actorPoses, taskData, useTaskStore } from '../state/task-store';

// M10 world furniture, doors, task actors and target markers. Thin: shapes
// come from src/world/fixture-meshes.ts, state from the task store.
// Furniture streams with the interiors: one instanced mesh per building and
// kind, shown only while that building's interior is active (outdoor
// fixtures always). Drawing every block's furniture at once cost ~280k
// triangles from anywhere on campus.

const KINDS: Exclude<FixtureKind, 'door'>[] = [
  'seat',
  'pc',
  'lectern',
  'shelf',
  'counter',
  'desk',
  'bench',
  'prayer',
  'bay',
  'rack',
];
const PLACEHOLDER = '#ee6f6f';
const MAX_MARKERS = 8;

const OUTDOOR = 'outdoor';
const groupOf = (f: Fixture) => f.buildingId ?? OUTDOOR;

interface DoorGroup {
  list: Fixture[];
  mesh: InstancedMesh;
  shown: Float32Array;
}

export function Fixtures() {
  const confidenceColors = useDebugStore((s) => s.confidenceColors);
  const activeInteriors = useWorldStore((s) => s.activeInteriors);
  const root = useMemo(() => new Group(), []);
  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    [],
  );

  // Geometry once per kind; instanced meshes per (building or outdoor, kind).
  const geometries = useMemo(
    () => new Map(KINDS.map((k) => [k, fixtureGeometry(k)])),
    [],
  );
  const leaf = useMemo(() => doorLeaf(DOOR_WIDTH, DOOR_LEAF_HEIGHT), []);
  const groups = useMemo(() => {
    const { fixtures } = taskData();
    const dummy = new Object3D();
    const out = new Map<string, { root: Group; doors?: DoorGroup }>();
    const keys = [...new Set(fixtures.map(groupOf))];
    for (const key of keys) {
      const root = new Group();
      root.name = `fixtures:${key}`;
      const mine = fixtures.filter((f) => groupOf(f) === key);
      for (const kind of KINDS) {
        const list = mine.filter((f) => f.kind === kind);
        if (!list.length) continue;
        const mesh = new InstancedMesh(
          geometries.get(kind)!,
          material,
          list.length,
        );
        mesh.name = `fixtures:${key}:${kind}`;
        list.forEach((f, i) => {
          dummy.position.set(...f.position);
          dummy.rotation.set(0, f.yaw, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.receiveShadow = true;
        root.add(mesh);
      }
      // Doors: hinge-animated leaves, updated only while they move.
      const doorList = mine.filter((f) => f.kind === 'door');
      let doors: DoorGroup | undefined;
      if (doorList.length) {
        const mesh = new InstancedMesh(leaf, material, doorList.length);
        mesh.name = `doors:${key}`;
        root.add(mesh);
        doors = {
          list: doorList,
          mesh,
          shown: new Float32Array(doorList.length).fill(-1),
        };
      }
      out.set(key, { root, ...(doors ? { doors } : {}) });
    }
    return out;
  }, [geometries, leaf, material]);

  // Show a building's furniture only while its interior is streamed in.
  useEffect(() => {
    for (const [key, g] of groups)
      g.root.visible = key === OUTDOOR || activeInteriors.includes(key);
  }, [groups, activeInteriors]);

  // Markers over the current task's targets (one draw call).
  const markers = useMemo(() => {
    const mesh = new InstancedMesh(
      markerGeometry(),
      new MeshStandardMaterial({
        color: '#f0c040',
        emissive: '#a07000',
        emissiveIntensity: 0.6,
      }),
      MAX_MARKERS,
    );
    mesh.name = 'task-markers';
    mesh.count = 0;
    mesh.frustumCulled = false;
    return mesh;
  }, []);

  useEffect(() => {
    groups.forEach((g) => root.add(g.root));
    root.add(markers);
    return () => {
      groups.forEach((g) => root.remove(g.root));
      root.remove(markers);
      geometries.forEach((g) => g.dispose());
      leaf.dispose();
      markers.geometry.dispose();
      (markers.material as MeshStandardMaterial).dispose();
      material.dispose();
    };
  }, [groups, geometries, leaf, markers, root, material]);

  // Placeholders stay visually obvious in debug mode (AGENTS.md rule 2).
  useEffect(() => {
    material.color.set(confidenceColors ? PLACEHOLDER : '#ffffff');
  }, [confidenceColors, material]);

  const scratch = useMemo(
    () => ({
      a: new Matrix4(),
      b: new Matrix4(),
      c: new Matrix4(),
      dummy: new Object3D(),
    }),
    [],
  );
  const clock = useRef(0);
  const byId = useMemo(
    () => new Map(taskData().fixtures.map((f) => [f.id, f])),
    [],
  );
  const targets = useRef({ list: [] as [number, number, number][], age: 1 });

  useFrame((_, delta) => {
    clock.current += delta;
    const { doors: system, engine } = useTaskStore.getState();
    // Doors (visible buildings only).
    for (const g of groups.values()) {
      const doors = g.doors;
      if (!doors || !g.root.visible) continue;
      let changed = false;
      doors.list.forEach((f, i) => {
        const open = system.doors.get(f.id)?.openness ?? 1;
        if (doors.shown[i] === open) return;
        doors.shown[i] = open;
        const { a, b, c } = scratch;
        // Door frame → hinge at one side → swing into the room (+Z local).
        a.makeRotationY(f.yaw).setPosition(...f.position);
        b.makeTranslation(-DOOR_WIDTH / 2, 0, 0);
        c.makeRotationY((-Math.PI / 2) * open);
        doors.mesh.setMatrixAt(i, a.multiply(b).multiply(c));
        changed = true;
      });
      if (changed) doors.mesh.instanceMatrix.needsUpdate = true;
    }

    // Markers: nearest targets of the current step (4 Hz), bobbing.
    const t = targets.current;
    t.age += delta;
    if (t.age >= 0.25) {
      t.age = 0;
      t.list = [];
      const hint = engine.hint();
      const feet = usePlayerStore.getState().position;
      if (hint) {
        const list = hint.fixtures
          .map((id) => byId.get(id))
          .filter((f): f is Fixture => Boolean(f));
        list.sort((p, q) => dist(p.position, feet) - dist(q.position, feet));
        for (const f of list.slice(0, MAX_MARKERS))
          t.list.push([f.position[0], f.position[1] + 1.6, f.position[2]]);
        if (hint.actor) {
          const pose = actorPoses(engine).find((x) => x.id === hint.actor);
          if (pose)
            t.list.unshift([
              pose.position[0],
              pose.position[1] + 2.2,
              pose.position[2],
            ]);
        }
      }
    }
    const targetList = t.list;
    const bob = Math.sin(clock.current * 3) * 0.08;
    targetList.slice(0, MAX_MARKERS).forEach((m, i) => {
      scratch.dummy.position.set(m[0], m[1] + bob, m[2]);
      scratch.dummy.rotation.set(0, clock.current, 0);
      scratch.dummy.updateMatrix();
      markers.setMatrixAt(i, scratch.dummy.matrix);
    });
    markers.count = Math.min(MAX_MARKERS, targetList.length);
    markers.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={root} />
      <TaskActors />
    </>
  );
}

const dist = (p: readonly number[], q: readonly number[]) =>
  Math.hypot(p[0]! - q[0]!, p[2]! - q[2]!);

const ROLE: Record<string, Archetype> = {
  faculty: 'faculty',
  librarian: 'librarian',
  cafe_staff: 'cafe_staff',
  medical: 'medical',
  shopkeeper: 'shopkeeper',
  student: 'student',
};

/** The lecturer, doctor, friend… of the active task, standing or sitting. */
function TaskActors() {
  const rev = useTaskStore((s) => s.rev);
  const engine = useTaskStore((s) => s.engine);
  const cache = useMemo(() => new NpcGeometryCache(), []);
  const root = useMemo(() => new Group(), []);
  const rigs = useRef(
    new Map<
      string,
      { rig: CharacterRig; animator: CharacterAnimator; sitting: boolean }
    >(),
  );

  useEffect(() => {
    const poses = actorPoses(engine);
    const keep = new Set(poses.map((p) => `${p.id}:${p.body}:${p.name}`));
    for (const [key, r] of rigs.current)
      if (!keep.has(key)) {
        root.remove(r.rig.group);
        rigs.current.delete(key);
      }
    for (const p of poses) {
      const key = `${p.id}:${p.body}:${p.name}`;
      let r = rigs.current.get(key);
      if (!r) {
        const role =
          engine.active?.task.actors?.find((a) => a.id === p.id)?.role ??
          'student';
        const {
          body,
          look,
          key: lookKey,
        } = npcLook({
          id: `actor:${p.name}`,
          archetype: ROLE[role] ?? 'student',
          body: p.body,
          spawn: p.position,
          spawnAt: 0,
          activities: [],
        });
        const rig = new CharacterRig(
          body,
          look,
          cache.get(body, look, lookKey),
        );
        rig.group.name = `actor:${p.id}`;
        r = {
          rig,
          animator: new CharacterAnimator(proportions(body)),
          sitting: p.sitting,
        };
        rigs.current.set(key, r);
        root.add(rig.group);
      }
      r.sitting = p.sitting;
      r.rig.group.position.set(...p.position);
      r.rig.group.rotation.y = p.yaw;
    }
  }, [rev, engine, cache, root]);

  useEffect(
    () => () => {
      rigs.current.forEach((r) => root.remove(r.rig.group));
      rigs.current.clear();
      cache.dispose();
    },
    [cache, root],
  );

  useFrame((_, delta) => {
    for (const r of rigs.current.values())
      r.rig.applyPose(
        r.animator.update({
          distance: 0,
          dt: Math.min(delta, 0.1),
          grounded: true,
          ...(r.sitting ? { action: 'sit' as const } : {}),
        }),
      );
  });

  return <primitive object={root} />;
}
