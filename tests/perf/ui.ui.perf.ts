/**
 * The image picker and session start with very large folders, in Chromium, backed by the real
 * file-handling code. Timing is taken inside the page (performance.now around the click, ending two
 * animation frames after the DOM is ready) so Playwright's polling does not add noise.
 * Run: npm run perf:ui
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../ui/fixtures';
import { makePng } from '../helpers/fixtures';
import { createPerf, makeLibrary, shared, sizes, type Library } from './lib';

const perf = createPerf({ lane: 'ui' });
const tiny = makePng(16, 16, 1); // many copies of a small real image: renders for real, costs little disk

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1280, height: 860 } });

const libs: Library[] = [];
test.afterAll(() => libs.forEach((l) => l.remove()));

const tilesSel = '[data-testid="pick-tile"]';

interface OpenResult {
  openMs: number;
  nodes: number;
  longTaskMaxMs: number;
  blockingMs: number;
}

/** Click "Choose images…" in the page and report when the grid has `n` tiles and has painted. */
async function openPicker(page: Page): Promise<OpenResult> {
  return page.evaluate(async () => {
    const w = window as unknown as { __long?: number[] };
    w.__long = [];
    const obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long!.push(e.duration)));
    obs.observe({ entryTypes: ['longtask'] });
    const t0 = performance.now();
    (document.querySelector('[data-testid="pick-open"]') as HTMLElement).click();
    await new Promise<void>((resolve) => {
      // The picker draws only the rows in view, so "ready" is: tiles exist and the scroll area has its full height.
      const ready = () => {
        const g = document.querySelector('[data-testid="picker-grid"]') as HTMLElement | null;
        return !!g && document.querySelectorAll('[data-testid="pick-tile"]').length > 0 && g.scrollHeight > g.clientHeight;
      };
      if (ready()) return resolve();
      const mo = new MutationObserver(() => {
        if (ready()) {
          mo.disconnect();
          resolve();
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const openMs = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 100)); // late long tasks from the same render
    obs.disconnect();
    const long = w.__long!;
    return {
      openMs,
      nodes: document.querySelectorAll('*').length,
      longTaskMaxMs: long.length ? Math.max(...long) : 0,
      blockingMs: long.reduce((s, d) => s + Math.max(0, d - 50), 0),
    };
  });
}

/** Pairs of picker tiles whose rectangles overlap. Should always be 0. */
async function overlappingTiles(page: Page): Promise<number> {
  return page.evaluate(() => {
    const r = [...document.querySelectorAll('[data-testid="pick-tile"]')].map((t) => t.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++)
        if (r[i]!.left < r[j]!.right - 0.5 && r[j]!.left < r[i]!.right - 0.5 && r[i]!.top < r[j]!.bottom - 0.5 && r[j]!.top < r[i]!.bottom - 0.5) n++;
    return n;
  });
}

async function closePicker(page: Page): Promise<void> {
  await page.evaluate(() => (document.querySelector('[aria-label="Close dialog"]') as HTMLElement).click());
  await expect(page.locator(tilesSel)).toHaveCount(0);
}

/** One frame-by-frame scroll through the grid; returns frame gaps in ms. */
async function scrollGrid(page: Page): Promise<{ max: number; p95: number }> {
  return page.evaluate(async () => {
    const grid = document.querySelector('[data-testid="picker-grid"]') as HTMLElement;
    const gaps: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 90; i++) {
      grid.scrollTop += Math.max(200, grid.scrollHeight / 90);
      await new Promise((r) => requestAnimationFrame(r));
      const t = performance.now();
      gaps.push(t - last);
      last = t;
    }
    gaps.sort((a, b) => a - b);
    return { max: gaps[gaps.length - 1]!, p95: gaps[Math.floor(gaps.length * 0.95)]! };
  });
}

for (const n of sizes('ui')) {
  test(`picker with ${n.toLocaleString('en-US')} images`, async ({ app, harness }) => {
    test.setTimeout(process.env['PERF_UPDATE'] === '1' ? 1_800_000 : 600_000);
    const lib = makeLibrary({ images: n, layout: 'flat', content: tiny });
    libs.push(lib);
    harness.pickNext(lib.root);
    await harness.api.linkFolder();
    await app.reload();
    await expect(app.getByTestId('pick-open')).toBeVisible();
    await expect(app.getByTestId('start-session')).toBeEnabled(); // the page has finished loading its settings

    // Each sample opens the picker from scratch; the metrics below share those runs.
    const opens = shared(async () => {
      const r = await openPicker(app);
      await closePicker(app);
      return r;
    });
    await perf.measure(`picker.${n}.open.ms`, opens.sampler((r) => r.openMs), { unit: 'ms', runs: n >= 50_000 ? 3 : 5 });
    await perf.measure(`picker.${n}.domNodes`, opens.sampler((r) => r.nodes), { unit: 'count', runs: 1, warmup: 0 });
    await perf.measure(`picker.${n}.longTaskMax.ms`, opens.sampler((r) => r.longTaskMaxMs), { unit: 'ms', info: true, runs: 3, warmup: 0 });
    await perf.measure(`picker.${n}.blocking.ms`, opens.sampler((r) => r.blockingMs), { unit: 'ms', info: true, runs: 3, warmup: 0 });

    await openPicker(app);
    expect(await overlappingTiles(app), 'picker tiles overlap').toBe(0);

    // Selecting everything and then one tile copies the whole selection each time.
    await perf.measure(`picker.${n}.selectAll.ms`, async () => {
      await app.getByTestId('picker-none').click();
      return app.evaluate(async () => {
        const t0 = performance.now();
        (document.querySelector('[data-testid="picker-all"]') as HTMLElement).click();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return performance.now() - t0;
      });
    }, { unit: 'ms', runs: 3 });
    await expect(app.getByTestId('picker-count')).toHaveText(`${n} of ${n} picked`);
    let k = 0;
    await perf.measure(`picker.${n}.toggleOne.ms`, () => {
      const i = k++ % 20;
      return app.evaluate(async (i) => {
        const tile = document.querySelectorAll('[data-testid="pick-tile"]')[i] as HTMLElement;
        const t0 = performance.now();
        tile.click();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return performance.now() - t0;
      }, i);
    }, { unit: 'ms', runs: 5 });

    const scroll = shared(() => scrollGrid(app));
    await perf.measure(`picker.${n}.scrollWorstFrame.ms`, scroll.sampler((s) => s.max), { unit: 'ms', info: true, runs: 3, warmup: 0 });
    await perf.measure(`picker.${n}.scrollP95Frame.ms`, scroll.sampler((s) => s.p95), { unit: 'ms', runs: 3, warmup: 0 });
  });

  test(`starting a session with ${n.toLocaleString('en-US')} images`, async ({ app, harness }) => {
    test.setTimeout(process.env['PERF_UPDATE'] === '1' ? 1_800_000 : 600_000);
    const lib = makeLibrary({ images: n, layout: 'flat', content: tiny });
    libs.push(lib);
    harness.pickNext(lib.root);
    await harness.api.linkFolder();
    await app.reload();
    await app.getByTestId('setup-mode-none').click();
    await expect(app.getByTestId('start-session')).toBeEnabled();

    await perf.measure(`session.${n}.startToFirstImage.ms`, async () => {
      await app.reload();
      await expect(app.getByTestId('start-session')).toBeEnabled();
      return app.evaluate(async () => {
        const t0 = performance.now();
        (document.querySelector('[data-testid="start-session"]') as HTMLElement).click();
        await new Promise<void>((resolve) => {
          const ok = () => {
            const img = document.querySelector('[data-testid="reference-image"]') as HTMLImageElement | null;
            return !!img && img.complete && img.naturalWidth > 0;
          };
          const tick = () => (ok() ? resolve() : requestAnimationFrame(tick));
          tick();
        });
        return performance.now() - t0;
      });
    }, { unit: 'ms', runs: n >= 50_000 ? 3 : 5 });

    await perf.measure(`session.${n}.nextImage.ms`, () =>
      app.evaluate(async () => {
        const before = (document.querySelector('[data-testid="reference-image"]') as HTMLImageElement).src;
        const t0 = performance.now();
        (document.querySelector('[data-testid="next"]') as HTMLElement).click();
        await new Promise<void>((resolve) => {
          const tick = () => {
            const img = document.querySelector('[data-testid="reference-image"]') as HTMLImageElement;
            if (img.src !== before && img.complete && img.naturalWidth > 0) resolve();
            else requestAnimationFrame(tick);
          };
          tick();
        });
        return performance.now() - t0;
      }), { unit: 'ms', runs: 5 });
  });
}
