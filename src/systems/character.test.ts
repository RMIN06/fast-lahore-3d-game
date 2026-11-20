import { describe, expect, test } from 'vitest';
import {
  ANIMATIONS,
  CharacterAnimator,
  ankleFK,
  footTarget,
  gaits,
  legIK,
  proportions,
  standingHipHeight,
  statePose,
} from './character';
import type { Body, Pose } from './character';
import { playerConfigFor } from './player-controller';

const BODIES: Body[] = ['male', 'female'];

describe.each(BODIES)('%s character', (body) => {
  const p = proportions(body);

  test('proportions match the avatar capsule and eye height', () => {
    expect(p.height).toBeCloseTo(playerConfigFor(body).height, 5);
    const eye = p.height - p.headRadius + 0.02;
    expect(Math.abs(eye - playerConfigFor(body).eyeHeight)).toBeLessThan(0.03);
    expect(standingHipHeight(p)).toBeGreaterThan(p.height * 0.45);
  });

  test('leg IK reaches its target (forward kinematics round trip)', () => {
    for (const [f, d] of [
      [0, 0.75],
      [0.3, 0.7],
      [-0.35, 0.68],
      [0.1, 0.5],
    ] as const) {
      const ik = legIK(p, f, d);
      const [af, ay] = ankleFK(p, 0, 0, ik.thigh, ik.knee);
      expect(af).toBeCloseTo(f, 4);
      expect(ay).toBeCloseTo(-d, 4);
      // Knee bends backward only; foot stays level.
      expect(ik.knee).toBeLessThanOrEqual(1e-9);
      expect(ik.thigh + ik.knee + ik.foot).toBeCloseTo(0, 9);
    }
  });

  test('every required animation (idle/walk/run/jump/sit/kick/swing) poses the body', () => {
    const idle = statePose(p, 'idle', 0);
    const delta = (a: Pose, b: Pose) =>
      Object.keys({ ...a.rotations, ...b.rotations }).reduce((sum, k) => {
        const x = a.rotations[k as keyof Pose['rotations']] ?? [0, 0, 0];
        const y = b.rotations[k as keyof Pose['rotations']] ?? [0, 0, 0];
        return (
          sum +
          Math.abs(x[0] - y[0]) +
          Math.abs(x[1] - y[1]) +
          Math.abs(x[2] - y[2])
        );
      }, 0) + Math.abs(a.hipHeight - b.hipHeight);
    expect(ANIMATIONS).toEqual([
      'idle',
      'walk',
      'run',
      'jump',
      'sit',
      'kick',
      'swing',
    ]);
    for (const state of ANIMATIONS.filter((s) => s !== 'idle')) {
      const pose = statePose(p, state, 0.35);
      expect(delta(pose, idle), state).toBeGreaterThan(0.5);
      // Animated: the pose changes over time.
      expect(
        delta(statePose(p, state, 0.15), statePose(p, state, 0.45)),
        state,
      ).toBeGreaterThan(0.05);
    }
    // Sitting lowers the hips to seat height.
    expect(statePose(p, 'sit', 1).hipHeight).toBeCloseTo(0.46, 2);
  });

  test.each(['walk', 'run'] as const)(
    'no foot sliding while %s (planted foot ≤ 1 cm drift)',
    (gaitName) => {
      const g = gaits(p)[gaitName];
      const animator = new CharacterAnimator(p);
      const speed = gaitName === 'walk' ? 1.6 : 4.8;
      const dt = 1 / 120;
      let x = 0; // body travel (forward)
      // Warm up into the state, then measure one second.
      for (let i = 0; i < 120; i += 1) {
        x += speed * dt;
        animator.update({ distance: speed * dt, dt, grounded: true });
      }
      expect(animator.state).toBe(gaitName);
      let worst = 0;
      let anchor: { L?: number; R?: number } = {};
      for (let i = 0; i < 240; i += 1) {
        x += speed * dt;
        const pose = animator.update({
          distance: speed * dt,
          dt,
          grounded: true,
        });
        for (const side of ['L', 'R'] as const) {
          const thigh = pose.rotations[`thigh_${side}`]![0];
          const knee = pose.rotations[`shin_${side}`]![0];
          const [f, y] = ankleFK(p, pose.hipHeight, 0, thigh, knee);
          const worldF = x + f;
          // On the ground: within 3 mm of the standing ankle height.
          const planted = Math.abs(y - p.ankle) < 0.003;
          if (planted) {
            anchor[side] ??= worldF;
            worst = Math.max(worst, Math.abs(worldF - anchor[side]!));
          } else anchor = { ...anchor, [side]: undefined };
        }
      }
      expect(worst).toBeLessThan(0.01);
      // A planted foot stays on the ground (no sinking or floating).
      const pose = animator.update({
        distance: speed * dt,
        dt,
        grounded: true,
      });
      const lowest = Math.min(
        ...(['L', 'R'] as const).map(
          (side) =>
            ankleFK(
              p,
              pose.hipHeight,
              0,
              pose.rotations[`thigh_${side}`]![0],
              pose.rotations[`shin_${side}`]![0],
            )[1],
        ),
      );
      expect(lowest).toBeGreaterThan(p.ankle - 0.012);
      expect(footTarget(g, 0).lift).toBe(0);
    },
  );
});

test('state machine: speed, airborne time and actions choose the animation', () => {
  const a = new CharacterAnimator(proportions('male'));
  const step = (
    speed: number,
    grounded = true,
    action?: 'sit' | 'kick' | 'swing',
    n = 30,
  ) => {
    for (let i = 0; i < n; i += 1)
      a.update({
        distance: speed / 60,
        dt: 1 / 60,
        grounded,
        ...(action ? { action } : {}),
      });
    return a.state;
  };
  expect(step(0)).toBe('idle');
  expect(step(1.6)).toBe('walk');
  expect(step(4.8)).toBe('run');
  expect(step(1.6, false, undefined, 3)).toBe('run'); // short drop: not a jump
  expect(step(1.6, false)).toBe('jump');
  expect(step(0, true, 'sit')).toBe('sit');
  expect(step(0)).toBe('idle');
  // Kick and swing play to the end even if the request stops.
  expect(step(0, true, 'kick', 1)).toBe('kick');
  expect(step(0, true, undefined, 20)).toBe('kick');
  expect(step(0, true, undefined, 40)).toBe('idle');
  expect(step(0, true, 'swing', 1)).toBe('swing');
  expect(step(0, true, undefined, 60)).toBe('idle');
});
