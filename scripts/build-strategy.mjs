// Renders TEST_STRATEGY.md to dist-demo/strategy.html (no dependencies, tokens shared with the app).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const md = readFileSync('TEST_STRATEGY.md', 'utf8').replace(/\r/g, '');
// Inconsolata reads small, so this page's own CSS is scaled like src/renderer/styles.css (x1.25, see apply-inconsolata.mjs).
const FONT_SCALE = 1.25;
const half = (n) => `${Math.round(n * FONT_SCALE * 2) / 2}px`;
const scaleFonts = (css) =>
  css
    .replace(/(font-size:\s*)([\d.]+)px/g, (_, a, n) => a + half(+n))
    .replace(/(font:\s*(?:(?:italic|normal|bold|[1-9]00)\s+)*)([\d.]+)px/g, (_, a, n) => a + half(+n));
// The product name comes from package.json, so a rename needs no change here.
const appName = String(JSON.parse(readFileSync('package.json', 'utf8')).productName ?? 'demo').toLowerCase();
const css = readFileSync('src/renderer/styles.css', 'utf8');
const tokens = css.slice(0, css.indexOf('*, *::before'));
if (/font(-size)?:\s*[\d.]+px/.test(tokens)) throw new Error('The shared tokens contain font sizes; they would be scaled twice.');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function inline(t) {
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(`<code>${esc(c)}</code>`) - 1}\u0000`);
  t = esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

// The ASCII pyramid becomes real layers.
const LAYERS = [
  ['E2E', 'Journeys', 'Real Electron, real disk, real restart', 'Electron'],
  ['Visual', 'Appearance', 'Screenshot comparison per screen, theme and width, in the real window', 'Electron'],
  ['UI', 'Screens', 'Real UI in Chromium + real file-handling code', 'Browser only'],
  ['Unit', 'Logic', 'Pure logic, storage on a temp dir, security rules', 'Node only'],
];
const pyramid =
  '<div class="layers" role="img" aria-label="Test layers, from end-to-end at the top to unit at the bottom">' +
  LAYERS.map(([n, w, d, needs], i) => `<div class="layer l${i}"><b>${n}</b><span class="w">${w}</span><span class="d">${d}</span><span class="n">${needs}</span></div>`).join('') +
  '</div>';

function table(lines) {
  const row = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
  const head = row(lines[0]);
  const body = lines.slice(2).map(row);
  const th = head.map((h) => `<th>${inline(h)}</th>`).join('');
  const tr = body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
  const short = body.every((r) => (r[0] ?? '').length <= 28); // keep a short first column on one line; let a long one wrap
  return `<div class="tw"><table${short ? ' class="nw1"' : ''}><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

const out = [];
const toc = [];
const lines = md.split('\n');
let title = 'Test strategy';
for (let i = 0; i < lines.length; ) {
  const l = lines[i];
  if (!l.trim()) { i++; continue; }
  if (l.startsWith('```')) {
    const buf = [];
    i++;
    while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
    i++;
    out.push(buf.join('\n').includes('┌') ? pyramid : `<pre><code>${esc(buf.join('\n'))}</code></pre>`);
    continue;
  }
  let m;
  if ((m = /^(#{1,4}) (.*)/.exec(l))) {
    const lvl = m[1].length;
    const text = m[2];
    if (lvl === 1) title = text;
    else {
      const id = slug(text);
      if (lvl === 2) toc.push([id, text]);
      out.push(`<h${lvl} id="${id}">${inline(text)}</h${lvl}>`);
    }
    i++;
    continue;
  }
  if (l.startsWith('|')) {
    const buf = [];
    while (i < lines.length && lines[i].startsWith('|')) buf.push(lines[i++]);
    out.push(table(buf));
    continue;
  }
  if (/^(- |\d+\. )/.test(l)) {
    const ordered = /^\d+\./.test(l);
    const items = [];
    while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\d+\. )/, ''));
    const tag = ordered ? 'ol' : 'ul';
    out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
    continue;
  }
  const buf = [lines[i++]]; // always consume the current line, so an unrecognised block can't loop forever
  while (i < lines.length && lines[i].trim() && !/^(#{1,4} |\||```|- |\d+\. )/.test(lines[i])) buf.push(lines[i++]);
  out.push(`<p>${inline(buf.join(' '))}</p>`);
}

const REPO = 'https://github.com/hugommartins/drawing-practice-timer';
const html = `<!doctype html>
<html lang="en" data-theme="system">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'">
<title>${esc(title)}</title>
<link rel="stylesheet" href="./fonts.css">
<link rel="icon" href="./favicon.svg" type="image/svg+xml">
<style>
${tokens}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--tx); font: 15px/1.6 var(--font-sans); -webkit-font-smoothing: antialiased; }
a { color: var(--ac); }
.top { padding: 12px 0; border-bottom: 1px solid var(--ln); position: sticky; top: 0; background: var(--bg); z-index: 5; }
.top-in { max-width: 1080px; margin: 0 auto; padding: 0 28px; }
.back { display: inline-block; padding: 6px 14px; border: 1px solid var(--ln); border-radius: 999px; color: var(--mu); text-decoration: none; font-weight: 500; }
.back:hover { color: var(--tx); background: var(--sf2); }
.wrap { max-width: 1080px; margin: 0 auto; padding: 40px 28px 96px; display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 48px; }
.side { position: sticky; top: 76px; align-self: start; font-size: 13px; }
.side .eyebrow { font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mu); margin-bottom: 8px; }
.side a { display: block; padding: 5px 0; color: var(--mu); text-decoration: none; }
.side a:hover { color: var(--tx); }
main { min-width: 0; }
h1 { font-size: 32px; letter-spacing: -0.02em; margin: 0 0 8px; }
.lede { color: var(--mu); margin: 0 0 8px; }
h2 { font-size: 20px; margin: 48px 0 12px; padding-top: 24px; border-top: 1px solid var(--ln); letter-spacing: -0.01em; scroll-margin-top: 72px; }
h3 { font-size: 15px; margin: 28px 0 8px; scroll-margin-top: 72px; }
h4 { font-size: 14px; margin: 22px 0 6px; color: var(--mu); scroll-margin-top: 72px; }
p, ul, ol { margin: 0 0 14px; }
ul, ol { padding-left: 22px; }
li { margin-bottom: 6px; }
code { font-family: var(--font-mono); font-size: 0.88em; background: var(--sf2); border: 1px solid var(--ln); border-radius: 6px; padding: 1px 5px; }
pre { background: var(--sf); border: 1px solid var(--ln); border-radius: 10px; padding: 14px 16px; overflow: auto; }
pre code { background: none; border: 0; padding: 0; }
.tw { overflow-x: auto; margin: 0 0 18px; border: 1px solid var(--ln); border-radius: 12px; background: var(--sf); }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th { text-align: left; font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--mu); font-weight: 500; background: var(--sf2); }
th, td { padding: 9px 14px; vertical-align: top; border-bottom: 1px solid var(--ln); }
tr:last-child td { border-bottom: 0; }
table.nw1 td:first-child { white-space: nowrap; }
.layers { display: grid; gap: 6px; margin: 0 0 20px; }
.layer { display: grid; grid-template-columns: 72px 110px 1fr 110px; gap: 14px; align-items: center; padding: 10px 16px; border-radius: 10px; border: 1px solid var(--ln); background: var(--sf); font-size: 13.5px; margin: 0 auto; width: 100%; }
.layer.l0 { width: 70%; } .layer.l1 { width: 80%; } .layer.l2 { width: 90%; }
.layer b { font-family: var(--font-mono); color: var(--ac); }
.layer .w { font-weight: 600; }
.layer .d { color: var(--mu); }
.layer .n { color: var(--mu); text-align: right; font-size: 12px; }
footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid var(--ln); color: var(--mu); font-size: 13px; }
@media (max-width: 860px) {
  .wrap { grid-template-columns: 1fr; gap: 0; padding: 28px 16px 72px; }
  .side { display: none; }
  .top { padding: 10px 0; }
  .top-in { padding: 0 16px; }
  table { display: block; max-width: 100%; overflow-x: auto; }
  .layer { grid-template-columns: 56px 1fr; } .layer .d, .layer .n { grid-column: 2; text-align: left; }
  .layer.l0, .layer.l1, .layer.l2 { width: 100%; }
}
</style>
</head>
<body>
<header class="top"><div class="top-in"><a class="back" href="./">← Back to demo</a></div></header>
<div class="wrap">
  <aside class="side"><div class="eyebrow">On this page</div>${toc.map(([id, t]) => `<a href="#${id}">${esc(t.replace(/^\d+\.\s*/, ''))}</a>`).join('')}</aside>
  <main>
    <h1>${esc(title)}</h1>
    <p class="lede">How the app is tested, which risks each layer covers, and how the suite is kept honest. Rendered from <a href="${REPO}/blob/main/TEST_STRATEGY.md"><code>TEST_STRATEGY.md</code></a>.</p>
    ${out.join('\n    ')}
    <footer>Part of the <a href="./">${appName} demo</a>. The strategy is the real one for this repository; the demo data is not.</footer>
  </main>
</div>
</body>
</html>
`;
writeFileSync('dist-demo/strategy.html', scaleFonts(html));
