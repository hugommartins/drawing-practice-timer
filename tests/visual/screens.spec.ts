/**
 * Visual regression in the real Electron window: each screen is compared with a stored baseline.
 *
 * Screenshots come from Electron's own Chromium, so a baseline matches what the app really shows.
 * Needs `npm install` (for the electron binary) and a build; `npm run test:visual` does the build.
 *
 * Everything that could vary between runs is pinned: the date (fake clock), the "random" image
 * order (seeded Math.random), the data (generated from a fixed day), the theme (set explicitly),
 * the display scale (forced to 1), animations and the caret (disabled), and the temp-folder path
 * (masked).
 *
 * Baselines are per platform (file names end in -darwin / -linux / -win32) because font rendering
 * differs. Create or refresh yours with `npm run test:visual:update`, review the images, commit.
 */
import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApi } from '../../src/main/handlers';
import { addDays, localDate } from '../../src/shared/dates';
import { makeReferenceFolder } from '../helpers/fixtures';

const root = path.resolve(__dirname, '../..');

/** Friday 30 Oct 2026, noon, local time. Every screenshot is taken "on" this day. */
const NOW = new Date(2026, 9, 30, 12, 0, 0);

/**
 * CSS viewport sizes are set through Playwright so the desktop doesn't constrain screenshots
 * on smaller CI displays.
 */
const WIDE = { width: 1280, height: 760 };
const NARROW = { width: 640, height: 760 };

type Theme = 'light' | 'dark';

interface Options {
  theme: Theme;
  /** Link two folders and seed ~5 months of practice. Otherwise the app starts empty. */
  seeded?: boolean;
  size?: { width: number; height: number };
}

async function seedData(dataDir: string, theme: Theme, seeded: boolean): Promise<void> {
  const picks: string[] = [];
  const api = createApi({ dataDir, pickFolder: async () => picks.shift() ?? null });
  await api.saveSettings({ theme });
  if (!seeded) return;

  const refs = mkdtempSync(path.join(tmpdir(), 'hatchmark-visual-refs-'));
  for (const [name, count] of [['Figure', 14], ['Hands', 9]] as const) {
    const dir = path.join(refs, name);
    makeReferenceFolder(dir, count, name.toLowerCase());
    picks.push(dir);
    await api.linkFolder();
  }
  const minutes = [10, 20, 35, 45, 70, 90];
  for (let i = 0; i < 160; i++) {
    if (i % 5 === 3 || i % 11 === 4) continue; // gaps, deterministic
    const d = addDays(NOW, -i);
    await api.addSession({
      date: localDate(d),
      startedAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString(),
      type: i % 3 ? 'Figure' : 'Hands',
      collectionId: null,
      mode: 'whole',
      seconds: minutes[i % 6]! * 60,
      images: 12,
      source: i % 7 ? 'app' : 'manual',
    });
  }
  const [fig] = await api.listCollections();
  await api.saveSettings({
    lastSession: { setup: { mode: 'per-image', perImageSec: 60, totalSec: 1800, count: 20, collectionId: fig!.id }, type: 'Figure', date: localDate(NOW), seconds: 1500, images: 20 },
  });
}

const test = base.extend<{ launch(opts: Options): Promise<Page> }>({
  launch: async ({}, use) => {
    const apps: ElectronApplication[] = [];
    await use(async ({ theme, seeded = false, size = WIDE }) => {
      const userData = mkdtempSync(path.join(tmpdir(), 'hatchmark-visual-'));
      const dataDir = path.join(userData, 'data');
      await seedData(dataDir, theme, seeded);

      const app = await electron.launch({
        args: [root, '--force-device-scale-factor=1', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
        cwd: root,
        env: { ...(process.env as Record<string, string>), HATCHMARK_USER_DATA: userData, HATCHMARK_DATA_DIR: dataDir },
      });
      apps.push(app);
      const page = await app.firstWindow();

      await page.setViewportSize(size);
      await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [size.width, size.height] as const, { timeout: 5000 }).catch(() => {
        throw new Error(`The viewport could not be set to ${size.width}x${size.height}.`);
      });

      // Deterministic "random" (same image order every run) and a frozen clock, then start the app over.
      await page.addInitScript(() => {
        let s = 12345;
        Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
      });
      await page.clock.install({ time: NOW });
      await page.clock.pauseAt(new Date(NOW.getTime() + 1000));
      await page.reload();
      await page.getByTestId('theme-toggle').waitFor();

      // Fail loudly, not with a mystery pixel diff, if the clock isn't actually frozen.
      const t1 = await page.evaluate(() => Date.now());
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => Date.now()), 'fake clock should be paused').toBe(t1);
      return page;
    });
    for (const a of apps) await a.close().catch(() => undefined);
  },
});

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
}

const shot = (page: Page, name: string) =>
  expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    threshold: 0.02, // default 0.2 hides low-contrast edges such as card corners
    // Strict on a developer machine. A CI runner image can change its text rendering between releases, so allow a little more there.
    maxDiffPixelRatio: process.env['CI'] ? 0.0005 : 0.0001,
    mask: [page.locator('.col-path')], // temp-folder paths differ every run
    stylePath: path.join(__dirname, 'screenshot.css'),
  });

for (const theme of ['dark', 'light'] as const) {
  test.describe(theme, () => {
    test('practice', async ({ launch }) => {
      const page = await launch({ theme, seeded: true });
      await settle(page);
      await shot(page, `practice-${theme}.png`);
    });

    test('history', async ({ launch }) => {
      const page = await launch({ theme, seeded: true });
      await page.getByTestId('nav-history').click();
      await settle(page);
      await shot(page, `history-${theme}.png`);
    });

    test('library', async ({ launch }) => {
      const page = await launch({ theme, seeded: true });
      await page.getByTestId('nav-library').click();
      await settle(page);
      await shot(page, `library-${theme}.png`);
    });

    test('session with grid', async ({ launch }) => {
      const page = await launch({ theme, seeded: true });
      await page.getByTestId('start-session').click();
      await page.getByTestId('view-grid').click();
      await settle(page);
      await shot(page, `session-${theme}.png`);
    });
  });
}

test('empty first run', async ({ launch }) => {
  const page = await launch({ theme: 'dark' });
  await settle(page);
  await shot(page, 'empty-dark.png');
});

test('log practice dialog', async ({ launch }) => {
  const page = await launch({ theme: 'light', seeded: true });
  await page.getByTestId('log-open').click();
  await settle(page);
  await shot(page, 'log-dialog-light.png');
});

test('narrow window: practice and session', async ({ launch }) => {
  const page = await launch({ theme: 'dark', seeded: true, size: NARROW });
  await settle(page);
  await shot(page, 'practice-narrow-dark.png');
  await page.getByTestId('start-session').click();
  await settle(page);
  await shot(page, 'session-narrow-dark.png');
});
