import { describe, expect, test } from 'vitest';
import fixture from '../../tests/fixtures/campus.valid.json';
import seed from '../../data/campus.seed.json';
import { campusSchema } from '../world/campus-schema';
import { loadCampus, loadCampusJson } from '../world/campus-loader';
import type { Campus } from '../types/campus';
import { validateCampus } from './campus-validation';
import { polygonContains, polygonsOverlap } from './polygon-validation';

const valid = (): Campus => campusSchema.parse(structuredClone(fixture));
const errors = (campus: unknown) =>
  validateCampus(campus, { mode: 'curated' }).issues.filter(
    (issue) => issue.severity === 'error',
  );

test('synthetic complete fixture passes without warnings; repeated local floor/stair IDs are legal', () => {
  expect(validateCampus(valid(), { mode: 'curated' }).issues).toEqual([]);
});
test('original seed loads losslessly with explicit incomplete/placeholder warnings', () => {
  const result = loadCampus(seed);
  expect(result.campus).toEqual(seed);
  expect(result.warnings.some((issue) => issue.code === 'placeholder')).toBe(
    true,
  );
  expect(
    result.warnings.some((issue) => issue.path === 'boundary.polygon'),
  ).toBe(true);
  expect(
    result.warnings.some((issue) =>
      issue.message.includes('reciprocal connector'),
    ),
  ).toBe(true);
  expect(() => loadCampus(seed, { mode: 'curated' })).toThrow(
    'boundary.polygon',
  );
});

const broken: [string, string, string, (campus: Campus) => void][] = [
  [
    'invalid enum',
    'schema',
    'buildings.0.confidence',
    (c) => {
      Object.assign(c.buildings[0]!, { confidence: 'invented' });
    },
  ],
  [
    'mismatched connector kinds',
    'connector',
    'buildings.0.floors',
    (c) => {
      c.buildings[0]!.floors[1]!.connectors[0]!.kind = 'lift';
    },
  ],
  [
    'missing gate heading in curated data',
    'incomplete',
    'gates.0.heading',
    (c) => {
      delete c.gates[0]!.heading;
    },
  ],
  [
    'null gate in curated data',
    'incomplete',
    'gates.0.position',
    (c) => {
      c.gates[0]!.position = null;
    },
  ],
  [
    'null anchor in curated data',
    'incomplete',
    'anchors.0.position',
    (c) => {
      c.anchors[0]!.position = null;
    },
  ],
  [
    'null footprint in curated data',
    'incomplete',
    'buildings.0.footprint',
    (c) => {
      c.buildings[0]!.footprint = null;
    },
  ],
  [
    'null area in curated data',
    'incomplete',
    'areas.0.polygon',
    (c) => {
      c.areas[0]!.polygon = null;
    },
  ],
  [
    'null entry in curated data',
    'incomplete',
    'buildings.0.entries.0.position',
    (c) => {
      c.buildings[0]!.entries[0]!.position = null;
    },
  ],
  [
    'null connector in curated data',
    'incomplete',
    'buildings.0.floors.0.connectors.0.position',
    (c) => {
      c.buildings[0]!.floors[0]!.connectors[0]!.position = null;
    },
  ],
  [
    'unsafe model override path',
    'schema',
    'buildings.0.floors.0.glb',
    (c) => {
      c.buildings[0]!.floors[0]!.glb = '/reference/private.glb';
    },
  ],
  [
    'unknown keys',
    'schema',
    'meta',
    (c) => {
      Object.assign(c.meta, { typo: true });
    },
  ],
  [
    'non-finite coordinate',
    'schema',
    'gates.0.position.0',
    (c) => {
      c.gates[0]!.position![0] = Infinity;
    },
  ],
  [
    'invalid dimension',
    'schema',
    'meta.defaults.floorHeight',
    (c) => {
      c.meta.defaults.floorHeight = 0;
    },
  ],
  [
    'short polygon',
    'schema',
    'boundary.polygon',
    (c) => {
      c.boundary.polygon = [
        [0, 0],
        [1, 1],
      ];
    },
  ],
  [
    'duplicate top-level IDs',
    'duplicate-id',
    'buildings.1.id',
    (c) => {
      c.buildings[1]!.id = 'A';
    },
  ],
  [
    'duplicate room IDs',
    'duplicate-id',
    'buildings.0.floors.1.spaces.0.id',
    (c) => {
      c.buildings[0]!.floors[1]!.spaces.push(
        structuredClone(c.buildings[0]!.floors[0]!.spaces[0]!),
      );
    },
  ],
  [
    'duplicate floor IDs',
    'duplicate-id',
    'buildings.0.floors.1.id',
    (c) => {
      c.buildings[0]!.floors[1]!.id = 'G';
    },
  ],
  [
    'duplicate entry IDs',
    'duplicate-id',
    'buildings.0.entries.1.id',
    (c) => {
      c.buildings[0]!.entries.push(
        structuredClone(c.buildings[0]!.entries[0]!),
      );
    },
  ],
  [
    'duplicate connector IDs',
    'duplicate-id',
    'buildings.0.floors.0.connectors.1.id',
    (c) => {
      c.buildings[0]!.floors[0]!.connectors.push(
        structuredClone(c.buildings[0]!.floors[0]!.connectors[0]!),
      );
    },
  ],
  [
    'duplicate levels',
    'duplicate-level',
    'buildings.0.floors.1.level',
    (c) => {
      c.buildings[0]!.floors[1]!.level = 0;
    },
  ],
  [
    'unresolved origin',
    'reference',
    'meta.origin',
    (c) => {
      c.meta.origin = 'unknown';
    },
  ],
  [
    'misplaced origin',
    'origin',
    'meta.origin',
    (c) => {
      c.gates[0]!.position = [1, 0];
    },
  ],
  [
    'department building reference',
    'reference',
    'departments.0.buildingIds.0',
    (c) => {
      c.departments[0]!.buildingIds[0] = 'unknown';
    },
  ],
  [
    'department spawn reference',
    'reference',
    'departments.0.spawnAnchor',
    (c) => {
      c.departments[0]!.spawnAnchor = 'A';
    },
  ],
  [
    'spawn reference to a non-spawn anchor',
    'reference',
    'departments.0.spawnAnchor',
    (c) => {
      c.anchors[0]!.kind = 'seat';
    },
  ],
  [
    'anchor reference',
    'reference',
    'anchors.0.refs.0',
    (c) => {
      c.anchors[0]!.refs = ['unknown'];
    },
  ],
  [
    'entry floor reference',
    'reference',
    'buildings.0.entries.0.floor',
    (c) => {
      c.buildings[0]!.entries[0]!.floor = 'unknown';
    },
  ],
  [
    'connector floor reference',
    'reference',
    'buildings.0.floors.0.connectors.0.connects.2',
    (c) => {
      c.buildings[0]!.floors[0]!.connectors[0]!.connects.push('unknown');
    },
  ],
  [
    'connector omits its own floor',
    'connector',
    'buildings.0.floors.0.connectors.0.connects',
    (c) => {
      c.buildings[0]!.floors[0]!.connectors[0]!.connects = ['1'];
    },
  ],
  [
    'missing upward connection',
    'connector',
    'buildings.0.floors',
    (c) => {
      c.buildings[0]!.floors[0]!.connectors = [];
    },
  ],
  [
    'missing reciprocal connection',
    'connector',
    'buildings.0.floors',
    (c) => {
      c.buildings[0]!.floors[1]!.connectors[0]!.connects = ['1'];
    },
  ],
  [
    'crossed polygon',
    'polygon',
    'buildings.0.footprint',
    (c) => {
      c.buildings[0]!.footprint = [
        [10, 10],
        [30, 30],
        [30, 10],
        [10, 30],
      ];
    },
  ],
  [
    'self-touching polygon',
    'polygon',
    'areas.0.polygon',
    (c) => {
      c.areas[0]!.polygon = [
        [0, 0],
        [5, 0],
        [5, 5],
        [2, 0],
        [0, 5],
      ];
    },
  ],
  [
    'explicit polygon closure',
    'polygon',
    'areas.0.polygon',
    (c) => {
      c.areas[0]!.polygon!.push(c.areas[0]!.polygon![0]!);
    },
  ],
  [
    'degenerate polygon',
    'polygon',
    'areas.0.polygon',
    (c) => {
      c.areas[0]!.polygon = [
        [0, 0],
        [1, 0],
        [2, 0],
      ];
    },
  ],
  [
    'overlapping buildings',
    'building-overlap',
    'buildings.1.footprint',
    (c) => {
      c.buildings[1]!.footprint = [
        [20, 20],
        [40, 20],
        [40, 40],
        [20, 40],
      ];
    },
  ],
  [
    'identical footprints',
    'building-overlap',
    'buildings.1.footprint',
    (c) => {
      c.buildings[1]!.footprint = c.buildings[0]!.footprint;
    },
  ],
  [
    'building outside boundary',
    'building-outside',
    'buildings.1.footprint',
    (c) => {
      c.buildings[1]!.footprint = [
        [250, 10],
        [270, 10],
        [270, 30],
        [250, 30],
      ];
    },
  ],
  [
    'space outside building',
    'space-outside',
    'buildings.0.floors.0.spaces.0.polygon',
    (c) => {
      c.buildings[0]!.floors[0]!.spaces[0]!.polygon = [
        [25, 25],
        [35, 25],
        [35, 35],
        [25, 35],
      ];
    },
  ],
  [
    'boundary too small',
    'boundary-area',
    'boundary.polygon',
    (c) => {
      c.boundary.polygon = [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ];
    },
  ],
  [
    'boundary too large',
    'boundary-area',
    'boundary.polygon',
    (c) => {
      c.boundary.polygon = [
        [0, 0],
        [1000, 0],
        [1000, 1000],
        [0, 1000],
      ];
    },
  ],
  [
    'null boundary in curated data',
    'incomplete',
    'boundary.polygon',
    (c) => {
      c.boundary.polygon = null;
    },
  ],
  [
    'missing room polygon in curated data',
    'incomplete',
    'buildings.0.floors.0.spaces.0.polygon',
    (c) => {
      delete c.buildings[0]!.floors[0]!.spaces[0]!.polygon;
    },
  ],
];
describe('deliberately broken fixtures exercise every validation rule', () => {
  test.each(broken)('%s', (_, code, path, mutate) => {
    const campus = valid();
    mutate(campus);
    expect(errors(campus)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code, path })]),
    );
  });
});
test.each(['tasks', 'npcs'])(
  '%s nested reference audit rejects missing anchors, buildings, rooms and departments',
  (name) => {
    for (const key of [
      'anchorId',
      'buildingId',
      'roomId',
      'departmentId',
      'locationAnchor',
      'refs',
    ]) {
      const result = validateCampus(valid(), {
        referenceDocuments: {
          [name]: [{ id: 'example', steps: [{ [key]: 'unknown' }] }],
        },
      });
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'reference',
          path: `${name}.0.steps.0.${key}`,
        }),
      );
    }
  },
);
test('nested reference arrays resolve and record IDs are unique per document', () => {
  const documents = {
    tasks: [
      {
        id: 'task',
        locationAnchors: ['spawn.test'],
        steps: [{ roomId: 'A-G-TEST' }],
      },
    ],
    npcs: [{ id: 'npc', schedule: [{ buildingId: 'A' }] }],
  };
  expect(
    validateCampus(valid(), { referenceDocuments: documents }).issues,
  ).toEqual([]);
  documents.tasks.push(documents.tasks[0]!);
  expect(
    validateCampus(valid(), { referenceDocuments: documents }).issues,
  ).toContainEqual(
    expect.objectContaining({ code: 'duplicate-id', path: 'tasks.1.id' }),
  );
});
test('malformed external documents fail explicitly', () => {
  expect(
    validateCampus(valid(), { referenceDocuments: { tasks: {} } }).issues,
  ).toContainEqual(expect.objectContaining({ code: 'schema', path: 'tasks' }));
  expect(
    validateCampus(valid(), { referenceDocuments: { npcs: [{}] } }).issues,
  ).toContainEqual(
    expect.objectContaining({ code: 'schema', path: 'npcs.0.id' }),
  );
  expect(
    validateCampus(valid(), {
      referenceDocuments: { tasks: [{ id: 'bad', anchorId: {} }] },
    }).issues,
  ).toContainEqual(
    expect.objectContaining({ code: 'schema', path: 'tasks.0.anchorId' }),
  );
});
test('georeferencing origins must resolve and match the campus origin', () => {
  const campus = valid();
  campus.meta.mapToWorld = {
    originGate: 'missing',
    originPx: [0, 0],
    formula: 'test only',
    assumption: 'test',
    status: 'test',
  };
  const issues = errors(campus);
  expect(issues).toContainEqual(
    expect.objectContaining({
      code: 'reference',
      path: 'meta.mapToWorld.originGate',
    }),
  );
  expect(issues).toContainEqual(
    expect.objectContaining({
      code: 'origin',
      path: 'meta.mapToWorld.originGate',
    }),
  );
});
test('an unsupported prop record fails loudly instead of dropping its fields', () => {
  const campus: unknown = {
    ...valid(),
    props: [{ id: 'undefined-contract', position: [0, 0, 0] }],
  };
  expect(errors(campus)).toContainEqual(
    expect.objectContaining({ code: 'schema', path: 'props' }),
  );
});
test('seed mode does not downgrade a positioned but broken floor link', () => {
  const campus = valid();
  campus.buildings[0]!.floors[0]!.connectors[0]!.connects = ['G'];
  expect(validateCampus(campus).issues).toContainEqual(
    expect.objectContaining({ code: 'connector', severity: 'error' }),
  );
});
test('placeholder confidence warns independently of geometry completeness', () => {
  const campus = valid();
  campus.buildings[0]!.confidence = 'placeholder';
  expect(validateCampus(campus, { mode: 'curated' }).issues).toEqual([
    expect.objectContaining({
      code: 'placeholder',
      path: 'buildings.0.confidence',
      severity: 'warning',
    }),
  ]);
});
test('loader rejects invalid JSON and includes offending paths for schema and reference errors', () => {
  expect(() => loadCampusJson('{broken')).toThrow('Campus JSON:');
  expect(() => loadCampusJson('{}')).toThrow('meta');
  const campus = valid();
  campus.departments[0]!.spawnAnchor = 'missing';
  expect(() => loadCampus(campus)).toThrow('departments.0.spawnAnchor');
});
test('boundary area sanity band is 12.5 acres ±20%', () => {
  const expected = 12.5 * 4046.8564224;
  const areaIssue = (factor: number) => {
    const side = Math.sqrt(expected * factor);
    const campus = valid();
    campus.boundary.polygon = [
      [0, 0],
      [side, 0],
      [side, side],
      [0, side],
    ];
    return validateCampus(campus, { mode: 'curated' }).issues.some(
      (issue) => issue.code === 'boundary-area',
    );
  };
  expect(areaIssue(0.79)).toBe(true);
  expect(areaIssue(0.801)).toBe(false);
  // Measured walled campus (Esri World Imagery and OSM agree): ~42,484 m².
  expect(areaIssue(42484 / expected)).toBe(false);
  expect(areaIssue(1.199)).toBe(false);
  expect(areaIssue(1.21)).toBe(true);
});
test('concave containment detects edges that leave the polygon even when vertices lie inside', () => {
  const concave: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [7, 10],
    [7, 3],
    [3, 3],
    [3, 10],
    [0, 10],
  ];
  expect(
    polygonContains(concave, [
      [1, 8],
      [9, 8],
      [9, 9],
      [1, 9],
    ]),
  ).toBe(false);
  expect(
    polygonContains(concave, [
      [0, 0],
      [3, 0],
      [3, 3],
      [0, 3],
    ]),
  ).toBe(true);
});
test('shared walls are not overlaps, enclosed footprints are', () => {
  expect(
    polygonsOverlap(
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      [
        [2, 0],
        [4, 0],
        [4, 2],
        [2, 2],
      ],
    ),
  ).toBe(false);
  expect(
    polygonsOverlap(
      [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
      ],
      [
        [1, 1],
        [2, 1],
        [2, 2],
        [1, 2],
      ],
    ),
  ).toBe(true);
});
