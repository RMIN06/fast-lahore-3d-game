import { expect, test } from 'vitest';
import campusJson from '../../data/campus.json';
import { loadCampus } from '../world/campus-loader';
import {
  GameClock,
  MINUTES_PER_DAY,
  REAL_SECONDS_PER_GAME_DAY,
  formatTime,
  isGateOpen,
  lightingAt,
  parseTime,
  sunAt,
} from './time';

const campus = loadCampus(campusJson, { mode: 'site-plan' }).campus;

test('a full day takes exactly 24 real minutes at ×1', () => {
  expect(REAL_SECONDS_PER_GAME_DAY).toBe(24 * 60);
  const clock = new GameClock();
  const start = clock.minutes;
  for (let i = 0; i < 24 * 60 * 10; i += 1) clock.advance(0.1); // 24 min in 0.1 s ticks
  expect(clock.day).toBe(1);
  expect(clock.minutes).toBeCloseTo(start, 3);
});

test('new players start Monday 08:30', () => {
  expect(new GameClock().label()).toBe('Mon 08:30');
});

test('pause stops time; speeds scale it', () => {
  const clock = new GameClock();
  clock.paused = true;
  clock.advance(60);
  expect(clock.label()).toBe('Mon 08:30');
  clock.paused = false;
  clock.setSpeed(4);
  clock.advance(15); // 15 real s × 4 = 60 game minutes
  expect(clock.label()).toBe('Mon 09:30');
  clock.setSpeed(0.5);
  clock.advance(60);
  expect(clock.label()).toBe('Mon 10:00');
});

test('set time and day; weekdays roll over Sunday → Monday', () => {
  const clock = new GameClock();
  clock.setDay(6);
  clock.setTime(parseTime('23:59'));
  expect(clock.dayType).toBe('sunday');
  clock.advance(2); // 2 real seconds = 2 game minutes
  expect(clock.label()).toBe('Mon 00:01');
  expect(clock.dayType).toBe('weekday');
  clock.setDay(5);
  expect(clock.dayType).toBe('saturday');
  expect(() => clock.setDay(7)).toThrow();
  expect(() => parseTime('24:00')).toThrow();
  expect(formatTime(MINUTES_PER_DAY - 0.5)).toBe('23:59');
});

test('Masjid-side gate opens only for Friday Jummah (campus data); others stay closed', () => {
  const masjid = campus.gates.find((g) => g.id === 'G-MASJID')!;
  const gate5 = campus.gates.find((g) => g.id === 'G5')!;
  expect(isGateOpen(masjid, 4, parseTime('13:10'))).toBe(true);
  expect(isGateOpen(masjid, 4, parseTime('12:44'))).toBe(false);
  expect(isGateOpen(masjid, 4, parseTime('14:00'))).toBe(false);
  expect(isGateOpen(masjid, 3, parseTime('13:10'))).toBe(false);
  expect(isGateOpen(gate5, 4, parseTime('13:10'))).toBe(false);
});

test('sun rises in the east at 06:00, is due south and highest at midday, sets west', () => {
  expect(sunAt(parseTime('06:00')).elevationDeg).toBeCloseTo(0);
  expect(sunAt(parseTime('18:30')).elevationDeg).toBeCloseTo(0);
  const morning = sunAt(parseTime('08:00'));
  expect(morning.direction[0]).toBeGreaterThan(0); // +X is east
  const noon = sunAt((parseTime('06:00') + parseTime('18:30')) / 2);
  expect(noon.azimuthDeg).toBeCloseTo(180);
  expect(noon.direction[2]).toBeGreaterThan(0); // +Z is south
  expect(sunAt(parseTime('17:00')).direction[0]).toBeLessThan(0);
  expect(sunAt(parseTime('00:00')).elevationDeg).toBeLessThan(-30);
  const d = noon.direction;
  expect(Math.hypot(...d)).toBeCloseTo(1);
});

test('lighting: bright day, readable night with lamps, windows and stars', () => {
  const noon = lightingAt(parseTime('12:00'));
  const night = lightingAt(parseTime('22:00'));
  expect(noon.daylight).toBeCloseTo(1);
  expect(noon.lampsOn).toBe(false);
  expect(noon.windowGlow).toBe(0);
  expect(night.daylight).toBe(0);
  expect(night.lampsOn).toBe(true);
  expect(night.windowGlow).toBe(1);
  expect(night.starOpacity).toBe(1);
  expect(night.sunIntensity).toBe(0);
  // Night is never black: moonlight and ambient keep it readable.
  expect(night.moonIntensity + night.ambientIntensity).toBeGreaterThan(0.8);
  // Lamps switch on around dusk (just before sunset), off after dawn.
  expect(lightingAt(parseTime('18:20')).lampsOn).toBe(true);
  expect(lightingAt(parseTime('07:00')).lampsOn).toBe(false);
});

test('lighting changes smoothly through dusk (no jumps)', () => {
  let previous = lightingAt(parseTime('17:00')).daylight;
  for (let m = parseTime('17:00'); m <= parseTime('20:00'); m += 1) {
    const now = lightingAt(m).daylight;
    expect(now).toBeLessThanOrEqual(previous + 1e-9);
    expect(previous - now).toBeLessThan(0.05);
    previous = now;
  }
});
