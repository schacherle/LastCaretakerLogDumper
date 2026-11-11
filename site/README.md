# Last Caretaker Web Archive (`site/`)

A standalone, static web viewer and diff explorer for data dumps extracted from *The Last Caretaker*. The application renders game voyage logs, chronological timeline events, quest subtitles, and sample data collectibles inside a retro-futuristic CRT hardware terminal interface.

---

## Architecture Overview

The web archive is built with vanilla HTML5, CSS3, and native browser ES modules (`<script type="module">`). It requires **no build step, bundler, transpilation, or server-side runtime**.

```
site/
├── index.html               # Accessible CRT terminal shell, CSP/SRI headers
├── styles.css               # Retro phosphor theme, focus-visible & WCAG AA tokens
├── app.js                   # Top-level coordinator and application bootstrap
├── js/
│   ├── core/                # formatters.js, clipboard.js
│   ├── api/                 # github.js (repo detection, encoding, GitHub & local fetch)
│   ├── domain/              # logs.js, timeline.js, subtitles.js, sampledata.js, diff.js
│   ├── state/               # store.js, router.js (hash routing & history state)
│   └── ui/                  # browse.js, compare.js, device.js
└── tests/                   # Node.js built-in test runner unit tests
```

Data is fetched dynamically at runtime from GitHub (or the local working copy during development):
- **Git Commit History**: Queried via GitHub REST API (`https://api.github.com/repos/<owner>/<repo>/commits`).
- **Raw Historical Artifacts**: Fetched via raw GitHub content URLs (`https://raw.githubusercontent.com/<owner>/<repo>/<sha>/...`) or from `/<path>` when `"Working Copy (Local Dumps)"` (`local`) is selected.
- **Diff Engine**: Computed client-side using `diff` (jsdiff) loaded via CDN with Subresource Integrity (SRI).

### Target Files Tracked Across Commits

| Scope | Path in Repository | Description |
|---|---|---|
| **Voyage Logs** | `voyage_logs_dump.json` | Log titles, parent descriptions, footers, and individual log fragments. |
| **Quest Subtitles** | `voyage_quest_subtitles_dump.json` | Subtitle dialog dumps grouped into multi-part quest sequences. |
| **Sample Data Text** | `voyage_sampledata_text_dump.json` | Collectible hologram titles, uncollected descriptions, and sent descriptions. |
| **Sample Data Local Cache** | `site/sampledata/data.json` | Curated sample codes, site locations, short summaries, and lore unlock entries. |
| **Sample Thumbnails** | `sampledata_images/` | Render target PNG image exports of holographic collectibles. |

---

## Features & User Interface

### Dual Display Modes

1. **Browse Mode (`#panel-browse`)**:
   - Master-detail view displaying **Voyage Logs**, **Timeline** (chronologically extracted dated log fragments), **Quest Subtitles**, or **Sample Data** lists on the left screen with real-time text filtering.
   - Rich detail pane on the right screen showing full fragment hierarchies, audio duration cues, or holographic collectible cards.
   - Version selector to travel back in time across commit SHAs (plus `Working Copy (Local Dumps)` when running locally).
   - Sub-filters for Sample Data: view **All**, **Hologram** (field), or **Painting** (cave) artifacts.

2. **Compare Mode (`#panel-compare`)**:
   - Compares data dumps between any two commits ("From" vs "To") or against the local working copy.
   - Computes structural additions, removals, and word-level diffs (`diffWords`) for modified text content.

### Deep Linking & URL Anchor Protocol

Both Browse and Compare views synchronize with the URL hash fragment and browser history (`pushState` / `popstate`):
```
#mode=browse&scope=<logs|timeline|subtitles|sampledata>&version=<shortSha|local>&entry=<entryId>&page=<pageKey>&text=<encodedText>&unlocked=1
#mode=compare&scope=<logs|subtitles|sampledata>&from=<shortSha|local>&to=<shortSha|local>
```
- **Entry / Compare Deep Links**: Click **COPY ENTRY LINK** or **COPY COMPARE LINK** to copy a permalink to the current view.
- **Text Selection Anchors**: Select any text block in the Browse detail screen to pop up the inline link anchor button (🔗). The exact phrase will be matched, highlighted (`<mark class="link-mark">`), and scrolled into view on page load.

### Retro Hardware Terminal Controls

The control strip mimics physical CRT monitor controls:
- **DISPLAY Grid**: Modify CRT brightness (`brt-up` / `brt-down`), contrast (`con-up` / `con-down`), and saturation (`sat-up` / `sat-down`).
- **DISP ON / OFF**: Power toggle for CRT raster and backlight simulation, paired with an LED indicator.
- **SETTINGS Grid**:
  - `UP` / `DOWN`: Smoothly scroll active detail pane content.
  - `PREV` / `NEXT`: Navigate through filtered entries (Browse) or step through historical commits (Compare).
  - `EXE`: Focus filter search input, trigger diff calculation, or unlock sample lore.
  - `EXIT`: Clear active search filter, dismiss selection link popups, and reset highlights.

---

## Local Development & Testing

### 1. Launch the Local Web Viewer

From the repository root, run the helper script:

```bash
./start.sh
```

This starts a local HTTP server at the repository root and opens `http://localhost:8000/site/`, automatically making `"Working Copy (Local Dumps)"` available alongside GitHub commit history.

You can also target another public GitHub repository with `?repo=owner/repo`:

```
http://localhost:8000/site/?repo=the1killer/LastCaretakerLogDumper
```

### 2. Run Unit Tests

Requires Node.js (uses the built-in `node --test` runner with zero external dependencies):

```bash
node --test site/tests/*.test.mjs
```

---

## Deployment Workflow

The static archive is automatically published to GitHub Pages via GitHub Actions:
- **Workflow configuration**: Located at [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).
- **Trigger**: Every push to the `main` branch modifying paths under `site/**` or the workflow itself.
- **Deployment artifact**: Contents of `./site` deployed to the `gh-pages` branch.
