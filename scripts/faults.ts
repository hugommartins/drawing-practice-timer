export type FaultKind = 'invented' | 'stand-in' | 'reconstructed';
export type StudyTheme = 'dark' | 'light';

export interface Fault {
  id: string;
  name: string;
  kind: FaultKind;
  theme: StudyTheme;
  css?: string;
  js?: string;
  screens: string[];
  briefReference?: string;
  transform?: string;
  rgbDelta?: number;
}

export const screens = ['Practice', 'History', 'Library'] as const;

export const visualFaults: Fault[] = [
  {
    id: 'card-radius',
    name: 'Card radius reduced from 16 px to 8 px',
    kind: 'invented',
    theme: 'dark',
    css: '.card { border-radius: 8px !important; }',
    screens: [...screens],
  },
  {
    id: 'card-border-removed',
    name: 'Card border removed',
    kind: 'stand-in',
    theme: 'dark',
    css: '.card { border-color: transparent !important; }',
    screens: [...screens],
  },
  {
    id: 'muted-text-darkened',
    name: 'Muted text darkened',
    kind: 'invented',
    theme: 'dark',
    css: ':root { --mu: #95979e !important; }',
    screens: [...screens],
  },
  {
    id: 'light-accent-subtle',
    name: 'Light accent shifted by four RGB units',
    kind: 'stand-in',
    theme: 'light',
    css: ":root[data-theme='light'] { --ac: #b87a16 !important; }",
    screens: [...screens],
    rgbDelta: 4,
  },
  {
    id: 'page-padding',
    name: 'Page padding increased by 2 px',
    kind: 'invented',
    theme: 'dark',
    css: '.page { padding: 30px !important; }',
    screens: [...screens],
  },
  {
    id: 'body-font-size',
    name: 'Body font reduced by 1 px',
    kind: 'stand-in',
    theme: 'dark',
    css: 'body { font-size: 13px !important; }',
    screens: [...screens],
  },
  {
    id: 'heading-copy',
    name: 'Page heading misspelled',
    kind: 'invented',
    theme: 'dark',
    js: "const title = document.querySelector('.page-head h1'); if (title) title.textContent = title.textContent.replace('Practice', 'Practise').replace('History', 'Historey').replace('Library', 'Libary');",
    screens: [...screens],
  },
  {
    id: 'button-radius',
    name: 'Button corners enlarged by 1 px',
    kind: 'stand-in',
    theme: 'dark',
    css: '.btn, .icon-btn { border-radius: 11px !important; }',
    screens: [...screens],
  },
  {
    id: 'light-palette',
    name: 'Light surface palette shifted',
    kind: 'stand-in',
    theme: 'light',
    css: ":root[data-theme='light'] { --bg: #f0f1f3 !important; --sf: #f9fafb !important; --ln: #d7dade !important; }",
    screens: [...screens],
  },
  {
    id: 'small-color-delta-2',
    name: 'Light border color shifted by two RGB units',
    kind: 'invented',
    theme: 'light',
    css: ":root[data-theme='light'] { --ln: #dfe2e6 !important; }",
    screens: [...screens],
    rgbDelta: 2,
  },
];

export const controls: Fault[] = [
  {
    id: 'hide-navigation',
    name: 'Hide navigation links',
    kind: 'invented',
    theme: 'dark',
    css: '.nav-link { display: none !important; }',
    screens: [...screens],
  },
  {
    id: 'high-contrast-border',
    name: 'Replace card border with a high-contrast color',
    kind: 'invented',
    theme: 'dark',
    css: '.card { border-color: #fff !important; }',
    screens: [...screens],
  },
];

export const reconstructedFaults: Fault[] = [
  {
    id: 'reconstructed-select-chevron',
    name: 'Select chevron inset',
    kind: 'reconstructed',
    theme: 'dark',
    css: "[data-testid='ref-select'] { background-position: calc(100% - 22px) calc(50% - 1px), calc(100% - 17px) calc(50% - 1px) !important; }",
    screens: ['Practice'],
    briefReference: '8f59799',
    transform: 'Move the custom select chevron 3 px inward on Practice.',
  },
  {
    id: 'reconstructed-light-accent',
    name: 'Light accent change',
    kind: 'reconstructed',
    theme: 'light',
    css: ":root[data-theme='light'] { --ac: #c18b35 !important; --l4: #c18b35 !important; --ln: #e7e1d6 !important; --ln2: #d5c9b0 !important; }",
    screens: [...screens],
    briefReference: '053ee43',
    transform: 'Warm the light-theme accent and border colors, including the strongest heatmap accent.',
  },
  {
    id: 'reconstructed-light-palette',
    name: 'Light palette change',
    kind: 'reconstructed',
    theme: 'light',
    css: ":root[data-theme='light'] { --bg: #f6f4ef !important; --sf: #ffffff !important; --sf2: #efece5 !important; --ln: #e2ded4 !important; --ln2: #cfc9bb !important; --tx: #1d1b17 !important; --mu: #6b675d !important; --ink: #ffffff !important; --l0: #ebe7dc !important; --l1: #f0d9a4 !important; --l2: #e2b45c !important; --l3: #cf9230 !important; --l4: #b87a12 !important; }",
    screens: [...screens],
    briefReference: '78fbfa1',
    transform: 'Restore the earlier warm light-theme palette values.',
  },
  {
    id: 'reconstructed-rename',
    name: 'App-name casing change',
    kind: 'reconstructed',
    theme: 'dark',
    js: "const brand = document.querySelector('.brand span'); if (brand) brand.textContent = 'Hatchmark';",
    screens: [...screens],
    briefReference: '58fdceb',
    transform: 'Change the rendered app name from hatchmark to Hatchmark.',
  },
];
