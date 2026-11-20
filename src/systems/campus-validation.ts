import { campusSchema } from '../world/campus-schema';
import type { Campus, Vec2 } from '../types/campus';
import {
  polygonArea,
  polygonContains,
  polygonProblem,
  polygonsOverlap,
} from './polygon-validation';

export const BOUNDARY_AREA_MIN = 0.8;
export const BOUNDARY_AREA_MAX = 1.2;

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}
export interface ValidationOptions {
  mode?: 'seed' | 'site-plan' | 'curated';
  referenceDocuments?: Record<string, unknown>;
}
export interface CampusValidation {
  campus?: Campus;
  issues: ValidationIssue[];
}

export function validateCampus(
  input: unknown,
  options: ValidationOptions = {},
): CampusValidation {
  const issues: ValidationIssue[] = [];
  const report = (
    code: string,
    path: string,
    message: string,
    severity: ValidationIssue['severity'] = 'error',
  ) => {
    issues.push({ code, path, message, severity });
  };
  const missing = (path: string, message: string) =>
    report(
      'incomplete',
      path,
      message,
      options.mode === 'curated' ||
        (options.mode === 'site-plan' &&
          /^(boundary\.|gates\.|areas\.|buildings\.\d+\.footprint)/.test(path))
        ? 'error'
        : 'warning',
    );
  const parsed = campusSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      report('schema', issue.path.join('.') || '$', issue.message);
    return { issues };
  }
  const campus = parsed.data;
  if (options.mode === 'site-plan') {
    if (
      !campus.meta.calibration?.metersPerPixel ||
      campus.meta.calibration.refs.length < 2 ||
      campus.meta.calibration.residualPct === undefined
    ) {
      report(
        'calibration',
        'meta.calibration',
        'A metric scale, at least two documented distance references, and residual error are required for M2',
      );
    }
  }
  const ids = new Map<string, string>();
  const register = (id: string, path: string, table = ids) => {
    const previous = table.get(id);
    if (previous)
      report(
        'duplicate-id',
        path,
        `Duplicate ID "${id}" (first at ${previous})`,
      );
    else table.set(id, path);
  };
  const unique = (
    items: { id: string }[],
    path: string,
    table?: Map<string, string>,
  ) =>
    items.forEach((item, index) =>
      register(item.id, `${path}.${index}.id`, table),
    );
  unique(campus.gates, 'gates');
  unique(campus.buildings, 'buildings');
  unique(campus.areas, 'areas');
  unique(campus.departments, 'departments');
  unique(campus.anchors, 'anchors');
  campus.buildings.forEach((building, bi) => {
    const path = `buildings.${bi}`;
    unique(building.entries, `${path}.entries`, new Map());
    unique(building.floors, `${path}.floors`, new Map());
    const levels = new Set<number>();
    building.floors.forEach((floor, fi) => {
      if (levels.has(floor.level))
        report(
          'duplicate-level',
          `${path}.floors.${fi}.level`,
          'Floor levels must be unique within a building',
        );
      levels.add(floor.level);
      unique(floor.spaces, `${path}.floors.${fi}.spaces`);
      unique(floor.connectors, `${path}.floors.${fi}.connectors`, new Map());
    });
  });
  const reference = (
    id: string,
    path: string,
    allowed: Set<string> = new Set(ids.keys()),
  ) => {
    if (!allowed.has(id))
      report('reference', path, `Unresolved reference "${id}"`);
  };
  const buildingIds = new Set(campus.buildings.map((b) => b.id));
  reference(
    campus.meta.origin,
    'meta.origin',
    new Set(campus.gates.map((gate) => gate.id)),
  );
  if (campus.meta.mapToWorld) {
    reference(
      campus.meta.mapToWorld.originGate,
      'meta.mapToWorld.originGate',
      new Set(campus.gates.map((gate) => gate.id)),
    );
    if (campus.meta.mapToWorld.originGate !== campus.meta.origin)
      report('origin', 'meta.mapToWorld.originGate', 'Must match meta.origin');
  }
  const origin = campus.gates.find((gate) => gate.id === campus.meta.origin);
  if (origin?.position && origin.position.some((value) => value !== 0))
    report('origin', 'meta.origin', 'Origin gate must be at [0, 0]');
  campus.departments.forEach((department, i) => {
    department.buildingIds.forEach((id, j) =>
      reference(id, `departments.${i}.buildingIds.${j}`, buildingIds),
    );
    reference(
      department.spawnAnchor,
      `departments.${i}.spawnAnchor`,
      new Set(
        campus.anchors
          .filter((anchor) => anchor.kind === 'spawn')
          .map((anchor) => anchor.id),
      ),
    );
  });
  campus.anchors.forEach((anchor, i) => {
    anchor.refs?.forEach((id, j) => reference(id, `anchors.${i}.refs.${j}`));
    if (!anchor.position)
      missing(`anchors.${i}.position`, 'Unresolved anchor position');
  });
  campus.gates.forEach((gate, i) => {
    if (!gate.position)
      missing(`gates.${i}.position`, 'Unresolved gate position');
    if (gate.heading === undefined)
      missing(`gates.${i}.heading`, 'Unresolved gate heading');
  });
  // Every explicit reference key is checked recursively, including nested task steps / NPC schedules.
  // This is a reference audit, not a premature task/NPC behavior schema.
  const referenceCollections: [string, { id: string }[]][] = [
    ['building', campus.buildings],
    [
      'room',
      campus.buildings.flatMap((b) => b.floors.flatMap((f) => f.spaces)),
    ],
    ['department', campus.departments],
    ['anchor', campus.anchors],
  ];
  const referenceKeys = new Map<string, Set<string> | undefined>([
    ['refs', undefined],
    ['location', undefined],
    ['locations', undefined],
    ...['anchor', 'locationAnchor', 'spawnAnchor', 'targetAnchor'].flatMap(
      (key): [string, Set<string>][] => [
        [key, new Set(campus.anchors.map((a) => a.id))],
        [`${key}s`, new Set(campus.anchors.map((a) => a.id))],
      ],
    ),
    ...referenceCollections.flatMap(
      ([kind, entities]): [string, Set<string>][] => {
        const set = new Set(entities.map((entity) => entity.id));
        return [
          [`${kind}Id`, set],
          [`${kind}Ids`, set],
        ];
      },
    ),
  ]);
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}.${i}`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (referenceKeys.has(key)) {
        const values: unknown[] = Array.isArray(child) ? child : [child];
        values.forEach((id, i) => {
          if (typeof id === 'string')
            reference(
              id,
              Array.isArray(child) ? `${childPath}.${i}` : childPath,
              referenceKeys.get(key),
            );
          else if (!(
            id &&
            typeof id === 'object' &&
            ['location', 'locations'].includes(key)
          ))
            report(
              'schema',
              childPath,
              'Expected a campus ID string or array of IDs',
            );
        });
      }
      walk(child, childPath);
    }
  };
  for (const [name, document] of Object.entries(
    options.referenceDocuments ?? {},
  )) {
    if (!Array.isArray(document)) {
      report('schema', name, 'Expected an array of reference-bearing records');
      continue;
    }
    const documentIds = new Map<string, string>();
    document.forEach((item: unknown, i) => {
      if (
        !item ||
        typeof item !== 'object' ||
        !('id' in item) ||
        typeof item.id !== 'string' ||
        !item.id.trim()
      )
        report('schema', `${name}.${i}.id`, 'Expected a nonempty record ID');
      else register(item.id, `${name}.${i}.id`, documentIds);
    });
    walk(document, name);
  }
  const goodPolygons = new Set<Vec2[]>();
  const polygon = (points: Vec2[] | null | undefined, path: string) => {
    if (!points) {
      missing(path, 'Unresolved polygon');
      return;
    }
    const problem = polygonProblem(points);
    if (problem) report('polygon', path, problem);
    else goodPolygons.add(points);
  };
  polygon(campus.boundary.polygon, 'boundary.polygon');
  if (campus.boundary.polygon && goodPolygons.has(campus.boundary.polygon)) {
    const area = polygonArea(campus.boundary.polygon);
    // Calibration sanity band. The walled campus measures ~10.5 acres against the
    // published 12.5 acres, so the band is ±20% (see docs/DECISIONS.md, M2).
    const expected = 12.5 * 4046.8564224;
    if (
      area < expected * BOUNDARY_AREA_MIN ||
      area > expected * BOUNDARY_AREA_MAX
    )
      report(
        'boundary-area',
        'boundary.polygon',
        `Area ${area.toFixed(2)} m² is outside 12.5 acres ±20%`,
      );
  }
  campus.areas.forEach((area, i) =>
    polygon(area.polygon, `areas.${i}.polygon`),
  );
  campus.buildings.forEach((building, bi) => {
    const path = `buildings.${bi}`;
    polygon(building.footprint, `${path}.footprint`);
    const floors = new Set(building.floors.map((floor) => floor.id));
    building.entries.forEach((entry, ei) => {
      reference(entry.floor, `${path}.entries.${ei}.floor`, floors);
      if (!entry.position)
        missing(`${path}.entries.${ei}.position`, 'Unresolved entry position');
    });
    building.floors.forEach((floor, fi) => {
      const floorPath = `${path}.floors.${fi}`;
      floor.connectors.forEach((connector, ci) => {
        const connectorPath = `${floorPath}.connectors.${ci}`;
        connector.connects.forEach((id, i) =>
          reference(id, `${connectorPath}.connects.${i}`, floors),
        );
        if (!connector.connects.includes(floor.id))
          report(
            'connector',
            `${connectorPath}.connects`,
            'Connector must include its own floor',
          );
        if (!connector.position)
          missing(`${connectorPath}.position`, 'Unresolved connector position');
      });
      floor.spaces.forEach((space, si) => {
        const spacePath = `${floorPath}.spaces.${si}.polygon`;
        polygon(space.polygon, spacePath);
        if (space.polygon && goodPolygons.has(space.polygon)) {
          if (building.footprint && goodPolygons.has(building.footprint)) {
            if (!polygonContains(building.footprint, space.polygon))
              report(
                'space-outside',
                spacePath,
                'Space extends outside its building footprint',
              );
          } else
            missing(
              spacePath,
              'Cannot check space containment until its building footprint is valid',
            );
        }
      });
    });
    const ordered = [...building.floors].sort((a, b) => a.level - b.level);
    ordered.slice(1).forEach((upper, i) => {
      const lower = ordered[i]!;
      const connected = lower.connectors.some(
        (connector) =>
          connector.connects.includes(upper.id) &&
          upper.connectors.some(
            (other) =>
              other.kind === connector.kind &&
              other.connects.includes(lower.id),
          ),
      );
      if (connected) return;
      const undeveloped = [lower, upper].every(
        (floor) =>
          floor.connectors.length > 0 &&
          floor.connectors.every(
            (connector) =>
              connector.position === null &&
              connector.connects.length === 1 &&
              connector.connects[0] === floor.id,
          ),
      );
      const message = `Missing reciprocal connector between ${lower.id} and ${upper.id}`;
      if (undeveloped) missing(`${path}.floors`, message);
      else report('connector', `${path}.floors`, message);
    });
  });
  const boundary = campus.boundary.polygon;
  campus.buildings.forEach((building, i) => {
    if (!building.footprint || !goodPolygons.has(building.footprint)) return;
    if (
      boundary &&
      goodPolygons.has(boundary) &&
      !polygonContains(boundary, building.footprint)
    )
      report(
        'building-outside',
        `buildings.${i}.footprint`,
        'Building extends outside campus boundary',
      );
    campus.buildings.slice(0, i).forEach((other, j) => {
      if (
        other.footprint &&
        goodPolygons.has(other.footprint) &&
        polygonsOverlap(building.footprint!, other.footprint)
      )
        report(
          'building-overlap',
          `buildings.${i}.footprint`,
          `Overlaps buildings.${j}.footprint (${other.id})`,
        );
    });
  });
  const confidence = (value: unknown, path: string) => {
    if (Array.isArray(value))
      value.forEach((child, i) => confidence(child, `${path}.${i}`));
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        const childPath = path ? `${path}.${key}` : key;
        if (key === 'confidence' && child === 'placeholder')
          report(
            'placeholder',
            childPath,
            'Placeholder data; not a verified campus fact',
            'warning',
          );
        else confidence(child, childPath);
      }
    }
  };
  confidence(campus, '');
  return { campus, issues };
}
