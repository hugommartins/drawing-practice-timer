import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { createThumbnailer } from '../../src/main/thumbs';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'thumbs-test-'));
const jpeg = (n = 10) => Buffer.alloc(n, 7);

function setup(over: Partial<Parameters<typeof createThumbnailer>[0]> = {}) {
  const dir = tmp();
  const src = path.join(dir, 'src');
  const cacheDir = path.join(dir, 'cache');
  const calls: string[] = [];
  let active = 0;
  let peak = 0;
  const t = createThumbnailer({
    cacheDir,
    render: async (abs) => {
      calls.push(abs);
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return jpeg();
    },
    ...over,
  });
  const make = async (name: string, body = 'x') => {
    await fs.mkdir(src, { recursive: true });
    const f = path.join(src, name);
    await fs.writeFile(f, body);
    return f;
  };
  return { t, cacheDir, calls, make, peak: () => peak };
}

describe('thumbnail cache', () => {
  test('makes a preview once, then serves it from disk', async () => {
    const { t, calls, make } = setup();
    const f = await make('a.png');
    const p1 = await t.get(f);
    const p2 = await t.get(f);
    assert.ok(p1 && p1 === p2);
    assert.equal(calls.length, 1);
    assert.equal((await fs.readFile(p1)).length, 10);
  });

  test('the cache survives a restart (a new thumbnailer over the same directory)', async () => {
    const a = setup();
    const f = await a.make('a.png');
    await a.t.get(f);
    const calls: string[] = [];
    const again = createThumbnailer({ cacheDir: a.cacheDir, render: async (x) => (calls.push(x), jpeg()) });
    assert.ok(await again.get(f));
    assert.equal(calls.length, 0);
  });

  test('a changed file gets a new preview', async () => {
    const { t, calls, make } = setup();
    const f = await make('a.png', 'one');
    const first = await t.get(f);
    await fs.writeFile(f, 'a longer second version');
    const later = new Date(Date.now() + 5000);
    utimesSync(f, later, later);
    const second = await t.get(f);
    assert.notEqual(first, second);
    assert.equal(calls.length, 2);
  });

  test('requests for the same image at the same moment share one render', async () => {
    const { t, calls, make } = setup();
    const f = await make('a.png');
    const all = await Promise.all([t.get(f), t.get(f), t.get(f), t.get(f), t.get(f)]);
    assert.equal(new Set(all).size, 1);
    assert.equal(calls.length, 1);
  });

  test('only `concurrency` originals are decoded at once', async () => {
    const { t, make, peak, calls } = setup({ concurrency: 2 });
    const files = await Promise.all(Array.from({ length: 10 }, (_, i) => make(`img_${i}.png`, String(i))));
    const out = await Promise.all(files.map((f) => t.get(f)));
    assert.ok(out.every(Boolean));
    assert.equal(calls.length, 10);
    assert.equal(peak(), 2);
  });

  test('a file that cannot be shrunk returns null and is not retried', async () => {
    const calls: string[] = [];
    const dir = tmp();
    const f = path.join(dir, 'weird.avif');
    writeFileSync(f, 'x');
    const t = createThumbnailer({ cacheDir: path.join(dir, 'c'), render: async (a) => (calls.push(a), null) });
    assert.equal(await t.get(f), null);
    assert.equal(await t.get(f), null);
    assert.equal(calls.length, 1);
  });

  test('a render that throws returns null', async () => {
    const dir = tmp();
    const f = path.join(dir, 'a.png');
    writeFileSync(f, 'x');
    const t = createThumbnailer({ cacheDir: path.join(dir, 'c'), render: async () => { throw new Error('decoder crashed'); } });
    assert.equal(await t.get(f), null);
  });

  test('a missing source returns null without rendering', async () => {
    const { t, calls } = setup();
    assert.equal(await t.get(path.join(tmp(), 'nope.png')), null);
    assert.equal(calls.length, 0);
  });

  test('an empty file in the cache is treated as a miss', async () => {
    const { t, calls, make } = setup();
    const f = await make('a.png');
    const p = (await t.get(f))!;
    await fs.writeFile(p, '');
    assert.equal(await t.get(f), p);
    assert.equal(calls.length, 2);
    assert.equal((await fs.stat(p)).size, 10);
  });

  test('no temporary files are left behind', async () => {
    const { t, cacheDir, make } = setup();
    await Promise.all(Array.from({ length: 6 }, (_, i) => make(`i${i}.png`, String(i)).then((f) => t.get(f))));
    const leftovers: string[] = [];
    for (const d of await fs.readdir(cacheDir)) for (const n of await fs.readdir(path.join(cacheDir, d))) if (!n.endsWith('.jpg')) leftovers.push(n);
    assert.deepEqual(leftovers, []);
  });

  test('prune removes the least recently used previews until under the limit', async () => {
    const { t, make } = setup({ maxBytes: 35 });
    const paths: string[] = [];
    for (let i = 0; i < 5; i++) paths.push((await t.get(await make(`i${i}.png`, String(i))))!); // 5 x 10 bytes
    const base = Date.now() / 1000;
    paths.forEach((p, i) => utimesSync(p, base - (5 - i) * 100, base - (5 - i) * 100)); // i0 oldest
    const removed = await t.prune();
    assert.equal(removed, 2);
    const left = await Promise.all(paths.map((p) => fs.stat(p).then(() => true, () => false)));
    assert.deepEqual(left, [false, false, true, true, true]);
  });

  test('prune does nothing when under the limit, or when there is no cache yet', async () => {
    const { t, make } = setup({ maxBytes: 1000 });
    assert.equal(await t.prune(), 0);
    await t.get(await make('a.png'));
    assert.equal(await t.prune(), 0);
  });
});
