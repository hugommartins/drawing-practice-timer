import type { ThemePref } from '../../shared/types';
import { IconTheme } from './icons';
import { useStore } from '../store';

export type Page = 'practice' | 'history' | 'library';

const NAV: { id: Page; label: string }[] = [
  { id: 'practice', label: 'Draw' },
  { id: 'history', label: 'History' },
  { id: 'library', label: 'Library' },
];

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };

export function Header({ page }: { page: Page }) {
  const { settings, patchSettings } = useStore();
  const theme = settings.theme;
  return (
    <header className="app-header">
      <div className="brand-row">
        <div className="brand">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="14" cy="14" r="11" fill="none" strokeWidth="2.5" strokeDasharray="52 18" strokeLinecap="round" transform="rotate(-90 14 14)" style={{ stroke: 'var(--ac)' }} />
            <circle cx="14" cy="14" r="3" style={{ fill: 'var(--ac)' }} />
          </svg>
          <span>hatchmark</span>
        </div>
        <nav aria-label="Main" className="nav">
          {NAV.map((n) => (
            <a key={n.id} href={`#/${n.id === 'practice' ? '' : n.id}`} className="nav-link" aria-current={page === n.id ? 'page' : undefined} data-testid={`nav-${n.id}`}>
              {n.label}
            </a>
          ))}
        </nav>
      </div>
      <button
        type="button"
        className="icon-btn"
        data-testid="theme-toggle"
        aria-label={`Theme: ${theme}. Click to switch to ${NEXT_THEME[theme]}`}
        title={`Theme: ${theme}`}
        onClick={() => void patchSettings({ theme: NEXT_THEME[theme] })}
      >
        <IconTheme mode={theme} />
      </button>
    </header>
  );
}
