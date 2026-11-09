import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { startHarness, bridgeInitScript } from '../tests/helpers/harness';
import { makeReferenceFolder } from '../tests/helpers/fixtures';
import { addDays, localDate } from '../src/shared/dates';
import { API_METHODS } from '../src/shared/types';
import { controls, realFaults, screens, visualFaults, type Fault } from './faults';

const OUT = path.resolve('study/data');
const WIDTH = 1280;
const HEIGHT = 760;
const BUDGETS = { local: 97, ci: 486 };
const REPEATS = 20;
const realMode = process.argv.includes('--real');
const measuredFaults = realMode ? realFaults : visualFaults;

interface Shot {
  buffer: Buffer;
  pixels: PNG;
}

function decode(buffer: Buffer): PNG {
  return PNG.sync.read(buffer);
}

function changedPixels(first: PNG, second: PNG, threshold: number): number {
  if (first.width !== second.width || first.height !== second.height) {
    throw new Error(`Screenshot dimensions differ: ${first.width}x${first.height} vs ${second.width}x${second.height}`);
  }
  return pixelmatch(first.data, second.data, undefined, first.width, first.height, { threshold });
}

function comparisonSettings(base: Shot, fault: Shot) {
  const deltaDefault = changedPixels(base.pixels, fault.pixels, 0.2);
  const deltaStrict = changedPixels(base.pixels, fault.pixels, 0.02);
  return {
    default: { threshold: 0.2, diffPixels: deltaDefault, flagged: deltaDefault > 0 },
    strict: {
      threshold: 0.02,
      diffPixels: deltaStrict,
      localFlagged: deltaStrict > BUDGETS.local,
      ciFlagged: deltaStrict > BUDGETS.ci,
      unlimitedFlagged: deltaStrict > 0,
    },
  };
}

async function seed(harness: Awaited<ReturnType<typeof startHarness>>, folder: string) {
  harness.pickNext(folder);
  await harness.api.linkFolder();
  await harness.api.saveSettings({ theme: 'dark', setup: { ...((await harness.api.getSettings()).setup), collectionId: (await harness.api.listCollections())[0]!.id } });
  const today = new Date(2026, 9, 30, 12);
  const minutes = [10, 20, 35, 45, 70, 90];
  for (let i = 0; i < 160; i++) {
    if (i % 5 === 3 || i % 11 === 4) continue;
    const day = addDays(today, -i);
    await harness.api.addSession({
      date: localDate(day),
      startedAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12).toISOString(),
      type: i % 3 ? 'Gesture' : 'Still life',
      collectionId: null,
      mode: 'whole',
      seconds: minutes[i % minutes.length]! * 60,
      images: 12,
      source: i % 7 ? 'app' : 'manual',
    });
  }
}

async function pin(page: Page) {
  await page.addInitScript(`(() => {
    const NativeDate = Date;
    const fixed = new NativeDate(2026, 9, 30, 12).valueOf();
    const FixedDate = new Proxy(NativeDate, {
      construct: (target, args) => Reflect.construct(target, args.length ? args : [fixed], target),
      apply: (target, thisArg, args) => Reflect.apply(target, thisArg, args.length ? args : [fixed])
    });
    Object.defineProperty(window, 'Date', { value: FixedDate });
    let seed = 12345;
    Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  })()`);
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
}

async function installBridge(page: Page, harness: Awaited<ReturnType<typeof startHarness>>) {
  await page.exposeFunction('__plchldrApi', async (method: string, args: unknown[]) => {
    if (!(API_METHODS as readonly string[]).includes(method)) throw new Error(`Unknown bridge method: ${method}`);
    const action = (harness.api as unknown as Record<string, (...values: unknown[]) => unknown>)[method];
    if (!action) throw new Error(`Missing bridge method: ${method}`);
    return action(...args);
  });
  await page.addInitScript(bridgeInitScript);
}

async function settle(page: Page) {
  await page.evaluate('document.fonts.ready');
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
}

async function capture(page: Page): Promise<Shot> {
  await settle(page);
  const buffer = await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    mask: [page.locator('.col-path')],
    scale: 'css',
  });
  return { buffer, pixels: decode(buffer) };
}

async function showScreen(page: Page, screen: string) {
  await page.getByTestId(`nav-${screen.toLowerCase()}`).click();
  if (screen === 'Practice') {
    await expect(page.getByTestId('stat-library')).toContainText('14');
  } else if (screen === 'History') {
    await expect(page.getByTestId('hist-days')).not.toContainText('0');
  } else {
    const previews = page.getByTestId('previews').locator('img');
    await expect(page.getByTestId('collection')).toHaveCount(1);
    await expect(previews).toHaveCount(8);
    await expect(previews.first()).toHaveJSProperty('naturalWidth', 120);
  }
  await settle(page);
}

async function setTheme(page: Page, harness: Awaited<ReturnType<typeof startHarness>>, theme: Fault['theme'], screen?: string) {
  await harness.api.saveSettings({ theme });
  await page.reload();
  await page.getByTestId('theme-toggle').waitFor();
  await showScreen(page, 'Practice');
  await expect(page.getByTestId('stat-library')).toContainText('14');
  if (screen && screen !== 'Practice') await showScreen(page, screen);
}

async function applyFault(page: Page, fault: Fault) {
  if (fault.css) await page.addStyleTag({ content: fault.css });
  if (fault.js) await page.evaluate(fault.js);
}

function faultSummary(fault: Fault, byScreen: Record<string, ReturnType<typeof comparisonSettings>>) {
  const settings = Object.values(byScreen);
  return {
    id: fault.id,
    name: fault.name,
    kind: fault.kind,
    theme: fault.theme,
    sourceCommit: fault.sourceCommit ?? null,
    rgbDelta: fault.rgbDelta ?? null,
    drawnOn: fault.screens,
    screens: byScreen,
    caughtEveryScreen: {
      default: settings.every((s) => s.default.flagged),
      local: settings.every((s) => s.strict.localFlagged),
      ci: settings.every((s) => s.strict.ciFlagged),
      strict: settings.every((s) => s.strict.unlimitedFlagged),
    },
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const temp = mkdtempSync(path.join(tmpdir(), 'plchldr-study-'));
  const folder = path.join(temp, 'Gesture');
  makeReferenceFolder(folder, 14, 'gesture');
  const harness = await startHarness();
  let browser: Browser | undefined;
  try {
    await seed(harness, folder);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error('Study page error:', error));
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('Study page console:', message.text());
    });
    await installBridge(page, harness);
    await pin(page);
    await page.goto(harness.url);
    await page.getByTestId('theme-toggle').waitFor();

    const baselines: Record<string, Shot> = {};
    for (const theme of ['dark', 'light'] as const) {
      for (const screen of screens) {
        await setTheme(page, harness, theme, screen);
        baselines[`${theme}-${screen}`] = await capture(page);
      }
    }

    const repeatNoise: Record<string, number[]> = {};
    const proxyNoise: Record<string, number[]> = {};
    const repeatBaseline = new Map<string, PNG>();
    for (const screen of screens) {
      repeatBaseline.set(screen, baselines[`dark-${screen}`]!.pixels);
    }
    for (const screen of screens) {
      await setTheme(page, harness, 'dark', screen);
      repeatNoise[screen] = [];
      proxyNoise[screen] = [];
      for (let i = 0; i < REPEATS; i++) {
        const shot = await capture(page);
        repeatNoise[screen]!.push(changedPixels(repeatBaseline.get(screen)!, shot.pixels, 0.02));
      }
    }

    const proxyBrowser = await chromium.launch({ headless: true, args: ['--font-render-hinting=none'] });
    const proxyContext = await proxyBrowser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    const proxyPage = await proxyContext.newPage();
    await installBridge(proxyPage, harness);
    await pin(proxyPage);
    await proxyPage.goto(harness.url);
    await proxyPage.getByTestId('theme-toggle').waitFor();
    for (const screen of screens) {
      await setTheme(proxyPage, harness, 'dark', screen);
      await proxyPage.addStyleTag({ content: '* { text-shadow: 0 0 0.8px color-mix(in srgb, currentColor 31%, transparent) !important; }' });
      const proxy = await capture(proxyPage);
      proxyNoise[screen] = [changedPixels(repeatBaseline.get(screen)!, proxy.pixels, 0.02)];
    }
    await proxyContext.close();
    await proxyBrowser.close();

    const faultResults = [];
    for (const fault of measuredFaults) {
      const byScreen: Record<string, ReturnType<typeof comparisonSettings>> = {};
      for (const screen of fault.screens) {
        await setTheme(page, harness, fault.theme, screen);
        await applyFault(page, fault);
        byScreen[screen] = comparisonSettings(baselines[`${fault.theme}-${screen}`]!, await capture(page));
      }
      faultResults.push(faultSummary(fault, byScreen));
    }

    const controlsResults = [];
    for (const fault of controls) {
      const byScreen: Record<string, { diffPixels: number; flagged: boolean }> = {};
      for (const screen of fault.screens) {
        await setTheme(page, harness, fault.theme, screen);
        await applyFault(page, fault);
        const diffPixels = changedPixels(baselines[`${fault.theme}-${screen}`]!.pixels, (await capture(page)).pixels, 0.02);
        byScreen[screen] = { diffPixels, flagged: diffPixels > BUDGETS.ci };
      }
      controlsResults.push({ id: fault.id, name: fault.name, screens: byScreen });
    }

    const result = {
      study: {
        title: 'What screenshot tests catch that UI tests miss?',
        faultSet: realMode ? 'four historical changes' : 'ten injected visual faults',
        renderer: 'Chromium browser harness; not Electron',
        screens: [...screens],
        viewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
        repeatCount: REPEATS,
        budgets: BUDGETS,
        thresholds: [0.2, 0.02],
        comparator: 'pixelmatch',
        environmentProxy: 'A 31% opacity subpixel text-shadow perturbation in a separate Chromium context; same machine, not a second machine',
        date: '2026-10-30',
        countRule: 'A fault counts as caught only when it is flagged on every screen where it is drawn.',
      },
      noise: {
        sameMachine: repeatNoise,
        environmentProxy: proxyNoise,
      },
      faults: faultResults,
      controls: controlsResults,
    };
    const output = realMode ? 'visual-real.json' : 'visual-sensitivity.json';
    writeFileSync(path.join(OUT, output), JSON.stringify(result, null, 2) + '\n');
  } finally {
    await browser?.close();
    await harness.close();
    rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
