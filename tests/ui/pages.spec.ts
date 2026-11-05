import { rmSync } from 'node:fs';
import { addDays, localDate } from '../../src/shared/dates';
import { expect, linkViaUi, test } from './fixtures';
import type { Harness } from '../helpers/harness';

async function seed(h: Harness, daysAgo: number, minutes: number, type = 'Figure', source: 'app' | 'manual' = 'app') {
  const d = addDays(new Date(), -daysAgo);
  await h.api.addSession({
    date: localDate(d),
    startedAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString(),
    type,
    collectionId: null,
    mode: source === 'manual' ? 'manual' : 'whole',
    seconds: minutes * 60,
    images: source === 'manual' ? 0 : 10,
    source,
  });
}

test('log practice outside the app: lands on the chosen day as "Logged"', async ({ app, harness, makeFolder }) => {
  await linkViaUi(app, harness, makeFolder('Figure', 4));
  await app.getByTestId('log-open').click();
  const dialog = app.getByTestId('log-dialog');
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!; // centred in the window, not expanding the page
  const vp = app.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - vp.height / 2)).toBeLessThan(2);

  await app.getByTestId('log-custom').fill('95');
  await expect(app.getByTestId('log-save')).toContainText('1h 35m');
  const tomorrow = localDate(addDays(new Date(), 1));
  await app.getByTestId('log-date').evaluate((el: HTMLInputElement, v) => {
    el.removeAttribute('max');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, tomorrow);
  await expect(app.getByTestId('log-save')).toBeDisabled(); // the future is refused

  await app.getByTestId('log-day-1').click();
  await app.getByTestId('log-min-45').click();
  await app.getByTestId('log-type').selectOption('Gesture');
  await app.getByTestId('log-note').fill('Life drawing class');
  await app.getByTestId('log-save').click();

  await expect(app.getByTestId('flash')).toContainText('Added 45m of gesture');
  expect((await harness.api.listSessions())[0]).toMatchObject({ type: 'Gesture', source: 'manual', seconds: 2700, date: localDate(addDays(new Date(), -1)), note: 'Life drawing class' });
  await app.getByTestId('nav-history').click();
  const row = app.getByTestId('session-row').first();
  await expect(row).toContainText('Logged');
  await expect(row).toContainText('Yesterday');
});

test.describe('history', () => {
  test('numbers, heatmap and types reflect the sessions', async ({ app, harness }) => {
    await seed(harness, 0, 40);
    await seed(harness, 1, 20, 'Hands');
    await seed(harness, 2, 70, 'Figure');
    await seed(harness, 5, 10, 'Figure');
    await app.reload();
    await app.getByTestId('nav-history').click();

    await expect(app.getByTestId('hist-days')).toContainText('4');
    await expect(app.getByTestId('hist-hours')).toContainText('2h 20m');
    await expect(app.getByTestId('hist-streak')).toContainText('3 days');
    await expect(app.getByTestId('session-row')).toHaveCount(4);
    await expect(app.getByTestId('type-row').first()).toContainText('Figure');
    expect(await app.locator('.heat-cell .dot.lv1, .heat-cell .dot.lv2, .heat-cell .dot.lv3, .heat-cell .dot.lv4').count()).toBe(4);
    await expect(app.locator('.heat-cell .dot.lv4')).toHaveCount(1); // the 70 minute day
  });

  test('deleting a session asks first and updates the totals', async ({ app, harness }) => {
    await seed(harness, 0, 30);
    await seed(harness, 3, 30);
    await app.reload();
    await app.getByTestId('nav-history').click();
    await app.getByTestId('session-delete').first().click();
    await app.getByRole('button', { name: 'Cancel' }).click();
    await expect(app.getByTestId('session-row')).toHaveCount(2);
    await app.getByTestId('session-delete').first().click();
    await app.getByTestId('confirm-yes').click();
    await expect(app.getByTestId('session-row')).toHaveCount(1);
    await expect(app.getByTestId('hist-days')).toContainText('1');
  });
});

test.describe('library', () => {
  test('lists folders with previews', async ({ app, harness, makeFolder }) => {
    await linkViaUi(app, harness, makeFolder('Figure', 12));
    await app.getByTestId('nav-library').click();
    const col = app.getByTestId('collection').first();
    await expect(col).toContainText('12 images');
    await expect(col.getByTestId('previews').locator('img')).toHaveCount(8);
    await expect(col.locator('img').first()).toHaveJSProperty('naturalWidth', 120);
  });

  test('rename changes the type used for new sessions', async ({ app, harness, makeFolder }) => {
    await linkViaUi(app, harness, makeFolder('Figure', 4));
    await app.getByTestId('nav-library').click();
    await app.getByTestId('collection-rename').click();
    await app.getByTestId('prompt-input').fill('Life drawing');
    await app.getByTestId('prompt-save').click();
    await expect(app.getByTestId('collection-name')).toHaveText('Life drawing');
    await app.getByTestId('nav-practice').click();
    await expect(app.getByTestId('ref-select')).toContainText('Life drawing');
  });

  test('a missing folder is flagged and blocks practice', async ({ app, harness, makeFolder }) => {
    const dir = makeFolder('Gone', 3);
    await linkViaUi(app, harness, dir);
    rmSync(dir, { recursive: true, force: true });
    await app.getByTestId('nav-library').click();
    await app.getByTestId('collection-rescan').click();
    await expect(app.getByTestId('collection-status')).toContainText('not found');
    await app.getByTestId('nav-practice').click();
    await expect(app.getByTestId('start-session')).toBeDisabled();
    await expect(app.getByTestId('start-blocker')).toContainText("can't be found");
  });

  test('remove keeps past sessions in history', async ({ app, harness, makeFolder }) => {
    await linkViaUi(app, harness, makeFolder('Figure', 3));
    await seed(harness, 0, 30);
    await app.getByTestId('nav-library').click();
    await app.getByTestId('collection-remove').click();
    await app.getByTestId('confirm-yes').click();
    await expect(app.getByTestId('empty-library')).toBeVisible();
    expect(await harness.api.listSessions()).toHaveLength(1);
  });
});

test('no page overflows sideways in a narrow window', async ({ app, harness, makeFolder }) => {
  await linkViaUi(app, harness, makeFolder('Figure', 4));
  await seed(harness, 0, 30);
  for (const [w, h] of [[900, 700], [480, 640]] as const) {
    await app.setViewportSize({ width: w, height: h });
    for (const nav of ['practice', 'history', 'library']) {
      await app.getByTestId(`nav-${nav}`).click();
      await expect(app.getByTestId(`page-${nav}`)).toBeVisible();
      // nothing may be wider than the window, whether the page or its content
      const widest = await app.evaluate(() => Math.max(document.documentElement.scrollWidth, document.querySelector('.page-inner')!.getBoundingClientRect().right));
      expect(widest, `${nav} at ${w}px`).toBeLessThanOrEqual(w + 1);
    }
  }
});
