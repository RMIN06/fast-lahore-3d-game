import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const directory = new URL('../reference/tour/', import.meta.url);
const discovery = JSON.parse(
  await readFile(new URL('discovery.json', directory), 'utf8'),
);
const browser = await chromium.launch();
const page = await browser.newPage();
const userAgent = await page.evaluate(() => navigator.userAgent);
try {
  const requests = process.argv.includes('--device')
    ? [['/script_general.js', 'config.general.raw.js']]
    : [
        ['/script.js', 'config.raw.js'],
        ['/locale/en.txt', 'locale.raw.txt'],
      ];
  for (const [suffix, output] of requests) {
    const record =
      discovery.records.find((record) =>
        new URL(record.url).pathname.endsWith(suffix),
      ) ??
      (suffix === '/script_general.js'
        ? { url: new URL('script_general.js', discovery.viewer).href }
        : undefined);
    if (!record) throw new Error(`Config URL not observed: ${suffix}`);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const response = await page.request.get(record.url, {
      timeout: 25000,
      headers: { 'user-agent': userAgent },
    });
    if (!response.ok())
      throw new Error(`${record.url}: HTTP ${response.status()}`);
    await writeFile(new URL(output, directory), await response.body());
    console.log(`${output}: ${response.status()}`);
  }
} catch (error) {
  await writeFile(
    new URL('BLOCKED.md', directory),
    `# TOUR_RECON blocked during config inspection\n\n2026-10-25. ${String(error)}\n\nStopped without alternate routes. Owner: export scene titles, IDs, and links manually.\n`,
  );
  console.error(String(error));
} finally {
  await browser.close();
}
