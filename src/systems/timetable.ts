import type { Campus } from '../types/campus';
import type { InteriorLayout } from './interior';
import { hash, rng } from './npc';
import { DAYS } from './time';

// M10 generated timetable (GAMEPLAY_SPEC §5). The real template per
// department is unknown (OPEN_QUESTIONS #18), so slots, courses and rooms are
// PLACEHOLDERS generated deterministically from the department and roll number.

/** Class slots (game minutes after midnight); lunch 12:50–14:00. */
export const SLOTS: readonly { from: number; to: number }[] = [
  { from: 8 * 60 + 30, to: 9 * 60 + 50 },
  { from: 10 * 60, to: 11 * 60 + 20 },
  { from: 11 * 60 + 30, to: 12 * 60 + 50 },
  { from: 14 * 60, to: 15 * 60 + 20 },
  { from: 15 * 60 + 30, to: 16 * 60 + 50 },
];

/** Generic course titles per department (fictional course codes). */
const COURSES: Record<string, readonly string[]> = {
  cs: [
    'Programming Fundamentals',
    'Data Structures',
    'Discrete Structures',
    'Database Systems',
    'Operating Systems',
    'Computer Networks',
    'Linear Algebra',
  ],
  civil: [
    'Engineering Mechanics',
    'Surveying',
    'Fluid Mechanics',
    'Structural Analysis',
    'Engineering Drawing',
    'Calculus',
  ],
  ee: [
    'Circuit Analysis',
    'Digital Logic Design',
    'Signals and Systems',
    'Electronics',
    'Electromagnetics',
    'Calculus',
  ],
  mgmt: [
    'Principles of Management',
    'Financial Accounting',
    'Business Communication',
    'Marketing',
    'Microeconomics',
    'Statistics',
  ],
};
const FALLBACK = [
  'Calculus',
  'Communication Skills',
  'Islamic Studies',
  'Pakistan Studies',
];

export interface ClassSlot {
  day: number;
  from: number;
  to: number;
  course: string;
  courseCode: string;
  spaceId: string;
  room: string;
  /** Labs are taught at PCs. */
  lab: boolean;
}

/** A week of classes (Mon–Fri) for a department and section (roll number). */
export function timetable(
  campus: Campus,
  layouts: InteriorLayout[],
  departmentId: string,
  rollNumber = '',
): ClassSlot[] {
  const department = campus.departments.find((d) => d.id === departmentId);
  if (!department) return [];
  const rooms = layouts
    .filter((l) => department.buildingIds.includes(l.buildingId))
    .flatMap((l) => l.floors.flatMap((f) => f.rooms))
    .filter((r) => r.kind === 'classroom' || r.kind === 'lab');
  if (!rooms.length) return [];
  const classrooms = rooms.filter((r) => r.kind === 'classroom');
  const labs = rooms.filter((r) => r.kind === 'lab');
  const courses = COURSES[departmentId] ?? FALLBACK;
  const out: ClassSlot[] = [];
  for (let day = 0; day < 5; day += 1) {
    const r = rng(hash(`tt:${departmentId}:${rollNumber}:${DAYS[day]}`));
    // Three or four classes a day, never all five slots.
    const count = 3 + Math.floor(r() * 2);
    const chosen = [...SLOTS.keys()]
      .sort(() => r() - 0.5)
      .slice(0, count)
      .sort((a, b) => a - b);
    for (const s of chosen) {
      const c = Math.floor(r() * courses.length);
      const lab = labs.length > 0 && (classrooms.length === 0 || r() < 0.25);
      const pool = lab ? labs : classrooms;
      const room = pool[Math.floor(r() * pool.length)]!;
      out.push({
        day,
        ...SLOTS[s]!,
        course: courses[c]! + (lab ? ' Lab' : ''),
        courseCode: `${departmentId.toUpperCase()}-${101 + c * 10 + (lab ? 1 : 0)}`,
        spaceId: room.spaceId,
        room: room.code ?? room.name,
        lab,
      });
    }
  }
  return out;
}

/**
 * The class to attend now: in session, or starting within `lead` minutes.
 * Arriving up to 15 minutes late still counts.
 */
export function currentClass(
  slots: ClassSlot[],
  day: number,
  minutes: number,
  lead = 30,
): ClassSlot | undefined {
  return slots.find(
    (s) => s.day === day && minutes >= s.from - lead && minutes <= s.from + 15,
  );
}

export const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
