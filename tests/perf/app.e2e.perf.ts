/**
 * Whole-app performance in the real Electron window: launch time, the image list over IPC,
 * process memory, a long run of image changes, and very large image files.
 * Run: npm run perf:e2e   (needs `npm install` for the electron binary; builds first)
 *
 * Process memory comes from app.getAppMetrics() (working set), the renderer's JS heap from the
 * DevTools protocol after a forced garbage collection.
 */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { linkSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makePng } from '../helpers/fixtures';
import { appNames, createPerf, makeLibrary, shared, sizes, type Library } from './lib';

const perf = createPerf({ lane: 'e2e' });
const names = appNames();
const root = path.resolve(__dirname, '../..');
const tiny = makePng(16, 16, 1);

test.describe.configure({ mode: 'serial' });

const cleanups: (() => void)[] = [];
test.afterAll(() => cleanups.forEach((c) => c()));

interface Seed {
  name: string;
  dir: string;
}

/** Writes collections.json into a fresh data dir, then launches the app on it. */
async function launch(seed: Seed[] = []): Promise<{ app: ElectronApplication; page: Page; ids: string[]; t0: number; userData: string }> {
  const userData = mkdtempSync(path.join(tmpdir(), 'perf-e2e-'));
  cleanups.push(() => rmSync(userData, { recursive: true, force: true }));
  const dataDir = path.join(userData, 'data');
  mkdirSync(dataDir, { recursive: true });
  const cols = seed.map((s, i) => ({ id: `perf-${i}`, name: s.name, path: s.dir, createdAt: new Date().toISOString() }));
  writeFileSync(path.join(dataDir, 'collections.json'), JSON.stringify(cols));
  const t0 = Date.now();
  const app = await electron.launch({
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    cwd: root,
    env: {
      ...(process.env as Record<string, string>),
      [`${names.prefix}_USER_DATA`]: userData,
      [`${names.prefix}_DATA_DIR`]: dataDir,
    },
  });
  const page = await app.firstWindow();
  return { app, page, ids: cols.map((c) => c.id), t0, userData };
}

/** Working-set memory in MB for the main process and for the renderer(s). */
async function processMB(app: ElectronApplication): Promise<{ main: number; renderer: number }> {
  const rows = await app.evaluate(({ app }: { app: { getAppMetrics(): { type: string; memory: { workingSetSize: number } }[] } }) => app.getAppMetrics().map((p) => ({ type: p.type, kb: p.memory.workingSetSize })));
  const sum = (t: string) => rows.filter((r) => r.type === t).reduce((s, r) => s + r.kb, 0) / 1024;
  return { main: sum('Browser'), renderer: sum('Tab') };
}

/** Renderer JS heap in MB after a forced collection. */
async function heapMB(page: Page): Promise<number> {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
    await cdp.detach();
    return usedSize / 2 ** 20;
  } catch {
    return page.evaluate(() => ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 2 ** 20);
  }
}

const sel = (id: string) => `[data-testid="${id}"]`;

/**
 * Click an element in the page; resolve (in ms) when the named condition holds and a frame has painted.
 * Written without eval: the renderer's content security policy forbids it.
 */
function clickUntil(page: Page, clickId: string, until: 'firstImage' | 'pickerVisibleDecoded'): Promise<number> {
  return page.evaluate(
    async ({ clickId, until }) => {
      const ready = (): boolean => {
        if (until === 'firstImage') {
          const i = document.querySelector('[data-testid="reference-image"]') as HTMLImageElement | null;
          return !!i && i.complete && i.naturalWidth > 0;
        }
        const tiles = [...document.querySelectorAll('[data-testid="pick-tile"] img')] as HTMLImageElement[];
        const visible = tiles.filter((i) => i.getBoundingClientRect().top < innerHeight);
        return tiles.length > 0 && visible.length > 0 && visible.every((i) => i.complete && i.naturalWidth > 0);
      };
      const t0 = performance.now();
      (document.querySelector(`[data-testid="${clickId}"]`) as HTMLElement).click();
      await new Promise<void>((resolve) => {
        const tick = () => (ready() ? resolve() : requestAnimationFrame(tick));
        tick();
      });
      await new Promise((r) => requestAnimationFrame(r));
      return performance.now() - t0;
    },
    { clickId, until },
  );
}

const waitFirstImage = (page: Page) =>
  page.waitForFunction(() => {
    const i = document.querySelector('[data-testid="reference-image"]') as HTMLImageElement | null;
    return !!i && i.complete && i.naturalWidth > 0;
  });
const clickNext = (page: Page) => page.evaluate(() => (document.querySelector('[data-testid="next"]') as HTMLElement).click());

for (const n of sizes('e2e')) {
  test.describe(`library of ${n.toLocaleString('en-US')} images`, () => {
    let libs: Library[] = [];
    test.beforeAll(() => {
      // Three folders, so startup scans several collections.
      libs = [0, 1, 2].map(() => makeLibrary({ images: n, layout: 'flat', content: tiny }));
      cleanups.push(() => libs.forEach((l) => l.remove()));
    });

    test('launch to a usable window', async () => {
      test.setTimeout(process.env['PERF_UPDATE'] === '1' ? 3_600_000 : 900_000);
      const total = n * 3;
      const empty = async () => {
        const { app, page, t0 } = await launch([]);
        try {
          await page.waitForSelector(sel('empty-practice'));
          return Date.now() - t0;
        } finally {
          await app.close();
        }
      };
      const full = async () => {
        const { app, page, t0 } = await launch(libs.map((l, i) => ({ name: `Folder ${i + 1}`, dir: l.root })));
        try {
          await expect(page.getByTestId('stat-library')).toContainText(String(total), { timeout: 240_000 });
          return Date.now() - t0;
        } finally {
          await app.close();
        }
      };
      if (n === sizes('e2e')[0]) await perf.measure('launch.empty.ms', empty, { unit: 'ms', runs: 3 });
      await perf.measure(`launch.3x${n}.toLibraryCount.ms`, full, { unit: 'ms', runs: 3 });
    });

    test('image list over IPC, and memory with the library open', async () => {
      test.setTimeout(process.env['PERF_UPDATE'] === '1' ? 3_600_000 : 900_000);
      const scenario = shared(async () => {
        const { app, page, ids } = await launch([{ name: 'Big', dir: libs[0]!.root }]);
        try {
          await expect(page.getByTestId('stat-library')).toContainText(String(n), { timeout: 240_000 });
          const afterLaunch = await processMB(app);
          const heapLaunch = await heapMB(page);

          const call = await page.evaluate(
            async ({ g, id }) => {
              const api = (window as unknown as Record<string, { api: { collectionImages(id: string): Promise<string[]> } }>)[g]!.api;
              const times: number[] = [];
              let bytes = 0;
              for (let i = 0; i < 6; i++) {
                const t0 = performance.now();
                const list = await api.collectionImages(id);
                times.push(performance.now() - t0);
                bytes = JSON.stringify(list).length;
              }
              times.shift(); // first call warms the path
              times.sort((a, b) => a - b);
              return { ms: times[times.length >> 1]!, bytes };
            },
            { g: names.global, id: ids[0]! },
          );

          await page.click(sel('pick-open'));
          await page.waitForSelector(sel('pick-tile'));
          // The picker draws only the rows in view. A scroll area as tall as n images would need proves the list arrived.
          await page.waitForFunction(() => {
            const g = document.querySelector('[data-testid="picker-grid"]') as HTMLElement | null;
            return !!g && g.scrollHeight > g.clientHeight;
          });
          const overlaps = await page.evaluate(() => {
            const r = [...document.querySelectorAll('[data-testid="pick-tile"]')].map((t) => t.getBoundingClientRect());
            let c = 0;
            for (let i = 0; i < r.length; i++)
              for (let j = i + 1; j < r.length; j++)
                if (r[i]!.left < r[j]!.right - 0.5 && r[j]!.left < r[i]!.right - 0.5 && r[i]!.top < r[j]!.bottom - 0.5 && r[j]!.top < r[i]!.bottom - 0.5) c++;
            return c;
          });
          expect(overlaps, 'picker tiles overlap in the real window').toBe(0);
          const afterPicker = await processMB(app);
          const heapPicker = await heapMB(page);
          return { afterLaunch, afterPicker, heapLaunch, heapPicker, ...call };
        } finally {
          await app.close();
        }
      });
      const opts = { runs: 3, warmup: 0 } as const;
      await perf.measure(`ipc.${n}.collectionImages.ms`, scenario.sampler((r) => r.ms), { unit: 'ms', ...opts });
      await perf.measure(`ipc.${n}.listBytes`, scenario.sampler((r) => r.bytes), { unit: 'bytes', runs: 1, warmup: 0 });
      await perf.measure(`memory.${n}.main.afterLaunch.MB`, scenario.sampler((r) => r.afterLaunch.main), { unit: 'MB', ...opts });
      await perf.measure(`memory.${n}.renderer.afterLaunch.MB`, scenario.sampler((r) => r.afterLaunch.renderer), { unit: 'MB', ...opts });
      await perf.measure(`memory.${n}.renderer.afterPicker.MB`, scenario.sampler((r) => r.afterPicker.renderer), { unit: 'MB', ...opts });
      await perf.measure(`memory.${n}.heap.afterLaunch.MB`, scenario.sampler((r) => r.heapLaunch), { unit: 'MB', info: true, ...opts });
      await perf.measure(`memory.${n}.heap.afterPicker.MB`, scenario.sampler((r) => r.heapPicker), { unit: 'MB', info: true, ...opts });
    });
  });
}

test('memory stays flat over 200 image changes', async () => {
  test.setTimeout(process.env['PERF_UPDATE'] === '1' ? 3_600_000 : 600_000);
  // Mid-size real images, so decoding and caching actually happen: 40 hard links to 4 distinct files.
  const lib = makeLibrary({ images: 0, layout: 'flat' });
  cleanups.push(() => lib.remove());
  const distinct: string[] = [];
  for (let i = 0; i < 4; i++) {
    const f = path.join(lib.root, `src_${i}.png`);
    writeFileSync(f, makePng(1600, 1066, i + 1));
    distinct.push(f);
  }
  for (let i = 0; i < 36; i++) {
    const to = path.join(lib.root, `copy_${String(i).padStart(2, '0')}.png`);
    try {
      linkSync(distinct[i % 4]!, to);
    } catch {
      copyFileSync(distinct[i % 4]!, to);
    }
  }

  const scenario = shared(async () => {
    const { app, page } = await launch([{ name: 'Mid', dir: lib.root }]);
    try {
      await expect(page.getByTestId('stat-library')).toContainText('40');
      await page.getByTestId('setup-mode-none').click();
      await page.getByTestId('start-session').click();
      await expect(page.getByTestId('reference-image')).toBeVisible();
      const heap0 = await heapMB(page);
      const ws0 = (await processMB(app)).renderer;
      for (let i = 0; i < 200; i++) {
        await clickNext(page);
        if (i % 10 === 9) await waitFirstImage(page);
      }
      await waitFirstImage(page);
      const heap1 = await heapMB(page);
      const ws1 = (await processMB(app)).renderer;
      return { heapGrowth: heap1 - heap0, workingSetGrowth: ws1 - ws0 };
    } finally {
      await app.close();
    }
  });
  await perf.measure('memory.200changes.heapGrowth.MB', scenario.sampler((r) => r.heapGrowth), { unit: 'MB', runs: 3, warmup: 0 });
  await perf.measure('memory.200changes.workingSetGrowth.MB', scenario.sampler((r) => r.workingSetGrowth), { unit: 'MB', info: true, runs: 3, warmup: 0 });
});

test('very large image files', async () => {
  test.setTimeout(process.env['PERF_UPDATE'] === '1' ? 3_600_000 : 900_000);
  // One 48-megapixel image, hard-linked 40 times so the folder looks full but costs the disk once.
  const lib = makeLibrary({ images: 0, layout: 'flat' });
  cleanups.push(() => lib.remove());
  const big = path.join(lib.root, 'big_000.png');
  writeFileSync(big, makePng(8000, 6000, 3));
  for (let i = 1; i < 40; i++) {
    const to = path.join(lib.root, `big_${String(i).padStart(3, '0')}.png`);
    try {
      linkSync(big, to);
    } catch {
      copyFileSync(big, to);
    }
  }

  const scenario = shared(async () => {
    const { app, page, userData } = await launch([{ name: 'Large', dir: lib.root }]);
    try {
      await expect(page.getByTestId('stat-library')).toContainText('40');
      const pickerMs = await clickUntil(page, 'pick-open', 'pickerVisibleDecoded'); // cold: previews are made now
      const afterPicker = (await processMB(app)).renderer;
      const tileWidth = await page.evaluate(() => (document.querySelector('[data-testid="pick-tile"] img') as HTMLImageElement).naturalWidth);
      expect(tileWidth, 'picker tile is a preview, not the 48-megapixel original').toBeLessThanOrEqual(320);
      await page.evaluate(() => (document.querySelector('[aria-label="Close dialog"]') as HTMLElement).click());
      await page.waitForTimeout(300);
      const warmMs = await clickUntil(page, 'pick-open', 'pickerVisibleDecoded'); // warm: from the cache on disk
      const cacheDir = path.join(userData, 'thumbs');
      let cacheMB = 0;
      if (existsSync(cacheDir)) for (const d of readdirSync(cacheDir)) for (const f of readdirSync(path.join(cacheDir, d))) cacheMB += statSync(path.join(cacheDir, d, f)).size / 2 ** 20;
      await page.evaluate(() => (document.querySelector('[aria-label="Close dialog"]') as HTMLElement).click());
      await page.getByTestId('setup-mode-none').click();
      const startMs = await clickUntil(page, 'start-session', 'firstImage');
      for (let i = 0; i < 5; i++) {
        await clickNext(page);
        await waitFirstImage(page);
      }
      const afterFive = (await processMB(app)).renderer;
      return { pickerMs, warmMs, cacheMB, startMs, afterPicker, afterFive };
    } finally {
      await app.close();
    }
  });
  const o = { runs: 3, warmup: 1 } as const;
  await perf.measure('largeImage.picker.visibleDecoded.ms', scenario.sampler((r) => r.pickerMs), { unit: 'ms', ...o });
  await perf.measure('largeImage.picker.warm.ms', scenario.sampler((r) => r.warmMs), { unit: 'ms', ...o });
  await perf.measure('largeImage.thumbCache.MB', scenario.sampler((r) => r.cacheMB), { unit: 'MB', info: true, ...o });
  await perf.measure('largeImage.session.startToFirstImage.ms', scenario.sampler((r) => r.startMs), { unit: 'ms', ...o });
  await perf.measure('largeImage.renderer.afterPicker.MB', scenario.sampler((r) => r.afterPicker), { unit: 'MB', ...o });
  await perf.measure('largeImage.renderer.afterFiveImages.MB', scenario.sampler((r) => r.afterFive), { unit: 'MB', ...o });
});
