import { expect, test } from '@playwright/test';
import { startNewGame, teleport } from './helpers';

const ANIMATIONS = ['idle', 'walk', 'run', 'jump', 'sit', 'kick', 'swing'];
const hide = {
  style:
    '.dev-overlay, header, .hud-clock, .world-label { visibility: hidden; }',
};

test.use({ viewport: { width: 960, height: 540 } });

test('character preview: both avatars play every animation; three LODs', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/dev/characters');
  const canvas = page.locator('canvas');
  await expect(page.getByTestId('preview-animation')).toHaveText('idle');
  await page.waitForTimeout(800);
  const idle = await canvas.screenshot(hide);
  for (const anim of ANIMATIONS.slice(1)) {
    await page.getByRole('button', { name: anim, exact: true }).click();
    await expect(page.getByTestId('preview-animation')).toHaveText(anim);
    // The pose differs from idle; looping and one-shot animations keep moving
    // (sit and jump settle into a held pose, so they are not re-checked).
    await expect
      .poll(async () => (await canvas.screenshot(hide)).equals(idle))
      .toBe(false);
    if (['walk', 'run', 'kick', 'swing'].includes(anim)) {
      const a = await canvas.screenshot(hide);
      await expect
        .poll(async () => (await canvas.screenshot(hide)).equals(a), {
          intervals: [150],
        })
        .toBe(false);
    }
    await page.screenshot({ path: `test-results/m8-${anim}.png` });
  }
  // Three levels of detail per body, each with fewer triangles.
  for (const body of ['male', 'female']) {
    const counts: number[] = [];
    for (const level of [0, 1, 2]) {
      await page.getByRole('button', { name: `LOD${level}` }).click();
      counts.push(Number(await page.getByTestId(`tris-${body}`).textContent()));
    }
    expect(counts[0]).toBeGreaterThan(counts[1]!);
    expect(counts[1]).toBeGreaterThan(counts[2]!);
  }
  expect(errors).toEqual([]);
});

test('in game the player character walks, runs, jumps, sits, kicks and swings', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'fast-lahore.settings.v1',
      JSON.stringify({ graphics: 'low', volume: 0.8 }),
    ),
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await startNewGame(page, { body: 'Female' });
  await teleport(page, 'gate:origin');
  const animation = page.getByTestId('player-animation');
  await expect(animation).toHaveText('idle');

  // First person hides the body; third person shows the character.
  const canvas = page.locator('canvas');
  const first = await canvas.screenshot(hide);
  await page.keyboard.press('KeyV');
  await expect(page.getByTestId('player-mode')).toHaveText('third');
  await expect
    .poll(async () => (await canvas.screenshot(hide)).equals(first))
    .toBe(false);

  await page.keyboard.down('KeyW');
  await expect(animation).toHaveText('walk');
  await page.keyboard.down('ShiftLeft');
  await expect(animation).toHaveText('run');
  await page.screenshot({ path: 'test-results/m8-game-run.png' });
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await expect(animation).toHaveText('idle');
  await page.keyboard.press('Space');
  await expect(animation).toHaveText('jump', { timeout: 3000 });
  await expect(animation).toHaveText('idle');

  const actions = page.getByRole('group', { name: 'Animation actions' });
  await actions.getByRole('button', { name: 'Sit' }).click();
  await expect(animation).toHaveText('sit');
  await page.screenshot({ path: 'test-results/m8-game-sit.png' });
  await actions.getByRole('button', { name: 'Sit' }).click();
  await expect(animation).toHaveText('idle');
  for (const action of ['Kick', 'Swing']) {
    await actions.getByRole('button', { name: action }).click();
    await expect(animation).toHaveText(action.toLowerCase());
    await expect(animation).toHaveText('idle');
  }
  // One draw call per character LOD; the budget holds.
  expect(
    Number(await page.getByTestId('draw-calls').textContent()),
  ).toBeLessThanOrEqual(400);
  expect(errors).toEqual([]);
});
