import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../reference/photos/', import.meta.url);
const plan = JSON.parse(
  await readFile(new URL('collection-plan.json', root), 'utf8'),
);
const browser = await chromium.launch();
const page = await browser.newPage();
const userAgent = await page.evaluate(() => navigator.userAgent);
let stopped;
let count = 0;
let lastRequest = 0;
const coverage = [];
try {
  for (const location of plan) {
    const directory = new URL(`${location.id}/`, root);
    await mkdir(directory, { recursive: true });
    const images = [];
    for (const scene of location.scenes) {
      if (stopped) break;
      try {
        // Only the small, observed thumbnail URL. Never request panorama tiles.
        const url = new URL(scene.thumbnailSource);
        if (
          url.hostname !== 'tours.panoraproperties.com' ||
          !url.pathname.endsWith('_t.jpg')
        )
          throw new Error('Unexpected preview URL; refusing download');
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, 1100 - (Date.now() - lastRequest))),
        );
        lastRequest = Date.now();
        const response = await page.request.get(url.href, {
          timeout: 20000,
          headers: { 'user-agent': userAgent },
        });
        if (!response.ok())
          throw new Error(`HTTP ${response.status()} at ${url.href}`);
        if (!response.headers()['content-type']?.startsWith('image/'))
          throw new Error(`Non-image response at ${url.href}`);
        const file = `${scene.id}.jpg`;
        await writeFile(new URL(file, directory), await response.body());
        images.push({
          file,
          source: url.href,
          license: 'unknown',
          shows: scene.title,
          usable_for_textures: false,
          kind: 'low_resolution_tour_preview',
        });
        count += 1;
        if (count % 10 === 0)
          console.log(`Saved ${count} private reference previews.`);
      } catch (error) {
        stopped = String(error);
        await writeFile(
          new URL('BLOCKED.md', root),
          `# Reference collection stopped\n\n2026-10-25: ${stopped}\n\nNo alternate routes attempted. Partial manifests and coverage record completed downloads only. Owner photos needed.\n`,
        );
      }
    }
    const notes = images.length
      ? 'Low-resolution tour previews only; not sufficient for detailed facade/material/signage reference. Owner should supply 5–10 useful original photographs, including both corridor directions and details. No texture rights assumed.'
      : 'No uniquely mapped usable reference image available. Owner should supply 5–10 photographs; ambiguous tour labels were not assigned to numbered rooms.';
    await writeFile(
      new URL('manifest.json', directory),
      JSON.stringify(
        {
          location: location.id,
          images,
          useful_detail_images: 0,
          needs_owner_photo: true,
          notes,
        },
        null,
        2,
      ),
    );
    coverage.push({ ...location, previewCount: images.length });
  }
} finally {
  await browser.close();
}
await writeFile(
  new URL('COVERAGE.md', root),
  `# Reference coverage — 2026-10-25\n\n${count} low-resolution tour thumbnail previews collected from the observed tour config, privately, at no more than one request per 1.1 seconds. No panorama tiles, external search scraping, or shipped assets. Only reference/maps/student-map.png existed before collection.\n\nThumbnails help identify views but are not counted as useful detail photographs. All ${coverage.length} locations need owner photos (5–10 each). Every row has a manifest with source URLs, unknown license, usable_for_textures: false, and needs_owner_photo: true. A block-level preview does not establish individual room coverage.\n\n${stopped ? `Collection stopped: ${stopped}` : 'Collection completed without an access block. No owner photo collection was available.'}\n\n| Location | Name | Useful detail photos | Tour previews | needs_owner_photo |\n| --- | --- | --- | --- | --- |\n${coverage.map((location) => `| ${location.id} | ${location.name.replaceAll('|', '\\|')} | 0 | ${location.previewCount} | true |`).join('\n')}\n\n## Owner shot list\n\nAll locations above require photos. For blocks: each facade, entrance, sign, brick/marble/window details; floor corridors in both directions, stair/lift positions and signs. For numbered rooms: readable room plate, interior looking both ways. For Library: halls, shelves, issue desk, conference/research rooms. For outdoors: named gate signs and approach, paths, courts, lawns, cafes, shops and Masjid. Confirm unmapped tour scenes before filing their images under numbered rooms.\n`,
);
console.log(
  `Reference collection complete: ${count} private previews; ${coverage.length} location manifests; ${stopped ? 'blocked/partial' : 'no access block'}.`,
);
