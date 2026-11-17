import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const directory = new URL('../reference/osm/', import.meta.url);
const data = JSON.parse(
  await readFile(new URL('area.raw.json', directory), 'utf8'),
);
const nodes = new Map(
  data.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]),
);
const boundary = data.elements.find(
  (e) => e.type === 'way' && e.id === 323166057,
);
const origin = nodes.get(boundary.nodes[0]);
const point = (n) => [
  (n.lon - origin.lon) * 111195.08 * Math.cos((origin.lat * Math.PI) / 180),
  -(n.lat - origin.lat) * 111195.08,
];
const boundaryPoints = boundary.nodes.map((id) => point(nodes.get(id)));
const minX = Math.min(...boundaryPoints.map((p) => p[0])) - 25,
  minY = Math.min(...boundaryPoints.map((p) => p[1])) - 25;
const width = Math.max(...boundaryPoints.map((p) => p[0])) - minX + 25,
  height = Math.max(...boundaryPoints.map((p) => p[1])) - minY + 25;
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const ways = data.elements.filter(
  (e) =>
    e.type === 'way' &&
    e.id !== boundary.id &&
    (e.tags?.building || e.tags?.area || e.tags?.leisure),
);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1100" viewBox="${minX} ${minY} ${width} ${height}"><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#111a20"/><polygon points="${boundaryPoints.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#dfbb54" stroke-width="1"/>${ways
  .map((w) => {
    const p = w.nodes.map((id) => point(nodes.get(id)));
    const x = p.reduce((s, q) => s + q[0], 0) / p.length,
      y = p.reduce((s, q) => s + q[1], 0) / p.length;
    return `<polygon points="${p.map((q) => q.join(',')).join(' ')}" fill="${w.tags.building ? '#366a80' : '#305846'}" stroke="#c2d3dc" stroke-width="0.5"/><text x="${x}" y="${y}" text-anchor="middle" fill="white" font-size="4">${escape(w.tags['name:en'] ?? w.tags.name ?? w.tags.amenity ?? 'unnamed')} (${w.id})</text>`;
  })
  .join(
    '',
  )}<text x="${minX + 5}" y="${minY + 10}" font-size="7" fill="white">OSM source review · north ↑ · 42,482 m² · not accepted geometry</text></svg>`;
await writeFile(new URL('site-plan.svg', directory), svg);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1100 },
  });
  await page.setContent(
    `<img style="width:100%;height:100%;margin:0" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`,
  );
  await page.locator('img').evaluate((image) => image.decode());
  await page.screenshot({
    path: fileURLToPath(new URL('site-plan.png', directory)),
  });
} finally {
  await browser.close();
}
