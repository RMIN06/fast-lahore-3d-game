import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const minutesOf = async (page: Page) => {
  const text = (await page.getByTestId('hud-clock').textContent()) ?? '';
  const [, hh, mm] = /(\d\d):(\d\d)/.exec(text) ?? [];
  return Number(hh) * 60 + Number(mm);
};
const hide = {
  style:
    '.dev-overlay, .world-label, header, .hud-clock { visibility: hidden; }',
};

/** Mean luminance (0..1) and share of bright pixels of a canvas screenshot. */
const brightness = async (page: Page, canvas: Locator) => {
  const png = (await canvas.screenshot(hide)).toString('base64');
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0,
      bright = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const l =
        (0.2126 * pixels[i]! +
          0.7152 * pixels[i + 1]! +
          0.0722 * pixels[i + 2]!) /
        255;
      sum += l;
      if (l > 0.6) bright += 1;
    }
    const n = pixels.length / 4;
    return { mean: sum / n, bright: bright / n };
  }, png);
};

test('time panel, day/night lighting, weekday gate schedule and budget', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByTestId('player-mode')).toHaveText('first');
  await expect(page.getByTestId('hud-clock')).toHaveText(/^Mon 08:3\d$/);

  // ×1: one game minute per real second (a full day = 24 real minutes).
  const t0 = await minutesOf(page);
  await page.waitForTimeout(6000);
  const elapsed = (await minutesOf(page)) - t0;
  expect(elapsed).toBeGreaterThanOrEqual(4);
  expect(elapsed).toBeLessThanOrEqual(8);

  // T opens the panel; movement keys are inactive while it is open.
  await page.keyboard.press('KeyT');
  const panel = page.getByRole('dialog', { name: 'Time panel' });
  await expect(panel).toBeVisible();
  const before = await page.getByTestId('player-z').textContent();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  await expect(page.getByTestId('player-z')).toHaveText(before!);

  // Pause stops the clock.
  await panel.getByRole('button', { name: 'Pause' }).click();
  const paused = await minutesOf(page);
  await page.waitForTimeout(3000);
  expect(await minutesOf(page)).toBe(paused);
  await expect(page.getByTestId('hud-clock')).toBeVisible();

  // ×4 runs four game minutes per real second.
  await panel.getByRole('button', { name: '×4' }).click();
  const fast0 = await minutesOf(page);
  await page.waitForTimeout(4000);
  expect((await minutesOf(page)) - fast0).toBeGreaterThanOrEqual(10);
  await panel.getByRole('button', { name: '×1' }).click();

  // Set time and day: the Masjid-side gate opens only for Friday Jummah.
  const setTime = async (day: string, time: string) => {
    await panel.getByLabel('Day').selectOption(day);
    await panel.getByLabel('Time', { exact: true }).fill(time);
    await panel.getByRole('button', { name: 'Set time' }).click();
  };
  await setTime('Fri', '13:10');
  await expect(page.getByTestId('hud-clock')).toHaveText(/^Fri 13:1\d$/);
  await expect(page.getByTestId('gates-open')).toHaveText('G-MASJID');
  await setTime('Thu', '13:10');
  await expect(page.getByTestId('gates-open')).toHaveText('none');

  // Overview at noon (sun shadows on) vs night (lamps, windows, moonlight).
  await page.keyboard.press('KeyT');
  await expect(panel).toBeHidden();
  await page.getByRole('checkbox', { name: 'Labels' }).uncheck();
  await page.getByRole('checkbox', { name: 'Free camera (orbit)' }).check();
  await page.keyboard.press('KeyT');
  await setTime('Mon', '12:00');
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(1500);
  const canvas = page.locator('canvas');
  const noon = await brightness(page, canvas);
  const calls = Number(await page.getByTestId('draw-calls').textContent());
  expect(calls).toBeGreaterThan(10);
  expect(calls).toBeLessThanOrEqual(400);
  expect(
    Number(await page.getByTestId('triangles').textContent()),
  ).toBeLessThanOrEqual(1_500_000);
  await page.screenshot({ path: 'test-results/m5-noon.png' });

  await page.keyboard.press('KeyT');
  await setTime('Mon', '21:30');
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(1500);
  const night = await brightness(page, canvas);
  await page.screenshot({ path: 'test-results/m5-night.png' });
  expect(night.mean).toBeLessThan(noon.mean); // it really is night
  expect(night.mean).toBeGreaterThan(0.04); // but not black: readable
  expect(night.bright).toBeGreaterThan(0.0005); // lit windows and lamps

  console.log('M5 brightness', { noon, night, calls });
  expect(errors).toEqual([]);
});
