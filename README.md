# Immersive LinkedIn Builder

Local-first browser app for building LinkedIn static posts and PDF carousel documents from a compact dashboard of recents, templates, and saved posts.

The default experience at `/` is now the LinkedIn-first builder. The older report-builder experience is preserved at `/legacy.html` for reference and recovery.

## Current Product Shape

### Default app

- URL: `/` or `/index.html`
- Purpose: land on a LinkedIn-only dashboard first, use compact top-right creation actions, then enter the editor only when creating or opening a document
- Default output format: square `1080 × 1080` (`1:1`)
- Alternate output format: LinkedIn portrait `1080 × 1350` (`4:5`)
- Output modes:
  - `Static Post`
  - `Carousel`
- Archetypes:
  - `People Spotlight`
  - `Case Study`
  - `Insight POV`
  - `Event Recap`
  - `Product Update`
  - `Social Proof`

### Legacy app

- URL: `/legacy.html`
- Purpose: archived report-builder shell and codepath
- Status: preserved, not the primary product direction

## What Changed On April 1, 2026

- `index.html` now boots a dedicated LinkedIn dashboard instead of dropping straight into the editor.
- `legacy.html` preserves the previous report-builder entrypoint.
- The new builder focuses on:
  - a dashboard-first surface with:
    - compact top-right `New post` and `New carousel` actions
    - `Recent drafts`
    - `Start from template`
    - `Saved posts`
    - a clickable Immersive brand block that returns to the dashboard
  - a local document registry instead of a single active draft
  - per-document auto-save, stored metadata, and cover thumbnails
  - square-first posts with project-wide switching between `1:1` and `4:5`
  - static posts exported as PNG
  - multi-page LinkedIn carousel documents exported as PDF
  - structured content slots:
    - `eyebrow`
    - `headline`
    - `supporting_copy`
    - `proof_stat`
    - `cta`
    - `author_or_source`
  - a persistent right-hand rail for page thumbnails and selected-item controls
  - a compact element manager grouped into `Background`, `Foreground`, `Text`, and `CTA`
  - unlocked-by-default layout editing for dragging and resizing on-canvas
  - add, duplicate, delete, and reorder element controls without leaving the editor
  - uploaded graphics that can be reused as a local image library
  - locally saved post snapshots for remixing and reuse
  - a reference-linked resource library for Figma links, reference posts, and uploaded inspiration
  - a Figma-driven `Media Coverage Portrait` design family with reusable launch variants:
    - `Speaker`
    - `Speaker Alt`
    - `Speaker Minimal`
    - `Author`
  - locked decorative background art plus editable headline, deck/byline, speaker image, name, and role slots for the media coverage family

## Current Capabilities

- Dashboard-first creation flow:
  1. land on the dashboard
  2. use `New post`, `New carousel`, open a recent draft, open a saved post, or start from a template
  3. enter the editor only after a document choice is made
  4. use the editor for output mode, aspect ratio, backgrounds, templates, text styles, CTAs, images, and detailed element editing
- Document model:
  - `Recent drafts` are auto-saved local documents sorted by `updatedAt`
  - `Saved posts` are explicit library entries backed by the same document registry
  - `Save to library` marks the active document as saved rather than creating a disconnected copy
  - the app stores one state payload per document plus a local index of metadata
- Frame management:
  - add, duplicate, delete, and reorder carousel pages
  - enforce a single frame in static mode
- Editing:
  - inline text editing on-canvas
  - right-rail typography controls for selected text and button items
  - drag and corner-resize with layout unlocked by default
  - click-to-deselect page mode and `Escape` to return to page controls
  - `Delete` / `Backspace` removes the selected element
  - undo / redo via buttons or `Cmd/Ctrl+Z`
  - grouped import / export / reset actions under a single `File` menu
  - add `Text`, `Image`, `Shape`, and `Button` elements from the right rail
- Local libraries:
  - recent draft thumbnails
  - saved post library for remixing prior work
  - background presets
  - uploaded image library
- Media Coverage family:
  - dashboard template cards for the four portrait media coverage variants
  - portrait-first boot at `1080 × 1350`
  - variant switching that preserves compatible user content and swapped speaker imagery
  - family-specific controls for `Variant`, `Background`, and `Text layout`
  - Figma-exported decorative asset layers that are locked in the editor but persisted locally after hydration
- Resource library:
  - save `figma_link`, `reference_post`, or `upload` references
  - assign tags, notes, preview images, and archetypes
  - attach resources to frames for working context in advanced mode
- Portability:
  - local persistence
  - import / export JSON drafts

## Quick Start

1. Start a local web server from this folder.
2. Open `http://localhost:4173/`.
3. Do not open with `file://`.

Example:

```bash
cd /Users/will.bloor/Documents/app-builder
python3 -m http.server 4173
```

Legacy builder:

```text
http://localhost:4173/legacy.html
```

## Export Rules

- Static mode:
  - export filename ends in `.png`
  - captures the active frame at the current project ratio
- Carousel mode:
  - export filename ends in `.pdf`
  - exports all frames in current order
  - every page uses the current project ratio and the same dimensions
- JSON:
  - exports the full local draft state for round-tripping

## Repository Layout

- `index.html`
  - LinkedIn builder shell
- `legacy.html`
  - archived report-builder shell
- `src/linkedin/*`
  - LinkedIn schema, templates, state, export flow, and app runtime
- `src/core/persisted-history-store.js`
  - reusable local persistence + undo/redo store
- `src/main.js`
  - legacy report-builder runtime

## Deploy (Vercel)

This is still a static site with no build step.

1. Import the repository into Vercel.
2. Keep the project root as this folder.
3. Leave Build Command empty.
4. Leave Output Directory empty.

`vercel.json` rewrites:

- `/` -> `/index.html`
- `/legacy` -> `/legacy.html`
- casing-safe variants for both

## Coordination Rule

When a change affects default boot behavior, reset flows, or the main product direction, update both:

- `/Users/will.bloor/Documents/app-builder/README.md`
- `/Users/will.bloor/Documents/app-builder/WORKSTREAMS.md`
