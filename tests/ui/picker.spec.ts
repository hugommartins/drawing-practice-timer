import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const tiles = '[data-testid="pick-tile"]';

/** Rectangles of every tile in the page, and how many pairs of them overlap. */
async function layout(page: Page) {
  return page.evaluate((sel) => {
    const rects = [...document.querySelectorAll(sel)].map((t) => t.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!, b = rects[j]!;
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps++;
      }
    }
    const grid = document.querySelector('[data-testid="picker-grid"]') as HTMLElement;
    return { count: rects.length, overlaps, cols: new Set(rects.map((r) => Math.round(r.left))).size, scrollHeight: grid.scrollHeight, clientHeight: grid.clientHeight };
  }, tiles);
}

async function openPicker(app: Page, harness: { api: { linkFolder(): Promise<unknown> }; pickNext(f: string | null): void }, dir: string) {
  harness.pickNext(dir);
  await harness.api.linkFolder();
  await app.reload();
  await app.getByTestId('pick-open').click();
  await expect(app.locator(tiles).first()).toBeVisible();
}

test.describe('image picker with many images', () => {
  test('only the rows in view are in the page, laid out without overlap', async ({ app, harness, makeFolder }) => {
    await openPicker(app, harness, makeFolder('Many', 400));
    const l = await layout(app);
    expect(l.count).toBeGreaterThan(0);
    expect(l.count).toBeLessThan(120); // a window, not all 400
    expect(l.overlaps).toBe(0);
    expect(l.scrollHeight).toBeGreaterThan(l.clientHeight * 10); // but the scroll area is the full height
  });

  test('scrolling reaches the last image and it can be picked', async ({ app, harness, makeFolder }) => {
    const dir = makeFolder('Many', 400);
    await openPicker(app, harness, dir);
    const id = (await harness.api.listCollections())[0]!.id;
    const all = await harness.api.collectionImages(id);
    expect(all).toHaveLength(400);

    await app.getByTestId('picker-grid').evaluate((el) => (el.scrollTop = el.scrollHeight));
    const last = app.locator(`${tiles}[aria-label="${all[all.length - 1]}"]`);
    await expect(last).toBeVisible();
    await last.click();
    await expect(app.getByTestId('picker-count')).toHaveText('1 of 400 picked');
    expect((await layout(app)).overlaps).toBe(0);

    await app.getByTestId('picker-grid').evaluate((el) => (el.scrollTop = 0));
    await expect(app.locator(`${tiles}[aria-label="${all[0]}"]`)).toBeVisible();
    await expect(app.locator(`${tiles}[aria-label="${all[all.length - 1]}"]`)).toHaveCount(0); // scrolled out, but still picked
    await expect(app.getByTestId('picker-count')).toHaveText('1 of 400 picked');
  });

  test('select all covers images that are not on screen; the choice is applied in full', async ({ app, harness, makeFolder }) => {
    await openPicker(app, harness, makeFolder('Many', 400));
    await app.getByTestId('picker-all').click();
    await expect(app.getByTestId('picker-count')).toHaveText('400 of 400 picked');
    await app.getByTestId('picker-grid').evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
    await app.locator(tiles).first().click(); // deselect one in the middle
    await expect(app.getByTestId('picker-count')).toHaveText('399 of 400 picked');
    await app.getByTestId('picker-done').click();
    await expect(app.getByTestId('pick-summary')).toContainText('399 chosen images');
  });

  test('the layout follows the window width and stays free of overlap', async ({ app, harness, makeFolder }) => {
    await openPicker(app, harness, makeFolder('Many', 400));
    const wide = await layout(app);
    await app.setViewportSize({ width: 560, height: 860 });
    await expect.poll(async () => (await layout(app)).cols).toBeLessThan(wide.cols);
    const narrow = await layout(app);
    expect(narrow.overlaps).toBe(0);
    expect(narrow.scrollHeight).toBeGreaterThan(wide.scrollHeight); // fewer columns, so taller
  });

  test('closing and at once reopening leaves the picker open', async ({ app, harness, makeFolder }) => {
    await openPicker(app, harness, makeFolder('Many', 40));
    // The native close event of a programmatic close arrives late; it must not close the reopened dialog.
    const stayedOpen = await app.evaluate(async () => {
      for (let i = 0; i < 8; i++) {
        (document.querySelector('[aria-label="Close dialog"]') as HTMLElement).click();
        await new Promise((r) => setTimeout(r, 4));
        (document.querySelector('[data-testid="pick-open"]') as HTMLElement).click();
        await new Promise((r) => setTimeout(r, 60));
        if (!(document.querySelector('dialog') as HTMLDialogElement).open) return false;
      }
      return true;
    });
    expect(stayedOpen).toBe(true);
  });

  test('tiles load small previews, made once; the session shows the original', async ({ app, harness, makeFolder }) => {
    await openPicker(app, harness, makeFolder('Many', 40));
    const tile = app.locator(`${tiles} img`).first();
    await expect.poll(() => tile.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(8); // the preview, not the 120-pixel file
    expect(harness.requests.thumb.length).toBeGreaterThan(0);
    expect(harness.requests.img).toHaveLength(0); // no tile asked for an original

    // Close and reopen: previews come from the cache.
    await app.waitForTimeout(300);
    const rendered = harness.requests.renders;
    expect(rendered).toBeGreaterThan(0);
    await app.getByRole('button', { name: 'Close dialog' }).click();
    await app.getByTestId('pick-open').click();
    await expect(app.locator(tiles).first()).toBeVisible();
    await app.waitForTimeout(300);
    expect(harness.requests.renders).toBe(rendered);

    // A session shows the real file.
    await app.getByRole('button', { name: 'Close dialog' }).click();
    await app.getByTestId('setup-mode-none').click();
    await app.getByTestId('start-session').click();
    const ref = app.getByTestId('reference-image');
    await expect.poll(() => ref.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(120);
    expect(harness.requests.img.length).toBeGreaterThan(0);
  });
});
