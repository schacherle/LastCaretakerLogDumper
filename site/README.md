# Last Caretaker Web Archive (`site/`)

A standalone, static web viewer and diff explorer for data dumps extracted from *The Last Caretaker*. The application renders game voyage logs, quest subtitles, and sample data collectibles inside a retro-futuristic CRT hardware terminal interface.

---

## Architecture Overview

The web archive is built with vanilla HTML5, CSS3, and modern JavaScript (ES6+). It requires **no build step, transpilation, or server-side runtime**.

Data is fetched dynamically at runtime directly from GitHub:
- **Git Commit History**: Queried via GitHub REST API (`https://api.github.com/repos/<owner>/<repo>/commits`).
- **Raw Historical Artifacts**: Fetched via raw GitHub content URLs (`https://raw.githubusercontent.com/<owner>/<repo>/<sha>/...`).
- **Diff Engine**: Computed client-side using `diff` (jsdiff) loaded via CDN.

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
   - Master-detail view displaying log, subtitle, or sample data lists on the left screen with real-time text filtering.
   - Rich detail pane on the right screen showing full fragment hierarchies, audio duration cues, or holographic collectible cards.
   - Version selector to travel back in time and view archive dumps at any historical commit SHA.
   - Sub-filters for Sample Data: view **All**, **Hologram** (field), or **Painting** (cave) artifacts.

2. **Compare Mode (`#panel-compare`)**:
   - Compares data dumps between any two commits ("From" vs "To").
   - Computes structural additions, removals, and word-level diffs (`diffWordsWithSpace`) for modified text content.

### Deep Linking & URL Anchor Protocol

The viewer encodes deep-link navigation directly into the URL hash fragment:
```
#mode=browse&scope=<logs|subtitles|sampledata>&version=<shortSha>&entry=<entryId>&page=<pageKey>&text=<encodedText>&unlocked=1
```
- **Entry Deep Links**: Click **COPY ENTRY LINK** or press EXE on a selected item to generate a link directly targeting that entry.
- **Text Selection Anchors**: Select any text block in the detail screen to pop up the inline link anchor button (🔗). The exact phrase will be matched, highlighted (`<mark class="linked-text-match">`), and scrolled into view on page load.

### Retro Hardware Terminal Controls

The control strip mimics physical CRT monitor controls:
- **DISPLAY Grid**: Modify CRT brightness (`brt-up` / `brt-down`), contrast (`con-up` / `con-down`), and saturation (`sat-up` / `sat-down`).
- **DISP ON / OFF**: Power toggle for CRT raster and backlight simulation, paired with an LED indicator.
- **SETTINGS Grid**:
  - `UP` / `DOWN`: Smoothly scroll active detail pane content.
  - `PREV` / `NEXT`: Navigate through filtered entries (Browse) or step through historical commits (Compare).
  - `EXE`: Focus filter search input, trigger diff calculation, or unlock sample lore.
  - `EXIT`: Clear active search filter, dismissal of selection link popups, and reset highlights.

---

## Local Development & Testing

Since the application uses `fetch()` to load static JSON files and query the GitHub API, it must be served through an HTTP server rather than opened via the `file://` protocol.

### 1. Launch a Local Web Server

From the root of the repository or the `site/` directory:

```bash
# From repository root:
python3 -m http.server 8000 --directory site

# Or using Node / npx:
npx serve site
```

### 2. Configure Repository Target Parameter

`app.js` automatically infers the target GitHub repository when deployed to `https://<owner>.github.io/<repo>/`. When running locally on `localhost` or `127.0.0.1`, pass the `repo` query parameter to specify the upstream or fork repository to read commit history and raw files from:

```
http://localhost:8000/?repo=the1killer/LastCaretakerLogDumper
```

Or for a fork:
```
http://localhost:8000/?repo=schacherle/LastCaretakerLogDumper
```

---

## Deployment Workflow

The static archive is automatically published to GitHub Pages via GitHub Actions:
- **Workflow configuration**: Located at [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).
- **Trigger**: Every push to the `main` branch modifying paths under `site/**` or the workflow itself.
- **Deployment artifact**: Contents of `./site` deployed to the `gh-pages` branch.
- **GitHub Pages Setting**: Configure GitHub Pages under **Settings → Pages → Build and deployment → Deploy from a branch** selecting branch `gh-pages` and root `/`.
