# Immersive Report Builder v0.2

Local-first, browser-based report builder for composable executive-readiness reports.

The app is frontend-only (no backend), optimized for Chromium print/PDF workflows, and supports four fixed output profiles:

- `LETTER_landscape` (default)
- `LETTER_portrait`
- `A4_landscape`
- `A4_portrait`

## Workspace Split (March 6, 2026)

This project is intentionally split into two top-level workspaces:

- Configurator parent project:
  - /Users/will.bloor/Documents/Configurator
  - use this for Configurator features and root app work
- App Builder project (this folder):
  - /Users/will.bloor/Documents/app-builder
  - use this for doc-builder work only

Why this exists:

- to stop branch/worktree cross-contamination between Configurator and doc-builder work
- to make Codex/editor threads target one project at a time

Working rule:

- open Configurator tasks in a thread rooted at /Users/will.bloor/Documents/Configurator
- open doc-builder tasks in a thread rooted at /Users/will.bloor/Documents/app-builder
- do not switch the Configurator root thread onto doc-builder branches

Safety backup:

- /Users/will.bloor/Documents/Configurator-doc-builder was kept as a recovery backup while this split was set up

## Current Status (March 5, 2026)

This README reflects the current handoff status for moving this code into a new repository.

### Implemented

- Grid system is **2x denser** than the original baseline:
  - `--grid-cols: 24`
  - `--grid-gap: 6px`
  - `--grid-row: 10px`
  - portrait overrides use smaller row/gap values
- Drag/resize/delete/fit interactions are stable:
  - drag via Moveable runtime
  - resize via custom 8-point bounding box handles
  - auto-fit clamps to remaining rows on page
  - delete supports toolbar confirm and keyboard delete
- Top bar was replaced with a contextual Figma-style control surface:
  - global actions (`undo`, `redo`, `grid`, `print`)
  - text context controls (`Title/Body`, family/size/weight, B/I/U, align, line-height, letter-spacing, case, text color)
  - surface controls for text components (`No line/Thin/Thick`, keyline color, background color, document color swatches)
- Text styling model is normalized and persisted for text design components:
  - `props.typography.{title,body}`
  - `props.surface`
  - normalization applied in factories and migration path to keep legacy projects loading
- Text rendering for `text`, `all_caps_title`, `header_3`, and `copy_block` now reads normalized typography/surface style values.
- Palette organization is split into:
  - `Page Layout Templates`
  - `On-Page Components` (grouped by category)
- Editor open behavior now defaults to text editing workflows:
  - clicking any component with `title` and/or `body` opens the component editor
  - adding a component auto-opens the component editor

### In Progress / Not Yet Complete

- True in-canvas inline text editing (contenteditable in situ) is still pending; text editing is currently inspector-driven.
- Contextual topbar styling is fully wired only for text design components (`text`, `all_caps_title`, `header_3`, `copy_block`), not every text-bearing component yet.
- Transparent fill (`no background`) and micro-label grouping in the top bar are planned next steps.

## Quick Start

1. Start a local web server from the project folder.
2. Open `http://localhost:4173/` (or `http://localhost:4173/index.html`).
3. Do **not** open with `file://` (ES module imports will fail).

Example:

```bash
cd <repo-root>
python3 -m http.server 4173
# open http://localhost:4173/
```

## Deploy (Vercel)

This project is static (no build step required). Deploy directly from this folder.

1. Import this repository into Vercel.
2. Keep the project root as this folder (`app-builder`).
3. Build Command: leave empty.
4. Output Directory: leave empty (serve root as static files).
5. Deploy.

If this project was moved to a new folder but you already had an existing Vercel project:

```bash
cd /Users/will.bloor/Documents/app-builder
npx --yes vercel link
# choose "Link to existing project"
npx --yes vercel deploy --prod
```

The included `vercel.json` rewrites both `/` and `/Index.html` to `/index.html` so casing differences do not break deploys on case-sensitive hosts.

## Architecture Overview

### Runtime Libraries

- [Moveable](https://github.com/daybrush/moveable): component dragging and target tracking
- [ECharts](https://echarts.apache.org/): chart rendering runtime

### Core Modules

- `src/main.js`: app orchestration, store wiring, interactions, import/export, print controls
- `src/render/page.js`: page/component DOM assembly, resize handle interactions, overflow checks
- `src/render/components.js`: component HTML rendering and toolbar controls
- `src/templates/catalog.js`: template/component factories, layout constraints, layout clamping
- `src/state/*`: schema defaults, migration, persistence store
- `src/print/*`: profile definitions and print CSS injection

## Current Interaction Model

### Selection

- Clicking a component selects it.
- Selected components show a floating toolbar and visible bounding box handles.

### Drag

- Dragging component body moves the component with grid snapping.
- Drag commits to layout values on interaction end.

### Resize

- Resize is done via custom bounding handles (`n/ne/e/se/s/sw/w/nw`).
- Resize snaps to the same grid metrics as drag.
- Locked components are protected from destructive actions.

### Auto-fit (`Fit`)

- Uses natural content measurement.
- Converts measured height to row span.
- Clamps by component constraints and remaining rows on page.

### Delete

- Toolbar delete is two-step (`Del` then `Confirm`).
- Keyboard `Delete`/`Backspace` deletes selected component directly.
- Keyboard delete is ignored while typing in form fields/contenteditable.

## Data, Import/Export, Persistence

- Project JSON export/import includes:
  - `project`, `footer`, `theme`, `datasets`, `assets`, `pages`
- CSV/JSON dataset import is supported.
- Image assets are stored as data URLs.
- Local persistence key:
  - `doc-builder.state.v0_2`
- Schema version:
  - `0.2`
- Runtime metadata may include:
  - `project.gridDensity` (used to keep old projects aligned to the denser grid)

## Repository Layout

```text
<repo-root>
├── index.html
├── README.md
├── src
│   ├── main.js
│   ├── assets
│   ├── data
│   ├── import
│   ├── print
│   ├── render
│   ├── state
│   ├── templates
│   └── utils
└── styles
    ├── builder.css
    ├── print.css
    └── tokens.css
```

## Smoke Test Checklist

1. Load app over HTTP (`python3 -m http.server 4173`).
2. Select a component and verify toolbar appears.
3. Select a text component (`text`, `all_caps_title`, `header_3`, `copy_block`) and verify contextual topbar controls appear.
4. Change typography and surface controls from topbar; verify live preview and persisted values after reload.
5. Drag component and confirm grid-snap movement.
6. Resize via bounding handles and confirm layout updates.
7. Click `Fit` repeatedly and verify component does not force page growth.
8. Click `Del` then `Confirm` and verify deletion.
9. Select a component and press `Delete` key to verify keyboard deletion.
10. Export JSON, reset sample pack, import JSON, verify round-trip.
11. Print all 4 profiles and verify fixed page size + footer pagination.

## Known Limitations / Notes

1. Large embedded image assets can exhaust localStorage quickly.
2. Runtime is local-only; there is no server-side PDF stabilization.
3. Some legacy compatibility logic remains in `src/main.js` for older seeded layout variants.
4. In-canvas inline text editing is not implemented yet (editing still flows through component editor forms).
5. Transparent fill mode (`no background`) is not implemented yet in the surface model/UI.

## Version Snapshot

- UI title: `Immersive Report Builder v0.2`
- App version constant: `0.2` (`src/utils/helpers.js`)
- Current cache-busting suffixes in `index.html`:
  - `styles/tokens.css?v=20260305a`
  - `styles/builder.css?v=20260305p`
  - `styles/print.css?v=20260305h`
  - `src/main.js?v=20260305u`
