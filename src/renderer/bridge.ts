import type { PlchldrBridge } from '../shared/types';

declare global {
  interface Window {
    plchldr: PlchldrBridge;
  }
}

export const bridge = (): PlchldrBridge => {
  if (!window.plchldr) throw new Error('window.plchldr is missing: the preload script did not run');
  return window.plchldr;
};

export const api = () => bridge().api;

/** Absolute path of an image inside a collection folder. */
export function imagePath(collectionPath: string, rel: string): string {
  const sep = collectionPath.includes('\\') && !collectionPath.includes('/') ? '\\' : '/';
  return collectionPath.replace(/[\\/]+$/, '') + sep + rel.split('/').join(sep);
}
