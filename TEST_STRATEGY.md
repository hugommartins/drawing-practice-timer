# Hatchmark test strategy

**Last updated:** 2026-11-13. Added risk 7 (very large linked folders and performance) with its test plan. The performance lane for it is implemented (`tests/perf`); no baselines are recorded yet, so it measures and does not gate.

## 1. Scope and risks

**Current requirements**

| # | Requirement |
|---|---|
| R1 | Link local folders of reference images; the folder name is the drawing type |
| R2 | Run a session with a per-image timer, a whole-session timer, or no timer; adjust time on the fly |
| R3 | View tools in a session: mirror, flip, greyscale, grid |
| R4 | Save sessions; ignore sessions under 20 seconds; never credit time the computer slept |
| R5 | Log practice done outside the app |
| R6 | History: heatmap by month and day (past year or a single year), streaks, per-type totals, delete a session |
| R7 | Library: rename, change folder, rescan, remove; flag missing folders |
| R8 | Light, dark or system theme; layout follows the window size |
| R9 | Data kept as plain local files; the app reads only the linked folders |

**What matters most, ranked by the damage if it breaks**

| # | Risk | Requirements |
|---|---|---|
| 1 | Lost or wrong practice data (not saved, miscounted, deleted by accident) | R4–R6, R9 |
| 2 | Timer dishonesty (drift, counting sleep time, double-advancing) | R2, R4 |
| 3 | Reading files it shouldn't (the image protocol serving non-linked paths) | R1, R9 |
| 4 | Unusable at some window size (overflow, controls off-screen, grid misaligned with the image) | R3, R8 |
| 5 | Broken wiring between Electron processes (preload, IPC, protocol) | all |
| 6 | Looks wrong (spacing, colour, radius, theme) | R8 |
| 7 | Slow or unresponsive with very large linked folders (scanning, long lists, thumbnails, memory) | R1, R7 |

Risk 7 was added on 2026-11-13 from reading the code, not from a measured problem. Its place in the ranking is provisional until the first measurements exist (section 3, "Performance with large libraries").

## 2. Principles

1. **Lowest layer that can prove it.** A check lives in the cheapest, fastest layer able to fail for the right reason. Higher layers only test what lower ones can't.
2. **Design for testability.** Code that touches disk has no Electron imports. Time and randomness are injected. This makes the lower layers possible.
3. **Deterministic by construction.** No sleeps, real clocks or unseeded randomness in any test, except the one real wait in the e2e journey.
4. **Real code, fake edges.** The only mocked boundary is the native folder dialog. File scanning, storage and the image allow-list are production code.
5. **Tests must be able to fail.** Boundaries are tested on both sides, and mutation testing checks the suite itself.
6. **Few end-to-end tests.** E2E covers journeys, not features.
7. **Pixels get their own lane.** Appearance is checked by screenshot comparison, not by asserting CSS values.

## 3. Layers

```
        ┌──────────────┐   Journeys       Real Electron, real disk, real restart
        │     E2E      │   needs: electron binary
        ├──────────────┤
        │    Visual    │   Appearance     Screenshot comparison per screen, theme and width,
        │              │                  in the real window
        ├──────────────┤   needs: electron binary
        │      UI      │   Screens        Real UI in Chromium + real file-handling code
        ├──────────────┤   needs: browser only
        │     Unit     │   Logic          Pure logic, storage on a temp dir, security rules
        └──────────────┘   needs: Node only
```

### Unit (`tests/unit`, `node:test`)

Runs in about a second with no browser.

| Area | What is asserted |
|---|---|
| Timer (`SessionRunner`) | Countdown, auto-advance, planned-count cap, no repeats within a pass, reshuffle when open-ended, pause/resume, ±time, finish, overflow carried across images, sleep gap not credited |
| Stats | Minutes per session (under 20 s counts as 0), level thresholds, Monday week start, 365-day past year, heatmap rows per month, streaks and insights, per-type totals over 30 days |
| Storage | Atomic writes, append-only sessions with tombstone deletes, corrupt lines skipped, defaults on empty |
| Library | Natural sort, nested folders, hidden files and non-images ignored, symlinked folders not followed, unreachable folders |
| Image access | Only image files inside linked folders are served; refuses other file types, other folders, `..` traversal, symlinks pointing out, sibling folders sharing a prefix, relative paths, bad encodings; stops once a folder is removed |
| Process boundary | Every method the preload exposes is implemented and nothing extra; window keeps sandbox, context isolation, no Node, no background throttling |

Boundary rule: every threshold gets one value just inside and one just outside.

### UI (`tests/ui`, Playwright, Chromium)

The built renderer is served over local HTTP. `window.hatchmark` is backed by the real `createApi`, so disk behaviour is production behaviour. Only the folder picker is faked. Playwright's fake clock runs a 30-minute session in milliseconds. A test starts the clock only after the session screen is up.

| Group | Covers |
|---|---|
| First run and setup | Empty state, cancel, linking names the type after the folder, options follow the timer mode and persist, blocked Start with a reason, theme |
| Session | Per-image countdown and advance, pause and ±time, whole-session auto-save and repeat, no-timer count-up, end/keep/discard, under-20 s not saved |
| On screen | Mirror/flip/greyscale/grid and shortcuts, aspect ratio and grid alignment across window sizes, controls restack when narrow |
| Pages | Log-practice dialog, history numbers and heatmap, delete with confirmation, library list/rename/missing folder/remove, no sideways overflow |

Selectors use `data-testid` for structure and roles or labels where the accessible name matters.

### Visual (`tests/visual`, Playwright `_electron` + `toHaveScreenshot`)

Each screen is compared with a stored baseline, taken from the real app window so it shows what Electron's own Chromium renders: practice, history, library and session with grid in light and dark, plus the empty state, the log dialog, and narrow practice and session.

- **Real launch, seeded data:** the data folder is created by the same code the app uses, and the app starts against it. Nothing is faked in the renderer except time and randomness.
- **Pinned inputs:** the clock is fixed to one day and checked to be frozen, `Math.random` is seeded so the image order is identical, the theme is stored in the seeded settings, the window content size is set exactly (the test fails if the display can't fit it), display scale is forced to 1, animations and the caret are off, temp-folder paths are masked, and fonts and images are awaited.
- **Strict comparison:** per-pixel tolerance is lowered from the default so low-contrast edges (a card corner, a border colour) are noticed. A small pixel budget absorbs nothing more than noise.
- **Per-platform baselines:** font rendering differs by OS, so baselines carry a platform suffix. Each machine creates its own with one update command and the diffs are reviewed before committing.
- **Intentional change:** update, review the diff images, commit.

Visual tests catch what functional tests can't: a layout that still works but looks wrong.

### E2E (`tests/e2e`, Playwright `_electron`)

One journey: first run → link a folder (images load through the real protocol) → draw for real → session appears in History → theme change → files on disk are as expected → restart → everything is still there. It exists to catch wiring that no lower layer can see. The folder dialog is replaced by `HATCHMARK_TEST_FOLDER`; `HATCHMARK_USER_DATA` and `HATCHMARK` keep tests off real data.

### Performance with large libraries (implemented, baselines pending)

**Why.** The app reads a linked folder up front. From reading the code on 2026-11-13, these are suspected hotspots to confirm or dismiss with numbers, not findings:

- Every collection is scanned recursively when the app starts, and each file list is kept in memory.
- A scan walks one folder at a time and sorts the whole list with a locale-aware comparison. On a slow or network drive the time is dominated by round trips.
- `collectionImages` returns the complete list to the window in one message, at every session start and every time the image picker opens.
- The image picker draws one tile and one `<img>` per file, with no windowing, and uses the original file as its thumbnail. Toggling a tile copies the whole selection.
- A session shows the original file at full size and does not load the next image ahead of time.
- A rescan that finishes late can overwrite the result of a newer one (last write wins).

**What "huge" means.** Test inputs, not promises: 1,000, 10,000, 50,000 and 100,000 images, flat and nested, with some non-image files mixed in; and a few very large image files (tens of megapixels). The supported limit is decided after measuring.

**What to measure and where**

| Measure | Layer | How |
|---|---|---|
| Scan time and result for N files (count, numeric ordering, no duplicates, deep nesting) | Unit | `scanImages` on a generated tree. Zero-byte files with image extensions are enough, since a scan never reads contents. |
| Main process stays responsive while scanning | Unit | Event-loop delay (p99 and max) sampled during a scan. |
| Overlapping scans: rescan while scanning, remove or relink while scanning | Unit | Scans with an injected delay. The final state must be the newest request's. |
| A slow or unreachable folder does not hold up the others or the window | Unit | File-system wrapper that adds latency. Real network volumes can't be reproduced in CI. |
| Size and round-trip time of the image list | E2E | Time from request to rendered result in the real window. |
| Time from launch to a usable window, with several large collections | E2E | Launch with generated libraries linked. |
| Picker: time to open, number of DOM nodes, long tasks, scrolling | UI | Playwright with a large fake list; long-task observer and node count. |
| Session start with N images (shuffle, first image visible) | UI | Time from Start to the first image. |
| Memory: after opening the picker, and after 200 image changes | E2E | Process memory from the app's own metrics. Growth per image change must stay flat. |
| Very large image files: time to visible, memory, picker thumbnails | E2E | A generated large image, copied to fill a folder. |

**How budgets are set.** Same method as the visual thresholds. The first deliverable is a measured baseline, on the target Mac and on the CI runner separately, with the run-to-run noise recorded. A budget is the baseline plus a margin chosen from that noise. No numbers are fixed before then.

**Where it runs.** Performance checks use real clocks, an exception to principle 3, so they live in their own lane (`tests/perf`), outside the pre-commit set. Each measure is the median of several runs after a warm-up, a failing budget is re-run before it is reported, and raw numbers are kept as run artifacts. Correctness at scale (counts, ordering, races) stays deterministic and belongs in the unit layer.

**What exists.** Implemented on 2026-11-13 in `tests/perf` (README there), run with `npm run perf`. Unit: scan correctness and time at 1,000 to 100,000 images (flat and nested), event-loop delay, memory held by a result, the cost of the sort alone, and the race and slow-folder cases. UI: picker open time, DOM nodes, long tasks, select all, one toggle, scroll frames, session start to first image. Electron: launch with three large collections, image list size and round trip, process and heap memory, growth over 200 image changes, 48-megapixel files in the picker and a session. Every metric except those marked info is gated by baseline plus three times its recorded noise; a miss is repeated once before it fails.

**Found while writing it.** Four of the suspected hotspots are confirmed as behaviour, by tests marked `todo` that fail today and do not fail the run: a late older scan overwrites a newer one (rescan, and relink); `listCollections` waits for every folder, so one stalled drive blocks the Library and Draw pages; two requests for the same uncached folder walk it twice. Whether any of them matters at real sizes is for the first baseline to say. The other hotspots (picker without windowing, original files as thumbnails, whole list over IPC) are measured but not yet judged.

**First measurements (2026-11-15, Mac, Intel i7-9750H, 16 GB, Electron).** Scanning is not the problem: 100,000 files take about 0.5 s, the event loop stays free (p99 about 1 ms), launch with three folders of 50,000 images takes 1.9 s against 1.1 s empty, and the image list over IPC is 0.8 MB and 20 ms at 50,000. The image picker was: 10,000 images opened in 0.64 s with 20,110 DOM nodes and 0.1 s to toggle one tile; 50,000 images opened in 3.5 s with 100,110 nodes, 2.5 s for Select all, 0.63 s for every single tile click, and 814 MB in the renderer. Forty 48-megapixel originals in the picker took 1.2 s to show and 1.17 GB in the renderer, because the original file is the thumbnail. Over 200 image changes the JS heap grew 0.9 MB (flat); process working set grew 107 MB (recorded only).

**First fix.** The picker now draws only the rows in view, placed in pixels (`ImagePicker.tsx`), so its cost no longer depends on the folder size (about 207 DOM nodes at any size, measured in Chromium on Linux; Mac numbers come with the next baseline). Thumbnails are done too: tiles load small previews (320 px, JPEG) made once in the main process and kept in `<userData>/thumbs` (`src/main/thumbs.ts`, size-limited, safe to delete), so the picker no longer decodes the originals. The large-image figures above are from before this and are to be re-recorded; a first (cold) open now pays for making the previews, a later one does not. Not changed: the session view of a huge original still decodes it in full. Not fixed yet: the three race and stall defects above.

**Done when.** Each suspected hotspot above is confirmed or dismissed by a recorded number; budgets are stored in the repo; and a deliberate slowdown (for example, an extra pass over the file list) turns the lane red.

## 4. Where each risk is covered

| Risk | Unit | UI | Visual | E2E |
|---|:-:|:-:|:-:|:-:|
| 1 Data correctness | ● storage, stats | ● save/discard/delete flows | | ● persists across restart |
| 2 Timer honesty | ● runner, injected clock | ● wiring, pause, ±time | | |
| 3 File access | ● allow-list rules | | | ● real protocol |
| 4 Window behaviour | | ● overflow, restack, grid | ● narrow layouts | |
| 5 Electron wiring | ● method parity, window flags | | | ● bridge, IPC, protocol |
| 6 Appearance | | | ● every screen, both themes | |
| 7 Large folders | ● scan, races (4 `todo`), slow folder | ● picker, session start | | ● startup, memory, large files |

● covered today. ○ planned (not implemented). Risk 7 runs in the separate performance lane, not the pre-commit set, and its budgets exist only after baselines are recorded (`npm run perf:baseline`). The Electron part has not been run yet.

## 5. Test data and determinism

- Reference folders are generated on the fly: small gradient PNGs with distinct seeds, one nested subfolder, plus files that must be ignored (`notes.txt`, hidden images).
- "Today" is fixed in stats and visual tests. Other UI tests derive dates relative to now.
- The timer takes a clock and an RNG as inputs. UI and visual tests freeze and advance time explicitly.
- Every test gets a fresh temp data directory. No test shares state.
- A test that waits on the wrong thing (starting the fake clock before the screen exists) is a flaky test; each is fixed at the cause, not retried.

- Large libraries: `makeLibrary` (`tests/perf/lib.ts`) takes the number of images, flat or nested folders, depth, fan-out, non-image files and file content. Zero-byte files for scan tests; copies of one 16-pixel PNG for picker and session rendering; hard links to one 48-megapixel PNG for decode tests (so the disk holds it once). Names carry numeric suffixes so the ordering rule is exercised, and a few hidden files must be skipped. Everything lives in a temp directory and is removed afterwards.

## 6. Out of scope

- Driving native OS widgets (the folder dialog, the macOS menu bar) through UI automation. Playwright can't reach them; the dialog is replaced by a test hook, and the choose-folder step is checked by hand per release. Revisit with an OS automation tool only if that step breaks in practice.
- Cross-platform packaging; the target is macOS, built locally.
- Real network and cloud-synced drives. Latency is simulated in the unit layer; the real thing can't be reproduced in CI. Performance with large local libraries is in scope (risk 7).
- Accessibility auditing beyond the roles, labels and keyboard operation the tests already use.

## 7. Running and gating

| When | What |
|---|---|
| While coding | Unit on save |
| Before commit | Unit + UI + Visual |
| Before release or install | All of the above + E2E on macOS |
| Before release, and after changes to scanning or list rendering | Performance lane (`npm run perf`, section 3) |
| Periodically | Mutation testing (section 8) |

- A change is done when its risk is covered in the lowest suitable layer, and any new threshold has boundary tests on both sides.
- UI, visual and E2E failures keep a trace, screenshot or diff image for diagnosis.
- Retries are off locally. At most one retry in CI, and a test that needs it is treated as a bug.

## 8. Keeping the suite honest

**Stryker** (mutation testing) changes the source in small ways, such as flipping a boundary, swapping `&&` for `||`, forcing a condition true or false, or flipping a boolean, and runs the tests against each change.

| Config | Mutates | Against | Speed |
|---|---|---|---|
| Logic | shared logic, handlers, library, storage, window | unit tests | fast |
| UI | renderer | UI tests | slow; run overnight or per file |

- A mutant that fails a test is **killed**. One that passes is a **survivor**: a missing test or dead code.
- The TypeScript checker discards mutants that don't compile, so they don't count against the score.
- A break threshold on the mutation score fails the run when quality drops. Incremental mode reuses results for untouched code and tests.
- Each survivor is resolved one at a time: write the missing test, or disable the mutant with a written reason if it is provably equivalent.
- Visual tests have their own sanity check: a deliberate style change (a radius, a colour, a padding) must turn them red.

## 9. Known gaps and risks

- E2E and Visual need a real macOS run to be trusted, since the Electron binary isn't available in every environment.
- Only macOS is exercised today. Windows and Linux are untested, and would need the e2e and visual layers run on those OSes, with baselines per OS.
- Visual baselines must be created on each platform, and drift when the Electron version or installed fonts change. None are committed until the first run on macOS.
- Visual and UI tests use different Chromium builds (Electron's and Playwright's). That is deliberate: UI tests prove behaviour, visual tests prove appearance in the real window.
- The unsigned local app can trigger Gatekeeper prompts; the install script clears quarantine.
- The 20-second save threshold forces one real 21-second wait in E2E. That is the only non-deterministic delay in the suite.
- UI responsiveness is asserted by geometry; visual tests cover how it looks at the sizes they capture, not every width in between.
- No performance baselines are recorded yet, so the lane measures and does not gate. Record them with `npm run perf:baseline` on the target Mac and on the CI runner, from a quiet machine, and commit `tests/perf/baselines.json`. The hotspots in section 3 come from reading the code, so some may turn out not to matter and others may be missing.
- Performance numbers depend on the machine and the disk. They need a baseline per machine class, like the visual baselines.
- Nothing limits or warns about folder size today. Whether to add a limit, paging or a warning is decided after the first measurements.
