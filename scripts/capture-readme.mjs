// Makes the README pictures from the built web demo: docs/*.png and docs/*.gif.
// Usage: npm run build:demo && npm run readme:images
// No extra packages: the GIF writer is scripts/gif.mjs. The demo's own images are used, so run
// `npm run demo:images` first if you want real references instead of the generated placeholders.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { decodePng, GifWriter } from './gif.mjs';

const { chromium } = await import('@playwright/test').catch(() => import('playwright'));

const ROOT = 'dist-demo';
const OUT = 'docs';
if (!fs.existsSync(path.join(ROOT, 'index.html'))) { console.error('dist-demo/ not found. Run: npm run build:demo'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.md': 'text/markdown' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!path.resolve(file).startsWith(path.resolve(ROOT)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();

async function open({ width, height, scale = 1, dark = false }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: dark ? 'dark' : 'light' });
  const page = await ctx.newPage();
  await page.goto(URL_);
  await page.addStyleTag({ content: '.demo-bar { display: none !important; }' });
  await page.getByTestId('page-practice').waitFor();
  await settle(page);
  return { ctx, page };
}
// Wait for fonts and every image that is on screen.
async function settle(page, ms = 400) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
const png = async (page, name, opts = {}) => { await page.screenshot({ path: path.join(OUT, name), ...opts }); console.log('wrote', path.join(OUT, name)); };

// ---- stills (crisp, 1.5x) ----
{
  const { ctx, page } = await open({ width: 1200, height: 900, scale: 1.5 });
  await png(page, 'practice.png');
  await page.getByTestId('pick-open').click();
  await page.getByTestId('pick-tile').first().waitFor();
  await settle(page, 700);
  for (const i of [1, 4, 6]) await page.getByTestId('pick-tile').nth(i).click();
  await png(page, 'picker.png');
  await ctx.close();
}
{
  const { ctx, page } = await open({ width: 1200, height: 800, scale: 1.5 });
  await page.getByTestId('start-session').click();
  await page.getByTestId('timer').waitFor();
  await settle(page, 800);
  await page.keyboard.press('g');
  await page.waitForTimeout(300);
  await png(page, 'session.png');
  await ctx.close();
}
for (const dark of [false, true]) {
  const { ctx, page } = await open({ width: 1200, height: 900, scale: 1.5, dark });
  await page.getByTestId('nav-history').click();
  await settle(page, 600);
  await png(page, dark ? 'history-dark.png' : 'history.png', { fullPage: true });
  await ctx.close();
}

// ---- GIFs: a few key frames, each held for a set time ----
async function gif(name, w, h, script) {
  const { ctx, page } = await open({ width: w, height: h });
  let enc = null;
  const frame = async (hold = 900) => {
    const img = decodePng(await page.screenshot());
    enc ??= new GifWriter(img.width, img.height);
    enc.addFrame(img.rgba, hold);
  };
  await script(page, frame);
  const bytes = enc.finish();
  fs.writeFileSync(path.join(OUT, name), bytes);
  console.log('wrote', path.join(OUT, name), `(${enc.frames} frames, ${(bytes.length / 1e6).toFixed(1)} MB)`);
  await ctx.close();
}
const press = async (page, key, wait = 250) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };

await gif('session.gif', 1100, 700, async (page, frame) => {
  await page.getByTestId('start-session').click();
  await page.getByTestId('timer').waitFor();
  await settle(page, 700);
  await frame(1500);
  await page.waitForTimeout(1000); await frame(900);
  await press(page, 'g'); await frame(1200);
  await press(page, 'm'); await frame(1200);
  await press(page, 'b'); await frame(1200);
  await press(page, 'b'); await press(page, 'm'); await press(page, 'g');
  await press(page, 'ArrowRight', 500); await settle(page, 300); await frame(1500);
  await press(page, 'h', 400); await frame(1500);
});

await gif('setup.gif', 1000, 760, async (page, frame) => {
  await frame(1400);
  await page.getByTestId('setup-mode-whole').click(); await page.waitForTimeout(250); await frame(1500);
  await page.getByTestId('setup-mode-none').click(); await page.waitForTimeout(250); await frame(1300);
  await page.getByTestId('setup-mode-per-image').click();
  await page.getByTestId('dur-60').click(); await page.getByTestId('count-20').click(); await page.waitForTimeout(250); await frame(1300);
  await page.getByTestId('pick-open').click();
  await page.getByTestId('pick-tile').first().waitFor(); await settle(page, 700); await frame(1400);
  for (const i of [1, 4, 6]) await page.getByTestId('pick-tile').nth(i).click();
  await frame(1300);
  await page.getByTestId('picker-done').click(); await page.waitForTimeout(300); await frame(1500);
});

await browser.close();
server.close();
