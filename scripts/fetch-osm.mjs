import { mkdir, writeFile } from 'node:fs/promises';

const directory = new URL('../reference/osm/', import.meta.url);
await mkdir(directory, { recursive: true });
const source = 'https://api.openstreetmap.org/api/0.6/way/323166057/full.json';
try {
  const response = await fetch(source, {
    headers: {
      'User-Agent': 'FAST-Lahore-Campus-Game development reference study',
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`OSM campus way: HTTP ${response.status}`);
  const wayData = await response.json();
  await writeFile(
    new URL('campus-way.raw.json', directory),
    JSON.stringify(wayData, null, 2),
  );
  const nodes = wayData.elements.filter((element) => element.type === 'node');
  const margin = 0.0003;
  const bbox = [
    Math.min(...nodes.map((node) => node.lon)) - margin,
    Math.min(...nodes.map((node) => node.lat)) - margin,
    Math.max(...nodes.map((node) => node.lon)) + margin,
    Math.max(...nodes.map((node) => node.lat)) + margin,
  ];
  const areaSource = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox.join(',')}`;
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const area = await fetch(areaSource, {
    headers: {
      'User-Agent': 'FAST-Lahore-Campus-Game development reference study',
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!area.ok) throw new Error(`OSM area: HTTP ${area.status}`);
  const data = await area.json();
  await writeFile(
    new URL('area.raw.json', directory),
    JSON.stringify(data, null, 2),
  );
  await writeFile(
    new URL('SOURCES.json', directory),
    JSON.stringify(
      {
        date: '2026-10-25',
        sources: [source, areaSource],
        license: 'ODbL 1.0',
        attribution: '© OpenStreetMap contributors',
      },
      null,
      2,
    ),
  );
  console.log(
    'Campus way:',
    wayData.elements.find((element) => element.type === 'way')?.tags,
  );
  console.log('Elements:', data.elements.length);
  console.log(
    'Named/building ways:',
    data.elements
      .filter(
        (element) =>
          element.type === 'way' &&
          (element.tags?.building || element.tags?.name),
      )
      .map((element) => ({ id: element.id, tags: element.tags })),
  );
} catch (error) {
  await writeFile(
    new URL('BLOCKED.md', directory),
    `# OSM reference access blocked\n\n2026-10-25. ${String(error)}\n\nNo source geometry has been accepted. A scaled satellite capture or owner measurements are needed.\n`,
  );
  console.log(String(error));
}
