import { expect, test } from 'vitest';
import {
  DEFAULT_AVATAR,
  DEFAULT_SETTINGS,
  LEGACY_SAVE_KEYS,
  SAVE_KEY,
  SAVE_VERSION,
  deleteSave,
  parseSave,
  readSave,
  rollNumberWarning,
  writeSave,
} from './save';
import type { SaveGame, SaveStorage } from './save';

const memory = (): SaveStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};
const profile = {
  rollNumber: '23L-1234',
  displayName: 'Ayesha',
  departmentId: 'cs',
  avatar: DEFAULT_AVATAR,
};
const save: SaveGame = {
  version: 2,
  profile,
  position: { x: 5.4, y: 0, z: 108.35, yaw: 1.2 },
  time: { day: 4, minutes: 13 * 60 + 10 },
  settings: { graphics: 'high', volume: 0.4 },
  savedAt: '2026-11-20T10:00:00.000Z',
};

test('roll number check warns but never blocks', () => {
  expect(rollNumberWarning('23L-1234')).toBeUndefined();
  expect(rollNumberWarning(' 21L-0007 ')).toBeUndefined();
  expect(rollNumberWarning('231234')).toMatch(/can still continue/);
  expect(rollNumberWarning('23l-1234')).toBeDefined();
});

test('save round-trips under a versioned key', () => {
  const storage = memory();
  writeSave(storage, save);
  expect(SAVE_KEY).toBe(`fast-lahore.save.v${SAVE_VERSION}`);
  expect([...storage.data.keys()]).toEqual([SAVE_KEY]);
  expect(readSave(storage)).toEqual({ ok: true, save });
  deleteSave(storage);
  expect(readSave(storage)).toBeUndefined();
});

test('migration: a v1 save (ARCHITECTURE §6 shape) upgrades to v2 and is rewritten', () => {
  const storage = memory();
  const v1 = {
    version: 1,
    profile,
    position: save.position,
    timeOfDay: 13.5,
    settings: DEFAULT_SETTINGS,
  };
  storage.setItem(LEGACY_SAVE_KEYS[0]!, JSON.stringify(v1));
  const result = readSave(storage);
  expect(result).toMatchObject({
    ok: true,
    migratedFrom: 1,
    save: {
      version: 2,
      profile,
      position: save.position,
      time: { day: 0, minutes: 810 },
      settings: DEFAULT_SETTINGS,
    },
  });
  // Legacy key replaced by the current one.
  expect(storage.getItem(LEGACY_SAVE_KEYS[0]!)).toBeNull();
  expect(parseSave(storage.getItem(SAVE_KEY)!)).toMatchObject({ ok: true });
});

test('corrupt, unversioned, future or malformed saves fail safely', () => {
  expect(parseSave('{oops')).toEqual({
    ok: false,
    error: 'Save is not valid JSON',
  });
  expect(parseSave('{"profile":{}}')).toMatchObject({
    ok: false,
    error: 'Save has no version',
  });
  expect(parseSave(JSON.stringify({ ...save, version: 99 }))).toMatchObject({
    ok: false,
    error: expect.stringMatching(/newer/),
  });
  expect(
    parseSave(JSON.stringify({ ...save, position: { x: 'far' } })),
  ).toMatchObject({ ok: false });
  expect(
    parseSave(
      JSON.stringify({ ...save, settings: { graphics: 'ultra', volume: 2 } }),
    ),
  ).toMatchObject({ ok: false });
  expect(() =>
    writeSave(memory(), { ...save, time: { day: 9, minutes: 0 } }),
  ).toThrow();
});
