# WORKSTREAMS (Command and Control)

This is the source of truth for chats working in `/Users/will.bloor/Documents/app-builder`.

- Last updated (UTC): `2026-04-01T18:02:11Z`
- Control owner: `WS-00`
- Production URL: `https://immersive-report-builder.vercel.app/`
- Release command: `bash /Users/will.bloor/Documents/app-builder/scripts/go-release.sh`

## Current Product Direction

- Default app at `/`: Immersive LinkedIn Builder
- Default surface intent: front-door LinkedIn dashboard first, with compact top-right create actions and brand-home navigation, then a square-first LinkedIn editor with a global left rail, inline-first canvas editing, and a persistent right rail split between item/page controls, elements, and pages, with portrait-first Figma-driven media coverage variants available as template starts
- Archived app at `/legacy.html`: report builder shell
- Repo rule: do not modify `/Users/will.bloor/Documents/Configurator` from this repo thread

## Non-Negotiable Rules

1. Read `README.md` and this file before making code changes.
2. Claim a workstream row before editing.
3. Add explicit file locks for repo-tracked files you edit.
4. Do not edit files locked by another active workstream.
5. Update both `README.md` and `WORKSTREAMS.md` in the same pass when changing default boot behavior or core product flow.
6. Only `WS-00` runs release flow.
7. `WORKSTREAMS.md` is never hard-locked; use it for coordination and handoff only.

## Current Deploy Readiness

- Freeze: `OFF`
- Ready for merge: `NO`
- Ready for release: `NO`
- Last known good commit: `74bfbb4`

## Active Workstreams

| ID | Owner / Chat | Branch | Status | Goal | Locked Files | Depends On | Updated (UTC) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WS-00 | Command and control | `main` | `in_progress` | Coordinate release readiness and merge order | `README.md`, `WORKSTREAMS.md`, `scripts/go-release.sh` | none | `2026-04-01T16:35:00Z` |
| WS-03 | Codex (this chat) | `main` | `in_progress` | Add a Figma-driven Media Coverage portrait family plus LinkedIn builder performance hardening, targeted render/persist instrumentation, dashboard chrome tightening, and thumbnail/dashboard optimization | `index.html`, `styles/linkedin-builder.css`, `src/assets/asset-manager.js`, `src/linkedin/constants.js`, `src/linkedin/export.js`, `src/linkedin/main.js`, `src/linkedin/schema.js`, `src/linkedin/templates.js`, `README.md`, `WORKSTREAMS.md` | none | `2026-04-01T18:02:11Z` |

## Merge Queue

1. _none queued_

## Decisions Log

- `2026-04-01`: `/` now targets a LinkedIn-first builder instead of the report-builder shell.
- `2026-04-01`: legacy report-builder access is preserved at `/legacy.html`.
- `2026-04-01`: export target is project-wide and ratio-aware, with `1:1` square as the default and `4:5` portrait as the secondary preset.
- `2026-04-01`: Figma is reference-linked in v1 through stored URLs, tags, notes, and preview assets rather than live sync.
- `2026-04-01`: the default LinkedIn surface is dashboard-first and library-led, with a persistent right rail for page and selected-item controls.
- `2026-04-01`: layout now defaults to unlocked, page thumbnails live in the persistent right rail, and text editing is inline-first with typography controls in the inspector.
- `2026-04-01`: the right rail now includes a grouped element manager for `Background`, `Foreground`, `Text`, and `CTA`, with add/duplicate/delete/reorder/layer controls.
- `2026-04-01`: the app now always lands on a front-door dashboard with compact top-right `New post` and `New carousel` actions, `Recent drafts`, `Start from template`, and conditional `Saved posts`, backed by a local document registry and per-document thumbnails.
- `2026-04-01`: the Immersive brand block in the top bar doubles as a home action that returns the user to the dashboard from the editor.
- `2026-04-01`: the LinkedIn builder now includes a portrait-only `Media Coverage Portrait` family derived from four shared Figma references, with family variants, locked decorative background art, portrait speaker cutouts, and editable headline/deck/byline/identity slots.
- `2026-04-01`: Media Coverage variants hydrate Figma-exported template assets into the local asset library, preserve user text and swapped speaker imagery across variant changes, and expose family-specific `Variant`, `Background`, and `Text layout` controls in the left rail.

## Handoffs

Use this format:

`YYYY-MM-DDTHH:MM:SSZ | WS-XX | owner | summary | files touched | next action`

Current entries:

- `2026-04-01T09:43:46Z | WS-03 | codex | implemented LinkedIn-first builder shell, schema, templates, persistence, exports, archived legacy entrypoint, and doc/routing updates | index.html, legacy.html, vercel.json, styles/linkedin-builder.css, src/core/persisted-history-store.js, src/linkedin/*, README.md, WORKSTREAMS.md | smoke-test boot, JSON round-trip, image import, PNG export, PDF export, and legacy entrypoint`
- `2026-04-01T10:17:58Z | WS-03 | codex | simplified the default LinkedIn flow around a dashboard of templates, backgrounds, uploaded images, and saved posts, while keeping the advanced editor behind an explicit toggle | index.html, styles/linkedin-builder.css, src/linkedin/constants.js, src/linkedin/schema.js, src/linkedin/main.js, README.md, WORKSTREAMS.md | smoke-test boot, dashboard interactions, saved-post library load/save, image upload/apply, PNG export, PDF export, and legacy entrypoint`
- `2026-04-01T11:16:00Z | WS-03 | codex | cleaned up the LinkedIn editor around inline-first text editing, default unlocked layout, a single File menu, keyboard undo/redo, right-rail page thumbnails, and tighter text bounding boxes | index.html, styles/linkedin-builder.css, src/linkedin/constants.js, src/linkedin/schema.js, src/linkedin/templates.js, src/linkedin/main.js, README.md, WORKSTREAMS.md | smoke-test inline edit, Cmd/Ctrl+Z, File menu actions, right-rail page management, and text auto-fit on style/content changes`
- `2026-04-01T13:05:00Z | WS-03 | codex | stabilized the LinkedIn editor around square-first aspect ratios, ratio-aware exports, a grouped element manager, consistent selection/deselect behavior, per-element image media, and Configurator-aligned chrome tokens | index.html, styles/linkedin-builder.css, src/linkedin/constants.js, src/linkedin/schema.js, src/linkedin/templates.js, src/linkedin/export.js, src/linkedin/main.js, README.md, WORKSTREAMS.md | smoke-test ratio switching, add/delete/duplicate/reorder elements, inline text editing, Delete/Escape/undo shortcuts, PNG export, and PDF export`
- `2026-04-01T15:10:00Z | WS-03 | codex | moved the LinkedIn app to a true front-door dashboard with recent drafts, saved posts, template starts, a local document registry, migration from legacy single-draft storage, and per-document thumbnail persistence while keeping the current editor as the edit surface | index.html, styles/linkedin-builder.css, src/core/persisted-history-store.js, src/linkedin/constants.js, src/linkedin/documents.js, src/linkedin/main.js, src/linkedin/store.js, README.md, WORKSTREAMS.md | smoke-test dashboard boot, legacy-draft migration, template start flow, recent/saved document actions, autosave ordering, and thumbnail refresh on return to dashboard`
- `2026-04-01T16:35:00Z | WS-03 | codex | implemented the Figma-driven Media Coverage portrait family as four reusable dashboard-start variants with locked decorative background layers, portrait speaker cutouts, variant/background/text-layout controls, portrait-first template boot, template-asset hydration, and live dashboard template previews | styles/linkedin-builder.css, src/assets/asset-manager.js, src/linkedin/constants.js, src/linkedin/schema.js, src/linkedin/templates.js, src/linkedin/main.js, README.md, WORKSTREAMS.md | smoke-test dashboard template cards, media coverage variant switching, background-only switching, text layout switching, speaker image replacement, portrait export, and JSON round-trip`
- `2026-04-01T14:42:18Z | WS-03 | codex | added opt-in LinkedIn perf instrumentation, skipped document persistence for pure ui actions, moved thumbnail refresh to explicit lifecycle events, removed render-loop template hydration, cached dashboard previews, and instrumented export capture timings | index.html, src/linkedin/export.js, src/linkedin/main.js, WORKSTREAMS.md | smoke-test dashboard boot, selection/search interactions without thumbnail churn, open/save/import thumbnail refresh, template asset hydration, and PNG/PDF export`
- `2026-04-01T14:49:26Z | WS-03 | codex | finished wiring the LinkedIn perf pass with explicit persist/thumbnail policies, targeted render invalidation, export capture instrumentation, dashboard preview reuse, and cache-bust updates for the front-door module graph | index.html, src/linkedin/export.js, src/linkedin/main.js, WORKSTREAMS.md | browser-verify perf mode samples, dashboard return thumbnail refresh, template asset hydration idempotence, and PNG/PDF export parity`
- `2026-04-01T15:07:47Z | WS-03 | codex | fixed export chrome leakage so suppress-selection renders no longer capture passive element overlays over media coverage text and speaker cutouts in output assets | src/linkedin/main.js, WORKSTREAMS.md | browser-verify Media Coverage PNG/PDF exports against editor canvas with Dan Potter variant`
- `2026-04-01T16:04:47Z | WS-03 | codex | compacted the dashboard chrome by replacing oversized create cards with top-right new-document actions, wiring the Immersive brand block back to the dashboard, and trimming dashboard spacing/cards for a denser front door | index.html, styles/linkedin-builder.css, src/linkedin/main.js, README.md, WORKSTREAMS.md | browser-verify dashboard home navigation, top-right new post/new carousel actions, and the compact dashboard layout after refresh`
- `2026-04-01T18:02:11Z | WS-03 | codex | fixed media-coverage record hydration so legacy speaker media no longer binds onto locked background art, made aspect-ratio changes rebuild that family against template geometry, and restored full-frame image selection with larger resize handles | index.html, styles/linkedin-builder.css, src/linkedin/main.js, src/linkedin/schema.js, src/linkedin/store.js, WORKSTREAMS.md | browser-verify open-draft speaker rendering, square/portrait switching, image selection bounds, and resize handle usability after refresh`
