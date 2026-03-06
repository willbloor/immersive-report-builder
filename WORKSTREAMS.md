# WORKSTREAMS (Command and Control)

This is the source of truth for all parallel chats working in `/Users/will.bloor/Documents/app-builder`.

- Last updated (UTC): `2026-03-06T09:00:00Z`
- Control owner: `WS-00`
- Production URL: `https://immersive-report-builder.vercel.app/`
- Release command: `bash /Users/will.bloor/Documents/app-builder/scripts/go-release.sh`

## Non-Negotiable Rules (All Chats)

1. Read this file and `README.md` before making any code changes.
2. Claim a workstream row in `Active Workstreams` before editing files.
3. Add explicit file locks in your row before editing (`Locked Files` column).
4. Do not edit files locked by another active workstream.
5. Update your row whenever status/scope/locks change.
6. At handoff or completion, clear locks and add a note in `Handoffs`.
7. Do not run production deploy from feature workstreams.
8. Only `WS-00` can run release flow (`Go`/`go-release.sh`).
9. No workstream may modify `/Users/will.bloor/Documents/Configurator` from this repo thread.
10. Treat known parallel local changes as normal; only escalate when there is a file-lock collision or release-gate risk.
11. `WORKSTREAMS.md` is a shared coordination file and must never be hard-locked; all active chats may update it for claim/status/handoff.
12. Non-WS-00 chats may edit only their own row and add handoff entries; only WS-00 edits release readiness, merge queue, and decisions log.

## Clear Plan of Action

1. Intake and deconflict:
   - New chat claims a workstream ID and file locks before editing.
   - Control owner resolves lock conflicts and updates merge order.
2. Build in parallel:
   - Each stream uses a narrow scope and minimal file surface.
   - Streams keep status current: `planned`, `in_progress`, `blocked`, `ready_for_merge`, `merged`, `closed`.
3. Integrate safely:
   - Merge queue is followed top-to-bottom.
   - After each merge, update `Decisions Log` and `Current Deploy Readiness`.
4. Release with gatekeeping:
   - Control owner verifies no active conflicting streams.
   - Run `bash scripts/go-release.sh --dry-run`.
   - If dry-run passes and queue is clear, execute release (`Go` or script without `--dry-run`).
5. Stabilize:
   - Validate `/` and `/Index.html` in production.
   - Capture release outcome and commit SHA in `Decisions Log`.

## Current Deploy Readiness

- Freeze: `OFF`
- Ready for merge: `NO` (set `YES` only when merge queue is empty)
- Ready for release: `NO` (set `YES` only after dry-run passes)
- Last known good commit: `a402c66`

## Active Workstreams

| ID | Owner / Chat | Branch | Status | Goal | Locked Files | Depends On | Updated (UTC) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WS-00 | Command and control | `main` | `in_progress` | Coordinate streams, merge queue, and controlled release | `README.md`, `scripts/go-release.sh` | none | `2026-03-06T09:45:00Z` |
| WS-01 | Parallel chat A | `main` | `in_progress` | Ongoing feature/edit stream | `src/main.js` | none | `2026-03-06T09:40:00Z` |
| WS-02 | Parallel chat B | `main` | `in_progress` | Ongoing styling stream | `styles/builder.css` | none | `2026-03-06T09:40:00Z` |
| WS-03 | Codex (this chat) | `main` | `in_progress` | UX/editor stream: Kanban page reorder, toolbar/icon actions, inspector compaction (with persistent accordion state), purge reset, cover headline anti-crop + offset, and continuous doc-sync | `src/main.js`, `src/render/components.js`, `src/render/page.js`, `src/templates/catalog.js`, `styles/builder.css`, `index.html`, `README.md` | none | `2026-03-06T16:03:09Z` |

## Merge Queue (Top = next)

1. _none queued_

## Decisions Log

- `2026-03-06`: app-builder is a separate git repo from Configurator.
- `2026-03-06`: production deploy path is git push to `main` + Vercel integration.
- `2026-03-06`: release gate is `scripts/go-release.sh` with strict preflight checks.

## Handoffs

Use this format:

`YYYY-MM-DDTHH:MM:SSZ | WS-XX | owner | summary | files touched | next action`

Current entries:

- `2026-03-06T09:00:00Z | WS-00 | command | initialized command-and-control board | WORKSTREAMS.md, README.md | require all chats to adopt protocol`
- `2026-03-06T12:20:54Z | WS-03 | codex | brand-aligned chart theme defaults (palette/typography/radii) and removed runtime hard-coded chart style drift | src/render/chart-theme.js, src/render/chart-runtime.js, WORKSTREAMS.md | visual QA on chart variants in Pages/Templates defaults`
- `2026-03-06T15:14:12Z | WS-03 | codex | fixed style-profile resolution bug (variant-aware), normalized scatter/histogram/waterfall/treemap/heatmap/funnel + legacy unified variants to tokenized theme contract, and documented canonical Figma nodes in theme runtime | src/render/chart-runtime.js, src/render/chart-theme.js, src/data/chart-registry.js, WORKSTREAMS.md | run manual visual QA against Figma refs for bar/line/donut/combo/radar and verify remaining advanced variants`
- `2026-03-06T15:52:42Z | WS-03 | codex | implemented UX/editor pass (page reorder interactions, iconized toolbar actions, inspector compaction, purge-to-defaults, cover headline anti-crop + movable offset) and refreshed project documentation | src/main.js, src/render/components.js, src/render/page.js, src/templates/catalog.js, styles/builder.css, index.html, README.md, WORKSTREAMS.md | continue enforcing doc-sync updates in parallel with feature edits`
- `2026-03-06T16:03:09Z | WS-03 | codex | fixed inspector accordion collapse bug by persisting section open/closed state across live re-renders; updated docs/workstream tracking | src/main.js, README.md, WORKSTREAMS.md | validate in UI that changing controls no longer auto-collapses sections`
