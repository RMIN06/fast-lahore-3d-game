import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const position = async (page: Page) =>
  Promise.all(
    ['x', 'y', 'z'].map(async (axis) =>
      Number(await page.getByTestId(`player-${axis}`).textContent()),
    ),
  );
const distance = (a: number[], b: number[]) =>
  Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);

test('player walks, sprints, jumps, switches camera and cannot leave through a gate', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByTestId('player-mode')).toHaveText('first');
  await expect
    .poll(async () => page.getByTestId('player-grounded').textContent())
    .toBe('true');
  await expect(page.locator('.crosshair')).toBeVisible();
  const start = await position(page);

  // Walk forward (spawn faces into campus from Gate-5).
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(300);
  const walked = await position(page);
  const walkDistance = distance(start, walked);
  expect(walkDistance).toBeGreaterThan(1.2);

  // Sprint the same time: clearly faster.
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await expect
    .poll(async () => page.getByTestId('player-sprinting').textContent())
    .toBe('true');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(300);
  const sprinted = await position(page);
  expect(distance(walked, sprinted)).toBeGreaterThan(walkDistance * 1.8);

  // Jump leaves the ground, then lands.
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await position(page))[1], { intervals: [50] })
    .toBeGreaterThan(0.2);
  await expect
    .poll(async () => page.getByTestId('player-grounded').textContent())
    .toBe('true');

  // V switches to third person instantly (capsule visible, no crosshair) and back.
  const hide = { style: '.dev-overlay, .world-label { visibility: hidden; }' };
  const canvas = page.locator('canvas');
  const firstPerson = await canvas.screenshot(hide);
  await page.keyboard.press('KeyV');
  await expect(page.getByTestId('player-mode')).toHaveText('third');
  await expect(page.locator('.crosshair')).toHaveCount(0);
  await expect
    .poll(async () => (await canvas.screenshot(hide)).equals(firstPerson))
    .toBe(false);
  await page.screenshot({ path: 'test-results/m4-third-person.png' });
  await page.keyboard.press('KeyV');
  await expect(page.getByTestId('player-mode')).toHaveText('first');

  // Sprint backwards into the closed Gate-5 for 4 s: the player stays inside.
  // Gate-5 is the origin; the inward direction is its heading (147.3°).
  const heading = (147.3 * Math.PI) / 180;
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(4000);
  await page.keyboard.up('KeyS');
  await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(300);
  const [x = NaN, , z = NaN] = await position(page);
  expect(x * Math.sin(heading) - z * Math.cos(heading)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/m4-first-person.png' });
  expect(errors).toEqual([]);
});
