import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Collection, type SessionRecord, type Settings } from '../shared/types';

/**
 * Plain files in one folder, so they are easy to read, back up or sync:
 *   collections.json  – linked folders
 *   sessions.jsonl    – one JSON object per line, append-only (deletes are tombstone lines)
 *   settings.json     – theme and the last session setup
 */
export class Storage {
  constructor(readonly dir: string) {}

  private file(name: string): string {
    return path.join(this.dir, name);
  }

  private async ensure(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  /** Write via a temp file so a crash never leaves half a JSON document behind. */
  private async writeJson(name: string, value: unknown): Promise<void> {
    await this.ensure();
    const target = this.file(name);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, target);
  }

  private async readJson<T>(name: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fs.readFile(this.file(name), 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  // --- collections
  async collections(): Promise<Collection[]> {
    const list = await this.readJson<Collection[]>('collections.json', []);
    return Array.isArray(list) ? list : [];
  }

  async saveCollections(list: Collection[]): Promise<void> {
    await this.writeJson('collections.json', list);
  }

  // --- sessions
  async sessions(): Promise<SessionRecord[]> {
    let raw = '';
    try {
      raw = await fs.readFile(this.file('sessions.jsonl'), 'utf8');
    } catch {
      return [];
    }
    const byId = new Map<string, SessionRecord>();
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const obj = JSON.parse(t) as Partial<SessionRecord> & { deleted?: boolean };
        if (!obj.id) continue;
        if (obj.deleted) byId.delete(obj.id);
        else byId.set(obj.id, obj as SessionRecord);
      } catch {
        // A torn or hand-edited line should not take the whole history down.
      }
    }
    return [...byId.values()].sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
  }

  async appendSession(s: Omit<SessionRecord, 'id'>): Promise<SessionRecord> {
    await this.ensure();
    const rec: SessionRecord = { id: randomUUID(), ...s };
    await fs.appendFile(this.file('sessions.jsonl'), JSON.stringify(rec) + '\n', 'utf8');
    return rec;
  }

  async deleteSession(id: string): Promise<void> {
    await this.ensure();
    await fs.appendFile(this.file('sessions.jsonl'), JSON.stringify({ id, deleted: true }) + '\n', 'utf8');
  }

  // --- settings
  async settings(): Promise<Settings> {
    const s = await this.readJson<Partial<Settings>>('settings.json', {});
    return { ...DEFAULT_SETTINGS, ...s, setup: { ...DEFAULT_SETTINGS.setup, ...(s.setup ?? {}) } };
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.settings()), ...patch };
    if (patch.setup) next.setup = { ...DEFAULT_SETTINGS.setup, ...patch.setup };
    await this.writeJson('settings.json', next);
    return next;
  }
}
