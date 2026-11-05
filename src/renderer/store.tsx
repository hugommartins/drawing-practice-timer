import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type CollectionInfo, type SessionRecord, type Settings, type SetupConfig, type TimerMode } from '../shared/types';
import { api } from './bridge';

export interface StartRequest {
  setup: SetupConfig;
}

interface Store {
  ready: boolean;
  collections: CollectionInfo[];
  sessions: SessionRecord[];
  settings: Settings;
  today: Date;
  reload(): Promise<void>;
  patchSettings(patch: Partial<Settings>): Promise<void>;
  setCollections(list: CollectionInfo[]): void;
  flash: string;
  setFlash(msg: string): void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** The current date, refreshed once a minute so "today" rolls over at midnight. */
function useToday(): Date {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [flash, setFlash] = useState('');
  const today = useToday();

  const reload = useCallback(async () => {
    const [c, s, st] = await Promise.all([api().listCollections(), api().listSessions(), api().getSettings()]);
    setCollections(c);
    setSessions(s);
    setSettings(st);
    setReady(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const patchSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch, setup: patch.setup ? { ...prev.setup, ...patch.setup } : prev.setup }));
    setSettings(await api().saveSettings(patch));
  }, []);

  const value = useMemo<Store>(
    () => ({ ready, collections, sessions, settings, today, reload, patchSettings, setCollections, flash, setFlash }),
    [ready, collections, sessions, settings, today, reload, patchSettings, flash],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const MODE_LABEL: Record<TimerMode, string> = {
  'per-image': 'Per image',
  whole: 'Whole session',
  none: 'No timer',
};
