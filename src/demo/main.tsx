import { installDemoBridge } from './bridge';

declare const __DEMO_IMAGES__: Record<string, string[]>;
const hasReal = typeof __DEMO_IMAGES__ !== 'undefined' && Object.keys(__DEMO_IMAGES__).length > 0;
/** Phones and tablets: the app is desktop-only, so say so and describe what the demo does there. */
const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

installDemoBridge();
void import('../renderer/main');

const images = hasReal
  ? 'The reference images are public-domain artworks from The Met (<a href="./images/CREDITS.md">credits</a>).'
  : 'The reference images are generated.';
const device = touch
  ? '<li><strong>Phones and tablets.</strong> This is a desktop app (macOS and Windows) and there is no mobile version yet. The demo is usable here, but the layout is approximate. “Link a folder” lets you pick photos instead of a folder.</li>'
  : '';

const bar = document.createElement('div');
bar.className = 'demo-bar';
bar.setAttribute('role', 'note');
bar.setAttribute('aria-label', 'About this demo');
bar.innerHTML =
  '<div class="demo-row">' +
  '<span class="demo-tag">Demo</span>' +
  '<span class="demo-text">Sample data, saved only in this browser.</span>' +
  '<a class="demo-link" href="./strategy.html">How it\'s tested →</a>' +
  '<button type="button" class="demo-more" aria-expanded="false" aria-controls="demo-details">Details</button>' +
  '<button type="button" class="demo-reset">Reset demo</button>' +
  '</div>' +
  '<div class="demo-details" id="demo-details" hidden><ul>' +
  '<li><strong>The history is made up.</strong> ' + images + '</li>' +
  '<li><strong>Your changes stay in this browser.</strong> Sessions and settings are saved here only. Clearing site data, or using another browser or a private window, loses them. “Reset demo” clears them now.</li>' +
  '<li><strong>A folder you link</strong> stays on your computer and is never uploaded. It is forgotten when you reload the page.</li>' +
  device +
  '</ul></div>';

const more = bar.querySelector<HTMLButtonElement>('.demo-more')!;
const details = bar.querySelector<HTMLElement>('.demo-details')!;
more.addEventListener('click', () => {
  const open = details.hidden;
  details.hidden = !open;
  more.setAttribute('aria-expanded', String(open));
  more.textContent = open ? 'Hide details' : 'Details';
});
bar.querySelector('.demo-reset')!.addEventListener('click', () => (window as unknown as { __resetDemo: () => void }).__resetDemo());
document.body.prepend(bar);
