import { cpSync, existsSync, readdirSync } from 'node:fs';

/**
 * Copy the data folder used under the previous product name (Plchldr) into the new one.
 * Does nothing when the new folder already has files or the old one is missing. The old folder is left in place.
 * Returns true when it copied.
 */
export function migrateLegacyData(legacyDir: string, dataDir: string): boolean {
  if (!existsSync(legacyDir)) return false;
  if (existsSync(dataDir) && readdirSync(dataDir).length > 0) return false;
  cpSync(legacyDir, dataDir, { recursive: true });
  return true;
}
