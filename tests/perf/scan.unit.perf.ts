/**
 * Scan cost and correctness at scale. Zero-byte files stand in for images: a scan never reads contents.
 * Run: npm run perf:unit
 */
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { after, describe, test } from 'node:test';
import { isImageFile, scanImages } from '../../src/main/library';
import { createPerf, makeLibrary, sizes, type Library } from './lib';

const perf = createPerf({ lane: 'unit' });
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const libs: Library[] = [];
after(() => libs.forEach((l) => l.remove()));

const gc = (globalThis as { gc?: () => void }).gc;
const now = () => performance.now();

for (const layout of ['flat', 'nested'] as const) {
  for (const n of sizes('unit')) {
    describe(`${layout} library, ${n.toLocaleString('en-US')} images`, () => {
      let lib: Library;
      test('setup', () => {
        lib = makeLibrary({ images: n, layout });
        libs.push(lib);
      });

      test('correctness: count, order, no duplicates, hidden and non-image files skipped', async () => {
        const { files, reachable } = await scanImages(lib.root);
        assert.equal(reachable, true);
        assert.equal(files.length, lib.images);
        assert.equal(new Set(files).size, files.length, 'duplicate paths');
        assert.ok(files.every((f) => !f.split('/').some((p) => p.startsWith('.'))), 'hidden file listed');
        assert.ok(files.every((f) => !/\.(txt|psd|xmp|json)$/i.test(f)), 'non-image listed');
        for (let i = 1; i < files.length; i++) {
          assert.ok(collator.compare(files[i - 1]!, files[i]!) <= 0, `out of order at ${i}: ${files[i - 1]} then ${files[i]}`);
        }
      });

      test('scan time', async () => {
        await perf.measure(`scan.${layout}.${n}.ms`, async () => {
          const t = now();
          await scanImages(lib.root);
          return now() - t;
        }, { unit: 'ms', runs: n >= 50_000 ? 3 : 5 });
      });

      test('main process stays responsive during a scan (event-loop delay)', async () => {
        const runOnce = async () => {
          const h = monitorEventLoopDelay({ resolution: 1 });
          h.enable();
          await scanImages(lib.root);
          h.disable();
          return { p99: h.percentile(99) / 1e6, max: h.max / 1e6 };
        };
        const samples: { p99: number; max: number }[] = [];
        await perf.measure(`scan.${layout}.${n}.loopP99.ms`, async () => {
          const r = await runOnce();
          samples.push(r);
          return r.p99;
        }, { unit: 'ms', runs: 3 });
        const last = samples[samples.length - 1]!;
        await perf.observe(`scan.${layout}.${n}.loopMax.ms`, last.max, { unit: 'ms', info: true });
      });

      if (layout === 'flat') {
        test('hotspot check: what does the locale-aware sort cost on this list?', async () => {
          const names = (await fsp.readdir(lib.root)).filter((f) => !f.startsWith('.') && isImageFile(f));
          const shuffled = [...names].sort(() => Math.random() - 0.5);
          const sortMs = (input: string[]) => () => {
            const copy = [...input];
            const t = now();
            copy.sort((a, b) => collator.compare(a, b));
            return now() - t;
          };
          // In the order the OS lists them, which is what a scan actually sorts.
          await perf.measure(`scan.flat.${n}.sortWalkOrder.ms`, sortMs(names), { unit: 'ms', info: true, runs: 3 });
          // Worst case: a file system that lists in no useful order.
          await perf.measure(`scan.flat.${n}.sortShuffled.ms`, sortMs(shuffled), { unit: 'ms', info: true, runs: 3 });
        });
      }

      test('memory held by one scan result', async () => {
        if (!gc) return; // needs node --expose-gc, which `npm run perf:unit` passes
        const measureOnce = async () => {
          gc();
          const before = process.memoryUsage().heapUsed;
          const res = await scanImages(lib.root);
          gc();
          const after = process.memoryUsage().heapUsed;
          assert.ok(res.files.length > 0); // keeps `res` alive until after the second reading
          return (after - before) / 2 ** 20;
        };
        // Below 10,000 files the figure is a fraction of a MB and mostly GC noise, so it is recorded only.
        await perf.measure(`scan.${layout}.${n}.heldMB`, measureOnce, { unit: 'MB', runs: 3, info: n < 10_000 });
      });
    });
  }
}
