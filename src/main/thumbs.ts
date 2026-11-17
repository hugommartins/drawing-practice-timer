/**
 * Small preview images for the picker and the Library, made once and kept on disk.
 *
 * Without this, every tile in the picker was the original file: a 48-megapixel image costs about
 * 190 MB decoded, so a screenful of them took over 1 GB. Here the original is decoded once, in the
 * main process, shrunk to a few hundred pixels and stored as a JPEG; the page only ever loads that.
 *
 * No Electron imports: the shrinking itself is injected (`render`), so the cache rules can be tested
 * without a window. If a preview cannot be made, `get` returns null and the caller serves the original.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface ThumbDeps {
  /** Directory the previews are kept in. Safe to delete at any time. */
  cacheDir: string;
  /** Returns JPEG bytes no larger than `px` on the longest side, or null if this file cannot be shrunk. */
  render(abs: string, px: number): Promise<Buffer | null>;
  /** Longest side in pixels (default 320: sharp on a 2x display at tile size). */
  px?: number;
  /** Originals decoded at the same time (default 2). Decoding a large image is the expensive part. */
  concurrency?: number;
  /** `prune()` deletes the least recently used previews until the cache is under this (default 500 MB). */
  maxBytes?: number;
}

export interface Thumbnailer {
  /** Path of the preview file for `abs`, making it first if needed; null if there is none. */
  get(abs: string): Promise<string | null>;
  /** Trims the cache to `maxBytes`, oldest first. Returns the number of files removed. */
  prune(): Promise<number>;
}

export function createThumbnailer(d: ThumbDeps): Thumbnailer {
  const px = d.px ?? 320;
  const limit = Math.max(1, d.concurrency ?? 2);
  const maxBytes = d.maxBytes ?? 500 * 2 ** 20;

  const inflight = new Map<string, Promise<string | null>>();
  const failed = new Set<string>(); // keys that could not be rendered this session: do not retry on every scroll

  let running = 0;
  const waiting: (() => void)[] = [];
  async function slot<T>(work: () => Promise<T>): Promise<T> {
    if (running >= limit) await new Promise<void>((r) => waiting.push(r));
    running++;
    try {
      return await work();
    } finally {
      running--;
      waiting.shift()?.();
    }
  }

  const keyOf = (abs: string, mtimeMs: number, size: number) =>
    createHash('sha1').update(`${abs}\0${mtimeMs}\0${size}\0${px}`).digest('hex');
  const fileOf = (key: string) => path.join(d.cacheDir, key.slice(0, 2), `${key}.jpg`);

  async function make(abs: string, key: string): Promise<string | null> {
    const file = fileOf(key);
    try {
      const st = await fs.stat(file);
      if (st.size > 0) {
        const now = new Date();
        void fs.utimes(file, now, now).catch(() => undefined); // recently used, for prune()
        return file;
      }
    } catch {
      /* not cached yet */
    }
    if (failed.has(key)) return null;

    const bytes = await slot(async () => {
      try {
        return await d.render(abs, px);
      } catch {
        return null;
      }
    });
    if (!bytes || bytes.length === 0) {
      failed.add(key);
      return null;
    }
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await fs.writeFile(tmp, bytes);
      await fs.rename(tmp, file); // never leave half a file where the cache looks for a whole one
      return file;
    } catch {
      return null;
    }
  }

  return {
    async get(abs) {
      let st;
      try {
        st = await fs.stat(abs);
      } catch {
        return null;
      }
      if (!st.isFile()) return null;
      const key = keyOf(abs, st.mtimeMs, st.size); // a changed file gets a new key, so no stale preview
      let p = inflight.get(key);
      if (!p) {
        p = make(abs, key).finally(() => inflight.delete(key));
        inflight.set(key, p);
      }
      return p;
    },

    async prune() {
      const entries: { file: string; size: number; at: number }[] = [];
      let dirs: string[] = [];
      try {
        dirs = await fs.readdir(d.cacheDir);
      } catch {
        return 0;
      }
      for (const dir of dirs) {
        let names: string[] = [];
        try {
          names = await fs.readdir(path.join(d.cacheDir, dir));
        } catch {
          continue;
        }
        for (const n of names) {
          const file = path.join(d.cacheDir, dir, n);
          try {
            const st = await fs.stat(file);
            if (n.endsWith('.tmp') && Date.now() - st.mtimeMs > 60_000) await fs.rm(file, { force: true });
            else if (n.endsWith('.jpg')) entries.push({ file, size: st.size, at: st.mtimeMs });
          } catch {
            /* vanished */
          }
        }
      }
      let total = entries.reduce((s, e) => s + e.size, 0);
      if (total <= maxBytes) return 0;
      entries.sort((a, b) => a.at - b.at);
      let removed = 0;
      for (const e of entries) {
        if (total <= maxBytes) break;
        await fs.rm(e.file, { force: true });
        total -= e.size;
        removed++;
      }
      return removed;
    },
  };
}
