import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { authorizeImage, createApi } from '../../src/main/handlers';
import { windowOptions } from '../../src/main/window';
import { API_METHODS } from '../../src/shared/types';
import { makeReferenceFolder } from '../helpers/fixtures';

let tmp: string;
let folder: string;
let outside: string;
let picked: string | null;
const enc = (p: string) => encodeURIComponent(p);

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'hatchmark-sec-'));
  folder = path.join(tmp, 'Figure');
  outside = path.join(tmp, 'private');
  makeReferenceFolder(folder, 8);
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'secret.png'), 'not really a png');
  picked = folder;
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function makeApi() {
  return createApi({ dataDir: path.join(tmp, 'data'), pickFolder: async () => picked });
}

describe('image protocol gatekeeper (hatchmark-img://)', () => {
  it('serves images inside a linked folder, including subfolders', async () => {
    const api = makeApi();
    await api.linkFolder();
    assert.equal(await authorizeImage(api, enc(path.join(folder, 'fig_001.png'))), path.join(folder, 'fig_001.png'));
    assert.equal(await authorizeImage(api, enc(path.join(folder, 'poses', 'fig_004.png'))), path.join(folder, 'poses', 'fig_004.png'));
  });

  it('serves nothing before any folder is linked', async () => {
    assert.equal(await authorizeImage(makeApi(), enc(path.join(folder, 'fig_001.png'))), null);
  });

  it('refuses non-image files, even inside a linked folder', async () => {
    const api = makeApi();
    await api.linkFolder();
    assert.equal(await authorizeImage(api, enc(path.join(folder, 'notes.txt'))), null);
  });

  it('refuses images outside every linked folder', async () => {
    const api = makeApi();
    await api.linkFolder();
    assert.equal(await authorizeImage(api, enc(path.join(outside, 'secret.png'))), null);
  });

  it('refuses ../ traversal out of a linked folder', async () => {
    const api = makeApi();
    await api.linkFolder();
    assert.equal(await authorizeImage(api, enc(path.join(folder, '..', 'private', 'secret.png'))), null);
  });

  it('refuses a symlink inside the folder that points outside it', async () => {
    const api = makeApi();
    await api.linkFolder();
    symlinkSync(path.join(outside, 'secret.png'), path.join(folder, 'sneaky.png'));
    assert.equal(await authorizeImage(api, enc(path.join(folder, 'sneaky.png'))), null);
  });

  it('does not treat a sibling folder with the same prefix as inside', async () => {
    const api = makeApi();
    await api.linkFolder();
    const sibling = folder + '-extra';
    mkdirSync(sibling);
    writeFileSync(path.join(sibling, 'a.png'), 'x');
    assert.equal(await authorizeImage(api, enc(path.join(sibling, 'a.png'))), null);
  });

  it('refuses relative paths and broken encodings', async () => {
    const api = makeApi();
    await api.linkFolder();
    assert.equal(await authorizeImage(api, enc('fig_001.png')), null);
    assert.equal(await authorizeImage(api, '%E0%A4%A.png'), null);
    assert.equal(await authorizeImage(api, ''), null);
  });

  it('stops serving a folder once it is removed', async () => {
    const api = makeApi();
    const link = await api.linkFolder();
    const file = path.join(folder, 'fig_001.png');
    assert.ok(await authorizeImage(api, enc(file)));
    await api.removeCollection(link!.collection.id);
    assert.equal(await authorizeImage(api, enc(file)), null);
  });
});

describe('what the renderer can reach', () => {
  it('every method the preload exposes is implemented, and nothing else is', () => {
    const api = makeApi();
    const implemented = Object.keys(api).filter((k) => k !== 'allowedRoots').sort();
    assert.deepEqual([...API_METHODS].sort(), implemented);
  });

  it('allowedRoots stays main-process only', () => {
    assert.ok(!(API_METHODS as readonly string[]).includes('allowedRoots'));
  });

  it('window keeps the renderer sandboxed', () => {
    const w = windowOptions('/x/preload.cjs').webPreferences;
    assert.equal(w.contextIsolation, true);
    assert.equal(w.nodeIntegration, false);
    assert.equal(w.sandbox, true);
    assert.equal(w.preload, '/x/preload.cjs');
  });

  it('timer is not throttled when the window is hidden', () => {
    assert.equal(windowOptions('/x').webPreferences.backgroundThrottling, false);
  });
});
