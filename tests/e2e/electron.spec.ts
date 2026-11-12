/**
 * End-to-end journeys in the real Electron app. Deliberately small: anything that can be checked
 * without Electron lives in a lower layer.
 *
 *   tests/unit  timer logic, stats, storage, image-access rules, window security settings
 *   tests/ui    every screen and interaction in Chromium, backed by the real file-handling code
 *   tests/e2e   (this file) only what needs the whole thing wired together: preload bridge, IPC,
 *               hatchmark-img:// protocol, files on disk, a restart
 *
 * Needs `npm install` (for the electron binary) and `npm run build`; `npm run test:e2e` does both.
 * The OS folder dialog can't be automated portably, so HATCHMARK_TEST_FOLDER stands in for it.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeReferenceFolder } from '../helpers/fixtures';

const root = path.resolve(__dirname, '../..');

async function launch(userData: string, folder?: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    cwd: root,
    env: {
      ...(process.env as Record<string, string>),
      HATCHMARK_USER_DATA: userData,
      HATCHMARK_DATA_DIR: path.join(userData, 'data'),
      ...(folder ? { HATCHMARK_TEST_FOLDER: folder } : {}),
    },
  });
  return { app, page: await app.firstWindow() };
}

test('journey: first run to first saved session, then a restart', async () => {
  test.setTimeout(90_000);
  const userData = mkdtempSync(path.join(tmpdir(), 'hatchmark-e2e-'));
  const folder = path.join(mkdtempSync(path.join(tmpdir(), 'hatchmark-e2e-refs-')), 'Figure');
  makeReferenceFolder(folder, 10, 'fig');

  const first = await launch(userData, folder);
  try {
    const { page } = first;

    await test.step('first run is empty', async () => {
      await expect(page.getByTestId('empty-practice')).toBeVisible();
    });

    await test.step('link a folder; its images load through the real protocol', async () => {
      await page.getByTestId('link-folder-cta').click();
      await expect(page.getByTestId('flash')).toContainText('Linked "Figure"');
      await page.getByTestId('nav-library').click();
      const tile = page.getByTestId('previews').locator('img').first();
      await expect.poll(() => tile.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(120);
    });

    await test.step('practice for real, with no timer', async () => {
      await page.getByTestId('nav-practice').click();
      await page.getByTestId('setup-mode-none').click();
      await page.getByTestId('start-session').click();
      await expect(page.getByTestId('reference-image')).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('image-counter')).toContainText('Image 2');
      await page.waitForTimeout(21_000); // sessions under 20 s are not saved
      await page.getByTestId('end-session').click();
      await page.getByTestId('end-save').click();
      await expect(page.getByTestId('session-done')).toContainText('Session saved');
    });

    await test.step('it shows up in history', async () => {
      await page.getByTestId('done-back').click();
      await page.getByTestId('nav-history').click();
      await expect(page.getByTestId('session-row')).toHaveCount(1);
      await expect(page.getByTestId('hist-days')).toContainText('1');
    });

    await test.step('and the choice of theme is saved', async () => {
      await page.getByTestId('theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });
  } finally {
    await first.app.close();
  }

  await test.step('the data is plain files on disk', async () => {
    const file = path.join(userData, 'data', 'sessions.jsonl');
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ type: 'Figure', mode: 'none', source: 'app', images: 2 });
  });

  const second = await launch(userData);
  try {
    await test.step('after a restart everything is still there', async () => {
      await expect(second.page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(second.page.getByTestId('stat-library')).toContainText('10');
      await second.page.getByTestId('nav-history').click();
      await expect(second.page.getByTestId('session-row')).toHaveCount(1);
    });
  } finally {
    await second.app.close();
  }
});
