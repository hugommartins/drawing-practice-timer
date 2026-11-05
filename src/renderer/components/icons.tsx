import type { ReactNode } from 'react';

function Svg({ children, size = 16, sw = 2 }: { children: ReactNode; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconFolder = ({ size = 22, plus = false }: { size?: number; plus?: boolean }) => (
  <Svg size={size} sw={size > 30 ? 1.5 : 2}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    {plus && <path d="M12 10.5v5M9.5 13h5" />}
  </Svg>
);
export const IconPlay = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
  </svg>
);
export const IconPause = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
    <rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
  </svg>
);
export const IconPrev = () => (
  <Svg size={20}>
    <path d="M19 5L9 12l10 7zM5 5v14" />
  </Svg>
);
export const IconNext = () => (
  <Svg size={20}>
    <path d="M5 5l10 7-10 7zM19 5v14" />
  </Svg>
);
export const IconArrowRight = () => (
  <Svg>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const IconChevronLeft = () => (
  <Svg>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);
export const IconPlus = () => (
  <Svg sw={2.5}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconCheck = () => (
  <Svg sw={2.5}>
    <path d="M5 12l5 5 9-10" />
  </Svg>
);
export const IconClose = () => (
  <Svg size={18}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconClock = ({ size = 22 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2M9 2h6" />
  </Svg>
);
export const IconImage = () => (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M21 16l-5-5-8 8" />
  </svg>
);
export const IconTheme = ({ mode }: { mode: 'system' | 'light' | 'dark' }) => (
  <Svg size={18}>
    {mode === 'dark' && <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
    {mode === 'light' && (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    )}
    {mode === 'system' && (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>
    )}
  </Svg>
);
export const IconDownload = () => (
  <Svg>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Svg>
);

export const IconMirror = () => (
  <Svg size={18}>
    <path d="M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z" />
  </Svg>
);
export const IconFlip = () => (
  <Svg size={18}>
    <path d="M3 12h18M7 8l5-5 5 5zM7 16l5 5 5-5z" />
  </Svg>
);
export const IconGrey = () => (
  <Svg size={18}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
  </Svg>
);
export const IconGrid = () => (
  <Svg size={18}>
    <path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" />
  </Svg>
);
export const IconFocus = () => (
  <Svg size={18}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
);
