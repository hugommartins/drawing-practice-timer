import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { bridgeInitScript, startHarness, type Harness } from '../helpers/harness';
import { makeReferenceFolder } from '../helpers/fixtures';
import { API_METHODS } from '../../src/shared/types';

interface Fixtures {
  harness: Harness;
  /** A page already pointed at the app, with a fresh empty data dir. */
  app: Page;
  /** Creates a folder of `count` images and returns its path. */
  makeFolder(name: string, count: number): string;
}

export const test = base.extend<Fixtures>({
  harness: async ({}, use) => {
    const h = await startHarness();
    await use(h);
    await h.close();
  },
  makeFolder: async ({}, use) => {
    const root = mkdtempSync(path.join(tmpdir(), 'hatchmark-refs-'));
    await use((name, count) => {
      const dir = path.join(root, name);
      makeReferenceFolder(dir, count, name.toLowerCase());
      return dir;
    });
  },
  app: async ({ page, harness }, use) => {
    await page.exposeFunction('__hatchmarkApi', async (method: string, args: unknown[]) => {
      if (!(API_METHODS as readonly string[]).includes(method)) throw new Error(`unknown api method ${method}`);
      return (harness.api as unknown as Record<string, (...a: unknown[]) => unknown>)[method]!(...args);
    });
    await page.addInitScript(bridgeInitScript);
    await page.goto(harness.url);
    await use(page);
  },
});

export { expect };

/** Link a folder through the UI (the fake picker returns `folder`). */
export async function linkViaUi(page: Page, harness: Harness, folder: string): Promise<void> {
  harness.pickNext(folder);
  await page.getByTestId('link-folder-cta').click();
  await expect(page.getByTestId('flash')).toContainText('Linked');
}
