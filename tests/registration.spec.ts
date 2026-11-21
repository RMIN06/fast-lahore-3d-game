import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { playerPosition, startNewGame } from './helpers';

interface CampusData {
  departments: { id: string; spawnAnchor: string }[];
  anchors: { id: string; position: number[]; heading: number }[];
}
const campus = JSON.parse(
  readFileSync(new URL('../data/campus.json', import.meta.url), 'utf8'),
) as CampusData;
const anchorOf = (departmentId: string) => {
  const department = campus.departments.find((d) => d.id === departmentId)!;
  return campus.anchors.find((a) => a.id === department.spawnAnchor)!;
};
const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
};
const exitToTitle = async (page: Page) => {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Exit to title' }).click();
  await expect(
    page.getByRole('heading', { name: 'FAST Lahore Campus' }),
  ).toBeVisible();
};

test('registration warns on roll number without blocking, and each department spawns at its anchor', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'FAST Lahore Campus' }),
  ).toBeVisible();
  await expect(page.getByTestId('continue')).toBeDisabled();
  await page.screenshot({ path: 'test-results/m6-title.png' });

  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('Roll number *').fill('1234');
  await expect(page.getByRole('status')).toContainText(
    'does not look like a FAST roll number',
  );
  await page.getByLabel('Department *').selectOption('civil');
  await page.getByRole('radio', { name: 'Female' }).check();
  await expect(page.getByLabel('Avatar preview')).toContainText('1.68 m');
  // The warning does not block: Start stays enabled.
  await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/m6-register.png' });
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('player-mode')).toHaveText('first');
  await expect(page.locator('.hud-task')).toContainText('1234');

  for (const department of ['civil', 'cs', 'ee', 'mgmt']) {
    if (department !== 'civil') {
      await exitToTitle(page);
      await startNewGame(page, { department });
    }
    const anchor = anchorOf(department);
    await expect
      .poll(async () => {
        const [x, , z] = await playerPosition(page);
        return Math.hypot(x! - anchor.position[0]!, z! - anchor.position[2]!);
      })
      .toBeLessThan(0.5);
    // Facing the entrance: compass shows the anchor's heading.
    const compass = (await page.getByTestId('hud-compass').textContent()) ?? '';
    const bearing = Number(/(\d+)°/.exec(compass)?.[1]);
    const diff = Math.abs(((bearing - anchor.heading + 540) % 360) - 180);
    expect(diff).toBeLessThan(2);
  }
  expect(errors).toEqual([]);
});

test('save, reload and Continue restore position, time and settings; menus work', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await startNewGame(page, { name: 'Ayesha', department: 'cs' });

  // Move away from the spawn point.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');

  // Set Wednesday 19:45 in the time panel.
  await page.keyboard.press('KeyT');
  const timePanel = page.getByRole('dialog', { name: 'Time panel' });
  await timePanel.getByLabel('Day').selectOption('Wed');
  await timePanel.getByLabel('Time', { exact: true }).fill('19:45');
  await timePanel.getByRole('button', { name: 'Set time' }).click();
  await page.keyboard.press('KeyT');

  // Phone (P) with map tab and player marker; full map (M).
  await page.keyboard.press('KeyP');
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone).toBeVisible();
  await expect(phone.getByTestId('map-player')).toBeVisible();
  await phone.getByRole('tab', { name: 'Tasks' }).click();
  await expect(phone).toContainText('No active task');
  await expect(phone.getByTestId('task-attend-class')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(phone).toBeHidden();
  await page.keyboard.press('KeyM');
  await expect(
    page.getByRole('dialog', { name: 'Campus map overlay' }),
  ).toBeVisible();
  await page.keyboard.press('KeyM');

  // Pause menu pauses time; change settings; save.
  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: 'Pause menu' });
  await expect(pause).toBeVisible();
  const frozen = await page.getByTestId('hud-clock').textContent();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('hud-clock')).toHaveText(frozen!);
  await pause.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('radio', { name: 'High' }).check();
  await settings.getByLabel('Volume').fill('30');
  await settings.getByRole('button', { name: 'Back' }).click();
  await pause.getByRole('button', { name: 'Save' }).click();
  // Time is frozen while paused, so the save holds exactly the HUD time.
  await expect(page.getByTestId('save-message')).toHaveText(`Saved ${frozen}`);
  expect(frozen).toMatch(/^Wed (19:[45]\d|20:0\d)$/);
  const saved = await playerPosition(page);
  const savedTime = await page.getByTestId('hud-clock').textContent();
  await page.screenshot({ path: 'test-results/m6-pause.png' });

  // Reload the page: Continue restores everything.
  await page.reload();
  await expect(page.getByTestId('continue')).toBeEnabled();
  await expect(page.getByTestId('save-summary')).toContainText(
    `Ayesha · Computer Science · ${frozen}`,
  );
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('player-mode')).toHaveText('first');
  await expect
    .poll(async () => {
      const [x, , z] = await playerPosition(page);
      return Math.hypot(x! - saved[0]!, z! - saved[2]!);
    })
    .toBeLessThan(0.5);
  // Same weekday; the clock resumes from the saved time (allow the minutes
  // that pass while the slow headless page loads).
  const minutesOf = (text: string) => {
    const [, hh, mm] = /(\d\d):(\d\d)/.exec(text) ?? [];
    return Number(hh) * 60 + Number(mm);
  };
  const restored = (await page.getByTestId('hud-clock').textContent())!;
  expect(restored.slice(0, 3)).toBe(savedTime!.slice(0, 3));
  const drift = minutesOf(restored) - minutesOf(savedTime!);
  expect(drift).toBeGreaterThanOrEqual(0);
  expect(drift).toBeLessThan(30);
  await page.keyboard.press('Escape');
  await page
    .getByRole('dialog', { name: 'Pause menu' })
    .getByRole('button', { name: 'Settings' })
    .click();
  await expect(page.getByRole('radio', { name: 'High' })).toBeChecked();
  await expect(page.getByLabel('Volume')).toHaveValue('30');
  await page.screenshot({ path: 'test-results/m6-continue.png' });
  expect(errors).toEqual([]);
});
