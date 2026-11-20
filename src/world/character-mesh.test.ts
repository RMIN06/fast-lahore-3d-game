import { expect, test } from 'vitest';
import { Box3, Vector3 } from 'three';
import {
  CharacterRig,
  characterGeometry,
  triangleCount,
} from './character-mesh';
import { DEFAULT_AVATAR, HAIR_STYLES } from '../systems/save';
import { CharacterAnimator, proportions } from '../systems/character';

test.each(['male', 'female'] as const)(
  '%s: three LODs with decreasing detail',
  (body) => {
    const counts = ([0, 1, 2] as const).map((l) =>
      triangleCount(characterGeometry(body, DEFAULT_AVATAR, l)),
    );
    expect(counts[0]).toBeGreaterThan(counts[1]!);
    expect(counts[1]).toBeGreaterThan(counts[2]!);
    expect(counts[0]).toBeLessThan(25_000); // ASSET_PIPELINE: 15–25k for full models
    const rig = new CharacterRig(body, DEFAULT_AVATAR);
    expect(rig.lod.levels.map((l) => l.distance)).toEqual([0, 12, 35]);
    // One skinned mesh (one draw call) per level, all sharing one skeleton.
    expect(new Set(rig.levels.map((m) => m.skeleton))).toHaveProperty(
      'size',
      1,
    );
    rig.dispose();
  },
);

test.each(['male', 'female'] as const)(
  '%s: rest height matches the avatar and posing moves the skinned mesh',
  (body) => {
    const geometry = characterGeometry(body, DEFAULT_AVATAR, 0);
    geometry.computeBoundingBox();
    const height = geometry.boundingBox!.max.y;
    expect(Math.abs(height - proportions(body).height)).toBeLessThan(0.05);
    expect(geometry.boundingBox!.min.y).toBeCloseTo(0, 2);
    const rig = new CharacterRig(body, DEFAULT_AVATAR);
    const animator = new CharacterAnimator(proportions(body));
    rig.applyPose(
      animator.update({ distance: 0, dt: 0.1, grounded: true, action: 'sit' }),
    );
    for (let i = 0; i < 30; i += 1)
      rig.applyPose(
        animator.update({
          distance: 0,
          dt: 0.05,
          grounded: true,
          action: 'sit',
        }),
      );
    rig.group.updateMatrixWorld(true);
    const box = new Box3().setFromObject(rig.levels[0]!, true);
    // Sitting lowers the head well below standing height.
    expect(box.max.y).toBeLessThan(proportions(body).height - 0.3);
    expect(box.getSize(new Vector3()).y).toBeGreaterThan(0.8);
    rig.dispose();
  },
);

test('hair options change the geometry; outfit and skin change vertex colours', () => {
  const base = characterGeometry('female', DEFAULT_AVATAR, 0);
  for (const hair of HAIR_STYLES.filter((h) => h !== DEFAULT_AVATAR.hair)) {
    const g = characterGeometry('female', { ...DEFAULT_AVATAR, hair }, 0);
    expect(triangleCount(g)).not.toBe(triangleCount(base));
  }
  const recoloured = characterGeometry(
    'female',
    { ...DEFAULT_AVATAR, outfitColor: '#a5473a', skinTone: '#7a4e33' },
    0,
  );
  const a = base.getAttribute('color').array,
    b = recoloured.getAttribute('color').array;
  expect([...a].some((v, i) => Math.abs(v - b[i]!) > 0.05)).toBe(true);
});
