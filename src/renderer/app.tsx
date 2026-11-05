import { useMemo, useState } from 'react';
import { AppContext, usePage, type ActiveSession } from './appctx';
import { Header } from './components/Header';
import { useStore } from './store';
import { Practice } from './pages/Practice';
import { History } from './pages/History';
import { Library } from './pages/Library';
import { Session } from './pages/Session';
import { useEffect } from 'react';

export function App() {
  const { ready, settings } = useStore();
  const page = usePage();
  const [active, setActive] = useState<ActiveSession | null>(null);
  const ctx = useMemo(() => ({ startSession: setActive }), []);

  useEffect(() => {
    document.documentElement.dataset['theme'] = settings.theme;
  }, [settings.theme]);

  if (!ready) return <div className="app" aria-busy="true" />;

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        {active ? (
          <Session key={active.collection.id + active.images.length} active={active} onExit={() => setActive(null)} />
        ) : (
          <>
            <Header page={page} />
            <main className="page" data-testid={`page-${page}`}>
              <div className="page-inner">
                {page === 'practice' && <Practice />}
                {page === 'history' && <History />}
                {page === 'library' && <Library />}
              </div>
            </main>
          </>
        )}
      </div>
    </AppContext.Provider>
  );
}
