import { installDemoBridge } from './bridge';

installDemoBridge();
void import('../renderer/main');

const banner = document.createElement('div');
banner.className = 'demo-bar';
banner.setAttribute('role', 'note');
banner.innerHTML =
  '<span class="demo-text">Demo with sample data. References are generated, and changes stay in this browser.</span>' +
  '<nav class="demo-nav" aria-label="Site">' +
  '<a href="./" aria-current="page">Demo</a>' +
  '<a href="./strategy.html">Test strategy</a>' +
  '<a href="./study/">Case study</a>' +
  '<a href="https://github.com/hugommartins/drawing-practice-timer">Source</a>' +
  '</nav>' +
  '<button type="button" class="demo-reset">Reset demo</button>';
banner.querySelector('button')!.addEventListener('click', () => (window as unknown as { __resetDemo: () => void }).__resetDemo());
document.body.prepend(banner);
