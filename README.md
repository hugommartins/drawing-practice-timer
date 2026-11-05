# Plchldr

Drawing-reference practice timer for the desktop. Point it at folders of reference images, pick a timer, draw, and watch a heatmap of the days you practiced fill in.

- **Local references.** Link any folder. The folder name is the drawing type ("Figure", "Hands"); subfolders are included. Nothing is copied or uploaded.
- **Pick your images.** Use the whole folder, or choose a single image or any set of them from a thumbnail picker. The choice is remembered, and "Repeat this setup" reuses it.
- **Timers.** Per image, whole session, or none. Adjust on the fly with ±15 s / +1 m.
- **Tracking.** Heatmap by month × day, past year or any single year, with streaks and per-type totals. Log practice you did away from the app.
- **View tools.** Mirror, flip, greyscale and a grid overlay that always sits exactly on the image.
- **Light, dark or follow the system.** The layout follows the window size.

## Run it

Needs Node 20+.

```bash
npm install
npm start          # build + launch
npm run dev        # rebuild on change + launch
npm run install:mac   # build Plchldr.app into ~/Applications
```

Keyboard in a session: `space` pause · `←` `→` previous / next · `m` mirror · `f` flip · `b` greyscale · `g` grid · `h` focus (hide the controls so the image fills the window, `esc` or `h` to bring them back).

## Getting references

Plchldr reads folders, so any source works once its images are in one. Put them in a folder named for the drawing type and link it.

For online collections, a downloader like [gallery-dl](https://github.com/mikf/gallery-dl) can save a whole board or gallery to a folder. It supports Pinterest boards and many other image sites (check its supported-sites list). Respect each site's terms and the artists' rights; references stay on your machine and are only used for practice.

```bash
gallery-dl -d ~/Pictures/refs "https://www.pinterest.com/<user>/<board>/"
```

Then use **Link a folder** in the Library. Re-run the command to refresh the folder, then **Rescan**.

## Your data

Plain files, in one folder you can back up or read:

On macOS: `~/Library/Application Support/Plchldr/data/`

| File | Contents |
|---|---|
| `collections.json` | linked folders |
| `sessions.jsonl` | one JSON line per session; deleting adds a tombstone line (append-only) |
| `settings.json` | theme, last setup, last session |

Sessions shorter than 20 seconds are not saved. Time while the computer sleeps is not counted.

## Tests

```bash
npm test                   # unit + UI
npm run test:visual        # screenshot comparison in the real window (run test:visual:update once to create your baselines)
npm run test:e2e           # one journey in the real Electron app
npm run mutate             # mutation testing with Stryker
```

Layers, rationale and test hooks: [TESTING.md](TESTING.md).

## Layout

```
src/main/       Electron main process, disk access (handlers.ts), image scanning
src/preload/    the narrow window.plchldr bridge
src/renderer/   React UI (Practice, Session, History, Library)
src/shared/     types, stats, SessionRunner, date/format helpers (used by both sides)
tests/          unit, ui (Chromium + harness), e2e (Electron)
```

## Roadmap

Next up:

- [ ] Keyboard shortcuts: space to pause, arrows for previous/next, `M` mirror, `G` grid
- [ ] No-repeat shuffle: don't repeat an image until the folder is exhausted, remembered across sessions
- [ ] Sound or flash when an image's time is up
- [ ] Skip or hide a reference permanently
- [ ] Resume an interrupted session after the app closes

Practice:

- [ ] Daily and weekly goals per drawing type, shown on the heatmap and Practice page
- [ ] One-line notes per session, visible in History
- [ ] Zoom and pan on the reference
- [ ] Always-on-top floating reference window

Data:

- [ ] Export and import all data as a single zip
- [ ] Re-link a moved folder without losing history

Quality:

- [ ] Accessibility checks (axe-core) in the UI test layer
- [ ] README screenshot and demo GIF

Not planned: cloud sync, accounts, a mobile app.
