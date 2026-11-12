// Copies study/data/*.json into study/index.html as <script type="application/json"> blocks, so the page
// needs no fetch. Run after the study scripts write new numbers:  node scripts/inline-study-data.mjs
// With no study/data/ files for a block, that block is left as it is.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const HTML = 'study/index.html';
const NAMES = ['visual-sensitivity', 'ui-vs-faults', 'visual-real', 'ui-real', 'editorial'];
const START = '<!-- study-data:start -->';
const END = '<!-- study-data:end -->';

let html = readFileSync(HTML, 'utf8');
const existing = {};
for (const m of html.matchAll(/<script type="application\/json" id="data-([\w-]+)">([\s\S]*?)<\/script>/g)) existing[m[1]] = m[2].trim();

const blocks = NAMES.map((name) => {
  const file = `study/data/${name}.json`;
  let body = existing[name];
  if (existsSync(file)) {
    const data = JSON.parse(readFileSync(file, 'utf8')); // fails loudly on invalid JSON
    body = JSON.stringify(data, null, 2).replace(/</g, '\\u003c'); // keeps "</script>" and "<!--" out of the page
  }
  if (!body) throw new Error(`No data for "${name}": expected ${file} or an existing block in ${HTML}.`);
  return `<script type="application/json" id="data-${name}">\n${body}\n</script>`;
});
const region = `${START}\n${blocks.join('\n')}\n${END}`;

if (html.includes(START)) html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), () => region);
else html = html.replace('<script src="./app.js" defer></script>', () => `${region}\n<script src="./app.js" defer></script>`);
writeFileSync(HTML, html);
console.log(`Inlined ${NAMES.length} data blocks into ${HTML}.`);
