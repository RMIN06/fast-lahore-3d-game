import { z } from 'zod';

// Local save (ARCHITECTURE §6): nothing leaves the browser. Versioned schema
// with step-by-step migrations; bad or unknown data never crashes the game.

export const SAVE_VERSION = 2;
export const SAVE_KEY = `fast-lahore.save.v${SAVE_VERSION}`;
/** Older keys that are migrated forward, then removed. */
export const LEGACY_SAVE_KEYS = ['fast-lahore.save.v1'];

/** FAST roll number pattern (GAMEPLAY_SPEC §1), e.g. 23L-1234. Soft check only. */
export const ROLL_NUMBER_PATTERN = /^\d{2}L-\d{4}$/;
export const rollNumberWarning = (roll: string): string | undefined =>
  ROLL_NUMBER_PATTERN.test(roll.trim())
    ? undefined
    : 'This does not look like a FAST roll number (e.g. 23L-1234). You can still continue.';

export const BODIES = ['male', 'female'] as const;
export const SKIN_TONES = ['#f1c9a5', '#d9a47c', '#b07a52', '#7a4e33'] as const;
export const HAIR_STYLES = ['short', 'long', 'tied', 'covered'] as const;
export const OUTFIT_COLORS = [
  '#3a6ea5',
  '#2f7d5b',
  '#a5473a',
  '#6b4fa0',
  '#d9d4c7',
  '#2d2f33',
] as const;
export const GRAPHICS = ['low', 'medium', 'high'] as const;

const avatarSchema = z.strictObject({
  body: z.enum(BODIES),
  skinTone: z.enum(SKIN_TONES),
  hair: z.enum(HAIR_STYLES),
  outfitColor: z.enum(OUTFIT_COLORS),
});
export const profileSchema = z.strictObject({
  rollNumber: z.string().trim().min(1).max(20),
  displayName: z.string().trim().max(40).optional(),
  departmentId: z.string().min(1),
  avatar: avatarSchema,
});
export const settingsSchema = z.strictObject({
  graphics: z.enum(GRAPHICS),
  /** 0..1, used from M12 (audio). */
  volume: z.number().min(0).max(1),
});
const positionSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  /** Camera yaw in radians (three.js, about +Y). */
  yaw: z.number().finite(),
});

/** v1: the shape in ARCHITECTURE §6 (time of day only, no weekday). */
const saveV1Schema = z.strictObject({
  version: z.literal(1),
  profile: profileSchema,
  position: positionSchema,
  timeOfDay: z.number().min(0).max(24),
  settings: settingsSchema,
});
/** v2 (M5+): weekday and minutes, plus when the save was written. */
export const saveSchema = z.strictObject({
  version: z.literal(2),
  profile: profileSchema,
  position: positionSchema,
  time: z.strictObject({
    day: z.number().int().min(0).max(6),
    minutes: z.number().min(0).max(1440),
  }),
  settings: settingsSchema,
  savedAt: z.iso.datetime(),
});

export type Profile = z.infer<typeof profileSchema>;
export type Avatar = Profile['avatar'];
export type Settings = z.infer<typeof settingsSchema>;
export type SaveGame = z.infer<typeof saveSchema>;

export const DEFAULT_SETTINGS: Settings = { graphics: 'medium', volume: 0.8 };
export const DEFAULT_AVATAR: Avatar = {
  body: 'male',
  skinTone: SKIN_TONES[1],
  hair: 'short',
  outfitColor: OUTFIT_COLORS[0],
};

/** Migrations keyed by the version they upgrade from. */
const MIGRATIONS: Record<number, (save: unknown) => unknown> = {
  1: (input) => {
    const v1 = saveV1Schema.parse(input);
    return {
      version: 2,
      profile: v1.profile,
      position: v1.position,
      // v1 had no weekday; assume Monday (the default start day).
      time: { day: 0, minutes: Math.min(v1.timeOfDay * 60, 1439.99) },
      settings: v1.settings,
      savedAt: new Date(0).toISOString(),
    };
  },
};

export type LoadResult =
  | { ok: true; save: SaveGame; migratedFrom?: number }
  | { ok: false; error: string };

/** Parse and migrate any stored save text to the current version. */
export function parseSave(text: string): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Save is not valid JSON' };
  }
  const start =
    data && typeof data === 'object' && 'version' in data
      ? (data as { version: unknown }).version
      : undefined;
  if (typeof start !== 'number' || !Number.isInteger(start))
    return { ok: false, error: 'Save has no version' };
  if (start > SAVE_VERSION)
    return {
      ok: false,
      error: `Save version ${start} is newer than this game`,
    };
  try {
    for (let v = start; v < SAVE_VERSION; v += 1) {
      const migrate = MIGRATIONS[v];
      if (!migrate)
        return { ok: false, error: `No migration from version ${v}` };
      data = migrate(data);
    }
    const save = saveSchema.parse(data);
    return start < SAVE_VERSION
      ? { ok: true, save, migratedFrom: start }
      : { ok: true, save };
  } catch (error) {
    return {
      ok: false,
      error: `Save is invalid: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    };
  }
}

/** Minimal storage interface (window.localStorage in the browser). */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function writeSave(storage: SaveStorage, save: SaveGame): void {
  storage.setItem(SAVE_KEY, JSON.stringify(saveSchema.parse(save)));
}

/** Load the current save, or migrate a legacy one forward and rewrite it. */
export function readSave(storage: SaveStorage): LoadResult | undefined {
  const current = storage.getItem(SAVE_KEY);
  if (current !== null) return parseSave(current);
  for (const key of LEGACY_SAVE_KEYS) {
    const legacy = storage.getItem(key);
    if (legacy === null) continue;
    const result = parseSave(legacy);
    if (result.ok) {
      writeSave(storage, result.save);
      storage.removeItem(key);
    }
    return result;
  }
  return undefined;
}

export function deleteSave(storage: SaveStorage): void {
  storage.removeItem(SAVE_KEY);
  LEGACY_SAVE_KEYS.forEach((key) => storage.removeItem(key));
}
