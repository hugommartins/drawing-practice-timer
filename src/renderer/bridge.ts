import type { HatchmarkBridge } from '../shared/types';

declare global {
  interface Window {
    hatchmark: HatchmarkBridge;
  }
}

export const bridge = (): HatchmarkBridge => {
  if (!window.hatchmark) throw new Error('window.hatchmark is missing: the preload script did not run');
  return window.hatchmark;
};

export const api = () => bridge().api;

/** Absolute path of an image inside a collection folder. */
export function imagePath(collectionPath: string, rel: string): string {
  const sep = collectionPath.includes('\\') && !collectionPath.includes('/') ? '\\' : '/';
  return collectionPath.replace(/[\\/]+$/, '') + sep + rel.split('/').join(sep);
}
