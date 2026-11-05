import { promises as fs } from 'node:fs';
import path from 'node:path';
import { IMAGE_EXTENSIONS } from '../shared/types';

const EXT = new Set<string>(IMAGE_EXTENSIONS);

export function isImageFile(name: string): boolean {
  return EXT.has(path.extname(name).toLowerCase());
}

export interface ScanResult {
  /** Paths relative to the root, with forward slashes, sorted naturally. */
  files: string[];
  reachable: boolean;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Walk a folder (subfolders included) and list its images. Hidden files and folders are skipped.
 * Symlinked folders are not followed, which also rules out loops.
 */
export async function scanImages(root: string): Promise<ScanResult> {
  try {
    const st = await fs.stat(root);
    if (!st.isDirectory()) return { files: [], reachable: false };
  } catch {
    return { files: [], reachable: false };
  }
  const files: string[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable subfolder: skip it, keep going
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(dir, e.name), childRel);
      else if (e.isFile() && isImageFile(e.name)) files.push(childRel);
    }
  }
  await walk(root, '');
  files.sort((a, b) => collator.compare(a, b));
  return { files, reachable: true };
}

/** True when `target` is `root` or lives under it, after resolving symlinks. */
export async function isInside(root: string, target: string): Promise<boolean> {
  try {
    const [r, t] = await Promise.all([fs.realpath(root), fs.realpath(target)]);
    const rel = path.relative(r, t);
    return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
  } catch {
    return false;
  }
}
