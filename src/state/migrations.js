import {
  ensureUiState,
  hasV1Shape,
  isV2Project,
  makeDefaultFooter,
  makeEmptyState,
  touchUpdatedAt,
} from "./schema.js";
import { createInitialPages, defaultPageKind, enforcePageContracts, makeComponent } from "../templates/catalog.js";
import { normalizeTypographyProps } from "../utils/typography.js";

function normalizeTextTypography(pages) {
  return (pages || []).map((page) => {
    if (!page || typeof page !== "object") return page;
    const out = { ...page };
    out.components = Array.isArray(page.components)
      ? page.components.map((component) => {
          if (!component || typeof component !== "object") return component;
          const next = { ...component };
          next.props = normalizeTypographyProps(next.type, next.props || {});
          return next;
        })
      : [];
    return enforcePageContracts(out, { syncTitle: true });
  });
}

function legacyBlockToComponent(block) {
  const layout = block.layout || {};
  return makeComponent({
    type: block.type || "text",
    title: block.title || "",
    body: block.body || "",
    status: block.status || "",
    props: block.data || {},
    dataBindings: [],
    slotId: null,
    layoutConstraints: { locked: false },
    layouts: {
      LETTER_landscape: {
        colStart: Number(layout.colStart) || 1,
        colSpan: Number(layout.colSpan) || 4,
        rowStart: Number(layout.rowStart) || 1,
        rowSpan: Number(layout.rowSpan) || 6,
      },
      LETTER_portrait: {
        colStart: Number(layout.colStart) || 1,
        colSpan: Number(layout.colSpan) || 12,
        rowStart: Number(layout.rowStart) || 1,
        rowSpan: Number(layout.rowSpan) || 6,
      },
      A4_landscape: {
        colStart: Number(layout.colStart) || 1,
        colSpan: Number(layout.colSpan) || 4,
        rowStart: Number(layout.rowStart) || 1,
        rowSpan: Number(layout.rowSpan) || 6,
      },
      A4_portrait: {
        colStart: Number(layout.colStart) || 1,
        colSpan: Number(layout.colSpan) || 12,
        rowStart: Number(layout.rowStart) || 1,
        rowSpan: Number(layout.rowSpan) || 6,
      },
    },
  });
}

function migrateV1ToV2(v1State) {
  const base = makeEmptyState();
  base.project.name = v1State.reportTitle || base.project.name;
  base.footer = makeDefaultFooter(base.project);
  base.pages = (v1State.pages || []).map((page) => ({
    id: page.id,
    templateId: "legacy_import",
    pageKind: defaultPageKind("legacy_import"),
    theme: "light_data",
    title: page.title || "Imported Page",
    subtitle: page.subtitle || "",
    sectionId: "Imported",
    showGrid: Boolean(page.showGrid),
    layoutMode: "free",
    components: (page.blocks || []).map(legacyBlockToComponent),
  }));
  if (base.pages.length === 0) {
    base.pages = createInitialPages();
  }
  base.ui.selectedPageId = v1State.selected?.pageId || null;
  base.ui.selectedComponentId = v1State.selected?.blockId || null;
  base.ui.activePageId = base.ui.selectedPageId || base.pages[0]?.id || null;
  base.ui.showGridAll = Boolean(v1State.showGridAll);
  base.pages = normalizeTextTypography(base.pages);
  touchUpdatedAt(base);
  return base;
}

function normalizeV2(candidate) {
  const base = makeEmptyState();
  const merged = {
    ...base,
    ...candidate,
    project: {
      ...base.project,
      ...(candidate.project || {}),
      marginsMm: {
        ...base.project.marginsMm,
        ...(candidate.project?.marginsMm || {}),
      },
    },
    footer: {
      ...base.footer,
      ...(candidate.footer || {}),
    },
    theme: {
      ...base.theme,
      ...(candidate.theme || {}),
    },
    datasets: Array.isArray(candidate.datasets) ? candidate.datasets : [],
    assets: Array.isArray(candidate.assets) ? candidate.assets : [],
    pages: normalizeTextTypography(Array.isArray(candidate.pages) ? candidate.pages : []),
  };
  ensureUiState(merged);
  if (merged.pages.length === 0) {
    merged.pages = createInitialPages();
  }
  merged.schemaVersion = "0.2";
  touchUpdatedAt(merged);
  return merged;
}

export function migrateAnyProject(raw) {
  if (!raw || typeof raw !== "object") {
    const state = makeEmptyState();
    state.pages = createInitialPages();
    return state;
  }

  if (isV2Project(raw)) {
    return normalizeV2(raw);
  }

  if (hasV1Shape(raw)) {
    return migrateV1ToV2(raw);
  }

  const fallback = makeEmptyState();
  fallback.pages = createInitialPages();
  return fallback;
}
