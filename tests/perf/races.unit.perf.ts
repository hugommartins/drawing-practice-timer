/**
 * Overlapping and slow scans, driven through the real createApi with a file system that can be held
 * back. Deterministic: nothing here measures time, it checks what the app ends up believing.
 *
 * Tests marked `todo` fail against the current code on purpose. They document a real defect found by
 * reading the code; node reports them as todo, they do not fail the run, and removing the flag after
 * a fix turns them into ordinary tests.
 * Run: npm run perf:unit
 */
import assert from 'node:assert/strict';
import { promises as fsp, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createApi } from '../../src/main/handlers';
import { createPerf } from './lib';

const perf = createPerf({ lane: 'unit' });

const realReaddir = fsp.readdir.bind(fsp);
let readdirCalls = 0;
/** Called after the real readdir has run, before its result is handed back. Return a promise to hold the call. */
let hook: ((dir: string, result: unknown) => Promise<void> | void) | null = null;

beforeEach(() => {
  readdirCalls = 0;
  hook = null;
  (fsp as unknown as { readdir: unknown }).readdir = async (dir: string, opts: unknown) => {
    readdirCalls++;
    const res = await (realReaddir as (d: string, o: unknown) => Promise<unknown>)(dir, opts);
    await hook?.(String(dir), res);
    return res;
  };
});
afterEach(() => {
  (fsp as unknown as { readdir: unknown }).readdir = realReaddir;
});

const gate = () => {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
};
const tick = () => new Promise((r) => setTimeout(r, 20)); // lets a held scan reach its hold

/** Holds the first readdir (optionally only for one folder) until the returned gate opens. */
function holdFirst(only?: string) {
  const g = gate();
  let first = true;
  hook = async (dir) => {
    if (first && (only === undefined || dir === only)) {
      first = false;
      await g.promise;
    }
  };
  return g;
}

async function folder(name: string, from: number, to: number): Promise<string> {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'perf-race-')), name);
  await fsp.mkdir(dir, { recursive: true });
  for (let i = from; i <= to; i++) writeFileSync(path.join(dir, `img_${i}.png`), '');
  return dir;
}
async function addImages(dir: string, from: number, to: number) {
  for (let i = from; i <= to; i++) writeFileSync(path.join(dir, `img_${i}.png`), '');
}

/** Links `picks` in order and returns the api (warm cache), the collection ids and the data dir. */
async function link(picks: string[]) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'perf-race-data-'));
  const queue = [...picks];
  const a = createApi({ dataDir, pickFolder: async () => queue.shift() ?? null });
  const ids: string[] = [];
  for (let i = 0; i < picks.length; i++) ids.push((await a.linkFolder())!.collection.id);
  return { a, ids, dataDir, queue };
}
/** A second api over the same data: what the app has right after a restart (nothing cached). */
const restart = (dataDir: string) => createApi({ dataDir, pickFolder: async () => null });

describe('overlapping scans', () => {
  test('a repeated list request is served from the cache (no second walk)', async () => {
    const dir = await folder('refs', 1, 20);
    const { a, ids } = await link([dir]);
    const walked = readdirCalls;
    await a.listCollections();
    await a.collectionImages(ids[0]!);
    assert.equal(readdirCalls, walked, 'cached list was walked again');
  });

  test(
    'rescan while an older rescan is still running: the newest answer wins',
    { todo: 'last write wins: an older scan that finishes late overwrites the cache with stale results' },
    async () => {
      const dir = await folder('refs', 1, 3);
      const { a, ids } = await link([dir]);
      const id = ids[0]!;

      const held = holdFirst();
      const older = a.rescanCollection(id); // reads 3 images, then is held
      await tick();
      await addImages(dir, 4, 5);
      const newer = await a.rescanCollection(id); // sees 5 and finishes first
      assert.equal(newer!.count, 5);

      held.open();
      await older;
      assert.equal((await a.collectionImages(id)).length, 5, 'the older scan overwrote the newer result');
    },
  );

  test(
    'relink while the old folder is still being scanned: the new folder wins',
    { todo: 'last write wins: the scan of the previous path can land after the relink' },
    async () => {
      const oldDir = await folder('old', 1, 3);
      const newDir = await folder('new', 1, 7);
      const { a, ids, queue } = await link([oldDir]);
      const id = ids[0]!;

      const held = holdFirst(oldDir);
      const stale = a.rescanCollection(id);
      await tick();
      queue.push(newDir);
      const relinked = await a.relinkCollection(id);
      assert.equal(relinked!.count, 7);

      held.open();
      await stale;
      assert.equal((await a.collectionImages(id)).length, 7, "the old folder's list replaced the new one");
    },
  );

  test('remove while scanning leaves nothing that can be read back', async () => {
    const dir = await folder('refs', 1, 4);
    const { a, ids } = await link([dir]);
    const id = ids[0]!;
    const held = holdFirst();
    const scanning = a.rescanCollection(id);
    await tick();
    await a.removeCollection(id);
    held.open();
    await scanning;
    assert.deepEqual(await a.collectionImages(id), []);
    assert.equal((await a.listCollections()).length, 0);
  });
});

describe('slow folders', () => {
  test(
    'one stalled folder does not hold up the list of the others',
    { todo: 'listCollections waits for every folder, so one stalled drive blocks the whole Library and Draw page' },
    async () => {
      const fast = await folder('fast', 1, 5);
      const slow = await folder('slow', 1, 5);
      const { dataDir } = await link([fast, slow]);
      const cold = restart(dataDir);

      const stall = holdFirst(slow);
      const outcome = await Promise.race([
        cold.listCollections().then(() => 'listed' as const),
        new Promise<'hung'>((r) => setTimeout(() => r('hung'), 1500)), // detection only, not a budget
      ]);
      stall.open();
      assert.equal(outcome, 'listed', 'the list did not come back while one folder was stalled');
    },
  );

  test(
    'startup and a session start asking at the same moment walk the folder once',
    { todo: 'there is no in-flight sharing: two requests for an uncached folder start two walks' },
    async () => {
      const dir = await folder('refs', 1, 10);
      const { dataDir, ids } = await link([dir]);
      const cold = restart(dataDir);
      readdirCalls = 0;
      await Promise.all([cold.listCollections(), cold.collectionImages(ids[0]!)]);
      await perf.observe('scan.concurrentRequests.readdirCalls', readdirCalls, { unit: 'count', info: true });
      assert.equal(readdirCalls, 1, 'two overlapping requests walked the folder twice');
    },
  );
});
