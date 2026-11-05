# Testing

```bash
npm run test:unit            # 62 tests, no browser: timer, stats, storage, image-access rules, window security
npm run test:ui              # 22 tests: every screen in Chromium, backed by the real file-handling code
npm run test:visual          # 11 tests / 12 screenshots: pixel comparison of each screen in the real Electron window, both themes
npm run test:visual:update   # (re)create the baselines for your platform
npm run test:e2e             # 1 journey in the real Electron app
npm run mutate               # Stryker: mutation testing of the logic layer
npm run mutate:ui            # Stryker: mutation testing of the renderer (slow)
```

Each check lives in the lowest layer that can prove it.

| Layer | Proves | Needs |
|---|---|---|
| `tests/unit` | timer maths (injected clock), stats, JSONL storage, which files `plchldr-img://` may serve (`authorizeImage`: traversal, symlinks, sibling-prefix folders), sandbox settings, every preload method is implemented | Node |
| `tests/ui` | each page and interaction, responsive layout, view tools, log-practice dialog; Playwright's `page.clock` runs a 30-minute session in milliseconds | Chromium |
| `tests/visual` | what the screens look like in the real app window: practice, history, library, session with grid, log dialog, empty state; light and dark; wide and narrow | Electron |
| `tests/e2e` | only what needs everything wired: preload bridge, IPC, the real protocol, files on disk, a restart | Electron |

How it fits together: `src/main/handlers.ts` holds everything that touches disk and has **no Electron imports**. The Electron main process wires it to IPC; the UI and visual tests wire the same object to a page. Only the native folder picker is faked. The OS dialog can't be automated portably, so the e2e journey uses `PLCHLDR_TEST_FOLDER`; `PLCHLDR_USER_DATA` and `PLCHLDR_DATA_DIR` keep tests off your real data.

## Visual regression

Playwright's `toHaveScreenshot` launches the real app (`_electron`) for each screen and compares the window content with a baseline in `tests/visual/screens.spec.ts-snapshots/`. Screenshots come from Electron's own Chromium, so a baseline shows what the app really renders.

How each launch is prepared: the data folder is seeded by the same `createApi` the app uses, then the app starts against it with `PLCHLDR_DATA_DIR`.

What is pinned so the same code always renders the same pixels:

| Source of variation | How it is pinned |
|---|---|
| Date and time | fake clock fixed at Fri 30 Oct 2026, noon, and checked to be frozen before each shot |
| Random image order | `Math.random` replaced by a seeded generator |
| Data | generated from the fixed date, deterministic gaps and sizes |
| Theme | stored in the seeded settings (not "system") |
| Window size | CSS viewport set exactly (1280×760 wide, 640×760 narrow), independent of display size |
| Display scale | `--force-device-scale-factor=1`, so Retina and non-Retina screens produce the same pixels |
| Animations, caret | disabled |
| Temp folder paths | masked |
| Fonts, images | waited on (`document.fonts.ready`, image `complete`) |

Comparison is strict on purpose: per-pixel `threshold: 0.02` and at most 0.01% differing pixels. Playwright's default per-pixel tolerance (0.2) hides low-contrast edges such as a card's corner radius changing from 16 px to 8 px.

**No baselines are committed yet.** They are per platform (`-darwin`, `-linux`, `-win32`) and have to come from a real Electron run. On your Mac: `npm install`, then `npm run test:visual:update`, look at the images, and commit the `-darwin` files. After that, any change to a screen shows up as a failure with expected / actual / diff images in the report. An intended design change is handled the same way: update, review, commit.

## Mutation testing (Stryker)

[StrykerJS](https://stryker-mutator.io) changes the source in small ways (flips `<` to `<=`, drops a condition, swaps `&&` for `||`) and runs the tests against each change. A test failing means the mutant is **killed**; none failing means it **survived**, which is a missing test or dead code.

- `stryker.config.json`: the logic layer (`src/shared`, handlers, library, storage, window) against the unit tests. Fast.
- `stryker.ui.config.json`: the renderer against the UI tests. Slow (a build and a browser run per mutant); run it overnight or on one file with `-m src/renderer/pages/Session.tsx`.
- The TypeScript checker discards mutants that don't compile, so they aren't counted as survivors.
- `thresholds.break` fails the command if the mutation score drops below it.
- `incremental` mode reuses results for code and tests that haven't changed.
- Reports: `reports/mutation/logic.html` and `ui.html`.

Treat survivors one at a time: write the missing test, or mark a provably equivalent mutant with `// Stryker disable next-line <mutator>: <why>`.

## CI

GitHub Actions, in `.github/workflows/`:

| Workflow | Runs | Where | When |
|---|---|---|---|
| `ci.yml` / checks | typecheck, unit, UI | Linux | every push to `main` and every pull request |
| `ci.yml` / electron | visual, e2e | macOS | after checks pass |
| `mutation.yml` | Stryker, logic layer | Linux | weekly, and on demand |

- Visual baselines are per platform, so that layer runs only where the baselines were generated (`-darwin`). Commit them before the first push, or the macOS job fails with no baseline to compare against.
- On failure, traces, screenshots and diffs are uploaded as artifacts; the HTML Playwright report is produced in CI.
- Commit `package-lock.json` so installs are reproducible (`npm ci`). Until it exists the workflows fall back to `npm install`.
- Mutation results are cached between runs (`incremental`), so a weekly run only re-tests what changed.

## Where to look

- Unit: `tests/unit/*.test.ts`
- UI specs and fixtures: `tests/ui/`; the Chromium harness that serves `dist/` and backs `window.plchldr` with the real `createApi` is `tests/helpers/harness.ts`
- Visual: `tests/visual/screens.spec.ts`
- E2E journey: `tests/e2e/electron.spec.ts`
