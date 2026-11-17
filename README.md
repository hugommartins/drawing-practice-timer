# Hatchmark

Drawing-reference practice timer for the desktop. Point it at folders of reference images, pick a timer, draw, and watch a heatmap of the days you practiced fill in.

<div align="center">

[![CI](https://github.com/hugommartins/drawing-practice-timer/actions/workflows/ci.yml/badge.svg?style=flat-square)](https://github.com/hugommartins/drawing-practice-timer/actions/workflows/ci.yml) [![Demo](https://github.com/hugommartins/drawing-practice-timer/actions/workflows/pages.yml/badge.svg?style=flat)](https://hugommartins.github.io/drawing-practice-timer/)

![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white&style=flat-square) ![React](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB&style=flat-square) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square) ![macOS and Windows](https://img.shields.io/badge/macOS%20%7C%20Windows-lightgrey?style=flat-square) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**[Try the demo in your browser](https://hugommartins.github.io/drawing-practice-timer/)**: the real interface with sample data, nothing to install.

[Features](#features) · [Install](#install) <br>
[Getting references](#getting-references) · [Your data](#your-data) <br>
[Testing](#testing) · [Roadmap](#roadmap)

</div>

## Features

| | |
|---|---|
| **Local references** | Link any folder. The folder name is the drawing type ("Figure", "Hands"); subfolders are included. Nothing is copied or uploaded. |
| **Pick your images** | Use the whole folder, or choose a single image or any set of them from a thumbnail picker. The choice is remembered, and "Repeat this setup" reuses it. |
| **Timers** | Per image, whole session, or none. Adjust on the fly with ±15 s / +1 m. |
| **Tracking** | Heatmap by month × day, past year or any single year, with streaks and per-type totals. Log practice you did away from the app. |
| **View tools** | Mirror, flip, greyscale and a grid overlay that always sits exactly on the image. |
| **Light, dark or follow the system** | The layout follows the window size. |

## Install

New to this? Follow **[INSTALL.md](INSTALL.md)**: step by step for macOS and Windows, with fixes for the common errors. No coding needed.

For developers: Node 22, `npm install`, `npm start` (build and launch), `npm run dev` (rebuild on change).

## Getting references

Hatchmark reads folders, so any source works once its images are in one. Put them in a folder named for the drawing type and link it.

For online collections, a downloader like [gallery-dl](https://github.com/mikf/gallery-dl) can save a whole board or gallery to a folder. It supports Pinterest boards and many other image sites (check its supported-sites list). Respect each site's terms and the artists' rights; references stay on your machine and are only used for practice.

```bash
gallery-dl -d ~/Pictures/refs "https://www.pinterest.com/<user>/<board>/"
```

Then use **Link a folder** in the Library. Re-run the command to refresh the folder, then **Rescan**.

## Your data

Plain files, in one folder you can back up or read:

On macOS: `~/Library/Application Support/Hatchmark/data/`
On Windows: `%APPDATA%\Hatchmark\data\`

| File | Contents |
|---|---|
| `collections.json` | linked folders |
| `sessions.jsonl` | one JSON line per session; deleting adds a tombstone line (append-only) |
| `settings.json` | theme, last setup, last session |

Sessions shorter than 20 seconds are not saved. Time while the computer sleeps is not counted.

## Tests

Layers, rationale and test hooks: [TESTING.md](TESTING.md).

## Roadmap

Next up:

- [ ] Keyboard shortcuts: space to pause, arrows for previous/next, `M` mirror, `G` grid
- [ ] No-repeat shuffle: don't repeat an image until the folder is exhausted, remembered across sessions
- [ ] Sound when an image's time is up
- [ ] Skip or hide a reference permanently
- [ ] Resume an interrupted session after the app closes

Practice:

- [ ] Daily and weekly goals per drawing type, shown on the heatmap and Practice page
- [ ] Always-on-top floating reference window

Data:

- [ ] Export and import all data as a single zip
- [ ] Re-link a moved folder without losing history

Platforms:

- [ ] Linux support. Electron already runs there and the app code is platform-neutral. Remaining: Linux visual baselines (`-linux`, `-linux-ci`) and a CI job under `xvfb-run`, an `install:linux` script, a check of the "Link a folder" dialog on Wayland and X11, and a Linux section in [INSTALL.md](INSTALL.md)

Performance and robustness:

- [ ] A scan that finishes late must not overwrite a newer one (after a rescan, or after re-linking a folder, the old folder's list can replace the new one)
- [ ] One slow or unreachable folder must not hold up the Library and Draw pages
- [ ] Two requests for the same folder at once (startup and a session start) share one scan instead of walking it twice
- [ ] Show very large originals at screen size in a session instead of decoding them whole (a 48-megapixel PNG costs about 190 MB)
- [ ] Performance baselines that allow for day-to-day variation between runs (`npm run perf:baseline` merging earlier runs)

Quality:

- [ ] Accessibility checks (axe-core) in the UI test layer
- [ ] README screenshot and demo GIF

Not planned: cloud sync, accounts, a mobile app.
