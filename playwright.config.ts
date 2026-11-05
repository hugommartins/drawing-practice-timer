import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    // The real renderer in Chromium, backed by the real file-handling code, no Electron needed.
    { name: 'ui', testDir: './tests/ui', use: { viewport: { width: 1280, height: 860 } } },
    // Pixel comparison of each screen in the real Electron window. Baselines are per platform.
    { name: 'visual', testDir: './tests/visual', fullyParallel: false, workers: 2, timeout: 60_000, expect: { toHaveScreenshot: { animations: 'disabled' } } },
    // The packaged-style app: launches Electron itself. Needs `npm install` and `npm run build` first.
    { name: 'electron', testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 60_000 },
  ],
});
