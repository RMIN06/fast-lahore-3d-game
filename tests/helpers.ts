import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export interface NewGame {
  roll?: string;
  department?: string;
  name?: string;
  body?: 'Male' | 'Female';
}

/** Title → New game → Register → in game (fresh browser storage per test). */
export async function startNewGame(page: Page, options: NewGame = {}) {
  if (!(await page.getByRole('button', { name: 'New game' }).isVisible()))
    await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('Roll number *').fill(options.roll ?? '23L-1234');
  if (options.name)
    await page.getByLabel('Display name (optional)').fill(options.name);
  await page
    .getByLabel('Department *')
    .selectOption(options.department ?? 'cs');
  if (options.body)
    await page.getByRole('radio', { name: options.body }).check();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('player-mode')).toHaveText('first');
  await expect
    .poll(async () => page.getByTestId('player-grounded').textContent())
    .toBe('true');
}

/** Dev overlay teleport (e.g. 'gate:origin' or a spawn anchor id). */
export async function teleport(page: Page, target: string) {
  await page.getByLabel('Teleport target').selectOption(target);
  await page.getByRole('button', { name: 'Teleport' }).click();
  // Keep keyboard input away from the focused button.
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.waitForTimeout(400);
}

export const playerPosition = async (page: Page) =>
  Promise.all(
    ['x', 'y', 'z'].map(async (axis) =>
      Number(await page.getByTestId(`player-${axis}`).textContent()),
    ),
  );
