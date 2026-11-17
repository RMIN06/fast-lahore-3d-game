import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const viewer = 'https://tours.panoraproperties.com/FAST-LHR/index.htm';
const directory = new URL('../reference/tour/', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const userAgent = await page.evaluate(() => navigator.userAgent);
const records = [];
let lastRequest = 0;
let queue = Promise.resolve();

try {
  // One request per second, including subresources. Avoid panorama/image downloads.
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).hostname !== new URL(viewer).hostname) {
      await route.abort();
      return;
    }
    if (['image', 'media', 'font'].includes(route.request().resourceType())) {
      await route.abort();
      return;
    }
    queue = queue.then(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 1100 - (Date.now() - lastRequest))),
      );
      lastRequest = Date.now();
      await route.continue();
    });
    await queue;
  });
  const robotsUrl = new URL('/robots.txt', viewer).href;
  const robots = await page.request.get(robotsUrl, {
    timeout: 25000,
    headers: { 'user-agent': userAgent },
  });
  records.push({ url: robotsUrl, status: robots.status() });
  if (![200, 404].includes(robots.status()))
    throw new Error(
      `robots.txt returned HTTP ${robots.status()}; stopping conservatively.`,
    );
  if (robots.status() === 200) {
    const body = await robots.text();
    await writeFile(new URL('robots.txt', directory), body);
    // A nonempty rules file requires review before crawling; do not guess permissions.
    if (/^\s*(disallow|crawl-delay)\s*:\s*\S/im.test(body)) {
      throw new Error(
        'robots.txt contains crawl restrictions; saved for review. No tour requests made.',
      );
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1100));
  page.on('response', (response) =>
    records.push({ url: response.url(), status: response.status() }),
  );
  const response = await page.goto(viewer, {
    waitUntil: 'domcontentloaded',
    timeout: 25000,
  });
  if (!response?.ok())
    throw new Error(
      `Viewer returned HTTP ${response?.status() ?? 'no response'}.`,
    );
  await writeFile(new URL('viewer.html', directory), await page.content());
  await writeFile(
    new URL('discovery.json', directory),
    JSON.stringify({ viewer, records, title: await page.title() }, null, 2),
  );
  console.log(
    'Viewer reachable; initial HTML and network discovery saved for config inspection.',
  );
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  const report = `# TOUR_RECON blocked report\n\nDate: 2026-10-25 (Asia/Karachi).\n\nViewer: ${viewer}\n\nAttempted headless Chromium access, checking the same host's robots.txt first with the browser user agent. Maximum request rate: one per 1.1 seconds; no panoramas downloaded.\n\nBlocked: ${reason}\n\nRequests recorded: ${JSON.stringify(records)}\n\nStopped tour recon. No alternate host, proxy, mirror, or network workaround was attempted. No scene count, topology, or campus facts can be inferred. Owner action: export the tour scene titles, IDs, links/config, and permitted reference screenshots manually into reference/tour/.\n`;
  await writeFile(new URL('BLOCKED.md', directory), report);
  console.log(report);
} finally {
  await browser.close();
}
