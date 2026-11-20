import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startNewGame, teleport } from './helpers';

// Software-rendered WebGL in CI: a smaller viewport keeps frames fast.
test.use({ viewport: { width: 800, height: 450 } });

const count = async (page: Page, id: string) =>
  Number(await page.getByTestId(id).textContent());

async function setTime(page: Page, day: string, time: string) {
  await page.keyboard.press('KeyT');
  const panel = page.getByRole('dialog', { name: 'Time panel' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Day').selectOption(day);
  await panel.getByLabel('Time', { exact: true }).fill(time);
  await panel.getByRole('button', { name: 'Set time' }).click();
  await page.keyboard.press('KeyT');
  await expect(panel).toBeHidden();
}

test('NPCs: lunch-time peak in the cafe stays within the performance budget', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await startNewGame(page);
  await expect(page.getByTestId('npc-status')).toHaveText('ready', {
    timeout: 30_000,
  });
  await page.getByRole('checkbox', { name: 'Labels' }).uncheck();

  // Monday 12:40: students are at lunch in F block's cafe (busiest place).
  await setTime(page, 'Mon', '12:40');
  await teleport(page, 'room:F-G-CAFE');
  await expect
    .poll(() => count(page, 'npc-present'), { timeout: 20_000 })
    .toBeGreaterThan(80);
  await expect
    .poll(() => count(page, 'npc-rendered'), { timeout: 20_000 })
    .toBeGreaterThan(30);
  await page.waitForTimeout(3000);

  const present = await count(page, 'npc-present');
  const active = await count(page, 'npc-active');
  const rendered = await count(page, 'npc-rendered');
  expect(active).toBeLessThanOrEqual(60);
  expect(rendered).toBeLessThanOrEqual(60);
  expect(await count(page, 'npc-stuck')).toBe(0);
  const calls = await count(page, 'draw-calls');
  const triangles = await count(page, 'triangles');
  expect(calls).toBeGreaterThan(10);
  expect(calls).toBeLessThanOrEqual(400);
  expect(triangles).toBeLessThanOrEqual(1_500_000);
  await page.screenshot({ path: 'test-results/m9-cafe-peak.png' });

  // Outdoors at the morning rush: students walking in from Gate-5.
  await setTime(page, 'Mon', '08:50');
  await teleport(page, 'gate:origin');
  await expect
    .poll(() => count(page, 'npc-rendered'), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  const outdoorCalls = await count(page, 'draw-calls');
  expect(outdoorCalls).toBeLessThanOrEqual(400);
  expect(await count(page, 'triangles')).toBeLessThanOrEqual(1_500_000);
  expect(await count(page, 'npc-active')).toBeLessThanOrEqual(60);
  await page.screenshot({ path: 'test-results/m9-morning.png' });

  console.log('M9 peak', {
    present,
    active,
    rendered,
    calls,
    triangles,
    outdoorCalls,
  });
  expect(errors).toEqual([]);
});

test('NPCs: at night only the gate guards are on campus', async ({ page }) => {
  test.setTimeout(120_000);
  await startNewGame(page);
  await expect(page.getByTestId('npc-status')).toHaveText('ready', {
    timeout: 30_000,
  });
  await setTime(page, 'Tue', '03:00');
  // Tuesday's plans start at midnight; guards are on duty around the clock.
  await expect
    .poll(() => count(page, 'npc-present'), { timeout: 20_000 })
    .toBe(4);

  // Dev overlay navmesh viewer: one extra line draw over the campus.
  await page.getByRole('checkbox', { name: 'Labels' }).uncheck();
  await page.getByRole('checkbox', { name: 'Free camera (orbit)' }).check();
  await page.waitForTimeout(1500);
  const before = await count(page, 'draw-calls');
  await page.getByRole('checkbox', { name: 'Navmesh' }).check();
  await expect.poll(() => count(page, 'draw-calls')).toBeGreaterThan(before);
  await page.screenshot({ path: 'test-results/m9-navmesh.png' });
});
