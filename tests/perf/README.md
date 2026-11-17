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

## Suspected hotspots

The app reads a linked folder up front. From reading the code on 2026-11-13, these are suspected hotspots to confirm or dismiss with numbers, not findings:

- Every collection is scanned recursively when the app starts, and each file list is kept in memory.
- A scan walks one folder at a time and sorts the whole list with a locale-aware comparison. On a slow or network drive the time is dominated by round trips.
- `collectionImages` returns the complete list to the window in one message, at every session start and every time the image picker opens.
- The image picker draws one tile and one `<img>` per file, with no windowing, and uses the original file as its thumbnail. Toggling a tile copies the whole selection.
- A session shows the original file at full size and does not load the next image ahead of time.
- A rescan that finishes late can overwrite the result of a newer one (last write wins).

## Findings log

**What exists.** Implemented on 2026-11-13 in `tests/perf` (README there), run with `npm run perf`. Unit: scan correctness and time at 1,000 to 100,000 images (flat and nested), event-loop delay, memory held by a result, the cost of the sort alone, and the race and slow-folder cases. UI: picker open time, DOM nodes, long tasks, select all, one toggle, scroll frames, session start to first image. Electron: launch with three large collections, image list size and round trip, process and heap memory, growth over 200 image changes, 48-megapixel files in the picker and a session. Every metric except those marked info is gated by baseline plus three times its recorded noise; a miss is repeated once before it fails.

**Found while writing it.** Four of the suspected hotspots are confirmed as behaviour, by tests marked `todo` that fail today and do not fail the run: a late older scan overwrites a newer one (rescan, and relink); `listCollections` waits for every folder, so one stalled drive blocks the Library and Draw pages; two requests for the same uncached folder walk it twice. Whether any of them matters at real sizes is for the first baseline to say. The other hotspots (picker without windowing, original files as thumbnails, whole list over IPC) are measured but not yet judged.

**First measurements (2026-11-15, Mac, Intel i7-9750H, 16 GB, Electron).** Scanning is not the problem: 100,000 files take about 0.5 s, the event loop stays free (p99 about 1 ms), launch with three folders of 50,000 images takes 1.9 s against 1.1 s empty, and the image list over IPC is 0.8 MB and 20 ms at 50,000. The image picker was: 10,000 images opened in 0.64 s with 20,110 DOM nodes and 0.1 s to toggle one tile; 50,000 images opened in 3.5 s with 100,110 nodes, 2.5 s for Select all, 0.63 s for every single tile click, and 814 MB in the renderer. Forty 48-megapixel originals in the picker took 1.2 s to show and 1.17 GB in the renderer, because the original file is the thumbnail. Over 200 image changes the JS heap grew 0.9 MB (flat); process working set grew 107 MB (recorded only).

**First fix.** The picker now draws only the rows in view, placed in pixels (`ImagePicker.tsx`), so its cost no longer depends on the folder size (about 207 DOM nodes at any size, measured in Chromium on Linux; Mac numbers come with the next baseline). Thumbnails are done too: tiles load small previews (320 px, JPEG) made once in the main process and kept in `<userData>/thumbs` (`src/main/thumbs.ts`, size-limited, safe to delete), so the picker no longer decodes the originals. The large-image figures above are from before this and are to be re-recorded; a first (cold) open now pays for making the previews, a later one does not. Not changed: the session view of a huge original still decodes it in full. Not fixed yet: the three race and stall defects above.
