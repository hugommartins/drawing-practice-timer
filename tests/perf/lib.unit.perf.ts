/**
 * Checks the lane's own rules with fake clocks and a throwaway baseline file, so a broken
 * budget check shows up here and not as a mystery in a real run.
 * Run: npm run perf:unit
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { budgetOf, createPerf, median, NOISE_FLOOR, percentile, PerfBudgetError } from './lib';

function fresh(update = false) {
  const dir = mkdtempSync(path.join(tmpdir(), 'perf-lib-'));
  const baselinesFile = path.join(dir, 'baselines.json');
  return { baselinesFile, make: (u = update) => createPerf({ lane: 'selftest', baselinesFile, resultsDir: dir, tag: 'test', update: u }) };
}
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)]!;
};

describe('perf lane rules', () => {
  test('median and percentile', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
  });

  test('no baseline: records and passes', async () => {
    const { make } = fresh();
    const o = await make().measure('m', () => 1000, { unit: 'ms', runs: 3 });
    assert.equal(o.status, 'measured');
  });

  test('recording a baseline stores the median, the spread as noise, and the floor when quiet', async () => {
    const { make, baselinesFile } = fresh();
    // Each of the 5 repeats takes `runs` samples; give them different medians.
    const medians = [100, 110, 90, 100, 105];
    let r = 0;
    await make(true).measure('m', () => medians[Math.floor(r++ / 3) % 5]!, { unit: 'ms', runs: 3, warmup: 0 });
    const b = JSON.parse(readFileSync(baselinesFile, 'utf8')).test.m;
    assert.equal(b.value, 100);
    assert.equal(b.noise, 20); // 110 - 90
    const quiet = fresh();
    await quiet.make(true).measure('q', () => 200, { unit: 'ms', runs: 3, warmup: 0 });
    assert.equal(JSON.parse(readFileSync(quiet.baselinesFile, 'utf8')).test.q.noise, 200 * NOISE_FLOOR);
    const counts = fresh();
    await counts.make(true).measure('c', () => 4000, { unit: 'count', runs: 1, warmup: 0 });
    assert.equal(JSON.parse(readFileSync(counts.baselinesFile, 'utf8')).test.c.noise, 0);
  });

  test('within budget passes; over budget on both tries fails; a one-off miss passes after the repeat', async () => {
    const f = fresh();
    await f.make(true).measure('m', () => 100, { unit: 'ms', runs: 1, warmup: 0 }); // value 100, noise 5 -> budget 115
    assert.equal(budgetOf({ value: 100, noise: 5, unit: 'ms', n: 5 }), 115);

    const ok = await f.make(false).measure('m', () => 114, { unit: 'ms', runs: 1, warmup: 0 });
    assert.equal(ok.status, 'ok');

    await assert.rejects(f.make(false).measure('m', () => 140, { unit: 'ms', runs: 1, warmup: 0 }), PerfBudgetError);

    const flaky = await f.make(false).measure('m', seq(140, 101), { unit: 'ms', runs: 1, warmup: 0 });
    assert.equal(flaky.status, 'ok');
    assert.equal(flaky.retried, true);
  });

  test('count metrics have no slack: one more node is over', async () => {
    const f = fresh();
    await f.make(true).measure('n', () => 500, { unit: 'count', runs: 1, warmup: 0 });
    await f.make(false).measure('n', () => 500, { unit: 'count', runs: 1, warmup: 0 });
    await assert.rejects(f.make(false).measure('n', () => 501, { unit: 'count', runs: 1, warmup: 0 }), PerfBudgetError);
  });

  test('info metrics are never gated and never baselined', async () => {
    const f = fresh();
    await f.make(true).measure('i', () => 1, { unit: 'ms', info: true, runs: 1, warmup: 0 });
    assert.equal(f.make().readBaselines().test, undefined);
    const o = await f.make(false).measure('i', () => 1e9, { unit: 'ms', info: true, runs: 1, warmup: 0 });
    assert.equal(o.status, 'info');
  });

  test('a baseline for another machine class is ignored', async () => {
    const f = fresh();
    await f.make(true).measure('m', () => 10, { unit: 'ms', runs: 1, warmup: 0 });
    const other = createPerf({ lane: 'selftest', baselinesFile: f.baselinesFile, resultsDir: path.dirname(f.baselinesFile), tag: 'other', update: false });
    assert.equal((await other.measure('m', () => 9999, { unit: 'ms', runs: 1, warmup: 0 })).status, 'measured');
  });
});
