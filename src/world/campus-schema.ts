import { z } from 'zod';

const text = z.string().trim().min(1);
const number = z.number().finite();
const positive = number.positive();
export const confidenceSchema = z.enum([
  'measured',
  'traced',
  'estimated',
  'placeholder',
]);
export const vec2Schema = z.tuple([number, number]);
export const vec3Schema = z.tuple([number, number, number]);
export const polygonSchema = z.array(vec2Schema).min(3);
const box = z.tuple([number, number, positive, positive]);
const provenance = { source: text.optional(), notes: text.optional() };
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24 hour)');

export const spaceSchema = z.strictObject({
  id: text,
  code: text.optional(),
  name: text,
  kind: z.enum([
    'classroom',
    'lab',
    'office',
    'common_room',
    'washroom',
    'library',
    'cafe',
    'auditorium',
    'seminar_hall',
    'medical',
    'recreation',
    'parking',
    'open_seating',
    'student_centre',
    'stairs',
    'other',
  ]),
  side: z.enum(['left', 'right', 'front', 'middle']).optional(),
  order: number.int().nonnegative().optional(),
  polygon: polygonSchema.optional(),
  capacity: number.int().nonnegative().optional(),
  confidence: confidenceSchema,
  ...provenance,
});
export const connectorSchema = z.strictObject({
  id: text,
  kind: z.enum(['stairs', 'lift']),
  position: vec2Schema.nullable(),
  connects: z.array(text).min(1),
});
export const floorSchema = z.strictObject({
  id: text,
  level: number.int(),
  height: positive.optional(),
  label: text,
  layout: z.enum(['corridor_spine', 'open_hall', 'parking', 'custom']),
  spaces: z.array(spaceSchema),
  connectors: z.array(connectorSchema),
  glb: text
    .refine(
      (value) =>
        value.startsWith('/models/') &&
        value.endsWith('.glb') &&
        !value.includes('..'),
      'Expected a shipped /models/*.glb path',
    )
    .optional(),
});
export const buildingSchema = z.strictObject({
  id: text,
  label: text,
  aliases: z.array(text),
  footprint: polygonSchema.nullable(),
  schematicBoxPx: box.optional(),
  features: z.array(text).optional(),
  entries: z.array(
    z.strictObject({
      id: text,
      position: vec2Schema.nullable(),
      floor: text,
      kind: z.enum(['main', 'side', 'stair', 'ramp']),
      label: text.optional(),
    }),
  ),
  floors: z.array(floorSchema).min(1),
  // Confidence in the floor count itself (A and E upper floors are unknown).
  floorsConfidence: confidenceSchema.optional(),
  roomCodePrefix: text.optional(),
  confidence: confidenceSchema,
  ...provenance,
});
export const campusSchema = z.strictObject({
  mapNotes: z
    .strictObject({
      benches: text,
      entryPoints: text,
      roomBlockClassNames: z.record(text, text),
    })
    .optional(),
  meta: z.strictObject({
    name: text,
    origin: text,
    geo: z
      .strictObject({
        lat: number.min(-90).max(90),
        lng: number.min(-180).max(180),
        rotationDeg: number,
      })
      .optional(),
    calibration: z
      .strictObject({
        method: text,
        metersPerPixel: positive.optional(),
        refs: z.array(text),
        residualPct: number.nonnegative().optional(),
        date: z.iso.date(),
      })
      .optional(),
    defaults: z.strictObject({
      floorHeight: positive,
      basementHeight: positive,
      wallThickness: positive,
      corridorWidth: positive,
      doorWidth: positive,
      doorHeight: positive,
      boundaryWallHeight: positive.optional(),
      gateWidth: positive.optional(),
    }),
    schematicMap: z.strictObject({
      file: text,
      sizePx: z.tuple([positive.int(), positive.int()]),
      northDirection: text.optional(),
      author: text.optional(),
      notToScale: z.boolean().optional(),
    }),
    officialAreaAcres: positive.optional(),
    notes: text.optional(),
    mapToWorld: z
      .strictObject({
        originPx: vec2Schema,
        originGate: text,
        formula: text,
        assumption: text,
        status: text,
      })
      .optional(),
  }),
  // The supplied seed has unresolved geometry. Curated-mode validation rejects nulls.
  boundary: z.strictObject({
    polygon: polygonSchema.nullable(),
    confidence: confidenceSchema,
  }),
  gates: z.array(
    z.strictObject({
      id: text,
      label: text,
      position: vec2Schema.nullable(),
      heading: number.optional(),
      schematicPx: vec2Schema.optional(),
      opens: z
        .strictObject({
          days: z
            .array(z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']))
            .optional(),
          fromTime: time.optional(),
          toTime: time.optional(),
        })
        .optional(),
      confidence: confidenceSchema,
      ...provenance,
    }),
  ),
  buildings: z.array(buildingSchema),
  areas: z.array(
    z.strictObject({
      id: text,
      label: text,
      kind: z.enum([
        'lawn',
        'ground',
        'court',
        'parking',
        'path',
        'road',
        'plaza',
        'shop',
        'cafe',
        'masjid',
        'water_feature',
        'other',
      ]),
      polygon: polygonSchema.nullable(),
      schematicBoxPx: box.optional(),
      surface: z
        .enum(['grass', 'asphalt', 'paving', 'clay', 'turf', 'concrete'])
        .optional(),
      confidence: confidenceSchema,
      ...provenance,
    }),
  ),
  // CAMPUS_SPEC names PropGroup but provides no contract; never silently accept opaque placement data.
  props: z
    .array(z.never())
    .max(0, 'PropGroup contract is undefined; see OPEN_QUESTIONS'),
  departments: z.array(
    z.strictObject({
      id: text,
      name: text,
      buildingIds: z.array(text).min(1),
      spawnAnchor: text,
      aliases: z.array(text),
      notes: text.optional(),
    }),
  ),
  anchors: z.array(
    z.strictObject({
      id: text,
      kind: z.enum(['spawn', 'seat', 'interact', 'npc_wp', 'camera']),
      position: vec3Schema.nullable(),
      heading: number.optional(),
      refs: z.array(text).optional(),
    }),
  ),
});
