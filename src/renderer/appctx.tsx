import { createContext, useContext, useEffect, useState } from 'react';
import type { CollectionInfo, SetupConfig } from '../shared/types';
import type { Page } from './components/Header';

export interface ActiveSession {
  setup: SetupConfig;
  collection: CollectionInfo;
  images: string[];
}

interface AppCtx {
  startSession(s: ActiveSession): void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp outside App');
  return c;
}

function parse(hash: string): Page {
  if (hash.startsWith('#/history')) return 'history';
  if (hash.startsWith('#/library')) return 'library';
  return 'practice';
}

export function usePage(): Page {
  const [page, setPage] = useState<Page>(() => parse(location.hash));
  useEffect(() => {
    const on = () => setPage(parse(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return page;
}

export function go(page: Page): void {
  location.hash = page === 'practice' ? '#/' : `#/${page}`;
}
