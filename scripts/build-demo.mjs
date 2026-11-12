// Static demo for GitHub Pages: the real renderer on a browser-only bridge. Output: dist-demo/
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';

const require = createRequire(import.meta.url);

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
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

// Reuse the renderer's static files and font handling by building the app first (npm run build).
cpSync('dist/renderer/fonts', 'dist-demo/fonts', { recursive: true });
cpSync('dist/renderer/fonts.css', 'dist-demo/fonts.css');
writeFileSync('dist-demo/styles.css', readFileSync('src/renderer/styles.css', 'utf8') + '\n' + readFileSync('src/demo/demo.css', 'utf8'));

const html = readFileSync('src/renderer/index.html', 'utf8')
  .replace('<title>Hatchmark</title>', '<title>Hatchmark · demo</title>')
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; font-src \'self\'">');
writeFileSync('dist-demo/index.html', html);
writeFileSync('dist-demo/.nojekyll', '');
writeFileSync('dist-demo/strategy.css', readFileSync('src/demo/strategy.css', 'utf8'));
execFileSync(process.execPath, ['scripts/build-strategy.mjs'], { stdio: 'inherit' });
cpSync('study', 'dist-demo/study', {
  recursive: true,
  filter(source) {
    const parts = relative('study', source).split(sep);
    return !(parts[0] === 'data' && parts.at(-1)?.endsWith('.png'));
  },
});
const studyFonts = join('dist-demo/study', 'fonts');
mkdirSync(studyFonts, { recursive: true });
const fontFiles = join(dirname(require.resolve('@fontsource/space-grotesk/package.json')), 'files');
const monoFiles = join(dirname(require.resolve('@fontsource/dm-mono/package.json')), 'files');
for (const weight of [400, 500, 600, 700]) {
  const file = `space-grotesk-latin-${weight}-normal.woff2`;
  cpSync(join(fontFiles, file), join(studyFonts, file));
}
for (const weight of [400, 500]) {
  const file = `dm-mono-latin-${weight}-normal.woff2`;
  cpSync(join(monoFiles, file), join(studyFonts, file));
}
