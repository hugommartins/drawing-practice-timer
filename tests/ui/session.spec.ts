import type { Page } from '@playwright/test';
import { localDate } from '../../src/shared/dates';
import { expect, test } from './fixtures';
import type { Harness } from '../helpers/harness';

async function linked(app: Page, harness: Harness, dir: string) {
  harness.pickNext(dir);
  await harness.api.linkFolder();
  await app.reload();
}

/** Fake timers so a 30-minute session runs in milliseconds. Must run before the session starts. */
async function fakeTime(app: Page) {
  const start = new Date();
  await app.clock.install({ time: start });
  // Stop time flowing by itself: from here it only moves when a test calls runFor().
  await app.clock.pauseAt(new Date(start.getTime() + 500));
}

/** Start and wait until the session screen is really up; the fake clock must not move before it is. */
async function begin(app: Page) {
  await app.getByTestId('start-session').click();
  await expect(app.getByTestId('timer')).toBeVisible();
}

test.describe('running a session', () => {
  test('per-image timer counts down and moves to a new image by itself', async ({ app, harness, makeFolder }) => {
    await linked(app, harness, makeFolder('Figure', 8));
    await fakeTime(app);
    await app.getByTestId('dur-30').click();
    await app.getByTestId('count-10').click();
    await begin(app);

    await expect(app.getByTestId('image-counter')).toContainText('Image 1 of 8'); // capped by folder size
    await expect(app.getByTestId('timer')).toHaveText('0:30');
    await app.clock.runFor(5_000);
    await expect(app.getByTestId('timer')).toHaveText('0:25');

    const first = await app.getByTestId('reference-image').getAttribute('src');
    await app.clock.runFor(26_000);
    await expect(app.getByTestId('image-counter')).toContainText('Image 2 of 8');
    expect(await app.getByTestId('reference-image').getAttribute('src')).not.toBe(first);
  });

  test('pause freezes the timer; time can be added and removed', async ({ app, harness, makeFolder }) => {
    await linked(app, harness, makeFolder('Figure', 5));
    await fakeTime(app);
    await begin(app);
    await app.clock.runFor(10_000);
    await expect(app.getByTestId('timer')).toHaveText('0:50');
    await app.getByTestId('play-pause').click();
    await app.clock.runFor(30_000);
    await expect(app.getByTestId('timer')).toHaveText('0:50');
    await expect(app.getByTestId('elapsed')).toContainText('paused');
    await app.getByTestId('play-pause').click();
    await app.getByTestId('add-60').click();
    await expect(app.getByTestId('timer')).toHaveText('1:50');
    await app.getByTestId('sub-15').click();
    await expect(app.getByTestId('timer')).toHaveText('1:35');
  });

  test('whole-session timer ends by itself, saves, and can be repeated', async ({ app, harness, makeFolder }) => {
    await linked(app, harness, makeFolder('Figure', 5));
    const old = new Date(Date.now() - 10 * 86_400_000); // outside this week, inside the past year
    await harness.api.addSession({ date: localDate(old), startedAt: old.toISOString(), type: 'Figure', collectionId: null, mode: 'manual', seconds: 1800, images: 0, source: 'manual' });
    await app.reload();
    await fakeTime(app);
    await app.getByTestId('setup-mode-whole').click();
    await app.getByTestId('dur-custom').fill('0:30');
    await begin(app);
    await expect(app.getByTestId('timer')).toHaveText('0:30');
    await app.clock.runFor(31_000);
    await expect(app.getByTestId('session-done')).toContainText('Session saved');
    await app.getByTestId('done-back').click();
    await expect(app.getByTestId('stat-week').locator('.v')).toHaveText('1m'); // this week only
    await expect(app.getByTestId('stat-year')).toContainText('2 days');
    await expect(app.getByTestId('last-session')).toContainText('Figure');
    expect((await harness.api.listSessions()).filter((x) => x.source === 'app')).toMatchObject([{ type: 'Figure', mode: 'whole', seconds: 30 }]);

    await app.getByTestId('setup-mode-none').click(); // change the live setup, then repeat the last one
    await app.getByTestId('last-session-repeat').click();
    await expect(app.getByTestId('timer')).toHaveText('0:30');
  });

  test('no-timer mode counts up and saves what was drawn', async ({ app, harness, makeFolder }) => {
    await linked(app, harness, makeFolder('Figure', 5));
    await fakeTime(app);
    await app.getByTestId('setup-mode-none').click();
    await begin(app);
    await expect(app.getByTestId('add-60')).toHaveCount(0);
    await app.clock.runFor(125_000);
    await expect(app.getByTestId('timer')).toHaveText('2:05');
    await app.getByTestId('end-session').click();
    await app.getByTestId('end-save').click();
    await expect(app.getByTestId('session-done')).toContainText('2m');
    expect((await harness.api.listSessions())[0]).toMatchObject({ mode: 'none', seconds: 125 });
  });

  test('ending early: keep drawing resumes, discard saves nothing', async ({ app, harness, makeFolder }) => {
    await linked(app, harness, makeFolder('Figure', 5));
    await fakeTime(app);
    await begin(app);
    await app.clock.runFor(40_000);
    await app.getByTestId('end-session').click();
    await expect(app.getByTestId('elapsed')).toContainText('paused');
    await app.getByTestId('end-keep').click();
    await expect(app.getByTestId('elapsed')).not.toContainText('paused');
    await app.getByTestId('end-session').click();
    await app.getByTestId('end-discard').click();
    await expect(app.getByTestId('page-practice')).toBeVisible();
    expect(await harness.api.listSessions()).toHaveLength(0);
  });

  test('sessions under 20 seconds are not saved', async ({ app, harness, makeFolder }) => {
    await linked(app, harness, makeFolder('Figure', 5));
    await fakeTime(app);
    await begin(app);
    await app.clock.runFor(8_000);
    await app.getByTestId('end-session').click();
    await app.getByTestId('end-save').click();
    await expect(app.getByTestId('session-done')).toContainText('Too short');
    expect(await harness.api.listSessions()).toHaveLength(0);
  });
});

test.describe('on screen', () => {
  test.beforeEach(async ({ app, harness, makeFolder }) => {
    await linked(app, harness, makeFolder('Figure', 5));
    await app.getByTestId('start-session').click();
    await app.waitForFunction(() => (document.querySelector('[data-testid=reference-image]') as HTMLImageElement | null)?.complete);
  });

  test('view tools and keyboard shortcuts', async ({ app }) => {
    const box = app.getByTestId('stage-box');
    await app.getByTestId('view-mirror').click();
    await expect(box).toHaveClass(/flip/);
    await app.getByTestId('view-gray').click();
    expect(await app.getByTestId('reference-image').evaluate((el) => getComputedStyle(el).filter)).toContain('grayscale(1)');
    await app.getByTestId('view-flip').click();
    await expect(box).toHaveClass(/mirror-v/);
    await app.getByTestId('view-mirror').click();
    await expect(box).not.toHaveClass(/ flip/);
    await expect(box).toHaveClass(/gray/);

    await app.getByTestId('stage').click({ position: { x: 5, y: 5 } }); // focus off the buttons so keys reach the page
    await app.keyboard.press('Space');
    await expect(app.getByTestId('elapsed')).toContainText('paused');
    await app.keyboard.press('ArrowRight');
    await expect(app.getByTestId('image-counter')).toContainText('Image 2');
    await app.keyboard.press('ArrowLeft');
    await expect(app.getByTestId('image-counter')).toContainText('Image 1');
    await app.keyboard.press('g');
    await expect(app.getByTestId('grid-overlay')).toBeVisible();
  });

  test('focus mode gives the image the whole window and keeps the timer reachable', async ({ app }) => {
    const before = (await app.getByTestId('stage').boundingBox())!;
    await app.getByTestId('focus-toggle').click();
    await expect(app.getByRole('complementary', { name: 'Session controls' })).toHaveCount(0);
    const during = (await app.getByTestId('stage').boundingBox())!;
    expect(during.width).toBeGreaterThan(before.width + 200);
    expect(during.height).toBeGreaterThan(before.height);
    await expect(app.getByTestId('hud-timer')).toBeVisible();
    await app.getByTestId('hud-play-pause').click();
    await expect(app.getByTestId('hud-play-pause')).toHaveAccessibleName('Resume');
    await app.keyboard.press('Escape');
    await expect(app.getByTestId('focus-hud')).toHaveCount(0);
    await expect(app.getByRole('complementary', { name: 'Session controls' })).toBeVisible();
    await app.keyboard.press('h');
    await expect(app.getByTestId('focus-hud')).toBeVisible();
    await app.getByTestId('focus-exit').click();
    await expect(app.getByTestId('focus-hud')).toHaveCount(0);
  });

  test('image keeps its aspect ratio and the grid sits exactly on it at any window size', async ({ app }) => {
    await app.getByTestId('view-grid').click();
    const check = async () => {
      const img = (await app.getByTestId('reference-image').boundingBox())!;
      const grid = (await app.getByTestId('grid-overlay').boundingBox())!;
      expect(img.width / img.height).toBeCloseTo(120 / 160, 1);
      for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(img[k] - grid[k])).toBeLessThan(1.5);
    };
    await check();
    await app.setViewportSize({ width: 700, height: 900 });
    await check();
    await app.setViewportSize({ width: 1500, height: 600 });
    await check();
  });

  test('controls move below the image in a narrow window, with no overflow', async ({ app }) => {
    const rail = app.getByRole('complementary', { name: 'Session controls' });
    let stage = (await app.getByTestId('stage').boundingBox())!;
    let railBox = (await rail.boundingBox())!;
    expect(railBox.x).toBeGreaterThan(stage.x + stage.width - 1); // wide: side by side

    await app.setViewportSize({ width: 600, height: 900 });
    stage = (await app.getByTestId('stage').boundingBox())!;
    railBox = (await rail.boundingBox())!;
    expect(railBox.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1); // narrow: stacked
    expect(await app.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(app.getByTestId('play-pause')).toBeInViewport();
  });
});
