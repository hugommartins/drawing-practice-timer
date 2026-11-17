// Static demo for GitHub Pages: the real renderer on a browser-only bridge. Output: dist-demo/
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// Optional real reference images: demo-images/<collection name>/*.jpg (see scripts/fetch-demo-images.mjs).
const IMG = /\.(jpe?g|png|webp|avif)$/i;
const realImages = {};
if (existsSync('demo-images')) {
  for (const d of readdirSync('demo-images', { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const files = readdirSync(`demo-images/${d.name}`).filter((f) => IMG.test(f)).sort();
    if (files.length) realImages[d.name] = files;
  }
}

// The case study lives in study/. It is optional: without it the demo and strategy page build without links to it.
const hasStudy = existsSync('study');

const imageSummary = Object.entries(realImages).map(([name, files]) => `${name} ${files.length}`).join(', ');
console.log(imageSummary ? `Demo images: real (${imageSummary})` : 'Demo images: none found in demo-images/, using generated art. Run: npm run demo:images');

rmSync('dist-demo', { recursive: true, force: true });
mkdirSync('dist-demo', { recursive: true });

await build({
  entryPoints: ['src/demo/main.tsx'],
  outfile: 'dist-demo/app.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"', __DEMO_IMAGES__: JSON.stringify(realImages), __DEMO_STUDY__: JSON.stringify(hasStudy) },
  logLevel: 'info',
});

// Reuse the renderer's static files and font handling by building the app first (npm run build).
cpSync('dist/renderer/fonts', 'dist-demo/fonts', { recursive: true });
cpSync('dist/renderer/fonts.css', 'dist-demo/fonts.css');
writeFileSync('dist-demo/styles.css', readFileSync('src/renderer/styles.css', 'utf8') + '\n' + readFileSync('src/demo/demo.css', 'utf8'));

// Favicon: the app's ring-and-dot mark.
cpSync('src/demo/favicon.svg', 'dist-demo/favicon.svg');

const html = readFileSync('src/renderer/index.html', 'utf8')
  .replace(/<title>([^<]*)<\/title>/, '<title>$1 · demo</title>')
  .replace('</head>', '<link rel="icon" href="./favicon.svg" type="image/svg+xml">\n</head>')
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; font-src \'self\'">');
writeFileSync('dist-demo/index.html', html);
writeFileSync('dist-demo/.nojekyll', '');
if (Object.keys(realImages).length) cpSync('demo-images', 'dist-demo/images', { recursive: true });

execFileSync(process.execPath, ['scripts/build-strategy.mjs'], { stdio: 'inherit' });

// Case study: its own template (study/), published under /study/ when the folder exists.
if (hasStudy) cpSync('study', 'dist-demo/study', { recursive: true, filter: (src) => !/study[\\/]data[\\/].*\.png$/.test(src) });
