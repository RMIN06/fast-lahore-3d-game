import { chromium } from '@playwright/test';
import { readFile, readdir, writeFile } from 'node:fs/promises';

const root = new URL('../reference/photos/', import.meta.url);
const entries = await readdir(root, { withFileTypes: true });
const panels = [];
for (const entry of entries.filter((entry) => entry.isDirectory())) {
  const directory = new URL(`${entry.name}/`, root);
  const manifest = JSON.parse(
    await readFile(new URL('manifest.json', directory), 'utf8'),
  );
  for (const image of manifest.images) {
    const data = (await readFile(new URL(image.file, directory))).toString(
      'base64',
    );
    const caption = `${entry.name}: ${image.shows}`
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;');
    panels.push(
      `<figure><img src="data:image/jpeg;base64,${data}"><figcaption>${caption}</figcaption></figure>`,
    );
  }
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  const html = `<html><head><style>body{margin:12px;background:#222;color:white;font:11px Arial;display:grid;grid-template-columns:repeat(6,1fr);gap:8px}figure{margin:0}img{width:100%;height:105px;object-fit:contain;background:#111}figcaption{min-height:30px}</style></head><body>${panels.join('')}</body></html>`;
  await writeFile(new URL('contact-sheet.html', root), html);
  await page.setContent(html);
  await page
    .locator('img')
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode())),
    );
  await page.screenshot({
    path: new URL('contact-sheet.png', root).pathname.replace(
      /^\/([A-Za-z]:)/,
      '$1',
    ),
    fullPage: true,
  });
  console.log(`Contact sheet: ${panels.length} private previews.`);
} finally {
  await browser.close();
}
