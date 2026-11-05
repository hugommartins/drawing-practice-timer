export type TimerMode = 'per-image' | 'whole' | 'none';
export type ThemePref = 'system' | 'light' | 'dark';

export interface Collection {
  id: string;
  /** Display name. Also the drawing "type" that sessions are tracked against. */
  name: string;
  /** Absolute path of the linked folder. */
  path: string;
  createdAt: string;
}

export interface CollectionInfo extends Collection {
  count: number;
  reachable: boolean;
}

export interface SessionRecord {
  id: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  startedAt: string;
  type: string;
  collectionId: string | null;
  mode: TimerMode | 'manual';
  /** Time actually spent drawing, in seconds. */
  seconds: number;
  images: number;
  source: 'app' | 'manual';
  note?: string;
}

export interface SetupConfig {
  mode: TimerMode;
  /** Seconds per image (per-image mode). */
  perImageSec: number;
  /** Seconds for the whole sitting (whole mode). */
  totalSec: number;
  /** Number of images, 0 = until you stop. */
  count: number;
  collectionId: string | null;
}

export interface LastSession {
  setup: SetupConfig;
  type: string;
  date: string;
  seconds: number;
  images: number;
}

export interface Settings {
  theme: ThemePref;
  setup: SetupConfig;
  lastSession: LastSession | null;
}

export interface LinkResult {
  collection: CollectionInfo;
  /** True when the folder was already linked and nothing new was created. */
  existing: boolean;
}

/** Everything the renderer can ask the main process to do. Plain JSON in, plain JSON out. */
export interface Api {
  listCollections(): Promise<CollectionInfo[]>;
  linkFolder(): Promise<LinkResult | null>;
  relinkCollection(id: string): Promise<CollectionInfo | null>;
  renameCollection(id: string, name: string): Promise<CollectionInfo | null>;
  removeCollection(id: string): Promise<void>;
  rescanCollection(id: string): Promise<CollectionInfo | null>;
  /** Image paths relative to the collection folder. */
  collectionImages(id: string): Promise<string[]>;
  listSessions(): Promise<SessionRecord[]>;
  addSession(s: Omit<SessionRecord, 'id'>): Promise<SessionRecord>;
  deleteSession(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
}

export const API_METHODS = [
  'listCollections',
  'linkFolder',
  'relinkCollection',
  'renameCollection',
  'removeCollection',
  'rescanCollection',
  'collectionImages',
  'listSessions',
  'addSession',
  'deleteSession',
  'getSettings',
  'saveSettings',
] as const satisfies readonly (keyof Api)[];

/** What the preload script (or a test harness) puts on `window.plchldr`. */
export interface PlchldrBridge {
  api: Api;
  /** URL the <img> tag should use for an absolute file path inside a linked folder. */
  fileUrl(absPath: string): string;
}

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'] as const;

export const DEFAULT_SETUP: SetupConfig = {
  mode: 'per-image',
  perImageSec: 60,
  totalSec: 1800,
  count: 20,
  collectionId: null,
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  setup: DEFAULT_SETUP,
  lastSession: null,
};
