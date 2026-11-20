import type { BufferGeometry } from 'three';
import { characterGeometry, characterMaterial } from './character-mesh';
import type { Look, SharedCharacter } from './character-mesh';
import type { Body } from '../systems/character';
import { hash, rng } from '../systems/npc';
import type { Archetype, NpcDay } from '../systems/npc';
import { OUTFIT_COLORS, SKIN_TONES } from '../systems/save';

// M9 NPC looks: students wear the avatar outfit colours; staff wear a colour
// per role so they read at a glance (own work, no real uniforms implied).

const UNIFORMS: Partial<Record<Archetype, readonly string[]>> = {
  guard: ['#27324a'],
  cafe_staff: ['#f2efe8'],
  medical: ['#e4eef2'],
  librarian: ['#5b4a3a', '#46505c'],
  faculty: ['#4a4f57', '#6d5c46', '#3d4a5a', '#5a4650'],
  shopkeeper: ['#8a6d4b', '#5f6b4a'],
};

/** Deterministic body, skin, hair and outfit for an NPC. */
export function npcLook(npc: NpcDay): { body: Body; look: Look; key: string } {
  const r = rng(hash(`look:${npc.id}`));
  const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length)]!;
  const skinTone = pick(SKIN_TONES);
  const hair =
    npc.body === 'male'
      ? 'short'
      : pick(['long', 'tied', 'covered', 'covered'] as const);
  const outfitColor = pick(UNIFORMS[npc.archetype] ?? OUTFIT_COLORS);
  return {
    body: npc.body,
    look: { skinTone, hair, outfitColor },
    key: `${npc.body}|${skinTone}|${hair}|${outfitColor}`,
  };
}

/** One set of LOD geometries per look, shared by every NPC wearing it. */
export class NpcGeometryCache {
  private readonly entries = new Map<string, SharedCharacter>();
  private readonly material = characterMaterial();

  get(body: Body, look: Look, key: string): SharedCharacter {
    let entry = this.entries.get(key);
    if (!entry) {
      const geometries = ([0, 1, 2] as const).map((level) =>
        characterGeometry(body, look, level),
      ) as [BufferGeometry, BufferGeometry, BufferGeometry];
      entry = { geometries, material: this.material };
      this.entries.set(key, entry);
    }
    return entry;
  }

  get size() {
    return this.entries.size;
  }

  dispose() {
    this.entries.forEach((e) => e.geometries.forEach((g) => g.dispose()));
    this.entries.clear();
    this.material.dispose();
  }
}
