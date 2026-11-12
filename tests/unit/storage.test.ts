import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createApi } from '../../src/main/handlers';
import { scanImages } from '../../src/main/library';
import { Storage } from '../../src/main/storage';
import { DEFAULT_SETTINGS } from '../../src/shared/types';
import { makeReferenceFolder } from '../helpers/fixtures';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'hatchmark-'));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const base = { mode: 'per-image' as const, seconds: 600, images: 10, source: 'app' as const, collectionId: null };

describe('Storage', () => {
  it('starts empty and returns defaults', async () => {
    const s = new Storage(path.join(tmp, 'data'));
    assert.deepEqual(await s.collections(), []);
    assert.deepEqual(await s.sessions(), []);
    assert.deepEqual(await s.settings(), DEFAULT_SETTINGS);
  });

  it('appends sessions as one JSON line each and reads them back in time order', async () => {
    const s = new Storage(path.join(tmp, 'data'));
    await s.appendSession({ ...base, date: '2026-10-29', startedAt: '2026-10-29T10:00:00.000Z', type: 'Figure' });
    await s.appendSession({ ...base, date: '2026-10-28', startedAt: '2026-10-28T10:00:00.000Z', type: 'Gesture' });
    const raw = readFileSync(path.join(tmp, 'data', 'sessions.jsonl'), 'utf8').trim().split('\n');
    assert.equal(raw.length, 2);
    assert.deepEqual((await s.sessions()).map((x) => x.type), ['Gesture', 'Figure']);
  });

  it('delete is a tombstone line; the earlier line stays in the file', async () => {
    const s = new Storage(path.join(tmp, 'data'));
    const a = await s.appendSession({ ...base, date: '2026-10-29', startedAt: '2026-10-29T10:00:00.000Z', type: 'Figure' });
    await s.deleteSession(a.id);
    assert.deepEqual(await s.sessions(), []);
    assert.equal(readFileSync(path.join(tmp, 'data', 'sessions.jsonl'), 'utf8').trim().split('\n').length, 2);
  });

  it('skips corrupt lines instead of failing', async () => {
    const dir = path.join(tmp, 'data');
    const s = new Storage(dir);
    const a = await s.appendSession({ ...base, date: '2026-10-29', startedAt: '2026-10-29T10:00:00.000Z', type: 'Figure' });
    appendFileSync(path.join(dir, 'sessions.jsonl'), '{"id": "broken", "da\nnot json at all\n');
    assert.deepEqual((await s.sessions()).map((x) => x.id), [a.id]);
  });

  it('settings merge over defaults and survive a partial or corrupt file', async () => {
    const dir = path.join(tmp, 'data');
    const s = new Storage(dir);
    const saved = await s.saveSettings({ theme: 'dark' });
    assert.equal(saved.theme, 'dark');
    assert.equal(saved.setup.perImageSec, DEFAULT_SETTINGS.setup.perImageSec);
    writeFileSync(path.join(dir, 'settings.json'), '{ nope');
    assert.deepEqual(await s.settings(), DEFAULT_SETTINGS);
  });
});

describe('scanImages', () => {
  it('finds images in subfolders, skips hidden and non-image files, sorts naturally', async () => {
    const dir = path.join(tmp, 'refs');
    const expected = makeReferenceFolder(dir, 12);
    const res = await scanImages(dir);
    assert.equal(res.reachable, true);
    assert.deepEqual(res.files, expected);
    assert.ok(!res.files.some((f) => f.includes('.hidden') || f.endsWith('.txt')));
  });
  it('reports a missing folder as unreachable', async () => {
    assert.deepEqual(await scanImages(path.join(tmp, 'nope')), { files: [], reachable: false });
  });
});

describe('createApi', () => {
  it('links a folder once, names it after the folder, counts its images', async () => {
    const refs = path.join(tmp, 'figure');
    makeReferenceFolder(refs, 8);
    const api = createApi({ dataDir: path.join(tmp, 'data'), pickFolder: async () => refs });
    const first = await api.linkFolder();
    assert.equal(first?.collection.name, 'figure');
    assert.equal(first?.collection.count, 8);
    assert.equal(first?.existing, false);
    const again = await api.linkFolder();
    assert.equal(again?.existing, true);
    assert.equal((await api.listCollections()).length, 1);
  });

  it('cancelling the dialog or picking a non-folder links nothing', async () => {
    let pick: string | null = null;
    const api = createApi({ dataDir: path.join(tmp, 'data'), pickFolder: async () => pick });
    assert.equal(await api.linkFolder(), null);
    pick = path.join(tmp, 'does-not-exist');
    assert.equal(await api.linkFolder(), null);
    assert.deepEqual(await api.listCollections(), []);
  });

  it('rename, rescan, relink and remove', async () => {
    const a = path.join(tmp, 'a');
    const b = path.join(tmp, 'b');
    makeReferenceFolder(a, 4);
    makeReferenceFolder(b, 9);
    let pick = a;
    const api = createApi({ dataDir: path.join(tmp, 'data'), pickFolder: async () => pick });
    const { collection } = (await api.linkFolder())!;
    assert.equal((await api.renameCollection(collection.id, '  Gesture  '))?.name, 'Gesture');
    assert.equal(await api.renameCollection(collection.id, '   '), null);
    writeFileSync(path.join(a, 'extra.png'), Buffer.from('x'));
    assert.equal((await api.listCollections())[0]?.count, 4); // cached until rescanned
    assert.equal((await api.rescanCollection(collection.id))?.count, 5);
    pick = b;
    assert.equal((await api.relinkCollection(collection.id))?.count, 9);
    assert.equal((await api.collectionImages(collection.id)).length, 9);
    await api.removeCollection(collection.id);
    assert.deepEqual(await api.listCollections(), []);
    assert.deepEqual(await api.collectionImages(collection.id), []);
  });

  it('a collection whose folder disappears is reported unreachable, not dropped', async () => {
    const refs = path.join(tmp, 'gone');
    makeReferenceFolder(refs, 3);
    const api = createApi({ dataDir: path.join(tmp, 'data'), pickFolder: async () => refs });
    const { collection } = (await api.linkFolder())!;
    rmSync(refs, { recursive: true });
    const after = await api.rescanCollection(collection.id);
    assert.equal(after?.reachable, false);
    assert.equal(after?.count, 0);
    assert.equal((await api.listCollections()).length, 1);
  });

  it('only folders that are linked count as allowed image roots', async () => {
    const refs = path.join(tmp, 'figure');
    makeReferenceFolder(refs, 2);
    const api = createApi({ dataDir: path.join(tmp, 'data'), pickFolder: async () => refs });
    await api.linkFolder();
    assert.deepEqual(await api.allowedRoots(), [refs]);
  });
});
