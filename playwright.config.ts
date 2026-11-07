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
    // On CI the baselines carry a `-ci` suffix: they are generated on the CI runner itself (see the
    // "Update visual baselines" workflow), because font rendering differs between a laptop and a runner.
    {
      name: 'visual',
      testDir: './tests/visual',
      fullyParallel: false,
      workers: 2,
      timeout: 60_000,
      snapshotPathTemplate: `{testDir}/{testFileName}-snapshots/{arg}{-projectName}-{platform}${process.env['CI'] ? '-ci' : ''}{ext}`,
      expect: { toHaveScreenshot: { animations: 'disabled' } },
    },
    // The packaged-style app: launches Electron itself. Needs `npm install` and `npm run build` first.
    { name: 'electron', testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 60_000 },
  ],
});
