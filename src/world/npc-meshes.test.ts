import { expect, test } from 'vitest';
import campusJson from '../../data/campus.json';
import { loadCampus } from './campus-loader';
import { interiorLayouts } from './interiors';
import { NpcGeometryCache, npcLook } from './npc-meshes';
import { planDay } from '../systems/npc';

const campus = loadCampus(campusJson, { mode: 'site-plan' }).campus;
const plans = planDay({ campus, layouts: interiorLayouts(campus) }, 0);

test('NPC looks are deterministic, varied, and staff wear role colours', () => {
  expect(plans.map(npcLook)).toEqual(plans.map(npcLook));
  const keys = new Set(plans.map((p) => npcLook(p).key));
  expect(keys.size).toBeGreaterThan(15);
  const guards = plans
    .filter((p) => p.archetype === 'guard')
    .map((p) => npcLook(p).look.outfitColor);
  expect(new Set(guards)).toEqual(new Set(['#27324a']));
  for (const p of plans) expect(npcLook(p).body).toBe(p.body);
});

test('NPCs wearing the same look share one set of LOD geometries', () => {
  const cache = new NpcGeometryCache();
  const a = npcLook(plans[0]!);
  const first = cache.get(a.body, a.look, a.key);
  expect(cache.get(a.body, a.look, a.key)).toBe(first);
  expect(first.geometries).toHaveLength(3);
  for (const p of plans.slice(0, 40)) {
    const l = npcLook(p);
    cache.get(l.body, l.look, l.key);
  }
  expect(cache.size).toBe(
    new Set(plans.slice(0, 40).map((p) => npcLook(p).key)).size,
  );
  cache.dispose();
});
