// Bundles main, preload and renderer with esbuild. `node build.mjs --watch` rebuilds on change.
import { build, context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const watch = process.argv.includes('--watch');
const require = createRequire(import.meta.url);

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/renderer', { recursive: true });

const node = { bundle: true, platform: 'node', format: 'cjs', target: 'node20', sourcemap: true, logLevel: 'info' };
const jobs = [
  { ...node, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs', external: ['electron'] },
  { ...node, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs', external: ['electron'] },
  {
    entryPoints: ['src/renderer/main.tsx'],
    outfile: 'dist/renderer/app.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    sourcemap: true,
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
    minify: !watch,
    logLevel: 'info',
  },
];

function copyStatic() {
  cpSync('src/renderer/index.html', 'dist/renderer/index.html');
  cpSync('src/renderer/styles.css', 'dist/renderer/styles.css');
  copyFonts();
}

// Fonts come from @fontsource when installed; otherwise the CSS falls back to system fonts.
function copyFonts() {
  const faces = [];
  mkdirSync('dist/renderer/fonts', { recursive: true });
  for (const [pkg, family] of [['dm-sans', 'DM Sans'], ['dm-mono', 'DM Mono']]) {
    let dir;
    try {
      dir = join(dirname(require.resolve(`@fontsource/${pkg}/package.json`)), 'files');
    } catch {
      continue;
    }
    if (!existsSync(dir)) continue;
    for (const weight of [400, 500, 700]) {
      const file = `${pkg}-latin-${weight}-normal.woff2`;
      if (!readdirSync(dir).includes(file)) continue;
      cpSync(join(dir, file), join('dist/renderer/fonts', file));
      faces.push(`@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;font-display:swap;src:url(./fonts/${file}) format('woff2')}`);
    }
  }
  writeFileSync('dist/renderer/fonts.css', faces.join('\n') + '\n');
}

if (watch) {
  copyStatic();
  for (const job of jobs) await (await context(job)).watch();
  console.log('watching…');
} else {
  await Promise.all(jobs.map((j) => build(j)));
  copyStatic();
}
