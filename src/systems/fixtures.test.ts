import { describe, expect, test } from 'vitest';
import campusJson from '../../data/campus.json';
import { loadCampus } from '../world/campus-loader';
import { interiorLayouts } from '../world/interiors';
import { campusFixtures } from './fixtures';
import type { FixtureKind } from './fixtures';
import { pointInPolygon } from './campus-geometry';

const campus = loadCampus(campusJson, { mode: 'site-plan' }).campus;
const layouts = interiorLayouts(campus);
const fixtures = campusFixtures(campus, layouts);
const rooms = layouts.flatMap((l) => l.floors.flatMap((f) => f.rooms));
const of = (kind: FixtureKind, where: { spaceId?: string; areaId?: string }) =>
  fixtures.filter(
    (f) =>
      f.kind === kind &&
      (!where.spaceId || f.spaceId === where.spaceId) &&
      (!where.areaId || f.areaId === where.areaId),
  );

describe('generated fixtures', () => {
  test('ids are unique and generation is deterministic', () => {
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length);
    expect(campusFixtures(campus, layouts)).toBe(fixtures);
  });
  test('classrooms, labs and halls have seats or PCs and a lectern', () => {
    for (const room of rooms) {
      const want: FixtureKind | undefined =
        room.kind === 'lab'
          ? 'pc'
          : ['classroom', 'auditorium', 'seminar_hall'].includes(room.kind)
            ? 'seat'
            : undefined;
      if (!want) continue;
      expect(
        of(want, { spaceId: room.spaceId }).length,
        room.spaceId,
      ).toBeGreaterThan(0);
      expect(
        of('lectern', { spaceId: room.spaceId }),
        room.spaceId,
      ).toHaveLength(1);
    }
  });
  test('library: issue desk, 36 coded shelves, study seats; cafe and offices have counters', () => {
    const shelves = of('shelf', { spaceId: 'E-G-LIBRARY' });
    expect(shelves).toHaveLength(36);
    expect(new Set(shelves.map((s) => s.code)).size).toBe(36);
    expect(of('counter', { spaceId: 'E-G-LIBRARY' })).toHaveLength(1);
    expect(of('seat', { spaceId: 'E-G-LIBRARY' }).length).toBeGreaterThan(0);
    for (const id of [
      'F-G-CAFE',
      'F-1-ACADEMICOFFICE',
      'F-1-FACULTYOFFICES',
      'C-G-MEDICAL',
    ])
      expect(of('counter', { spaceId: id }), id).toHaveLength(1);
    expect(
      of('desk', { spaceId: 'F-1-FACULTYOFFICES' }).length,
    ).toBeGreaterThan(0);
  });
  test('fixtures in rooms lie inside their room and building', () => {
    for (const f of fixtures.filter((x) => x.spaceId && x.kind !== 'door')) {
      const room = rooms.find((r) => r.spaceId === f.spaceId)!;
      expect(
        pointInPolygon([f.position[0], f.position[2]], room.polygon),
        f.id,
      ).toBe(true);
      expect(f.position[1]).toBe(room.anchor[1]);
    }
  });
  test('outdoor areas: lawn benches, cafe/shop counters, prayer spaces, parking', () => {
    for (const area of campus.areas.filter((a) => a.polygon)) {
      const inArea = fixtures.filter((f) => f.areaId === area.id);
      for (const f of inArea)
        expect(
          pointInPolygon([f.position[0], f.position[2]], area.polygon!),
          f.id,
        ).toBe(true);
      if (area.kind === 'lawn')
        expect(
          of('bench', { areaId: area.id }).length,
          area.id,
        ).toBeGreaterThan(0);
      if (area.kind === 'cafe' || area.kind === 'shop')
        expect(of('counter', { areaId: area.id }), area.id).toHaveLength(1);
      if (area.kind === 'masjid')
        expect(of('prayer', { areaId: area.id }).length).toBeGreaterThan(0);
    }
  });
  test('every room with a doorway has one door', () => {
    const doors = fixtures.filter((f) => f.kind === 'door');
    expect(doors.length).toBeGreaterThan(90);
    expect(new Set(doors.map((d) => d.spaceId)).size).toBe(doors.length);
  });
});
