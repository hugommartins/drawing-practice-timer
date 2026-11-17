import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Api, Collection, CollectionInfo, LinkResult } from '../shared/types';
import { isImageFile, isInside, scanImages } from './library';
import { Storage } from './storage';

export interface Deps {
  /** Where collections.json, sessions.jsonl and settings.json live. */
  dataDir: string;
  /** Opens the native "choose a folder" dialog. Returns null when cancelled. Injected so tests can fake it. */
  pickFolder: () => Promise<string | null>;
  now?: () => Date;
}

export interface ApiWithInternals extends Api {
  /** Folders the renderer may load images from. Used by the image protocol. */
  allowedRoots(): Promise<string[]>;
}

/**
 * All app behaviour that touches the disk. No Electron imports, so the same object is
 * wired to ipcMain in the real app and to a test page in the UI tests.
 */
export function createApi(deps: Deps): ApiWithInternals {
  const store = new Storage(deps.dataDir);
  const now = deps.now ?? (() => new Date());
  /** id -> image list, filled lazily and refreshed on rescan. */
  const cache = new Map<string, { files: string[]; reachable: boolean }>();

  async function scan(c: Collection, force = false) {
    if (!force) {
      const hit = cache.get(c.id);
      if (hit) return hit;
    }
    const res = await scanImages(c.path);
    cache.set(c.id, res);
    return res;
  }

  async function info(c: Collection, force = false): Promise<CollectionInfo> {
    const r = await scan(c, force);
    return { ...c, count: r.files.length, reachable: r.reachable };
  }

  async function find(id: string): Promise<{ list: Collection[]; c: Collection } | null> {
    const list = await store.collections();
    const c = list.find((x) => x.id === id);
    return c ? { list, c } : null;
  }

  return {
    async listCollections() {
      const list = await store.collections();
      return Promise.all(list.map((c) => info(c)));
    },

    async linkFolder(): Promise<LinkResult | null> {
      const picked = await deps.pickFolder();
      if (!picked) return null;
      const abs = path.resolve(picked);
      const stat = await fs.stat(abs).catch(() => null);
      if (!stat?.isDirectory()) return null;
      const list = await store.collections();
      const dup = list.find((c) => path.resolve(c.path) === abs);
      if (dup) return { collection: await info(dup, true), existing: true };
      const c: Collection = { id: randomUUID(), name: path.basename(abs) || abs, path: abs, createdAt: now().toISOString() };
      await store.saveCollections([...list, c]);
      return { collection: await info(c, true), existing: false };
    },

    async relinkCollection(id) {
      const hit = await find(id);
      if (!hit) return null;
      const picked = await deps.pickFolder();
      if (!picked) return null;
      const next = { ...hit.c, path: path.resolve(picked) };
      await store.saveCollections(hit.list.map((c) => (c.id === id ? next : c)));
      return info(next, true);
    },

    async renameCollection(id, name) {
      const hit = await find(id);
      const clean = name.trim();
      if (!hit || !clean) return null;
      const next = { ...hit.c, name: clean };
      await store.saveCollections(hit.list.map((c) => (c.id === id ? next : c)));
      return info(next);
    },

    async removeCollection(id) {
      const list = await store.collections();
      await store.saveCollections(list.filter((c) => c.id !== id));
      cache.delete(id);
    },

    async rescanCollection(id) {
      const hit = await find(id);
      return hit ? info(hit.c, true) : null;
    },

    async collectionImages(id) {
      const hit = await find(id);
      if (!hit) return [];
      return (await scan(hit.c)).files;
    },

    listSessions: () => store.sessions(),
    addSession: (s) => store.appendSession(s),
    deleteSession: (id) => store.deleteSession(id),
    getSettings: () => store.settings(),
    saveSettings: (patch) => store.saveSettings(patch),

    async allowedRoots() {
      return (await store.collections()).map((c) => c.path);
    },
  };
}

/** Resolve an absolute path only if it sits inside one of the linked folders. */
export async function resolveAllowed(api: ApiWithInternals, abs: string): Promise<string | null> {
  const roots = await api.allowedRoots();
  for (const r of roots) if (await isInside(r, abs)) return abs;
  return null;
}

/**
 * The gatekeeper for the hatchmark-img:// protocol. Takes the still-encoded path from the URL and
 * returns the file to serve, or null. Only absolute paths to image files inside a linked folder
 * pass; anything else (other file types, other folders, `..` tricks, symlinks pointing out) does not.
 */
export async function authorizeImage(api: ApiWithInternals, encodedPath: string): Promise<string | null> {
  let abs: string;
  try {
    abs = decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
  if (!path.isAbsolute(abs) || !isImageFile(abs)) return null;
  return resolveAllowed(api, abs);
}
