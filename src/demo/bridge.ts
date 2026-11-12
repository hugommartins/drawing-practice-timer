// Browser-only stand-in for the Electron preload. Same Api, backed by memory + localStorage.
import { addDays, localDate } from '../shared/dates';
import {
  DEFAULT_SETTINGS,
  type Api,
  type Collection,
  type CollectionInfo,
  type LinkResult,
  type HatchmarkBridge,
  type SessionRecord,
  type Settings,
} from '../shared/types';
import { art, type ArtKind } from './art';

const KEY = 'hatchmark-demo:v1';
const IMG_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i;

interface Demo {
  name: string;
  kind: ArtKind;
  count: number;
}
const DEMOS: Record<string, Demo> = {
  'demo-gesture': { name: 'Gesture', kind: 'pose', count: 24 },
  'demo-still': { name: 'Still life', kind: 'still', count: 18 },
  'demo-landscape': { name: 'Landscape', kind: 'land', count: 16 },
};
const pad = (n: number) => String(n).padStart(2, '0');
const demoFiles = (d: Demo) => Array.from({ length: d.count }, (_, i) => `${d.kind}-${pad(i + 1)}.svg`);
const demoPath = (id: string) => `demo/${DEMOS[id]!.name}`;

interface Persisted {
  sessions: SessionRecord[];
  settings: Settings;
  /** Demo collections the visitor removed. */
  removed: string[];
  renamed: Record<string, string>;
}

/** A believable 14 weeks of practice, relative to today. Deterministic. */
function seedSessions(today: Date): SessionRecord[] {
  const out: SessionRecord[] = [];
  const types = ['Gesture', 'Gesture', 'Still life', 'Landscape'];
  const notes: Record<number, string> = { 3: 'Shoulders keep coming out too wide.', 11: 'Warm-up only.', 29: 'Started with 30 s poses, much better.' };
  let n = 0;
  for (let back = 100; back >= 1; back--) {
    const day = addDays(today, -back);
    const dow = (day.getDay() + 6) % 7;
    const roll = Math.abs(Math.sin(back * 12.9898) * 43758.5453) % 1;
    const p = dow >= 5 ? 0.35 : 0.62;
    if (roll > p) continue;
    const type = types[(back * 7) % types.length]!;
    const id = Object.entries(DEMOS).find(([, d]) => d.name === type)![0];
    const minutes = 12 + Math.floor(((roll * 997) % 1) * 38);
    const started = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 30, 0);
    out.push({
      id: `seed-${n}`,
      date: localDate(day),
      startedAt: started.toISOString(),
      type,
      collectionId: id,
      mode: 'per-image',
      seconds: minutes * 60,
      images: Math.max(1, Math.round(minutes / 1.5)),
      source: 'app',
      ...(notes[n] ? { note: notes[n] } : {}),
    });
    n++;
  }
  return out;
}

function load(today: Date): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      if (Array.isArray(p.sessions)) {
        return { ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings, setup: { ...DEFAULT_SETTINGS.setup, ...p.settings.setup } } };
      }
    }
  } catch {
    /* storage blocked: run from memory */
  }
  return { sessions: seedSessions(today), settings: { ...DEFAULT_SETTINGS, setup: { ...DEFAULT_SETTINGS.setup, perImageSec: 30, count: 10 } }, removed: [], renamed: {} };
}

interface Own {
  id: string;
  name: string;
  files: string[];
  urls: Map<string, string>;
}

export function installDemoBridge(): void {
  const state = load(new Date());
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  };
  /** Folders the visitor linked from their own disk. Kept in memory only: nothing is uploaded or stored. */
  const own: Own[] = [];

  const collections = (): Collection[] => [
    ...Object.entries(DEMOS)
      .filter(([id]) => !state.removed.includes(id))
      .map(([id, d]) => ({ id, name: state.renamed[id] ?? d.name, path: demoPath(id), createdAt: '2026-01-01T00:00:00.000Z' })),
    ...own.map((o) => ({ id: o.id, name: o.name, path: `your-folder/${o.name}`, createdAt: new Date().toISOString() })),
  ];
  const filesOf = (id: string): string[] => (DEMOS[id] ? demoFiles(DEMOS[id]) : own.find((o) => o.id === id)?.files ?? []);
  const info = (c: Collection): CollectionInfo => ({ ...c, count: filesOf(c.id).length, reachable: true });

  function pickLocalFolder(): Promise<FileList | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.setAttribute('webkitdirectory', '');
      input.addEventListener('change', () => resolve(input.files && input.files.length ? input.files : null));
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  const api: Api = {
    async listCollections() {
      return collections().map(info);
    },
    async linkFolder(): Promise<LinkResult | null> {
      const files = await pickLocalFolder();
      if (!files) return null;
      const images = [...files].filter((f) => IMG_EXT.test(f.name));
      if (images.length === 0) return null;
      const root = (images[0]!.webkitRelativePath || '').split('/')[0] || 'My folder';
      const prev = own.find((o) => o.name === root);
      if (prev) return { collection: info({ id: prev.id, name: prev.name, path: `your-folder/${prev.name}`, createdAt: '' }), existing: true };
      const o: Own = { id: `own-${own.length + 1}`, name: root, files: [], urls: new Map() };
      for (const f of images) {
        const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name;
        o.files.push(rel);
        o.urls.set(rel, URL.createObjectURL(f));
      }
      o.files.sort();
      own.push(o);
      return { collection: info({ id: o.id, name: o.name, path: `your-folder/${o.name}`, createdAt: '' }), existing: false };
    },
    async relinkCollection() {
      return null;
    },
    async renameCollection(id, name) {
      const clean = name.trim();
      const c = collections().find((x) => x.id === id);
      if (!c || !clean) return null;
      const o = own.find((x) => x.id === id);
      if (o) o.name = clean;
      else state.renamed[id] = clean;
      save();
      return info({ ...c, name: clean });
    },
    async removeCollection(id) {
      const i = own.findIndex((o) => o.id === id);
      if (i >= 0) own.splice(i, 1);
      else if (DEMOS[id]) state.removed.push(id);
      save();
    },
    async rescanCollection(id) {
      const c = collections().find((x) => x.id === id);
      return c ? info(c) : null;
    },
    async collectionImages(id) {
      return filesOf(id).slice();
    },
    async listSessions() {
      return [...state.sessions].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
    },
    async addSession(s) {
      const rec: SessionRecord = { id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, ...s };
      state.sessions.push(rec);
      save();
      return rec;
    },
    async deleteSession(id) {
      state.sessions = state.sessions.filter((s) => s.id !== id);
      save();
    },
    async getSettings() {
      return state.settings;
    },
    async saveSettings(patch) {
      const next: Settings = { ...state.settings, ...patch };
      if (patch.setup) next.setup = { ...DEFAULT_SETTINGS.setup, ...patch.setup };
      state.settings = next;
      save();
      return next;
    },
  };

  const bridge: HatchmarkBridge = {
    api,
    fileUrl(abs) {
      const parts = abs.split('/');
      if (parts[0] === 'demo') {
        const id = Object.keys(DEMOS).find((k) => DEMOS[k]!.name === parts[1])!;
        const file = parts.slice(2).join('/');
        return art(DEMOS[id]!.kind, file);
      }
      const o = own.find((x) => x.name === parts[1]);
      return o?.urls.get(parts.slice(2).join('/')) ?? '';
    },
  };
  (window as unknown as { hatchmark: HatchmarkBridge }).hatchmark = bridge;

  /** Used by the "Reset demo" button. */
  (window as unknown as { __resetDemo: () => void }).__resetDemo = () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    location.reload();
  };
}
