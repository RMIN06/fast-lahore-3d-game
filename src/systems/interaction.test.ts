import { expect, test } from 'vitest';
import { approach, pickFocus } from './interaction';
import type { Interactable } from './interaction';
import { DoorSystem, NPC_HOLD_SECONDS } from './doors';

const thing = (id: string, x: number, z: number, y = 0): Interactable => ({
  id,
  type: 'fixture',
  position: [x, y, z],
  height: 1,
  label: id,
  verb: 'Use',
});

test('focus: nearest thing in the look cone within reach, same floor, not behind walls', () => {
  // Facing north (-Z, yaw 0).
  const all = [
    thing('ahead', 0, -1.5),
    thing('far', 0, -3),
    thing('behind', 0, 1),
    thing('side', 1.5, 0),
    thing('upstairs', 0, -1, 3.5),
  ];
  expect(pickFocus([0, 0, 0], 0, all)?.id).toBe('ahead');
  expect(pickFocus([0, 0, 0], Math.PI, all)?.id).toBe('behind');
  expect(pickFocus([0, 0, 0], -Math.PI / 2, all)?.id).toBe('side'); // facing east
  expect(pickFocus([0, 0, 0], 0, all, (c) => c.id === 'ahead')).toBeUndefined();
  expect(
    pickFocus([0, 0, 0], 0, [
      thing('near-ahead', 0.1, -1.0),
      thing('ahead', 0, -1.6),
    ])?.id,
  ).toBe('near-ahead');
});

test('approach: stand in front of a counter, behind a seat, facing it', () => {
  const counter = {
    position: [0, 0, 0] as [number, number, number],
    yaw: 0,
    kind: 'counter' as const,
  };
  const a = approach(counter);
  expect(a.position[2]).toBeCloseTo(-1);
  expect(pickFocus(a.position, a.yaw, [thing('c', 0, 0)])?.id).toBe('c');
  const seat = approach({ ...counter, kind: 'seat' });
  expect(seat.position[2]).toBeCloseTo(1);
  expect(pickFocus(seat.position, seat.yaw, [thing('s', 0, 0)])?.id).toBe('s');
});

test('doors: open by default, E closes (blocks), NPCs open it and it shuts again', () => {
  const doors = new DoorSystem(new Map([['door:X', [0, 0, 0]]]));
  expect(doors.blocking('door:X')).toBe(false);
  expect(doors.toggle('door:X')).toBe(true);
  expect(doors.blocking('door:X')).toBe(true);
  // The toggle reaches physics on the next update.
  expect(doors.update(0.1, []).changed).toEqual(['door:X']);
  for (let i = 0; i < 10; i += 1) doors.update(0.1, []);
  expect(doors.doors.get('door:X')!.openness).toBe(0);
  // An NPC arrives: the door opens (no longer blocking) ...
  expect(doors.update(0.1, [[0.5, 0, 0.5]]).changed).toEqual(['door:X']);
  expect(doors.blocking('door:X')).toBe(false);
  // ... and swings shut once they are gone.
  let t = 0;
  while (!doors.blocking('door:X') && t < 10) {
    doors.update(0.1, []);
    t += 0.1;
  }
  expect(t).toBeCloseTo(NPC_HOLD_SECONDS, 0);
  expect(doors.toggle('door:X')).toBe(false);
  expect(doors.blocking('door:X')).toBe(false);
});
