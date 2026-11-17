# Performance lane

Measures what happens with very large linked folders. Plan, reasons and the list of suspected hotspots: `TEST_STRATEGY.md`, section 3, "Performance with large libraries". It is separate from `npm test` because it uses real clocks.

```
npm run perf                 # all three lanes
npm run perf:unit            # scan cost, event-loop delay, memory, overlapping and slow scans
npm run perf:ui              # image picker and session start in Chromium
npm run perf:e2e             # launch time, IPC, process memory, 200 image changes, 48-megapixel files (real Electron)
npm run perf:baseline        # record baselines for THIS machine (repeats every measurement 5 times)
node scripts/perf.mjs unit --sizes=1000,10000      # smaller run
```

Default sizes: unit 1,000 / 10,000 / 50,000 / 100,000 images, UI and Electron 1,000 / 10,000 / 50,000. The 50,000 UI cases render 50,000 tiles and take minutes.

## How a result is judged

- Each number is the median of several runs after one warm-up run (`lib.ts`, `measure`).
- **No budget is written in a test.** A budget is `baseline + 3 x noise`, read from `baselines.json` for this machine class: `darwin`, `win32`, `linux`, and the same with `-ci` on CI. Counts (DOM nodes, bytes) have no slack.
- `npm run perf:baseline` records the baseline: it repeats each measurement 5 times, stores the median as the value and the spread (largest minus smallest) as the noise. One choice that is not derived from data: the stored noise is never below 5% of the value, because a few quiet runs understate it. Change `NOISE_FLOOR` in `lib.ts` if that proves wrong.
- With no baseline for a metric the run records it and passes ("no baseline yet"). Until baselines are committed, the lane measures and does not gate.
- A number over budget is measured again; only a second miss fails the test.
- Metrics marked `info` are recorded and never gated (they answer "is this a hotspot?", for example the cost of the sort alone).
- Raw numbers and samples go to `results/<lane>.json` (ignored by git). Keep them as CI artifacts.
- Baselines for the Mac and for the CI runner are recorded separately. Record them on the machine they describe, from a quiet state (nothing else running).

## What is here

| File | Covers |
|---|---|
| `lib.ts` | measuring, budgets, baselines, the library generator |
| `lib.unit.perf.ts` | the rules above, with fake numbers |
| `scan.unit.perf.ts` | count, order, hidden and non-image files at every size; scan time; event-loop delay; memory; cost of the sort |
| `races.unit.perf.ts` | rescan, relink and remove while scanning; one stalled folder; duplicate walks |
| `ui.ui.perf.ts` | picker open time, DOM nodes, long tasks, select all, toggle one tile, scroll frames; session start to first image; next image |
| `app.e2e.perf.ts` | launch to a usable window, image list over IPC (size and time), process and heap memory, growth over 200 image changes, 48-megapixel files in picker and session |

## Known defects, found by the race tests

These tests are marked `todo`: they run, fail today, and do not fail the run. When the defect is fixed, remove the `todo` option and the test becomes an ordinary one.

1. A rescan that started earlier but finishes later overwrites a newer result (last write wins).
2. The same happens when a folder is relinked while the old path is still being scanned.
3. `listCollections` waits for every folder, so one stalled drive blocks the Library and Draw pages.
4. Two requests for the same uncached folder (startup list and a session start) walk it twice.

## Limits

- A real slow or network drive is not reproduced; the unit layer only stalls the file system on purpose.
- Frame timing in headless Chromium and on a busy machine is noisy; that is why it is baselined per machine class.
- `app.e2e.perf.ts` reads process memory from `app.getAppMetrics()` (working set) and the renderer heap through the DevTools protocol; values differ between macOS, Windows and Linux, so compare only against the same platform's baseline.
