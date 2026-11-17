import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const directory = new URL('reference/tour/', root);
const objects = JSON.parse(
  await readFile(new URL('objects.json', directory), 'utf8'),
);
const seed = JSON.parse(
  await readFile(new URL('data/campus.seed.json', root), 'utf8'),
);
const byId = new Map(objects.map((object) => [object.id, object]));
const panoramas = objects.filter((object) => object.class === 'Panorama');
const sceneIds = new Set(panoramas.map((scene) => scene.id));
const dereference = (value) =>
  typeof value === 'string' && value.startsWith('this.')
    ? byId.get(value.slice(5))
    : value;

function matchEntity(title) {
  if (
    /^(Block A\b|A Block\b|Admin Block\b|Administrative Block\b)/i.test(title)
  )
    return ['A', 'Explicit block label; room/floor not assigned'];
  if (/^Civil Engineering Block/i.test(title))
    return ['B', 'Explicit department block label'];
  if (/^Block C\b/i.test(title)) return ['C', 'Explicit block label'];
  if (/^(Block D\b|Electrical Engineering Block\b)/i.test(title))
    return ['D', 'Explicit block/department label'];
  if (title === 'FAST School of Management')
    return ['D', 'Department match from seed; precise floor not inferred'];
  if (/^Library\b/i.test(title))
    return [
      'E',
      'Library block only; existing placeholder hall is not evidence for room/floor mapping',
    ];
  if (
    /^(Block F\b|New Academic Building\b|Incubation Centre — Block F)/i.test(
      title,
    )
  )
    return ['F', 'Explicit block label; unnumbered rooms not assigned'];
  const exact = new Map([
    ['Badminton Court', 'badminton'],
    ['Basketball Court', 'basketball'],
    ['Cricket Ground', 'cricket-ground'],
    ['Cricket Ground — Entrance', 'cricket-ground'],
    ['Futsal Field', 'futsal'],
    ['Campus Medical Centre', 'C-G-MEDICAL'],
    ['Main Auditorium', 'C-G-AUDITORIUM'],
    ['Main Auditorium — Interior', 'C-G-AUDITORIUM'],
    ['Campus Photocopy & Print Shop', 'book-photocopy'],
    ['Girls Common Room', 'B-G-GIRLSCOMMON'],
    ['Outside Academic Office', 'F-1-ACADEMICOFFICE'],
    ['Embedded Systems Laboratory', 'D-1-EMBEDDEDLAB'],
  ]);
  if (exact.has(title))
    return [
      exact.get(title),
      'Named facility match to seed; position remains unverified',
    ];
  if (title === 'Campus Gate 2')
    return [
      'G2',
      'New tour-named gate; no position, heading, or identity with existing gates inferred',
    ];
  return [
    null,
    'NEW / unresolved: title does not establish a unique seed entity',
  ];
}

function outgoing(scene) {
  const targets = new Set(
    (scene.adjacentPanoramas ?? []).map((adjacent) =>
      adjacent.panorama.replace('this.', ''),
    ),
  );
  const visited = new Set();
  function inspect(value) {
    if (typeof value === 'string') {
      if (value.startsWith('this.') && byId.has(value.slice(5))) {
        if (visited.has(value)) return;
        visited.add(value);
        inspect(dereference(value));
      }
      for (const match of value.matchAll(
        /setPlayListSelectedIndex\(this\.(\w+),\s*(\d+)\)/g,
      )) {
        const item = dereference(byId.get(match[1])?.items?.[Number(match[2])]);
        if (item?.media) targets.add(item.media.replace('this.', ''));
      }
      return;
    }
    if (Array.isArray(value)) value.forEach(inspect);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(inspect);
  }
  inspect(scene.overlays ?? []);
  targets.delete(scene.id);
  for (const target of targets)
    if (!sceneIds.has(target))
      throw new Error(`Dangling tour edge ${scene.id} -> ${target}`);
  return [...targets].sort();
}
const scenes = panoramas.map((scene) => {
  const [entity, evidence] = matchEntity(scene.label);
  if (!scene.label) throw new Error(`Missing scene title ${scene.id}`);
  return {
    id: scene.id,
    title: scene.label,
    outgoing: outgoing(scene),
    entity,
    status: entity ? 'MAPPED' : 'NEW',
    evidence,
    thumbnailSource: new URL(
      scene.thumbnailUrl,
      'https://tours.panoraproperties.com/FAST-LHR/',
    ).href,
  };
});
const edges = scenes.flatMap((scene) =>
  scene.outgoing.map((target) => [scene.id, target]),
);
await writeFile(
  new URL('tour_graph.json', directory),
  JSON.stringify(
    {
      source: 'https://tours.panoraproperties.com/FAST-LHR/index.htm',
      captured: '2026-10-25',
      method:
        'Literal config AST plus locale labels; adjacency and hotspot playlist actions, without executing downloaded scripts',
      scenes,
      edges,
    },
    null,
    2,
  ),
);

const gateScene = scenes.find((scene) => scene.entity === 'G2');
if (gateScene && !seed.gates.some((gate) => gate.id === 'G2')) {
  seed.gates.push({
    id: 'G2',
    label: gateScene.title,
    position: null,
    confidence: 'estimated',
    source: 'tour',
    notes: `Tour scene ${gateScene.id}. Named gate only; location, heading, relation to map gates and access policy unconfirmed.`,
  });
  // Insertion only: preserve every pre-existing byte instead of rewriting map-derived entries.
  const original = await readFile(
    new URL('data/campus.seed.json', root),
    'utf8',
  );
  const addition = JSON.stringify(seed.gates.at(-1), null, 2)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  const updated = original.replace(
    /\r?\n {2}\],\r?\n {2}"buildings":/,
    `,\n${addition}\n  ],\n  "buildings":`,
  );
  if (updated === original)
    throw new Error(
      'Seed insertion location not found; refusing broad rewrite',
    );
  await writeFile(new URL('data/campus.seed.json', root), updated);
}
const entities = [
  ...seed.buildings.map((b) => ({ id: b.id, name: b.label })),
  ...seed.gates.map((g) => ({ id: g.id, name: g.label })),
  ...seed.areas.map((a) => ({ id: a.id, name: a.label })),
  ...seed.buildings.flatMap((b) =>
    b.floors.flatMap((f) => f.spaces.map((s) => ({ id: s.id, name: s.name }))),
  ),
];
const mapped = new Set(scenes.filter((s) => s.entity).map((s) => s.entity));
const escape = (value) => String(value).replaceAll('|', '\\|');
const locationLines = scenes.map(
  (scene) =>
    `| ${scene.id} | ${escape(scene.title)} | ${scene.entity ?? 'NEW'} | ${scene.evidence} |`,
);
const uncovered = entities.filter((entity) => !mapped.has(entity.id));
await writeFile(
  new URL('locations.md', directory),
  `# Panora scene inventory — 2026-10-25\n\n${scenes.length} scenes; ${edges.length} directed links; ${mapped.size} distinct seed entities mapped; ${scenes.filter((s) => !s.entity).length} scenes marked NEW/unresolved. All links resolve. Scene labels are tour assertions, not measured geometry. No tour distances or orientation were copied to world coordinates.\n\nMappings to a block do not verify individual rooms or floors. NEW includes ambiguous matches, not only newly discovered facilities.\n\n| Scene ID | Tour title (verbatim) | Entity | Evidence / limits |\n| --- | --- | --- | --- |\n${locationLines.join('\n')}\n\n## Seed entities with no uniquely mapped scene\n\n| Entity | Name | Status |\n| --- | --- | --- |\n${uncovered.map((entity) => `| ${entity.id} | ${escape(entity.name)} | UNCOVERED |`).join('\n')}\n\n## Conflicts and follow-up\n\n- Block A labels mention basement and first floor, absent from the ground-only seed. Confirm floor identity and count before adding geometry.\n- Library labels mention first floor, research rooms and conference rooms; the seed has a placeholder single hall. Confirm plans before replacing it.\n- Gate 2 was added as a named, estimated, unlocated tour entity. Do not equate it with Gate-3 or Gate-5.\n- Gym, Love Garden, fountain plaza, examination hall, unnamed basements and laboratories require owner mapping. No coordinates or numbered-room matches were guessed.\n- All six blocks have explicit block/department-labelled scenes. Management is named; Electrical and Civil are explicit. CS numbered labs/rooms remain largely uncovered.\n- Prioritize Library study halls, A/F corridors, department entrances, medical centre, courts and photocopy shop as visual references. Thumbnails are only reference previews; owner photos remain necessary for facade details and interiors.\n`,
);
await mkdir(new URL('reference/photos/', root), { recursive: true });
const plan = entities.map((entity) => ({
  ...entity,
  scenes: scenes.filter((scene) => scene.entity === entity.id).slice(0, 8),
}));
await writeFile(
  new URL('reference/photos/collection-plan.json', root),
  JSON.stringify(plan, null, 2),
);
console.log(
  JSON.stringify({
    scenes: scenes.length,
    edges: edges.length,
    mappedEntities: mapped.size,
    unresolvedScenes: scenes.filter((s) => !s.entity).length,
    uncoveredEntities: uncovered.length,
    plannedThumbnails: plan.reduce(
      (sum, entity) => sum + entity.scenes.length,
      0,
    ),
  }),
);
