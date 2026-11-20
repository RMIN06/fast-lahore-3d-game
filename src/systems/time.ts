import type { Campus } from '../types/campus';

// Game time (GAMEPLAY_SPEC §4): 24 in-game hours = 24 real minutes at ×1,
// i.e. one game minute per real second. Pure logic; no rendering here.

export const MINUTES_PER_DAY = 24 * 60;
export const REAL_SECONDS_PER_GAME_DAY = 24 * 60;
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type Weekday = (typeof DAYS)[number];
export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];
/** Default start for new players (OPEN_QUESTIONS #20): Monday 08:30. */
export const START = { day: 0, minutes: 8 * 60 + 30 };
/** Spec: sunrise ~06:00, sunset ~18:30. */
export const SUNRISE = 6 * 60;
export const SUNSET = 18 * 60 + 30;
/** Noon sun elevation near the equinox at Lahore (lat ~31.5° N). */
export const MAX_SUN_ELEVATION = 58;

export type DayType = 'weekday' | 'saturday' | 'sunday';

export class GameClock {
  day = START.day;
  minutes = START.minutes;
  speed: Speed = 1;
  paused = false;

  /** Advance by real elapsed seconds. */
  advance(realSeconds: number): void {
    if (this.paused || realSeconds <= 0) return;
    this.minutes +=
      realSeconds * this.speed * (MINUTES_PER_DAY / REAL_SECONDS_PER_GAME_DAY);
    while (this.minutes >= MINUTES_PER_DAY) {
      this.minutes -= MINUTES_PER_DAY;
      this.day = (this.day + 1) % 7;
    }
  }

  setTime(minutes: number): void {
    if (!Number.isFinite(minutes)) throw new Error('Invalid time');
    this.minutes =
      ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  }

  setDay(day: number): void {
    if (!Number.isInteger(day) || day < 0 || day > 6)
      throw new Error('Day must be 0 (Mon) to 6 (Sun)');
    this.day = day;
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
  }

  get weekday(): Weekday {
    return DAYS[this.day]!;
  }

  get dayType(): DayType {
    return this.day === 5 ? 'saturday' : this.day === 6 ? 'sunday' : 'weekday';
  }

  /** "Mon 08:30" */
  label(): string {
    return `${this.weekday} ${formatTime(this.minutes)}`;
  }
}

export const formatTime = (minutes: number): string => {
  const whole = Math.floor(minutes);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

/** "HH:MM" (24 hour) to minutes after midnight. */
export function parseTime(text: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (!match) throw new Error('Expected HH:MM (24 hour)');
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Gate schedule from campus data. Gates with an `opens` rule are open only in
 * that window (e.g. the Masjid-side gate on Friday for Jummah); gates without
 * one stay closed because no off-campus areas exist (PRD §2).
 */
export function isGateOpen(
  gate: Campus['gates'][number],
  day: number,
  minutes: number,
): boolean {
  const rule = gate.opens;
  if (!rule) return false;
  if (rule.days && !rule.days.includes(DAYS[day]!)) return false;
  const from = rule.fromTime ? parseTime(rule.fromTime) : 0;
  const to = rule.toTime ? parseTime(rule.toTime) : MINUTES_PER_DAY;
  return minutes >= from && minutes < to;
}

export interface SunState {
  elevationDeg: number;
  /** Compass bearing, degrees clockwise from north. */
  azimuthDeg: number;
  /** Unit vector toward the sun: +X east, +Y up, +Z south. */
  direction: [number, number, number];
}

/** Simple sun path: rises in the east at SUNRISE, due south at midday, sets west. */
export function sunAt(minutes: number): SunState {
  const day = (minutes - SUNRISE) / (SUNSET - SUNRISE);
  let elevation: number, azimuth: number;
  if (day >= 0 && day <= 1) {
    elevation = MAX_SUN_ELEVATION * Math.sin(Math.PI * day);
    azimuth = 90 + 180 * day;
  } else {
    const nightLength = MINUTES_PER_DAY - (SUNSET - SUNRISE);
    const since = (minutes - SUNSET + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const night = since / nightLength;
    elevation = -40 * Math.sin(Math.PI * night);
    azimuth = (270 + 180 * night) % 360;
  }
  const el = (elevation * Math.PI) / 180,
    az = (azimuth * Math.PI) / 180;
  return {
    elevationDeg: elevation,
    azimuthDeg: azimuth,
    direction: [
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      -Math.cos(az) * Math.cos(el),
    ],
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixColor = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16),
    pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(mix((pa >> shift) & 255, (pb >> shift) & 255, t));
  return `#${[16, 8, 0].map((s) => channel(s).toString(16).padStart(2, '0')).join('')}`;
};

export interface Lighting {
  sun: SunState;
  /** 0 = night, 1 = full day (twilight blends between). */
  daylight: number;
  sunIntensity: number;
  moonIntensity: number;
  ambientIntensity: number;
  /** Hemisphere (ambient) sky colour: moonlit blue at night. */
  ambientColor: string;
  skyColor: string;
  groundColor: string;
  fogColor: string;
  exposure: number;
  lampsOn: boolean;
  /** 0..1 window emission. */
  windowGlow: number;
  starOpacity: number;
}

/** All time-of-day lighting parameters for the renderer. */
export function lightingAt(minutes: number): Lighting {
  const sun = sunAt(minutes);
  const el = sun.elevationDeg;
  const daylight = smoothstep(-6, 8, el);
  const dusk = 1 - smoothstep(0, 12, Math.abs(el));
  const night = '#0b1424',
    day = '#b9d2e6',
    sunset = '#e39a63';
  return {
    sun,
    daylight,
    sunIntensity: 2.6 * smoothstep(-1, 12, el),
    moonIntensity: 0.8 * (1 - daylight),
    ambientIntensity: mix(1.1, 1.6, daylight),
    ambientColor: mixColor('#4a5f8c', '#e4f1ff', daylight),
    skyColor: mixColor(mixColor(night, day, daylight), sunset, dusk * 0.6),
    groundColor: mixColor('#1c2420', '#3d4a3a', daylight),
    fogColor: mixColor(mixColor(night, day, daylight), sunset, dusk * 0.5),
    exposure: mix(1.15, 0.95, daylight),
    lampsOn: el < 3,
    windowGlow: 1 - smoothstep(-4, 6, el),
    starOpacity: 1 - smoothstep(-12, -2, el),
  };
}
