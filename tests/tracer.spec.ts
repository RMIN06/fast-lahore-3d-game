import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function clickPixel(page: Page, point: [number, number]) {
  const screen = await page
    .getByTestId('trace-surface')
    .evaluate((element, p) => {
      const matrix = (element as SVGSVGElement).getScreenCTM()!;
      const result = new DOMPoint(p[0], p[1]).matrixTransform(matrix);
      return { x: result.x, y: result.y };
    }, point);
  await page.mouse.click(screen.x, screen.y);
}

test('tracer calibrates, edits, previews and exports a draft without shipping private imagery', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/dev/tracer');
  await expect(
    page.getByRole('heading', { name: 'Campus site-plan tracer' }),
  ).toBeVisible();
  for (const id of ['A', 'B', 'C', 'D', 'E', 'F'])
    await expect(page.getByTestId(`schematic-${id}`)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Export campus.json', exact: true }),
  ).toBeDisabled();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#263d48';
    ctx.fillRect(0, 0, 1000, 800);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('Reference image', { exact: true }).setInputFiles({
    name: 'synthetic-not-campus.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(page.getByRole('status')).toContainText('Mark Gate-5');
  await clickPixel(page, [100, 100]);
  await page
    .getByLabel('Source / measurement citation')
    .fill('Synthetic test source only');
  await page.getByLabel(/Source has a reliable metric scale/).check();
  for (const [index, points] of [
    [
      [400, 150],
      [500, 150],
    ],
    [
      [400, 200],
      [400, 300],
    ],
  ].entries()) {
    await page
      .getByRole('button', { name: 'Pick reference endpoints' })
      .click();
    for (const point of points)
      await clickPixel(page, point as [number, number]);
    await page
      .getByLabel('Reference distance (m)', { exact: true })
      .fill('100');
    await page
      .getByLabel('Reference label', { exact: true })
      .fill(`Synthetic ruler ${index + 1}`);
    await page.getByRole('button', { name: 'Add distance reference' }).click();
  }
  await page.getByRole('button', { name: 'Fit metric scale' }).click();
  await expect(page.getByTestId('calibration-status')).toContainText(
    '1.0000 m/px',
  );
  for (const point of [
    [100, 100],
    [353, 100],
    [353, 300],
    [100, 300],
  ])
    await clickPixel(page, point as [number, number]);
  await page.getByRole('button', { name: 'Apply trace', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'Applied Campus boundary',
  );
  await expect(page.getByTestId('site-plan-status')).toContainText(
    '50600.0 m²',
  );
  await page.getByRole('button', { name: 'World plan', exact: true }).click();
  await expect(page.getByTestId('shape-boundary')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Export campus.json', exact: true }),
  ).toBeDisabled();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export draft', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('campus.draft.json');
  const parsed = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(parsed.boundary.confidence).toBe('placeholder');
  expect(parsed.meta.calibration.refs).toHaveLength(2);
  await page.screenshot({ path: 'test-results/m2-tracer-world.png' });
  await page.getByRole('button', { name: 'Undo applied trace' }).click();
  await expect(page.getByTestId('site-plan-status')).toContainText(
    'Boundary not traced',
  );
  await page.getByRole('button', { name: 'Schematic', exact: true }).click();
  await page.screenshot({ path: 'test-results/m2-tracer-schematic.png' });
  expect(errors).toEqual([]);
});
