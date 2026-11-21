import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { startNewGame } from './helpers';
import { solveDialogue } from '../src/systems/dialogue';
import type { DialogueTree, TasksDocument } from '../src/systems/task-schema';

// M10 acceptance: every task can be started and completed in game. Each run
// starts the task from the phone inside its time window, then plays it: walk
// there (dev "Go to"), press E on the target, sit, and answer dialogues.

const doc = JSON.parse(
  readFileSync(new URL('../data/tasks.json', import.meta.url), 'utf8'),
) as TasksDocument;
const tree = (id: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../data/dialogue/${id}.json`, import.meta.url),
      'utf8',
    ),
  ) as DialogueTree;

test.use({ viewport: { width: 800, height: 450 } });

const text = async (page: Page, id: string) =>
  ((await page.getByTestId(id).textContent()) ?? '').trim();

async function timePanel(page: Page, day: string, time: string, speed = '×4') {
  await page.keyboard.press('KeyT');
  const panel = page.getByRole('dialog', { name: 'Time panel' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Day').selectOption(day);
  await panel.getByLabel('Time', { exact: true }).fill(time);
  await panel.getByRole('button', { name: 'Set time' }).click();
  await panel.getByRole('button', { name: speed }).click();
  await page.keyboard.press('KeyT');
  await expect(panel).toBeHidden();
}

async function goTo(page: Page, target: string) {
  await page.getByLabel('Task target').fill(target);
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.waitForTimeout(500);
}

async function openPhone(page: Page, tab: string) {
  await page.keyboard.press('KeyP');
  const phone = page.getByRole('dialog', { name: 'Phone' });
  await expect(phone).toBeVisible();
  await phone.getByRole('tab', { name: tab }).click();
  return phone;
}

/** Answer the open conversation (right quiz answers; friends: sit together). */
async function talk(page: Page) {
  const box = page.getByTestId('dialogue');
  const id = (await box.getAttribute('data-dialogue'))!;
  const path = solveDialogue(
    tree(id),
    id.startsWith('friend-') ? 'bench' : undefined,
  )!;
  for (const i of path) {
    await page.keyboard.press(`Digit${i + 1}`);
    await page.waitForTimeout(120);
  }
  await expect(box).toBeHidden();
}

/** Play the active task step by step until it ends. */
async function play(page: Page, taskId: string) {
  for (let guard = 0; guard < 40; guard += 1) {
    if ((await text(page, 'task-id')) === 'none') break;
    if (await page.getByTestId('dialogue').isVisible()) {
      await talk(page);
      continue;
    }
    const index = await text(page, 'task-step-index');
    const places = await text(page, 'task-places');
    const kind = await text(page, 'task-step-kind');
    if (kind === 'go' || kind === 'visit') {
      await goTo(page, (await text(page, 'task-places')).split(' ')[0]!);
    } else if (kind === 'use' || kind === 'sit') {
      const target = (await text(page, 'task-targets')).split(' ')[0]!;
      expect(target, `${taskId}: a ${kind} target`).not.toBe('');
      await goTo(page, `fixture:${target}`);
      await expect.poll(() => text(page, 'focus-id')).toBe(target);
      await page.keyboard.press('KeyE');
    } else if (kind === 'talk') {
      const actor = await text(page, 'task-actor');
      await goTo(page, `actor:${actor}`);
      await expect.poll(() => text(page, 'focus-id')).toBe(actor);
      await page.keyboard.press('KeyE');
    }
    // Wait for the step to move on, the task to end or a conversation to open.
    await expect
      .poll(
        async () =>
          (await text(page, 'task-id')) === 'none' ||
          (await page.getByTestId('dialogue').isVisible()) ||
          (await text(page, 'task-step-index')) !== index ||
          // A checklist stays on one step: a ticked place leaves the list.
          (kind === 'visit' && (await text(page, 'task-places')) !== places),
        { timeout: 30_000 },
      )
      .toBe(true);
  }
  await expect(page.getByTestId('task-last')).toHaveText(`${taskId}:completed`);
  await expect(page.getByTestId('task-notice')).toContainText('Task complete');
  // Seated at the end (eat, study): stand up again.
  if (await page.getByTestId('seated-id').isVisible())
    await page.keyboard.press('KeyE');
}

const windowStart = (task: TasksDocument['tasks'][number]) => {
  const w = task.window;
  if (!w || w === 'timetable') return { day: 'Mon', time: '10:00' };
  const [h, m] = w.from.split(':').map(Number) as [number, number];
  const t = h * 60 + m + 5;
  return {
    day: w.days?.[0] ?? 'Mon',
    time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`,
  };
};

async function setup(page: Page) {
  // Software WebGL: the Low preset keeps many teleports fast.
  await page.addInitScript(() =>
    localStorage.setItem(
      'fast-lahore.settings.v1',
      JSON.stringify({ graphics: 'low', volume: 0.8 }),
    ),
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await startNewGame(page);
  await page.getByRole('checkbox', { name: 'Labels' }).uncheck();
  return errors;
}

for (const task of doc.tasks.filter((t) => !t.viaMessages)) {
  test(`task "${task.title}" starts from the phone and completes in game`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = await setup(page);
    let { day, time } = windowStart(task);
    if (task.window === 'timetable') {
      // Read the next class from the phone, then arrive ten minutes early.
      await timePanel(page, 'Mon', '07:00', '×1');
      const phone = await openPhone(page, 'Tasks');
      const why = await phone.getByTestId(`task-${task.id}`).textContent();
      const at = /Next class (\d\d):(\d\d)/.exec(why ?? '')!;
      await page.keyboard.press('KeyP');
      const t = Number(at[1]) * 60 + Number(at[2]) - 10;
      time = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    }
    await timePanel(page, day, time);
    const phone = await openPhone(page, 'Tasks');
    await phone.getByTestId(`start-${task.id}`).click();
    await expect(phone).toBeHidden();
    await expect(page.getByTestId('task-id')).toHaveText(task.id);
    await expect(page.getByTestId('task-line')).toContainText(task.title);
    await play(page, task.id);
    await page.screenshot({ path: `test-results/m10-${task.id}.png` });
    // Ticked in the phone for this session only.
    const after = await openPhone(page, 'Tasks');
    await expect(after.getByTestId(`task-${task.id}`)).toContainText(
      `✓ ${task.title}`,
    );
    await page.keyboard.press('KeyP');
    // Nothing about tasks reaches the save.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save' }).click();
    const saved = await page.evaluate(() =>
      Object.keys(localStorage)
        .map((k) => localStorage.getItem(k) ?? '')
        .join('\n'),
    );
    expect(saved).not.toMatch(new RegExp(`${task.id}|completed|"tasks"`));
    expect(errors).toEqual([]);
  });
}

test('meet a friend: a phone message invites you; show up, chat, sit together', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await setup(page);
  await timePanel(page, 'Mon', '17:00');
  const phone = await openPhone(page, 'Messages');
  const accept = phone
    .getByRole('button', { name: 'Sure, see you there' })
    .first();
  await expect(accept).toBeVisible();
  await accept.click();
  await expect(page.getByTestId('task-id')).toHaveText('meet-friend');
  await play(page, 'meet-friend');
  await page.screenshot({ path: 'test-results/m10-meet-friend.png' });
  const messages = await openPhone(page, 'Messages');
  await expect(messages.getByText('You said yes.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('interaction: E opens and closes a room door (it blocks when shut), sits and stands', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await setup(page);
  await goTo(page, 'fixture:door:C-1-CS1');
  await expect.poll(() => text(page, 'focus-id')).toBe('door:C-1-CS1');
  await expect(page.getByTestId('interact-prompt')).toContainText(
    'Open / close',
  );
  await page.keyboard.press('KeyE'); // shut
  await page.waitForTimeout(800);
  const before = await page.getByTestId('player-z').textContent();
  const beforeX = await page.getByTestId('player-x').textContent();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  // Blocked: starting 1 m away, the player only reaches the shut door.
  const moved = Math.hypot(
    Number(await page.getByTestId('player-x').textContent()) - Number(beforeX),
    Number(await page.getByTestId('player-z').textContent()) - Number(before),
  );
  expect(moved).toBeLessThan(0.9);
  await page.keyboard.press('KeyE'); // open again
  await page.waitForTimeout(800);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const through = Math.hypot(
    Number(await page.getByTestId('player-x').textContent()) - Number(beforeX),
    Number(await page.getByTestId('player-z').textContent()) - Number(before),
  );
  expect(through).toBeGreaterThan(1.6);
  // Sit on a classroom seat, stand with E.
  await goTo(page, 'fixture:seat:C-1-CS1:0');
  await expect.poll(() => text(page, 'focus-id')).toBe('seat:C-1-CS1:0');
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('seated-id')).toContainText('seat:C-1-CS1:0');
  await expect(page.getByTestId('player-animation')).toHaveText('sit');
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/m10-seated.png' });
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('seated-id')).toBeHidden();
  await expect(page.getByTestId('player-animation')).not.toHaveText('sit');
  expect(errors).toEqual([]);
});
