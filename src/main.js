import { importAssetFile } from "./assets/asset-manager.js";
import { bindingPresetForType, buildBinding, buildChartBindingDraft } from "./data/bindings.js";
import {
  CHART_FAMILY_OPTIONS,
  chartVariantById,
  chartVariantCardHtml,
  chartVariantsForFamily,
} from "./data/chart-registry.js";
import {
  arrayControlSpecFor,
  createArrayItemForPath,
  groupLabelForPath,
  isControlPathVisible,
  propLabel,
} from "./data/prop-controls.js";
import { parseCsvText } from "./import/csv.js";
import { parseDatasetJson } from "./import/json-dataset.js";
import { buildProjectBundle, hydrateBundle } from "./import/project-json.js";
import { printProject, applyRuntimeProfile, normalizeMargins, updatePrintCss } from "./print/engine.js";
import { PRINT_PROFILES } from "./print/profiles.js";
import { mountRuntimeCharts } from "./render/chart-runtime.js";
import { renderPageNode, collectOverflowWarnings, setDragData, DND_MIME } from "./render/page.js";
import { createStore, loadPersistedState } from "./state/store.js";
import { makeEmptyState, STORAGE_KEY_V1, STORAGE_KEY_V2 } from "./state/schema.js";
import {
  BINDABLE_TYPES,
  COMPONENT_LIBRARY,
  PAGE_THEMES,
  PAGE_KINDS,
  TEMPLATE_LIBRARY,
  buildComponentFromType,
  clonePage,
  createMissingInitialPages,
  createInitialPages,
  createPageFromTemplate,
  enforcePageContracts,
  ensureComponentDefaultState,
  getComponentLayout,
  isContentPageKind,
  makeCustomPage,
  resetComponentToDefaults,
  setComponentLayout,
} from "./templates/catalog.js";
import { reportCatalogIntegrity } from "./templates/catalog-validation.js";
import {
  csvToPairs,
  debounce,
  deepClone,
  downloadText,
  escapeHtml,
  getByPath,
  kebabToTitle,
  safeJsonParse,
  setByPath,
  toNumber,
} from "./utils/helpers.js";
import { initPerf, startPerfTimer } from "./utils/perf.js";
import { normalizeTypographySurfaceProps } from "./utils/typography.js";

const store = createStore(loadPersistedState());

const refs = {
  app: document.getElementById("app"),
  canvasPanel: document.querySelector(".panel.canvas"),
  palette: document.getElementById("palette"),
  paletteTitle: document.getElementById("paletteTitle"),
  paletteDescription: document.getElementById("paletteDescription"),
  workbenchRail: document.getElementById("workbenchRail"),
  pages: document.getElementById("pages"),
  selectCanvasZoom: document.getElementById("selectCanvasZoom"),
  btnCanvasZoomOut: document.getElementById("btnCanvasZoomOut"),
  btnCanvasZoomFit: document.getElementById("btnCanvasZoomFit"),
  btnCanvasZoomIn: document.getElementById("btnCanvasZoomIn"),
  inspectorPanel: document.querySelector(".panel.inspector"),
  inspector: document.getElementById("inspector"),
  inspectorTabs: document.getElementById("inspectorTabs"),
  thumbnails: document.getElementById("thumbnails"),
  toast: document.getElementById("toast"),
  autoFitOverlay: document.getElementById("autoFitOverlay"),
  autoFitPhase: document.getElementById("autoFitPhase"),
  autoFitProfile: document.getElementById("autoFitProfile"),
  title: document.getElementById("projectTitle"),
  subtitle: document.getElementById("projectSubtitle"),
  profile: document.getElementById("selectPrintProfile"),
  marginTopMm: document.getElementById("marginTopMm"),
  marginRightMm: document.getElementById("marginRightMm"),
  marginBottomMm: document.getElementById("marginBottomMm"),
  marginLeftMm: document.getElementById("marginLeftMm"),
  btnTogglePalette: document.getElementById("btnTogglePalette"),
  btnToggleInspector: document.getElementById("btnToggleInspector"),
  btnOpenSettingsDrawer: document.getElementById("btnOpenSettingsDrawer"),
  btnCloseSettingsDrawer: document.getElementById("btnCloseSettingsDrawer"),
  settingsDrawer: document.getElementById("settingsDrawer"),
  btnImportProjectTrigger: document.getElementById("btnImportProjectTrigger"),
  btnImportDataTrigger: document.getElementById("btnImportDataTrigger"),
  btnImportImageTrigger: document.getElementById("btnImportImageTrigger"),
  btnClosePalette: document.getElementById("btnClosePalette"),
  btnCloseInspector: document.getElementById("btnCloseInspector"),
  btnUndo: document.getElementById("btnUndo"),
  btnRedo: document.getElementById("btnRedo"),
  btnPrint: document.getElementById("btnPrint"),
  btnTopbarExport: document.getElementById("btnTopbarExport"),
  btnTopbarPurge: document.getElementById("btnTopbarPurge"),
  btnTopbarAutoFit: document.getElementById("btnTopbarAutoFit"),
  btnGrid: document.getElementById("btnToggleGrid"),
  textTopbarControls: document.getElementById("textTopbarControls"),
  topbarTypographyGroup: document.getElementById("topbarTypographyGroup"),
  topbarSurfaceGroup: document.getElementById("topbarSurfaceGroup"),
  topbarContextHint: document.getElementById("topbarContextHint"),
  topbarFontFamily: document.getElementById("topbarFontFamily"),
  topbarFontSize: document.getElementById("topbarFontSize"),
  btnTopbarFontSizeDec: document.getElementById("btnTopbarFontSizeDec"),
  btnTopbarFontSizeInc: document.getElementById("btnTopbarFontSizeInc"),
  topbarFontWeight: document.getElementById("topbarFontWeight"),
  btnTopbarBold: document.getElementById("btnTopbarBold"),
  btnTopbarItalic: document.getElementById("btnTopbarItalic"),
  btnTopbarUnderline: document.getElementById("btnTopbarUnderline"),
  btnTopbarAlignLeft: document.getElementById("btnTopbarAlignLeft"),
  btnTopbarAlignCenter: document.getElementById("btnTopbarAlignCenter"),
  btnTopbarAlignRight: document.getElementById("btnTopbarAlignRight"),
  topbarLineHeight: document.getElementById("topbarLineHeight"),
  topbarLetterSpacing: document.getElementById("topbarLetterSpacing"),
  btnTopbarCaseNormal: document.getElementById("btnTopbarCaseNormal"),
  btnTopbarCaseUpper: document.getElementById("btnTopbarCaseUpper"),
  topbarTextTransform: document.getElementById("topbarTextTransform"),
  topbarTextColor: document.getElementById("topbarTextColor"),
  topbarKeyline: document.getElementById("topbarKeyline"),
  topbarKeylineColor: document.getElementById("topbarKeylineColor"),
  btnTopbarBackgroundNone: document.getElementById("btnTopbarBackgroundNone"),
  topbarBackgroundColor: document.getElementById("topbarBackgroundColor"),
  btnExport: document.getElementById("btnExport"),
  btnImport: document.getElementById("fileImportProject"),
  btnReset: document.getElementById("btnReset"),
  btnCustomPage: document.getElementById("btnAddCustomPage"),
  fileCsv: document.getElementById("fileImportCsv"),
  fileAsset: document.getElementById("fileImportAsset"),
};

const CANVAS_ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5];
const CANVAS_ZOOM_MIN = 0.5;
const CANVAS_ZOOM_MAX = 1.5;
const CANVAS_ZOOM_MODE_FIT = "fit";
const CANVAS_ZOOM_MODE_MANUAL = "manual";
const CANVAS_FIT_RESYNC_DELAY_MS = 240;
const TOPBAR_TEXT_COMPONENT_TYPES = new Set([
  "text",
  "all_caps_title",
  "header_3",
  "copy_block",
  "cover_hero",
  "section_intro",
]);
const REFLOW_CONTENT_SELECTOR =
  ".panel-card, .design-text, .delta-card, .cover-hero, .section-intro, .recommendation-card, .response-pair, .kpi-columns";
const AUTO_FIT_TRIGGERS = new Set(["profile-change", "explicit", "debounced", "import", "reset"]);
const AUTO_FIT_PHASE_LABELS = {
  prepare: "Preparing auto-fit",
  settle: "Settling page geometry",
  measure: "Measuring content",
  reflow: "Applying layout",
  verify: "Verifying overflow",
  finalize: "Finalizing",
};
const AUTO_FIT_SETTLE_DEFAULTS = {
  maxFrames: 12,
  timeoutMs: 900,
  fontsTimeoutMs: 450,
};
const PAGE_REORDER_SHIFT_MS = 170;
const PAGE_REORDER_AUTO_SCROLL_EDGE_PX = 52;
const PAGE_REORDER_AUTO_SCROLL_MAX_PX = 14;

initPerf({
  app: "doc-builder",
  schemaVersion: "0.2",
});
reportCatalogIntegrity();

document.body.dataset.appBooted = "1";
let settingsDrawerOpen = false;
const moveableRuntime = {
  instance: null,
  active: null,
  warnedMissing: false,
};
const inspectorSectionRuntime = {
  settings: {
    basic: true,
    controls: null,
    layout: false,
    advanced: false,
  },
};
let topbarTypographySession = null;
let topbarSurfaceSession = null;
let inspectorTextSession = null;
let componentClipboard = null;
let fitZoomFrameId = null;
let fitZoomTimeoutId = null;
let reflowSuspendCount = 0;
let pendingAutoReflowReason = null;
const autoFitRuntime = {
  running: false,
  runId: 0,
  queued: null,
  phase: "idle",
  startedAt: 0,
  lastResult: null,
};
const pageReorderRuntime = {
  isActive: false,
  draggingPageId: null,
  sourceIndex: -1,
  targetIndex: -1,
  sourceRowEl: null,
  placeholderEl: null,
  listEl: null,
  scrollContainerEl: null,
  floatingEl: null,
  pointerClientY: 0,
  autoScrollFrame: null,
  pointerId: null,
  pointerOffsetY: 0,
  pointerOffsetX: 0,
  onPointerMove: null,
  onPointerUp: null,
};
const reflowDebounce = debounce(() => {
  if (pendingAutoReflowReason) {
    requestAutoFit({ trigger: "debounced", reason: pendingAutoReflowReason });
  }
  pendingAutoReflowReason = null;
}, 260);

const TARGET_GRID_DENSITY = 2;

function readInspectorSettingsSectionOpen(section, fallback = false) {
  const value = inspectorSectionRuntime.settings?.[section];
  return typeof value === "boolean" ? value : fallback;
}

function bindInspectorSettingsSectionToggles(root) {
  root.querySelectorAll("details[data-inspector-section]").forEach((detailsEl) => {
    detailsEl.addEventListener("toggle", () => {
      const key = detailsEl.dataset.inspectorSection;
      if (!key) return;
      inspectorSectionRuntime.settings[key] = detailsEl.open;
    });
  });
}

function scaleLayoutToDensity(layout, factor) {
  if (!layout || typeof layout !== "object") return;
  const colStart = Math.max(1, Number(layout.colStart) || 1);
  const colSpan = Math.max(1, Number(layout.colSpan) || 1);
  const rowStart = Math.max(1, Number(layout.rowStart) || 1);
  const rowSpan = Math.max(1, Number(layout.rowSpan) || 1);
  layout.colStart = Math.max(1, Math.round((colStart - 1) * factor + 1));
  layout.colSpan = Math.max(1, Math.round(colSpan * factor));
  layout.rowStart = Math.max(1, Math.round((rowStart - 1) * factor + 1));
  layout.rowSpan = Math.max(1, Math.round(rowSpan * factor));
}

function scaleConstraintsToDensity(constraints, factor) {
  if (!constraints || typeof constraints !== "object") return;
  for (const key of ["minColSpan", "maxColSpan", "minRowSpan", "maxRowSpan"]) {
    const raw = Number(constraints[key]);
    if (Number.isFinite(raw) && raw > 0) {
      constraints[key] = Math.max(1, Math.round(raw * factor));
    }
  }
}

function scaleComponentToDensity(component, factor) {
  if (!component || typeof component !== "object") return;
  for (const layout of Object.values(component.layouts || {})) {
    scaleLayoutToDensity(layout, factor);
  }
  for (const layout of Object.values(component.defaultLayouts || {})) {
    scaleLayoutToDensity(layout, factor);
  }
  if (component.defaultState && typeof component.defaultState === "object") {
    for (const layout of Object.values(component.defaultState.layouts || {})) {
      scaleLayoutToDensity(layout, factor);
    }
  }
  scaleConstraintsToDensity(component.layoutConstraints, factor);
}

function scalePageToDensity(page, factor) {
  if (!page || !Array.isArray(page.components)) return;
  for (const component of page.components) {
    scaleComponentToDensity(component, factor);
  }
}

function ensureTargetGridDensity(draft, options = {}) {
  const force = options.force === true;
  const currentDensity = Math.max(1, Number(draft.project?.gridDensity) || 1);
  if (!force && currentDensity >= TARGET_GRID_DENSITY) return false;
  const factor = TARGET_GRID_DENSITY / (force ? 1 : currentDensity);
  for (const page of draft.pages || []) {
    scalePageToDensity(page, factor);
  }
  draft.project.gridDensity = TARGET_GRID_DENSITY;
  return true;
}

function normalizeUiSelectionInDraft(draft) {
  if (!Array.isArray(draft.pages) || draft.pages.length === 0) {
    draft.ui.selectedPageId = null;
    draft.ui.selectedComponentId = null;
    draft.ui.activePageId = null;
    draft.ui.pageSettingsPageId = null;
    return;
  }
  const selectedPage = findPage(draft, draft.ui.selectedPageId)
    || findPage(draft, draft.ui.activePageId)
    || draft.pages[0];
  draft.ui.selectedPageId = selectedPage?.id || null;
  draft.ui.activePageId = selectedPage?.id || null;
  if (!findComponent(selectedPage, draft.ui.selectedComponentId)) {
    draft.ui.selectedComponentId = null;
  }
  if (!findPage(draft, draft.ui.pageSettingsPageId)) {
    draft.ui.pageSettingsPageId = null;
  }
}

function parsePaletteOverrideInput(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function chartStyleNeedsReset(chartModel = {}) {
  const visual = chartModel.visual && typeof chartModel.visual === "object" ? chartModel.visual : {};
  const overrides = chartModel.overrides && typeof chartModel.overrides === "object" ? chartModel.overrides : {};
  const hasPaletteOverride = parsePaletteOverrideInput(visual.paletteOverride).length > 0
    || parsePaletteOverrideInput(visual.palette).length > 0;
  return visual.useBrandDefaults === false || hasPaletteOverride || Object.keys(overrides).length > 0;
}

function resetChartStyleModel(chartModel = {}) {
  const visual = chartModel.visual && typeof chartModel.visual === "object" ? chartModel.visual : {};
  return {
    ...chartModel,
    visual: {
      ...visual,
      useBrandDefaults: true,
      palette: "",
      paletteOverride: [],
    },
    overrides: {},
  };
}

function resetAllChartStylesToBrandDefaults() {
  const state = store.getState();
  let updated = 0;
  for (const page of state.pages || []) {
    for (const component of page.components || []) {
      if (component.type !== "chart") continue;
      if (chartStyleNeedsReset(component.props?.chart || {})) {
        updated += 1;
      }
    }
  }
  if (updated === 0) {
    showToast("All charts already use brand defaults");
    return;
  }

  store.commit((draft) => {
    for (const page of draft.pages || []) {
      for (const component of page.components || []) {
        if (component.type !== "chart") continue;
        const chartModel = component.props?.chart || {};
        if (!chartStyleNeedsReset(chartModel)) continue;
        component.props = {
          ...(component.props || {}),
          chart: resetChartStyleModel(chartModel),
        };
      }
    }
  }, { historyLabel: "reset-chart-styles" });
  showToast(`Reset ${updated} chart style${updated === 1 ? "" : "s"} to brand defaults`);
  requestAutoFit({ trigger: "debounced", reason: "chart-style-reset-all" });
}

function addMissingDefaultPages() {
  const state = store.getState();
  const missing = createMissingInitialPages(state.pages || []);
  if (missing.length === 0) {
    showToast("All default pages are already present");
    return;
  }

  store.commit((draft) => {
    const density = Math.max(1, Number(draft.project?.gridDensity) || 1);
    for (const page of missing) {
      if (density > 1) {
        scalePageToDensity(page, density);
      }
      draft.pages.push(page);
    }
    normalizeUiSelectionInDraft(draft);
  }, { historyLabel: "add-default-pages" });

  showToast(`Added ${missing.length} missing default page${missing.length === 1 ? "" : "s"}`);
  requestAutoFit({ trigger: "debounced", reason: "add-default-pages" });
}

async function resetSamplePack() {
  const proceed = await requestDecision({
    title: "Reset sample pack",
    message: "Reset to the sample template pack? This replaces current pages and clears imported datasets/assets.",
    confirmLabel: "Reset",
    cancelLabel: "Keep current",
    tone: "danger",
  });
  if (!proceed) return;
  store.commit((draft) => {
    draft.pages = createInitialPages();
    ensureTargetGridDensity(draft, { force: true });
    draft.datasets = [];
    draft.assets = [];
    normalizeUiSelectionInDraft(draft);
  }, { historyLabel: "reset" });
  showToast("Sample pages restored");
  requestAutoFit({ trigger: "reset", reason: "reset" });
}

function clearPersistedProjectState() {
  try {
    localStorage.removeItem(STORAGE_KEY_V2);
    localStorage.removeItem(STORAGE_KEY_V1);
  } catch (_error) {
    // Ignore storage errors in local-only mode.
  }
}

async function purgeAllAndResetDefaults() {
  const proceed = await requestDecision({
    title: "Purge everything?",
    message: "This will reset to factory defaults: default templates only, no imported data/assets, and no custom styling or history.",
    confirmLabel: "Purge all",
    cancelLabel: "Cancel",
    tone: "danger",
  });
  if (!proceed) return;

  const baseline = makeEmptyState();
  baseline.pages = createInitialPages();
  ensureTargetGridDensity(baseline, { force: true });
  normalizeUiSelectionInDraft(baseline);

  clearPersistedProjectState();
  store.replace(baseline, { skipHistory: true });
  store.clearHistory();

  showToast("Factory defaults restored");
  requestAutoFit({ trigger: "reset", reason: "purge-all" });
}

if (store.getState().pages.length === 0) {
  store.commit((draft) => {
    draft.pages = createInitialPages();
    draft.ui.activePageId = draft.pages[0]?.id || null;
  }, { historyLabel: "seed" });
}

store.commit((draft) => {
  ensureTargetGridDensity(draft);
  for (const page of draft.pages || []) {
    page.layoutMode = "free";
    for (const component of page.components || []) {
      if (!component.layoutConstraints || typeof component.layoutConstraints !== "object") {
        component.layoutConstraints = {};
      }
      component.layoutConstraints.locked = false;
      component.layoutConstraints.allowedTypes = null;
      component.slotId = null;
      if (!component.defaultLayouts || typeof component.defaultLayouts !== "object") {
        component.defaultLayouts = deepClone(component.layouts || {});
      }
      ensureComponentDefaultState(component);
    }
    enforcePageContracts(page, { syncTitle: true });
  }
}, { skipHistory: true });
requestAutoFit({ trigger: "reset", reason: "bootstrap" });

function showToast(message, timeout = 1500) {
  refs.toast.textContent = message;
  refs.toast.classList.add("is-visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => refs.toast.classList.remove("is-visible"), timeout);
}

let decisionDialogUi = null;
let decisionDialogResolver = null;

function settleDecisionDialog(result) {
  if (!decisionDialogUi) return;
  decisionDialogUi.overlay.hidden = true;
  if (decisionDialogResolver) {
    const resolver = decisionDialogResolver;
    decisionDialogResolver = null;
    resolver(result);
  }
}

function ensureDecisionDialog() {
  if (decisionDialogUi) return decisionDialogUi;

  const overlay = document.createElement("div");
  overlay.className = "decision-overlay no-print";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="decision-card" role="dialog" aria-modal="true" aria-labelledby="decisionTitle">
      <h3 id="decisionTitle">Confirm action</h3>
      <p id="decisionMessage"></p>
      <div class="decision-actions">
        <button type="button" class="btn" data-decision="cancel">Cancel</button>
        <button type="button" class="btn btn--primary" data-decision="confirm">Continue</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const title = overlay.querySelector("#decisionTitle");
  const message = overlay.querySelector("#decisionMessage");
  const cancelButton = overlay.querySelector('[data-decision="cancel"]');
  const confirmButton = overlay.querySelector('[data-decision="confirm"]');

  overlay.addEventListener("click", (event) => {
    if (overlay.hidden) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const actionButton = target.closest("[data-decision]");
    if (actionButton) {
      settleDecisionDialog(actionButton.dataset.decision === "confirm");
      return;
    }
    if (target === overlay) {
      settleDecisionDialog(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      settleDecisionDialog(false);
    }
  });

  decisionDialogUi = {
    overlay,
    title,
    message,
    cancelButton,
    confirmButton,
  };
  return decisionDialogUi;
}

function requestDecision({
  title = "Confirm action",
  message = "Are you sure you want to continue?",
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  tone = "default",
} = {}) {
  const ui = ensureDecisionDialog();
  ui.title.textContent = title;
  ui.message.textContent = message;
  ui.cancelButton.textContent = cancelLabel;
  ui.confirmButton.textContent = confirmLabel;
  ui.confirmButton.classList.toggle("btn--danger", tone === "danger");
  ui.overlay.hidden = false;
  ui.confirmButton.focus();

  return new Promise((resolve) => {
    if (decisionDialogResolver) {
      settleDecisionDialog(false);
    }
    decisionDialogResolver = resolve;
  });
}

function hideDecisionDialog() {
  if (decisionDialogResolver) {
    settleDecisionDialog(false);
    return;
  }
  if (decisionDialogUi?.overlay) decisionDialogUi.overlay.hidden = true;
}

function setSettingsDrawerOpen(next) {
  settingsDrawerOpen = Boolean(next);
  refs.settingsDrawer?.classList.toggle("is-open", settingsDrawerOpen);
  refs.btnOpenSettingsDrawer?.classList.toggle("is-active", settingsDrawerOpen);
}

function unlockPageModel(page) {
  if (!page) return;
  page.layoutMode = "free";
  for (const component of page.components || []) {
    if (!component.layoutConstraints) component.layoutConstraints = {};
    if (isDefaultPageHeaderComponent(component)) {
      component.layoutConstraints.locked = false;
      component.layoutConstraints.allowedTypes = null;
      component.slotId = "default-page-title";
      component.isDefaultPageTitle = true;
      continue;
    }
    component.layoutConstraints.locked = false;
    component.layoutConstraints.allowedTypes = null;
    component.slotId = null;
  }
}

function findPage(draft, pageId) {
  return draft.pages.find((page) => page.id === pageId) || null;
}

function findComponent(page, componentId) {
  if (!page) return null;
  return page.components.find((component) => component.id === componentId) || null;
}

function makeComponentId() {
  return `cmp_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function selectedEntities(state = store.getState()) {
  const page = findPage(state, state.ui.selectedPageId);
  const component = findComponent(page, state.ui.selectedComponentId);
  return { page, component };
}

function hasEditableTextFields(component) {
  if (!component || typeof component !== "object") return false;
  return typeof component.title === "string" || typeof component.body === "string";
}

function clearTextEditSessions() {
  topbarTypographySession = null;
  topbarSurfaceSession = null;
  inspectorTextSession = null;
}

function normalizeComponentTextValue(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

function normalizeTextFieldKey(field) {
  const raw = String(field ?? "").trim();
  if (raw === "title" || raw === "body") return raw;
  if (/^props(?:\.|\[)/.test(raw)) return raw;
  return null;
}

function readComponentTextField(component, field) {
  if (!component || typeof component !== "object") return "";
  const key = normalizeTextFieldKey(field);
  if (!key) return "";
  const value = key === "title" || key === "body"
    ? component[key]
    : getByPath(component, key);
  return normalizeComponentTextValue(value);
}

function writeComponentTextFieldInDraft(draft, pageId, componentId, field, value) {
  const page = findPage(draft, pageId);
  const component = findComponent(page, componentId);
  if (!component) return false;
  const key = normalizeTextFieldKey(field);
  if (!key) return false;
  const nextValue = normalizeComponentTextValue(value);
  const currentValue = readComponentTextField(component, key);
  if (currentValue === nextValue) return false;
  if (key === "title" || key === "body") {
    component[key] = nextValue;
    return true;
  }
  if (!component.props || typeof component.props !== "object") component.props = {};
  setByPath(component, key, nextValue);
  return true;
}

function commitComponentTextField(pageId, componentId, field, value, historyLabel = "component-text") {
  const state = store.getState();
  const page = findPage(state, pageId);
  const component = findComponent(page, componentId);
  if (!page || !component) return false;
  const key = normalizeTextFieldKey(field);
  if (!key) return false;
  const nextValue = normalizeComponentTextValue(value);
  if (readComponentTextField(component, key) === nextValue) return false;
  store.commit((draft) => {
    writeComponentTextFieldInDraft(draft, pageId, componentId, key, nextValue);
  }, { historyLabel });
  scheduleDebouncedAutoReflow(`text:${historyLabel}`);
  return true;
}

function previewInspectorComponentText(pageId, componentId, field, value) {
  const state = store.getState();
  const page = findPage(state, pageId);
  const component = findComponent(page, componentId);
  if (!page || !component) return;
  const key = normalizeTextFieldKey(field);
  const nextValue = normalizeComponentTextValue(value);

  if (
    !inspectorTextSession ||
    inspectorTextSession.pageId !== page.id ||
    inspectorTextSession.componentId !== component.id ||
    inspectorTextSession.field !== key
  ) {
    inspectorTextSession = {
      pageId: page.id,
      componentId: component.id,
      field: key,
      baseline: readComponentTextField(component, key),
    };
  }

  if (readComponentTextField(component, key) === nextValue) return;
  store.commit((draft) => {
    writeComponentTextFieldInDraft(draft, page.id, component.id, key, nextValue);
  }, { historyLabel: `inspector-${key}-preview`, skipHistory: true });
}

function commitInspectorComponentText(pageId, componentId, field, value) {
  const state = store.getState();
  const page = findPage(state, pageId);
  const component = findComponent(page, componentId);
  if (!page || !component) {
    inspectorTextSession = null;
    return;
  }
  const key = normalizeTextFieldKey(field);
  const nextValue = normalizeComponentTextValue(value);
  const session = inspectorTextSession;
  const hasSession =
    session &&
    session.pageId === page.id &&
    session.componentId === component.id &&
    session.field === key;

  if (hasSession) {
    const currentValue = readComponentTextField(component, key);
    if (currentValue !== session.baseline) {
      store.commit((draft) => {
        writeComponentTextFieldInDraft(draft, page.id, component.id, key, session.baseline);
      }, { historyLabel: `inspector-${key}-preview`, skipHistory: true });
    }
    if (session.baseline !== nextValue) {
      commitComponentTextField(page.id, component.id, key, nextValue, `inspector-${key}`);
    }
    inspectorTextSession = null;
    return;
  }

  commitComponentTextField(page.id, component.id, key, nextValue, `inspector-${key}`);
  inspectorTextSession = null;
}

function commitInlineTextEdit(pageId, componentId, field, value) {
  clearTextEditSessions();
  return commitComponentTextField(pageId, componentId, field, value, "inline-text");
}

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable], [role="textbox"]'));
}

function select(pageId, componentId = null) {
  clearTextEditSessions();
  const current = store.getState().ui;
  const nextComponentId = componentId || null;
  if (
    current.selectedPageId === pageId &&
    current.selectedComponentId === nextComponentId &&
    current.activePageId === pageId
  ) {
    return;
  }
  store.commit(
    (draft) => {
      draft.ui.selectedPageId = pageId;
      draft.ui.selectedComponentId = nextComponentId;
      draft.ui.activePageId = pageId;
      draft.ui.pendingDeleteComponentId = null;
    },
    { skipHistory: true },
  );
}

function openComponentEditor(pageId, componentId, tab = "settings") {
  clearTextEditSessions();
  const nextTab = tab === "data" ? "data" : "settings";
  store.commit((draft) => {
    draft.ui.selectedPageId = pageId;
    draft.ui.selectedComponentId = componentId;
    draft.ui.activePageId = pageId;
    draft.ui.inspectorTab = nextTab;
    draft.ui.inspectorOpen = true;
    draft.ui.pendingDeleteComponentId = null;
  }, { skipHistory: true });
}

function toggleComponentEditor(pageId, componentId, tab = "settings") {
  clearTextEditSessions();
  const nextTab = tab === "data" ? "data" : "settings";
  const state = store.getState();
  const isSameSelection =
    state.ui.selectedPageId === pageId &&
    state.ui.selectedComponentId === componentId;
  const shouldClose = isSameSelection && Boolean(state.ui.inspectorOpen);

  store.commit((draft) => {
    draft.ui.selectedPageId = pageId;
    draft.ui.selectedComponentId = componentId;
    draft.ui.activePageId = pageId;
    draft.ui.pendingDeleteComponentId = null;
    if (shouldClose) {
      draft.ui.inspectorOpen = false;
      return;
    }
    draft.ui.inspectorTab = nextTab;
    draft.ui.inspectorOpen = true;
  }, { skipHistory: true });
}

function deselectComponent(pageId = null) {
  clearTextEditSessions();
  const state = store.getState();
  const nextPageId = pageId || state.ui.selectedPageId || state.ui.activePageId || null;
  if (
    state.ui.selectedComponentId == null &&
    (!nextPageId || (state.ui.selectedPageId === nextPageId && state.ui.activePageId === nextPageId))
  ) {
    return;
  }
  store.commit((draft) => {
    if (nextPageId) {
      draft.ui.selectedPageId = nextPageId;
      draft.ui.activePageId = nextPageId;
    }
    draft.ui.selectedComponentId = null;
    draft.ui.pendingDeleteComponentId = null;
  }, { historyLabel: "ui-deselect-component", skipHistory: true });
}

function resolveTopbarTextTarget(ui) {
  return ui?.topbarTextTarget === "body" ? "body" : "title";
}

function isTransparentSurfaceColor(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "transparent" || raw === "none";
}

function normalizeCanvasZoom(value) {
  const zoom = Number(value);
  if (!Number.isFinite(zoom)) return 1;
  const clamped = Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX, zoom));
  return Math.round(clamped * 100) / 100;
}

function normalizeCanvasZoomMode(value) {
  return value === CANVAS_ZOOM_MODE_FIT ? CANVAS_ZOOM_MODE_FIT : CANVAS_ZOOM_MODE_MANUAL;
}

function isCanvasFitMode(state = store.getState()) {
  return normalizeCanvasZoomMode(state.ui?.canvasZoomMode) === CANVAS_ZOOM_MODE_FIT;
}

function applyCanvasZoom(zoomValue, zoomModeValue = CANVAS_ZOOM_MODE_MANUAL) {
  const zoom = normalizeCanvasZoom(zoomValue);
  const zoomMode = normalizeCanvasZoomMode(zoomModeValue);
  if (refs.pages) {
    refs.pages.style.zoom = String(zoom);
    refs.pages.style.setProperty("--canvas-zoom", String(zoom));
    refs.pages.style.setProperty("--canvas-ui-scale", String(Math.max(0.66, Math.min(2, 1 / zoom))));
  }
  if (refs.selectCanvasZoom) {
    if (zoomMode === CANVAS_ZOOM_MODE_FIT) {
      refs.selectCanvasZoom.value = CANVAS_ZOOM_MODE_FIT;
      if (refs.selectCanvasZoom.value !== CANVAS_ZOOM_MODE_FIT) {
        const nearest = CANVAS_ZOOM_STEPS.reduce((best, candidate) => (
          Math.abs(candidate - zoom) < Math.abs(best - zoom) ? candidate : best
        ), CANVAS_ZOOM_STEPS[0]);
        refs.selectCanvasZoom.value = String(nearest);
      }
    } else {
      const exact = String(zoom);
      refs.selectCanvasZoom.value = exact;
      if (refs.selectCanvasZoom.value !== exact) {
        const nearest = CANVAS_ZOOM_STEPS.reduce((best, candidate) => (
          Math.abs(candidate - zoom) < Math.abs(best - zoom) ? candidate : best
        ), CANVAS_ZOOM_STEPS[0]);
        refs.selectCanvasZoom.value = String(nearest);
      }
    }
  }
  refs.btnCanvasZoomFit?.classList.toggle("is-active", zoomMode === CANVAS_ZOOM_MODE_FIT);
}

function updateCanvasZoom(nextZoom, options = {}) {
  const modeFromOptions = Object.prototype.hasOwnProperty.call(options, "mode")
    ? options.mode
    : null;
  const state = store.getState();
  const normalized = normalizeCanvasZoom(nextZoom);
  const currentZoom = normalizeCanvasZoom(state.ui?.canvasZoom ?? 1);
  const currentMode = normalizeCanvasZoomMode(state.ui?.canvasZoomMode);
  const nextMode = modeFromOptions == null ? currentMode : normalizeCanvasZoomMode(modeFromOptions);
  if (Math.abs(currentZoom - normalized) < 0.005 && currentMode === nextMode) return;
  store.commit((draft) => {
    draft.ui.canvasZoom = normalized;
    draft.ui.canvasZoomMode = nextMode;
  }, { historyLabel: "ui-canvas-zoom", skipHistory: true });
}

function resolveActivePageSheet(state = store.getState()) {
  if (!refs.pages) return null;
  const activePageId = state.ui?.activePageId;
  if (activePageId) {
    const activeSheet = refs.pages.querySelector(`.page[data-page-id="${activePageId}"] .page-sheet`);
    if (activeSheet) return activeSheet;
  }
  return refs.pages.querySelector(".page-sheet");
}

function computeCanvasFitZoom(state = store.getState()) {
  if (!refs.pages || !refs.canvasPanel) return null;
  const sheet = resolveActivePageSheet(state);
  if (!sheet) return null;

  const currentZoom = normalizeCanvasZoom(state.ui?.canvasZoom ?? 1);
  const sheetRect = sheet.getBoundingClientRect();
  if (sheetRect.width < 1 || sheetRect.height < 1 || currentZoom <= 0) return null;

  const baseWidth = sheetRect.width / currentZoom;
  const baseHeight = sheetRect.height / currentZoom;
  if (baseWidth < 1 || baseHeight < 1) return null;

  const pagesRect = refs.pages.getBoundingClientRect();
  const canvasRect = refs.canvasPanel.getBoundingClientRect();

  let availableWidth = pagesRect.width;
  const inspectorRect = refs.inspectorPanel?.getBoundingClientRect();
  if (state.ui?.inspectorOpen && inspectorRect) {
    const overlapWidth = Math.max(
      0,
      Math.min(pagesRect.right, inspectorRect.right) - Math.max(pagesRect.left, inspectorRect.left),
    );
    availableWidth -= overlapWidth;
  }
  availableWidth = Math.max(40, availableWidth - 12);

  const topInset = Math.max(0, pagesRect.top - canvasRect.top);
  const availableHeight = Math.max(40, canvasRect.height - topInset - 8);

  const rawFit = Math.min(availableWidth / baseWidth, availableHeight / baseHeight);
  if (!Number.isFinite(rawFit)) return null;
  return normalizeCanvasZoom(rawFit);
}

function refreshCanvasFitZoom(state = store.getState()) {
  if (!isCanvasFitMode(state)) return;
  const fitZoom = computeCanvasFitZoom(state);
  if (!Number.isFinite(fitZoom)) return;
  const currentZoom = normalizeCanvasZoom(state.ui?.canvasZoom ?? 1);
  if (Math.abs(currentZoom - fitZoom) < 0.01) return;
  updateCanvasZoom(fitZoom, { mode: CANVAS_ZOOM_MODE_FIT });
}

function scheduleCanvasFitZoom(options = {}) {
  const withTransitionPass = options.withTransitionPass === true;
  if (!isCanvasFitMode(store.getState())) return;
  if (fitZoomFrameId != null) {
    window.cancelAnimationFrame(fitZoomFrameId);
  }
  fitZoomFrameId = window.requestAnimationFrame(() => {
    fitZoomFrameId = null;
    refreshCanvasFitZoom(store.getState());
  });
  if (!withTransitionPass) return;
  if (fitZoomTimeoutId != null) {
    window.clearTimeout(fitZoomTimeoutId);
  }
  fitZoomTimeoutId = window.setTimeout(() => {
    fitZoomTimeoutId = null;
    refreshCanvasFitZoom(store.getState());
  }, CANVAS_FIT_RESYNC_DELAY_MS);
}

function enableCanvasFitMode() {
  const state = store.getState();
  const fitZoom = computeCanvasFitZoom(state);
  if (Number.isFinite(fitZoom)) {
    updateCanvasZoom(fitZoom, { mode: CANVAS_ZOOM_MODE_FIT });
  } else {
    updateCanvasZoom(state.ui?.canvasZoom ?? 1, { mode: CANVAS_ZOOM_MODE_FIT });
  }
  scheduleCanvasFitZoom({ withTransitionPass: true });
}

function stepCanvasZoom(direction) {
  const state = store.getState();
  const current = normalizeCanvasZoom(state.ui?.canvasZoom ?? 1);
  let index = CANVAS_ZOOM_STEPS.findIndex((value) => value >= current - 0.0001 && value <= current + 0.0001);
  if (index < 0) {
    index = CANVAS_ZOOM_STEPS.findIndex((value) => value > current);
    if (index < 0) index = CANVAS_ZOOM_STEPS.length - 1;
  }
  const nextIndex = Math.max(0, Math.min(CANVAS_ZOOM_STEPS.length - 1, index + direction));
  updateCanvasZoom(CANVAS_ZOOM_STEPS[nextIndex], { mode: CANVAS_ZOOM_MODE_MANUAL });
}

function selectedTextEntities(state = store.getState()) {
  const { page, component } = selectedEntities(state);
  if (!page || !component || !hasEditableTextFields(component)) {
    return { page: null, component: null };
  }
  return { page, component };
}

function selectedStyleEntities(state = store.getState()) {
  const { page, component } = selectedEntities(state);
  if (!page || !component) {
    return { page: null, component: null };
  }
  return { page, component };
}

const THEME_AWARE_TEXT_TYPES = new Set(["text", "all_caps_title", "header_3", "copy_block"]);

function applyThemeDefaultsToComponent(component, pageTheme) {
  if (!component || !THEME_AWARE_TEXT_TYPES.has(component.type || "")) return;
  const sourceProps = component.props && typeof component.props === "object" ? component.props : {};
  const nextProps = normalizeTypographySurfaceProps(component.type, {
    ...sourceProps,
    typography: sourceProps.typography,
    surface: sourceProps.surface,
  });

  if (pageTheme === PAGE_THEMES.dark_intro) {
    nextProps.typography.title.color = "#F2F5FF";
    nextProps.typography.body.color = "#F2F5FF";
    nextProps.surface.backgroundColor = "transparent";
    nextProps.surface.keyline = "none";
  }

  if (component.type === "all_caps_title") {
    nextProps.typography.title.textTransform = "uppercase";
    nextProps.surface.backgroundColor = "transparent";
    nextProps.surface.keyline = "none";
  }

  component.props = normalizeTypographySurfaceProps(component.type, nextProps);
}

function resolveTopbarMode(state = store.getState()) {
  const { page, component } = selectedEntities(state);
  if (!page || !component) {
    return { mode: "none", page: null, component: null };
  }
  const isTextType = TOPBAR_TEXT_COMPONENT_TYPES.has(component.type || "");
  return {
    mode: isTextType ? "text" : "shape",
    page,
    component,
  };
}

function fmtTopbarNumber(value, digits = 2) {
  return Number(value)
    .toFixed(digits)
    .replace(/\.?0+$/, "");
}

function normalizeHexColor(value, fallback = "#17181C") {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw
      .slice(1)
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toUpperCase()}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return raw.toUpperCase();
  }
  return fallback;
}

function cssColorToInputColor(value, fallback = "#17181C", options = {}) {
  const allowTransparent = options.allowTransparent === true;
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (raw.toLowerCase() === "transparent") {
    return allowTransparent ? "transparent" : fallback;
  }
  if (/^#[0-9a-f]{3,6}$/i.test(raw)) {
    return normalizeHexColor(raw, fallback);
  }

  const match = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return fallback;
  const parts = match[1].split(",").map((part) => part.trim());
  if (parts.length < 3) return fallback;

  const parseChannel = (part) => {
    if (part.endsWith("%")) {
      const ratio = Number.parseFloat(part.slice(0, -1));
      if (!Number.isFinite(ratio)) return NaN;
      return Math.round((Math.max(0, Math.min(100, ratio)) / 100) * 255);
    }
    const valueNum = Number.parseFloat(part);
    if (!Number.isFinite(valueNum)) return NaN;
    return Math.round(Math.max(0, Math.min(255, valueNum)));
  };

  const parseAlpha = (part) => {
    if (part == null) return 1;
    const valueNum = Number.parseFloat(part);
    if (!Number.isFinite(valueNum)) return 1;
    return Math.max(0, Math.min(1, valueNum));
  };

  const r = parseChannel(parts[0]);
  const g = parseChannel(parts[1]);
  const b = parseChannel(parts[2]);
  const a = parseAlpha(parts[3]);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return fallback;
  if (a <= 0.01) {
    return allowTransparent ? "transparent" : fallback;
  }
  const byte = (valueNum) => valueNum.toString(16).padStart(2, "0").toUpperCase();
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function hasExplicitSurfaceOverrides(component) {
  const surface = component?.props?.surface;
  if (!surface || typeof surface !== "object") return false;
  return ["backgroundColor", "keyline", "keylineColor"].some((key) => {
    const value = surface[key];
    return value != null && String(value).trim() !== "";
  });
}

function readRenderedSurfaceStyle(pageId, componentId, fallbackSurface) {
  if (!refs.pages || !pageId || !componentId) return null;
  const node = refs.pages.querySelector(`[data-page-id="${pageId}"] [data-component-id="${componentId}"]`);
  if (!(node instanceof HTMLElement)) return null;
  const content = node.querySelector(REFLOW_CONTENT_SELECTOR) || node;
  if (!(content instanceof HTMLElement)) return null;
  const computed = getComputedStyle(content);

  const backgroundColor = cssColorToInputColor(
    computed.backgroundColor,
    fallbackSurface.backgroundColor === "transparent" ? "#ECEEF5" : fallbackSurface.backgroundColor,
    { allowTransparent: true },
  );
  const borderColorRaw = cssColorToInputColor(computed.borderTopColor, fallbackSurface.keylineColor, { allowTransparent: true });
  const borderColor = borderColorRaw === "transparent" ? fallbackSurface.keylineColor : borderColorRaw;
  const borderWidth = toNumber(computed.borderTopWidth, 0);
  const keyline = borderWidth <= 0.5 || borderColorRaw === "transparent"
    ? "none"
    : borderWidth >= 2
      ? "thick"
      : "thin";

  return {
    backgroundColor,
    keyline,
    keylineColor: borderColor,
  };
}

function resolveSurfaceStyleForSelection(page, component) {
  const normalized = readSurfaceStyle(component);
  if (hasExplicitSurfaceOverrides(component)) {
    return normalized;
  }
  const rendered = readRenderedSurfaceStyle(page?.id, component?.id, normalized);
  return rendered || normalized;
}

function normalizeStylePropsForType(type, props) {
  const source = props && typeof props === "object" ? { ...props } : {};
  const styleSeed = normalizeTypographySurfaceProps(type || "text", {
    typography: source.typography,
    surface: source.surface,
  });
  source.typography = styleSeed.typography;
  source.surface = styleSeed.surface;
  return source;
}

function normalizeComponentStyleProps(component, props = null) {
  const type = component?.type || "text";
  const source = props == null ? component?.props : props;
  return normalizeStylePropsForType(type, source);
}

function readTypographyStyle(component, target) {
  const props = normalizeComponentStyleProps(component);
  return props.typography[target];
}

function readSurfaceStyle(component) {
  const props = normalizeComponentStyleProps(component);
  return props.surface;
}

function setTypographyStyleInDraft(draft, pageId, componentId, target, stylePatch) {
  const page = findPage(draft, pageId);
  const component = findComponent(page, componentId);
  if (!component) return;

  const nextProps = normalizeComponentStyleProps(component);
  nextProps.typography[target] = {
    ...nextProps.typography[target],
    ...(stylePatch || {}),
  };
  component.props = normalizeComponentStyleProps(component, nextProps);
}

function setSurfaceStyleInDraft(draft, pageId, componentId, stylePatch) {
  const page = findPage(draft, pageId);
  const component = findComponent(page, componentId);
  if (!component) return;

  const nextProps = normalizeComponentStyleProps(component);
  nextProps.surface = {
    ...nextProps.surface,
    ...(stylePatch || {}),
  };
  component.props = normalizeComponentStyleProps(component, nextProps);
}

function previewSelectedTextTypography(stylePatch) {
  const state = store.getState();
  const { page, component } = selectedTextEntities(state);
  if (!page || !component) return;
  const target = resolveTopbarTextTarget(state.ui);

  if (
    !topbarTypographySession ||
    topbarTypographySession.pageId !== page.id ||
    topbarTypographySession.componentId !== component.id ||
    topbarTypographySession.target !== target
  ) {
    topbarTypographySession = {
      pageId: page.id,
      componentId: component.id,
      target,
      baseline: { ...readTypographyStyle(component, target) },
    };
  }

  store.commit((draft) => {
    setTypographyStyleInDraft(draft, page.id, component.id, target, stylePatch);
  }, { historyLabel: "topbar-typography-preview", skipHistory: true });
}

function commitSelectedTextTypography(stylePatch, historyLabel = "topbar-typography") {
  const state = store.getState();
  const { page, component } = selectedTextEntities(state);
  if (!page || !component) return;
  const target = resolveTopbarTextTarget(state.ui);
  const finalStyle = {
    ...readTypographyStyle(component, target),
    ...(stylePatch || {}),
  };

  const session = topbarTypographySession;
  const hasSession =
    session &&
    session.pageId === page.id &&
    session.componentId === component.id &&
    session.target === target;

  if (hasSession) {
    store.commit((draft) => {
      setTypographyStyleInDraft(draft, page.id, component.id, target, session.baseline);
    }, { historyLabel: "topbar-typography-preview", skipHistory: true });
  }

  store.commit((draft) => {
    setTypographyStyleInDraft(draft, page.id, component.id, target, finalStyle);
  }, { historyLabel });

  topbarTypographySession = null;
  scheduleDebouncedAutoReflow(`typography:${historyLabel}`);
}

function previewSelectedTextSurface(stylePatch) {
  const state = store.getState();
  const { page, component } = selectedStyleEntities(state);
  if (!page || !component) return;

  if (
    !topbarSurfaceSession ||
    topbarSurfaceSession.pageId !== page.id ||
    topbarSurfaceSession.componentId !== component.id
  ) {
    topbarSurfaceSession = {
      pageId: page.id,
      componentId: component.id,
      baseline: { ...resolveSurfaceStyleForSelection(page, component) },
    };
  }

  store.commit((draft) => {
    setSurfaceStyleInDraft(draft, page.id, component.id, stylePatch);
  }, { historyLabel: "topbar-surface-preview", skipHistory: true });
}

function commitSelectedTextSurface(stylePatch, historyLabel = "topbar-surface") {
  const state = store.getState();
  const { page, component } = selectedStyleEntities(state);
  if (!page || !component) return;
  const finalStyle = {
    ...resolveSurfaceStyleForSelection(page, component),
    ...(stylePatch || {}),
  };

  const session = topbarSurfaceSession;
  const hasSession =
    session &&
    session.pageId === page.id &&
    session.componentId === component.id;

  if (hasSession) {
    store.commit((draft) => {
      setSurfaceStyleInDraft(draft, page.id, component.id, session.baseline);
    }, { historyLabel: "topbar-surface-preview", skipHistory: true });
  }

  store.commit((draft) => {
    setSurfaceStyleInDraft(draft, page.id, component.id, finalStyle);
  }, { historyLabel });

  topbarSurfaceSession = null;
  scheduleDebouncedAutoReflow(`surface:${historyLabel}`);
}

function setCanvasTextTarget(pageId, componentId, target) {
  clearTextEditSessions();
  store.commit((draft) => {
    draft.ui.selectedPageId = pageId;
    draft.ui.selectedComponentId = componentId;
    draft.ui.activePageId = pageId;
    draft.ui.pendingDeleteComponentId = null;
    draft.ui.topbarTextTarget = target === "body" ? "body" : "title";
  }, { historyLabel: "ui-canvas-text-target", skipHistory: true });
}

function adjustSelectedTextFontSize(delta) {
  const state = store.getState();
  const { component } = selectedTextEntities(state);
  if (!component) return;
  const target = resolveTopbarTextTarget(state.ui);
  const current = readTypographyStyle(component, target);
  commitSelectedTextTypography(
    { fontSize: Math.round(toNumber(current.fontSize, 16) + delta) },
    "topbar-font-size",
  );
}

function syncTopbarTextControls(state) {
  const topbarMode = resolveTopbarMode(state);
  const hasSelection = topbarMode.mode !== "none";

  if (refs.textTopbarControls) refs.textTopbarControls.hidden = !hasSelection;
  if (refs.topbarTypographyGroup) refs.topbarTypographyGroup.hidden = topbarMode.mode !== "text";
  if (refs.topbarSurfaceGroup) refs.topbarSurfaceGroup.hidden = topbarMode.mode !== "shape";
  if (refs.topbarContextHint) {
    refs.topbarContextHint.hidden = hasSelection;
    if (!hasSelection) {
      refs.topbarContextHint.textContent = "Select text or a shape to edit style controls.";
    }
  }

  if (!hasSelection) {
    clearTextEditSessions();
    refs.btnTopbarBackgroundNone?.classList.remove("is-active");
    if (refs.topbarBackgroundColor) refs.topbarBackgroundColor.disabled = false;
    return;
  }

  const { page, component } = topbarMode;

  if (
    topbarTypographySession &&
    (topbarTypographySession.pageId !== page.id ||
      topbarTypographySession.componentId !== component.id ||
      topbarTypographySession.target !== resolveTopbarTextTarget(state.ui))
  ) {
    topbarTypographySession = null;
  }
  if (
    topbarSurfaceSession &&
    (topbarSurfaceSession.pageId !== page.id ||
      topbarSurfaceSession.componentId !== component.id)
  ) {
    topbarSurfaceSession = null;
  }

  if (topbarMode.mode === "text") {
    const target = resolveTopbarTextTarget(state.ui);
    const style = readTypographyStyle(component, target);
    if (refs.topbarFontFamily) refs.topbarFontFamily.value = style.fontFamily;
    if (refs.topbarFontSize) refs.topbarFontSize.value = String(style.fontSize);
    if (refs.topbarFontWeight) refs.topbarFontWeight.value = String(style.fontWeight);
    if (refs.btnTopbarBold) refs.btnTopbarBold.classList.toggle("is-active", Number(style.fontWeight) >= 600);
    if (refs.btnTopbarItalic) refs.btnTopbarItalic.classList.toggle("is-active", style.fontStyle === "italic");
    if (refs.btnTopbarUnderline) refs.btnTopbarUnderline.classList.toggle("is-active", style.textDecoration === "underline");
    refs.btnTopbarAlignLeft?.classList.toggle("is-active", style.textAlign === "left");
    refs.btnTopbarAlignCenter?.classList.toggle("is-active", style.textAlign === "center");
    refs.btnTopbarAlignRight?.classList.toggle("is-active", style.textAlign === "right");
    if (refs.topbarLineHeight) refs.topbarLineHeight.value = fmtTopbarNumber(style.lineHeight, 2);
    if (refs.topbarLetterSpacing) refs.topbarLetterSpacing.value = fmtTopbarNumber(style.letterSpacing, 2);
    refs.btnTopbarCaseNormal?.classList.toggle("is-active", style.textTransform !== "uppercase");
    refs.btnTopbarCaseUpper?.classList.toggle("is-active", style.textTransform === "uppercase");
    if (refs.topbarTextTransform) refs.topbarTextTransform.value = style.textTransform;
    if (refs.topbarTextColor) refs.topbarTextColor.value = cssColorToInputColor(style.color, "#17181C");
    return;
  }

  const surface = resolveSurfaceStyleForSelection(page, component);
  const hasTransparentFill = isTransparentSurfaceColor(surface.backgroundColor);
  if (refs.topbarKeyline) {
    const keylineValue = surface.keyline === "none" || surface.keyline === "thick" ? surface.keyline : "thin";
    refs.topbarKeyline.value = keylineValue;
  }
  if (refs.topbarKeylineColor) refs.topbarKeylineColor.value = cssColorToInputColor(surface.keylineColor, "#D7D7E7");
  refs.btnTopbarBackgroundNone?.classList.toggle("is-active", hasTransparentFill);
  if (refs.topbarBackgroundColor) {
    refs.topbarBackgroundColor.value = hasTransparentFill
      ? "#ECEEF5"
      : cssColorToInputColor(surface.backgroundColor, "#ECEEF5");
    refs.topbarBackgroundColor.disabled = false;
  }
}

function jumpToPage(pageId, behavior = "smooth") {
  if (!pageId) return;
  requestAnimationFrame(() => {
    const pageNode = refs.pages?.querySelector(`[data-page-id="${pageId}"]`);
    if (!pageNode) return;
    pageNode.scrollIntoView({ behavior, block: "start" });
  });
}

function addPageFromTemplate(templateId) {
  const page = createPageFromTemplate(templateId);
  if (!page) return;
  store.commit((draft) => {
    enforcePageContracts(page, { syncTitle: true });
    const density = Math.max(1, Number(draft.project?.gridDensity) || 1);
    if (density > 1) {
      scalePageToDensity(page, density);
    }
    draft.pages.push(page);
    draft.ui.selectedPageId = page.id;
    draft.ui.selectedComponentId = null;
    draft.ui.activePageId = page.id;
    draft.ui.pagePanelTab = "pages";
    draft.ui.pageSettingsPageId = null;
  }, { historyLabel: "add-page" });
  showToast("Template page added");
  requestAutoFit({ trigger: "debounced", reason: "template-add" });
}

function addCustomPage() {
  const page = makeCustomPage();
  store.commit((draft) => {
    enforcePageContracts(page, { syncTitle: true });
    const density = Math.max(1, Number(draft.project?.gridDensity) || 1);
    if (density > 1) {
      scalePageToDensity(page, density);
    }
    draft.pages.push(page);
    draft.ui.selectedPageId = page.id;
    draft.ui.selectedComponentId = null;
    draft.ui.activePageId = page.id;
    draft.ui.pagePanelTab = "pages";
    draft.ui.pageSettingsPageId = null;
  }, { historyLabel: "add-custom-page" });
  showToast("Custom page added");
  requestAutoFit({ trigger: "debounced", reason: "custom-page-add" });
}

function duplicatePage(pageId) {
  store.commit((draft) => {
    const index = draft.pages.findIndex((page) => page.id === pageId);
    if (index < 0) return;
    const copy = clonePage(draft.pages[index]);
    unlockPageModel(copy);
    draft.pages.splice(index + 1, 0, copy);
    draft.ui.selectedPageId = copy.id;
    draft.ui.selectedComponentId = null;
    draft.ui.activePageId = copy.id;
    draft.ui.pagePanelTab = "pages";
    draft.ui.pageSettingsPageId = null;
  }, { historyLabel: "duplicate-page" });
  showToast("Page duplicated as editable copy");
}

function deletePage(pageId) {
  const state = store.getState();
  if (state.pages.length <= 1) {
    showToast("At least one page is required");
    return;
  }

  store.commit((draft) => {
    const index = draft.pages.findIndex((page) => page.id === pageId);
    if (index < 0) return;
    draft.pages.splice(index, 1);
    const next = draft.pages[Math.max(0, index - 1)] || draft.pages[0] || null;
    draft.ui.selectedPageId = next?.id || null;
    draft.ui.selectedComponentId = null;
    draft.ui.activePageId = next?.id || null;
    if (draft.ui.pageSettingsPageId === pageId) {
      draft.ui.pageSettingsPageId = null;
    }
  }, { historyLabel: "delete-page" });
  showToast("Page removed");
}

function unlockPage(pageId, historyLabel = "unlock-page") {
  const current = findPage(store.getState(), pageId);
  if (!current || current.layoutMode === "free") return false;

  store.commit((draft) => {
    const page = findPage(draft, pageId);
    if (!page) return;
    unlockPageModel(page);
  }, { historyLabel });
  showToast("Page unlocked for free editing");
  return true;
}

function pageLabel(page) {
  return String(page?.title || page?.templateId || "Untitled Page").trim() || "Untitled Page";
}

function announcePageReorder(message) {
  const live = document.getElementById("pageReorderLive");
  if (!(live instanceof HTMLElement)) return;
  live.textContent = "";
  requestAnimationFrame(() => {
    live.textContent = message;
  });
}

function focusPageDragHandle(pageId) {
  if (!pageId) return;
  requestAnimationFrame(() => {
    const selector = `[data-page-drag-handle][data-page-id="${pageId}"]`;
    const target = refs.palette?.querySelector(selector);
    if (target instanceof HTMLElement) {
      target.focus();
    }
  });
}

function reorderPageToIndex(pageId, targetIndex, options = {}) {
  const { historyLabel = "reorder-page", announce = true } = options;
  const state = store.getState();
  const sourceIndex = state.pages.findIndex((page) => page.id === pageId);
  if (sourceIndex < 0) return false;
  const boundedTarget = Math.max(0, Math.min(Number(targetIndex) || 0, state.pages.length - 1));
  if (boundedTarget === sourceIndex) return false;

  let moved = false;
  store.commit((draft) => {
    const index = draft.pages.findIndex((page) => page.id === pageId);
    if (index < 0) return;
    const nextIndex = Math.max(0, Math.min(Number(targetIndex) || 0, draft.pages.length - 1));
    if (nextIndex === index) return;
    const [page] = draft.pages.splice(index, 1);
    draft.pages.splice(nextIndex, 0, page);
    moved = true;
  }, { historyLabel });

  if (moved && announce) {
    const next = store.getState();
    const index = next.pages.findIndex((page) => page.id === pageId);
    const page = next.pages[index];
    announcePageReorder(`Moved ${pageLabel(page)} to position ${index + 1} of ${next.pages.length}.`);
  }
  return moved;
}

function movePage(pageId, direction, options = {}) {
  const state = store.getState();
  const index = state.pages.findIndex((page) => page.id === pageId);
  if (index < 0) return false;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= state.pages.length) return false;
  return reorderPageToIndex(pageId, nextIndex, { historyLabel: "move-page", announce: options.announce !== false });
}

function clearPageReorderFloating() {
  if (pageReorderRuntime.floatingEl) {
    pageReorderRuntime.floatingEl.remove();
    pageReorderRuntime.floatingEl = null;
  }
}

function stopPageReorderAutoScroll() {
  if (pageReorderRuntime.autoScrollFrame != null) {
    cancelAnimationFrame(pageReorderRuntime.autoScrollFrame);
    pageReorderRuntime.autoScrollFrame = null;
  }
}

function resetPageReorderRuntime(options = {}) {
  const restoreSource = options.restoreSource !== false;
  stopPageReorderAutoScroll();
  clearPageReorderFloating();
  if (pageReorderRuntime.onPointerMove) {
    window.removeEventListener("pointermove", pageReorderRuntime.onPointerMove, true);
  }
  if (pageReorderRuntime.onPointerUp) {
    window.removeEventListener("pointerup", pageReorderRuntime.onPointerUp, true);
    window.removeEventListener("pointercancel", pageReorderRuntime.onPointerUp, true);
  }
  if (pageReorderRuntime.placeholderEl) {
    pageReorderRuntime.placeholderEl.remove();
  }
  if (restoreSource && pageReorderRuntime.sourceRowEl) {
    pageReorderRuntime.sourceRowEl.style.removeProperty("display");
    pageReorderRuntime.sourceRowEl.style.removeProperty("visibility");
    pageReorderRuntime.sourceRowEl.classList.remove("is-drag-source");
  }
  pageReorderRuntime.isActive = false;
  pageReorderRuntime.draggingPageId = null;
  pageReorderRuntime.sourceIndex = -1;
  pageReorderRuntime.targetIndex = -1;
  pageReorderRuntime.sourceRowEl = null;
  pageReorderRuntime.placeholderEl = null;
  pageReorderRuntime.listEl = null;
  pageReorderRuntime.scrollContainerEl = null;
  pageReorderRuntime.pointerClientY = 0;
  pageReorderRuntime.pointerId = null;
  pageReorderRuntime.pointerOffsetY = 0;
  pageReorderRuntime.pointerOffsetX = 0;
  pageReorderRuntime.onPointerMove = null;
  pageReorderRuntime.onPointerUp = null;
}

function pageRowsForReorder(listEl) {
  if (!(listEl instanceof HTMLElement)) return [];
  return [...listEl.querySelectorAll("[data-page-row]")].filter((row) => row instanceof HTMLElement);
}

function pageRowsWithoutSource(listEl, sourceRowEl) {
  return pageRowsForReorder(listEl).filter((row) => row !== sourceRowEl && row.style.display !== "none");
}

function createPageFloatingRow(row, startRect, pointerX, pointerY) {
  const floating = row.cloneNode(true);
  floating.classList.add("drawer-list-row--floating", "no-print");
  floating.removeAttribute("data-page-row");
  floating.style.width = `${Math.round(startRect.width)}px`;
  floating.style.left = `${Math.round(startRect.left)}px`;
  floating.style.top = `${Math.round(startRect.top)}px`;
  document.body.appendChild(floating);
  pageReorderRuntime.pointerOffsetX = pointerX - startRect.left;
  pageReorderRuntime.pointerOffsetY = pointerY - startRect.top;
  return floating;
}

function moveFloatingRow(pointerX, pointerY) {
  const floating = pageReorderRuntime.floatingEl;
  if (!(floating instanceof HTMLElement)) return;
  const left = pointerX - pageReorderRuntime.pointerOffsetX;
  const top = pointerY - pageReorderRuntime.pointerOffsetY;
  floating.style.left = `${Math.round(left)}px`;
  floating.style.top = `${Math.round(top)}px`;
}

function createPagePlaceholder(heightPx) {
  const placeholder = document.createElement("div");
  placeholder.className = "drawer-list-placeholder";
  placeholder.innerHTML = '<span>Drop page here</span>';
  placeholder.style.height = `${Math.max(40, Math.round(heightPx || 52))}px`;
  return placeholder;
}

function animatePageRowsFlip(listEl, mutate, excluded = new Set()) {
  const beforeRows = pageRowsForReorder(listEl).filter(
    (row) => !excluded.has(row) && row.style.display !== "none",
  );
  const before = new Map(beforeRows.map((row) => [row, row.getBoundingClientRect().top]));
  mutate();
  const afterRows = pageRowsForReorder(listEl).filter(
    (row) => !excluded.has(row) && row.style.display !== "none",
  );
  afterRows.forEach((row) => {
    const prevTop = before.get(row);
    if (!Number.isFinite(prevTop)) return;
    const nextTop = row.getBoundingClientRect().top;
    const delta = prevTop - nextTop;
    if (Math.abs(delta) < 0.5) return;
    row.classList.add("is-shifting");
    row.style.transition = "none";
    row.style.transform = `translateY(${delta}px)`;
    row.getBoundingClientRect();
    row.style.transition = `transform ${PAGE_REORDER_SHIFT_MS}ms ease`;
    row.style.transform = "translateY(0)";
    window.setTimeout(() => {
      row.style.removeProperty("transition");
      row.style.removeProperty("transform");
      row.classList.remove("is-shifting");
    }, PAGE_REORDER_SHIFT_MS + 24);
  });
}

function movePlaceholderToIndex(listEl, sourceRowEl, placeholderEl, index) {
  if (!(listEl instanceof HTMLElement) || !(placeholderEl instanceof HTMLElement)) return -1;
  const rows = pageRowsWithoutSource(listEl, sourceRowEl);
  const bounded = Math.max(0, Math.min(index, rows.length));
  const move = () => {
    if (bounded >= rows.length) {
      listEl.appendChild(placeholderEl);
      return;
    }
    listEl.insertBefore(placeholderEl, rows[bounded]);
  };
  if (placeholderEl.parentElement === listEl) {
    animatePageRowsFlip(listEl, move, new Set([sourceRowEl]));
  } else {
    move();
  }
  return bounded;
}

function calculateDropIndex(listEl, sourceRowEl, clientY) {
  const rows = pageRowsWithoutSource(listEl, sourceRowEl);
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += 1) {
    const rect = rows[i].getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (clientY < midpoint) return i;
  }
  return rows.length;
}

function updatePageReorderFromPointer(clientY) {
  if (!pageReorderRuntime.isActive || !(pageReorderRuntime.listEl instanceof HTMLElement)) return;
  pageReorderRuntime.pointerClientY = clientY;
  const index = calculateDropIndex(
    pageReorderRuntime.listEl,
    pageReorderRuntime.sourceRowEl,
    clientY,
  );
  if (index === pageReorderRuntime.targetIndex) return;
  pageReorderRuntime.targetIndex = movePlaceholderToIndex(
    pageReorderRuntime.listEl,
    pageReorderRuntime.sourceRowEl,
    pageReorderRuntime.placeholderEl,
    index,
  );
}

function runPageReorderAutoScroll() {
  if (!pageReorderRuntime.isActive || !(pageReorderRuntime.scrollContainerEl instanceof HTMLElement)) {
    stopPageReorderAutoScroll();
    return;
  }
  const container = pageReorderRuntime.scrollContainerEl;
  const rect = container.getBoundingClientRect();
  let velocity = 0;
  const fromTop = pageReorderRuntime.pointerClientY - rect.top;
  const fromBottom = rect.bottom - pageReorderRuntime.pointerClientY;

  if (fromTop < PAGE_REORDER_AUTO_SCROLL_EDGE_PX) {
    const ratio = Math.max(0, Math.min(1, (PAGE_REORDER_AUTO_SCROLL_EDGE_PX - fromTop) / PAGE_REORDER_AUTO_SCROLL_EDGE_PX));
    velocity = -Math.ceil(PAGE_REORDER_AUTO_SCROLL_MAX_PX * ratio);
  } else if (fromBottom < PAGE_REORDER_AUTO_SCROLL_EDGE_PX) {
    const ratio = Math.max(0, Math.min(1, (PAGE_REORDER_AUTO_SCROLL_EDGE_PX - fromBottom) / PAGE_REORDER_AUTO_SCROLL_EDGE_PX));
    velocity = Math.ceil(PAGE_REORDER_AUTO_SCROLL_MAX_PX * ratio);
  }

  if (velocity !== 0) {
    const previous = container.scrollTop;
    container.scrollTop += velocity;
    if (container.scrollTop !== previous) {
      updatePageReorderFromPointer(pageReorderRuntime.pointerClientY);
    }
  }

  pageReorderRuntime.autoScrollFrame = requestAnimationFrame(runPageReorderAutoScroll);
}

function startPageReorderAutoScroll() {
  if (pageReorderRuntime.autoScrollFrame != null) return;
  pageReorderRuntime.autoScrollFrame = requestAnimationFrame(runPageReorderAutoScroll);
}

function bindPageReorderDnD(root, options = {}) {
  const reorderEnabled = options.reorderEnabled === true;
  const listEl = root.querySelector("[data-page-list]");
  const handles = [...root.querySelectorAll("[data-page-drag-handle]")];
  if (!(listEl instanceof HTMLElement)) return;

  const clearSearchHint = root.querySelector("[data-page-reorder-hint]");
  if (clearSearchHint instanceof HTMLElement) {
    clearSearchHint.hidden = reorderEnabled;
  }

  handles.forEach((handle) => {
    if (!(handle instanceof HTMLElement)) return;
    const row = handle.closest("[data-page-row]");
    if (!(row instanceof HTMLElement)) return;
    const pageId = row.dataset.pageId;
    if (!pageId) return;
    handle.setAttribute("draggable", "false");
    handle.setAttribute("aria-disabled", reorderEnabled ? "false" : "true");

    handle.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });

    handle.addEventListener("pointerdown", (event) => {
      if (!reorderEnabled || event.button !== 0) return;
      const state = store.getState();
      const sourceIndex = state.pages.findIndex((page) => page.id === pageId);
      if (sourceIndex < 0) return;

      event.preventDefault();
      resetPageReorderRuntime();

      const rowRect = row.getBoundingClientRect();
      const pointerX = event.clientX || rowRect.left + rowRect.width / 2;
      const pointerY = event.clientY || rowRect.top + rowRect.height / 2;
      const placeholder = createPagePlaceholder(rowRect.height);
      const floating = createPageFloatingRow(row, rowRect, pointerX, pointerY);
      pageReorderRuntime.isActive = true;
      pageReorderRuntime.draggingPageId = pageId;
      pageReorderRuntime.sourceIndex = sourceIndex;
      pageReorderRuntime.targetIndex = sourceIndex;
      pageReorderRuntime.sourceRowEl = row;
      pageReorderRuntime.placeholderEl = placeholder;
      pageReorderRuntime.listEl = listEl;
      pageReorderRuntime.scrollContainerEl = root.closest(".panel-body") || root;
      pageReorderRuntime.floatingEl = floating;
      pageReorderRuntime.pointerClientY = pointerY;
      pageReorderRuntime.pointerId = event.pointerId;

      row.classList.add("is-drag-source");
      row.style.display = "none";
      listEl.insertBefore(placeholder, row);
      moveFloatingRow(pointerX, pointerY);
      updatePageReorderFromPointer(pointerY);

      const onPointerMove = (moveEvent) => {
        if (!pageReorderRuntime.isActive) return;
        if (moveEvent.pointerId !== pageReorderRuntime.pointerId) return;
        moveEvent.preventDefault();
        moveFloatingRow(moveEvent.clientX, moveEvent.clientY);
        updatePageReorderFromPointer(moveEvent.clientY);
      };

      const onPointerUp = (upEvent) => {
        if (!pageReorderRuntime.isActive) return;
        if (upEvent.pointerId !== pageReorderRuntime.pointerId) return;
        upEvent.preventDefault();
        const draggedPageId = pageReorderRuntime.draggingPageId;
        const targetIndex = pageReorderRuntime.targetIndex;
        const moved = reorderPageToIndex(draggedPageId, targetIndex, { historyLabel: "reorder-page", announce: true });
        resetPageReorderRuntime();
        if (moved) {
          focusPageDragHandle(draggedPageId);
        }
      };

      pageReorderRuntime.onPointerMove = onPointerMove;
      pageReorderRuntime.onPointerUp = onPointerUp;
      window.addEventListener("pointermove", onPointerMove, true);
      window.addEventListener("pointerup", onPointerUp, true);
      window.addEventListener("pointercancel", onPointerUp, true);
      startPageReorderAutoScroll();

      if (typeof handle.setPointerCapture === "function") {
        try {
          handle.setPointerCapture(event.pointerId);
        } catch (_error) {
          // Pointer capture can fail in some browser edge-cases; drag still works via window listeners.
        }
      }
    });
  });
}

function addComponent(pageId, type, position, options = {}) {
  const current = store.getState();
  const currentPage = findPage(current, pageId);
  if (!currentPage) return;
  const wasTemplateLocked = currentPage.layoutMode === "template";

  store.commit((draft) => {
    const page = findPage(draft, pageId);
    if (!page) return;
    if (page.layoutMode === "template") {
      unlockPageModel(page);
    }

    const component = buildComponentFromType(type, options);
    applyThemeDefaultsToComponent(component, page.theme);
    const density = Math.max(1, Number(draft.project?.gridDensity) || 1);
    if (density > 1) {
      scaleComponentToDensity(component, density);
    }
    setComponentLayout(component, draft.project.printProfile, {
      colStart: position?.colStart ?? 1,
      rowStart: position?.rowStart ?? 1,
    });

    page.components.push(component);
    draft.ui.selectedPageId = page.id;
    draft.ui.selectedComponentId = component.id;
    draft.ui.activePageId = page.id;
  }, { historyLabel: "add-component" });

  if (wasTemplateLocked) {
    showToast("Template unlocked and component added");
    scheduleDebouncedAutoReflow("add-component");
    return;
  }
  showToast("Component added");
  scheduleDebouncedAutoReflow("add-component");
}

function buildUnlockedComponentClone(sourceComponent, profileId, options = {}) {
  const copy = deepClone(sourceComponent);
  copy.id = makeComponentId();
  if (options.appendCopySuffix) {
    copy.title = `${copy.title || kebabToTitle(copy.type)} (copy)`;
  }
  copy.slotId = null;
  copy.layoutConstraints = {
    ...(copy.layoutConstraints || {}),
    locked: false,
    allowedTypes: null,
  };
  const layout = getComponentLayout(copy, profileId);
  const offsetCol = Number.isFinite(options.offsetCol) ? options.offsetCol : 1;
  const offsetRow = Number.isFinite(options.offsetRow) ? options.offsetRow : 1;
  setComponentLayout(copy, profileId, {
    colStart: Math.min(24, Math.max(1, layout.colStart + offsetCol)),
    rowStart: Math.min(800, Math.max(1, layout.rowStart + offsetRow)),
  });
  return copy;
}

function copySelectedComponentToClipboard() {
  const state = store.getState();
  const { page, component } = selectedEntities(state);
  if (!page || !component) return false;
  componentClipboard = {
    sourcePageId: page.id,
    component: deepClone(component),
  };
  showToast("Component copied");
  return true;
}

function pasteComponentFromClipboard(targetPageId = null) {
  if (!componentClipboard?.component) {
    showToast("Copy a component first");
    return false;
  }
  const state = store.getState();
  const pageId = targetPageId || state.ui.selectedPageId || state.ui.activePageId || state.pages[0]?.id;
  if (!pageId) return false;

  let pastedComponentId = null;
  let unlockedTemplate = false;
  store.commit((draft) => {
    const page = findPage(draft, pageId);
    if (!page) return;
    if (page.layoutMode === "template") {
      unlockPageModel(page);
      unlockedTemplate = true;
    }
    const copy = buildUnlockedComponentClone(componentClipboard.component, draft.project.printProfile, {
      offsetCol: 1,
      offsetRow: 1,
      appendCopySuffix: false,
    });
    page.components.push(copy);
    pastedComponentId = copy.id;
    draft.ui.selectedPageId = page.id;
    draft.ui.selectedComponentId = copy.id;
    draft.ui.activePageId = page.id;
    draft.ui.pendingDeleteComponentId = null;
  }, { historyLabel: "paste-component" });

  if (!pastedComponentId) return false;
  showToast(unlockedTemplate ? "Template unlocked and component pasted" : "Component pasted");
  scheduleDebouncedAutoReflow("paste-component");
  return true;
}

function duplicateComponent(pageId, componentId) {
  const current = store.getState();
  const page = findPage(current, pageId);
  const component = findComponent(page, componentId);
  if (!component) return;

  store.commit((draft) => {
    const page = findPage(draft, pageId);
    const component = findComponent(page, componentId);
    if (!component) return;

    const copy = buildUnlockedComponentClone(component, draft.project.printProfile, {
      offsetCol: 1,
      offsetRow: 1,
      appendCopySuffix: true,
    });

    page.components.push(copy);
    draft.ui.selectedPageId = pageId;
    draft.ui.selectedComponentId = copy.id;
    draft.ui.activePageId = pageId;
    draft.ui.pendingDeleteComponentId = null;
  }, { historyLabel: "duplicate-component" });
  showToast("Component duplicated");
  scheduleDebouncedAutoReflow("duplicate-component");
}

function deleteComponent(pageId, componentId) {
  const current = store.getState();
  const page = findPage(current, pageId);
  const component = findComponent(page, componentId);
  if (!component) return;
  if (component.layoutConstraints?.locked) {
    showToast("Locked template components cannot be deleted.");
    return;
  }

  store.commit((draft) => {
    const page = findPage(draft, pageId);
    if (!page) return;
    const index = page.components.findIndex((component) => component.id === componentId);
    if (index < 0) return;
    page.components.splice(index, 1);
    if (draft.ui.selectedComponentId === componentId) {
      draft.ui.selectedComponentId = null;
    }
    draft.ui.pendingDeleteComponentId = null;
  }, { historyLabel: "delete-component" });
  showToast("Component deleted");
  scheduleDebouncedAutoReflow("delete-component");
}

function requestOrConfirmDeleteComponent(pageId, componentId, confirmed = false) {
  const state = store.getState();
  const page = findPage(state, pageId);
  const component = findComponent(page, componentId);
  if (!page || !component) return;
  if (component.layoutConstraints?.locked) {
    showToast("Locked template components cannot be deleted.");
    return;
  }

  const pending = state.ui.pendingDeleteComponentId === componentId;
  if (!confirmed && !pending) {
    store.commit((draft) => {
      draft.ui.selectedPageId = pageId;
      draft.ui.selectedComponentId = componentId;
      draft.ui.activePageId = pageId;
      draft.ui.pendingDeleteComponentId = componentId;
    }, { skipHistory: true });
    showToast("Click trash again to delete component");
    return;
  }
  deleteComponent(pageId, componentId);
}

function toggleComponentLock(pageId, componentId) {
  const current = store.getState();
  const page = findPage(current, pageId);
  const component = findComponent(page, componentId);
  if (!page || !component) return;

  let unlockedTemplate = false;
  const nextLocked = !Boolean(component.layoutConstraints?.locked);

  store.commit((draft) => {
    const targetPage = findPage(draft, pageId);
    const target = findComponent(targetPage, componentId);
    if (!targetPage || !target) return;

    if (targetPage.layoutMode === "template" && !nextLocked) {
      unlockPageModel(targetPage);
      unlockedTemplate = true;
    }

    if (!target.layoutConstraints || typeof target.layoutConstraints !== "object") {
      target.layoutConstraints = {};
    }

    target.layoutConstraints.locked = nextLocked;
    if (!nextLocked) {
      target.layoutConstraints.allowedTypes = null;
      target.slotId = null;
    }
  }, { historyLabel: "toggle-component-lock" });

  if (nextLocked) {
    showToast("Component locked");
    return;
  }
  if (unlockedTemplate) {
    showToast("Page unlocked and component unlocked");
    return;
  }
  showToast("Component unlocked");
}

function moveComponent(sourcePageId, targetPageId, componentId, position) {
  const current = store.getState();
  const sourceCurrent = findPage(current, sourcePageId);
  const targetCurrent = findPage(current, targetPageId);
  const currentComponent = findComponent(sourceCurrent, componentId);
  if (!sourceCurrent || !targetCurrent || !currentComponent) return;
  if (currentComponent.layoutConstraints?.locked) {
    showToast("Locked template components cannot be moved.");
    return;
  }
  const targetWasTemplateLocked = targetCurrent.layoutMode === "template";

  store.commit((draft) => {
    const source = findPage(draft, sourcePageId);
    const target = findPage(draft, targetPageId);
    if (!source || !target) return;

    const componentIndex = source.components.findIndex((component) => component.id === componentId);
    if (componentIndex < 0) return;

    const component = source.components[componentIndex];

    source.components.splice(componentIndex, 1);
    if (target.layoutMode === "template") {
      unlockPageModel(target);
    }
    setComponentLayout(component, draft.project.printProfile, {
      colStart: position.colStart,
      rowStart: position.rowStart,
    });
    target.components.push(component);

    draft.ui.selectedPageId = target.id;
    draft.ui.selectedComponentId = component.id;
    draft.ui.activePageId = target.id;
  }, { historyLabel: "move-component" });
  if (targetWasTemplateLocked) {
    showToast("Target page unlocked for editing");
  }
}

function updatePage(pageId, patch, historyLabel = "update-page") {
  store.commit((draft) => {
    const page = findPage(draft, pageId);
    if (!page) return;
    const syncTitle = Object.prototype.hasOwnProperty.call(patch || {}, "title");
    Object.assign(page, patch);
    enforcePageContracts(page, { syncTitle });
  }, { historyLabel });
  if (!["grid", "page-mode", "page-full-bleed"].includes(historyLabel)) {
    scheduleDebouncedAutoReflow(`page:${historyLabel}`);
  }
}

function updateComponent(pageId, componentId, patch, historyLabel = "update-component") {
  store.commit((draft) => {
    const page = findPage(draft, pageId);
    const component = findComponent(page, componentId);
    if (!component) return;
    Object.assign(component, patch);
  }, { historyLabel });
  scheduleDebouncedAutoReflow(`component:${historyLabel}`);
}

function updateComponentLayout(pageId, componentId, patch) {
  store.commit((draft) => {
    const page = findPage(draft, pageId);
    const component = findComponent(page, componentId);
    if (!component) return;
    if (component.layoutConstraints?.locked) return;

    setComponentLayout(component, draft.project.printProfile, patch);
  }, { historyLabel: "layout" });
}

function resizeComponent(pageId, componentId, patch) {
  updateComponentLayout(pageId, componentId, patch);
}

function nudgeComponent(pageId, componentId, action) {
  store.commit((draft) => {
    const page = findPage(draft, pageId);
    const component = findComponent(page, componentId);
    if (!component || component.layoutConstraints?.locked) return;

    const layout = getComponentLayout(component, draft.project.printProfile);
    const patch = {};

    switch (action) {
      case "move-left":
        patch.colStart = layout.colStart - 1;
        break;
      case "move-right":
        patch.colStart = layout.colStart + 1;
        break;
      case "move-up":
        patch.rowStart = layout.rowStart - 1;
        break;
      case "move-down":
        patch.rowStart = layout.rowStart + 1;
        break;
      case "grow-width":
        patch.colSpan = layout.colSpan + 1;
        break;
      case "shrink-width":
        patch.colSpan = layout.colSpan - 1;
        break;
      case "grow-height":
        patch.rowSpan = layout.rowSpan + 1;
        break;
      case "shrink-height":
        patch.rowSpan = layout.rowSpan - 1;
        break;
      default:
        return;
    }

    setComponentLayout(component, draft.project.printProfile, patch);
  }, { historyLabel: "layout-adjust" });
}

function measureNaturalHeight(contentNode) {
  if (!(contentNode instanceof HTMLElement)) return 0;
  const prev = {
    height: contentNode.style.height,
    minHeight: contentNode.style.minHeight,
    maxHeight: contentNode.style.maxHeight,
    overflow: contentNode.style.overflow,
  };
  contentNode.style.height = "auto";
  contentNode.style.minHeight = "0";
  contentNode.style.maxHeight = "none";
  contentNode.style.overflow = "visible";
  const measured = Math.ceil(contentNode.scrollHeight);
  contentNode.style.height = prev.height;
  contentNode.style.minHeight = prev.minHeight;
  contentNode.style.maxHeight = prev.maxHeight;
  contentNode.style.overflow = prev.overflow;
  return measured;
}

function measureNaturalSize(contentNode) {
  if (!(contentNode instanceof HTMLElement)) {
    return {
      height: 0,
      clientWidth: 0,
      scrollWidth: 0,
      horizontalOverflow: false,
    };
  }
  const height = measureNaturalHeight(contentNode);
  const clientWidth = Math.max(0, Math.ceil(contentNode.clientWidth));
  const scrollWidth = Math.max(clientWidth, Math.ceil(contentNode.scrollWidth));
  const horizontalOverflow = scrollWidth > clientWidth + 1;
  return {
    height,
    clientWidth,
    scrollWidth,
    horizontalOverflow,
  };
}

function autoFitComponentHeight(pageId, componentId, contentRef) {
  let rowPx = 10;
  let gapPx = 6;
  let rowsAvailable = 1;
  let measured = 0;

  const node = refs.pages?.querySelector(
    `[data-page-id="${pageId}"] [data-component-id="${componentId}"]`,
  );
  const pageBody = node?.closest?.(".page-body");
  if (pageBody) {
    const metrics = readGridMetrics(pageBody);
    rowPx = metrics.row;
    gapPx = metrics.gap;
    rowsAvailable = metrics.rowsAvailable;
  }
  if (contentRef instanceof HTMLElement) {
    measured = measureNaturalHeight(contentRef);
  } else {
    measured = Math.max(0, toNumber(contentRef, 0));
  }

  store.commit((draft) => {
    const page = findPage(draft, pageId);
    const component = findComponent(page, componentId);
    if (!component || component.layoutConstraints?.locked) return;

    const layout = getComponentLayout(component, draft.project.printProfile);
    const minRowSpan = Math.max(1, Number(component.layoutConstraints?.minRowSpan) || 1);
    const maxByConstraint = Math.max(minRowSpan, Number(component.layoutConstraints?.maxRowSpan) || 400);
    const maxByPage = Math.max(minRowSpan, rowsAvailable - layout.rowStart + 1);
    const maxRowSpan = Math.max(minRowSpan, Math.min(maxByConstraint, maxByPage));
    const neededRowSpan = Math.max(1, Math.ceil((measured + gapPx + 6) / (rowPx + gapPx)));
    const nextRowSpan = Math.max(minRowSpan, Math.min(maxRowSpan, neededRowSpan));
    setComponentLayout(component, draft.project.printProfile, { rowSpan: nextRowSpan });
  }, { historyLabel: "auto-fit-height" });
}

function resetComponentToDefault(pageId, componentId) {
  let didReset = false;
  store.commit((draft) => {
    const page = findPage(draft, pageId);
    const component = findComponent(page, componentId);
    if (!component || component.layoutConstraints?.locked) return;
    didReset = resetComponentToDefaults(component);
    if (didReset) {
      draft.ui.pendingDeleteComponentId = null;
    }
  }, { historyLabel: "reset-component" });
  if (didReset) {
    showToast("Component reset");
  }
}

function updateWarnings(nextWarnings) {
  const current = store.getState().ui.warnings || {};
  if (JSON.stringify(current) === JSON.stringify(nextWarnings || {})) return;
  store.commit((draft) => {
    draft.ui.warnings = nextWarnings;
  }, { skipHistory: true });
}

function cssColorToHex(value, fallback = "#3c64ff") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (text.startsWith("#")) return text;
  const rgb = text.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) return fallback;
  const [r, g, b] = rgb[1]
    .split(",")
    .slice(0, 3)
    .map((part) => Math.max(0, Math.min(255, Number.parseInt(part.trim(), 10) || 0)));
  return `#${[r, g, b].map((num) => num.toString(16).padStart(2, "0")).join("")}`;
}

function cssVarHex(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return cssColorToHex(value, fallback);
}

function pxNumber(value, fallback) {
  const n = Number.parseFloat(String(value || "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function readGridMetrics(pageBodyEl) {
  const styles = getComputedStyle(pageBodyEl);
  const rect = pageBodyEl.getBoundingClientRect();
  const cols = Math.max(1, Number.parseInt(styles.getPropertyValue("--grid-cols"), 10) || 24);
  const gap = Math.max(0, pxNumber(styles.getPropertyValue("--grid-gap"), 6));
  const row = Math.max(1, pxNumber(styles.getPropertyValue("--grid-row"), 10));
  const colW = (rect.width - gap * (cols - 1)) / cols;
  const cellW = colW + gap;
  const cellH = row + gap;
  const bodyHeight = pageBodyEl.clientHeight || rect.height;
  const rowsAvailable = Math.max(1, Math.floor((bodyHeight + gap) / cellH));
  return {
    rect,
    cols,
    gap,
    row,
    colW,
    cellW,
    cellH,
    rowsAvailable,
  };
}

function clampMoveToGrid(rawColStart, rawRowStart, colSpan, rowSpan, metrics) {
  const maxColStart = Math.max(1, metrics.cols - colSpan + 1);
  const maxRowStart = Math.max(1, metrics.rowsAvailable - rowSpan + 1);
  return {
    colStart: Math.max(1, Math.min(maxColStart, rawColStart)),
    rowStart: Math.max(1, Math.min(maxRowStart, rawRowStart)),
  };
}

function withReflowSuspended(callback) {
  reflowSuspendCount += 1;
  try {
    return callback();
  } finally {
    reflowSuspendCount = Math.max(0, reflowSuspendCount - 1);
  }
}

function scheduleDebouncedAutoReflow(reason = "content-change") {
  if (reflowSuspendCount > 0) return;
  pendingAutoReflowReason = reason;
  reflowDebounce();
}

function normalizeAutoFitRequest(options = {}) {
  const candidateTrigger = String(options.trigger || "explicit").trim();
  const trigger = AUTO_FIT_TRIGGERS.has(candidateTrigger) ? candidateTrigger : "explicit";
  return {
    trigger,
    reason: String(options.reason || trigger),
  };
}

function isAutoFitRunActive(runId) {
  return autoFitRuntime.runId === runId;
}

function shouldShowAutoFitOverlay(trigger) {
  return trigger !== "debounced";
}

function setAutoFitOverlay({ visible = false, phase = "prepare", profileLabel = "" } = {}) {
  if (!refs.autoFitOverlay) return;
  if (visible) {
    refs.autoFitOverlay.hidden = false;
    refs.autoFitOverlay.dataset.phase = phase;
    if (refs.autoFitPhase) {
      refs.autoFitPhase.textContent = AUTO_FIT_PHASE_LABELS[phase] || AUTO_FIT_PHASE_LABELS.prepare;
    }
    if (refs.autoFitProfile) {
      refs.autoFitProfile.textContent = profileLabel ? `Profile: ${profileLabel}` : "";
    }
    return;
  }
  refs.autoFitOverlay.hidden = true;
  refs.autoFitOverlay.dataset.phase = "idle";
}

function markAutoFitPhase(runId, request, phase, profileLabel) {
  if (!isAutoFitRunActive(runId)) return false;
  autoFitRuntime.phase = phase;
  if (shouldShowAutoFitOverlay(request.trigger)) {
    document.body.classList.add("auto-fit-busy");
    setAutoFitOverlay({
      visible: true,
      phase,
      profileLabel,
    });
  } else {
    setAutoFitOverlay({ visible: false });
    document.body.classList.remove("auto-fit-busy");
  }
  return true;
}

function waitForAnimationFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(resolve);
  });
}

async function waitForAnimationFrames(count = 1, runId = null) {
  const total = Math.max(1, Number(count) || 1);
  for (let index = 0; index < total; index += 1) {
    await waitForAnimationFrame();
    if (runId != null && !isAutoFitRunActive(runId)) {
      return false;
    }
  }
  return true;
}

async function waitForFontsReady(timeoutMs = AUTO_FIT_SETTLE_DEFAULTS.fontsTimeoutMs, runId = null) {
  if (!document?.fonts?.ready || typeof document.fonts.ready.then !== "function") {
    return { supported: false, timedOut: false };
  }
  let timedOut = false;
  let timeoutId = null;
  await Promise.race([
    document.fonts.ready.catch(() => {}),
    new Promise((resolve) => {
      timeoutId = window.setTimeout(() => {
        timedOut = true;
        resolve();
      }, Math.max(0, Number(timeoutMs) || 0));
    }),
  ]);
  if (timeoutId != null) {
    window.clearTimeout(timeoutId);
  }
  if (runId != null && !isAutoFitRunActive(runId)) {
    return { supported: true, timedOut, cancelled: true };
  }
  return { supported: true, timedOut };
}

function captureLayoutSettleSnapshot() {
  const sample = [];
  if (!refs.pages) return sample;
  refs.pages.querySelectorAll(".page[data-page-id]").forEach((pageNode) => {
    const pageId = pageNode.dataset.pageId;
    if (!pageId) return;
    const pageBody = pageNode.querySelector(".page-body");
    if (!(pageBody instanceof HTMLElement)) return;
    const rect = pageBody.getBoundingClientRect();
    const metrics = readGridMetrics(pageBody);
    sample.push({
      pageId,
      width: rect.width,
      height: rect.height,
      rowsAvailable: metrics.rowsAvailable,
    });
  });
  sample.sort((left, right) => left.pageId.localeCompare(right.pageId));
  return sample;
}

function areLayoutSamplesStable(previous, current, tolerancePx = 1) {
  if (!Array.isArray(previous) || !Array.isArray(current)) return false;
  if (previous.length !== current.length) return false;
  for (let index = 0; index < current.length; index += 1) {
    const left = previous[index];
    const right = current[index];
    if (!left || !right) return false;
    if (left.pageId !== right.pageId) return false;
    if (Math.abs(left.width - right.width) > tolerancePx) return false;
    if (Math.abs(left.height - right.height) > tolerancePx) return false;
    if (Math.abs(left.rowsAvailable - right.rowsAvailable) > 1) return false;
  }
  return true;
}

async function waitForLayoutSettle({
  profileId,
  maxFrames = AUTO_FIT_SETTLE_DEFAULTS.maxFrames,
  timeoutMs = AUTO_FIT_SETTLE_DEFAULTS.timeoutMs,
  fontsTimeoutMs = AUTO_FIT_SETTLE_DEFAULTS.fontsTimeoutMs,
  runId = null,
} = {}) {
  const startedAt = performance.now();
  const framesLimit = Math.max(1, Number(maxFrames) || AUTO_FIT_SETTLE_DEFAULTS.maxFrames);
  const timeoutLimit = Math.max(1, Number(timeoutMs) || AUTO_FIT_SETTLE_DEFAULTS.timeoutMs);
  const fontsLimit = Math.max(0, Number(fontsTimeoutMs) || AUTO_FIT_SETTLE_DEFAULTS.fontsTimeoutMs);

  const rendered = await waitForAnimationFrames(2, runId);
  if (rendered === false) {
    return {
      profileId,
      cancelled: true,
      settled: false,
      settleTimedOut: false,
      fontsTimedOut: false,
      frames: 0,
      elapsedMs: performance.now() - startedAt,
    };
  }

  const fonts = await waitForFontsReady(fontsLimit, runId);
  if (fonts?.cancelled) {
    return {
      profileId,
      cancelled: true,
      settled: false,
      settleTimedOut: false,
      fontsTimedOut: Boolean(fonts.timedOut),
      frames: 0,
      elapsedMs: performance.now() - startedAt,
    };
  }

  let previous = captureLayoutSettleSnapshot();
  let stableFrames = 0;
  let frames = 0;

  while (frames < framesLimit) {
    const alive = await waitForAnimationFrames(1, runId);
    if (alive === false) {
      return {
        profileId,
        cancelled: true,
        settled: false,
        settleTimedOut: false,
        fontsTimedOut: Boolean(fonts?.timedOut),
        frames,
        elapsedMs: performance.now() - startedAt,
      };
    }

    const current = captureLayoutSettleSnapshot();
    stableFrames = areLayoutSamplesStable(previous, current, 1) ? stableFrames + 1 : 0;
    previous = current;
    frames += 1;
    const elapsedMs = performance.now() - startedAt;
    if (stableFrames >= 2) {
      return {
        profileId,
        settled: true,
        settleTimedOut: false,
        fontsTimedOut: Boolean(fonts?.timedOut),
        frames,
        elapsedMs,
      };
    }
    if (elapsedMs >= timeoutLimit) {
      return {
        profileId,
        settled: false,
        settleTimedOut: true,
        fontsTimedOut: Boolean(fonts?.timedOut),
        frames,
        elapsedMs,
      };
    }
  }

  return {
    profileId,
    settled: false,
    settleTimedOut: true,
    fontsTimedOut: Boolean(fonts?.timedOut),
    frames,
    elapsedMs: performance.now() - startedAt,
  };
}

function countImpossibleFitComponents(state = store.getState()) {
  let total = 0;
  for (const page of state.pages || []) {
    for (const component of page.components || []) {
      if (component?.layoutDiagnostics?.impossibleFit) {
        total += 1;
      }
    }
  }
  return total;
}

function collectAutoFitIssues(state = store.getState()) {
  const overflowCount = Object.keys(state.ui?.warnings || {}).length;
  const impossibleFitCount = countImpossibleFitComponents(state);
  return {
    overflowCount,
    impossibleFitCount,
    hasIssues: overflowCount > 0 || impossibleFitCount > 0,
  };
}

function summarizeReflowState(state = store.getState(), profileId = state?.project?.printProfile) {
  const placementByComponent = new Map();
  for (const page of state.pages || []) {
    for (const component of page.components || []) {
      const layout = getComponentLayout(component, profileId);
      placementByComponent.set(component.id, `${page.id}:${layout.colStart}:${layout.colSpan}:${layout.rowStart}:${layout.rowSpan}`);
    }
  }
  return {
    profileId,
    continuationPages: (state.pages || []).filter((page) => isAutoContinuationPage(page)).length,
    issues: collectAutoFitIssues(state),
    placementByComponent,
  };
}

function summarizeReflowDelta(before, after) {
  let movedComponents = 0;
  for (const [componentId, beforePlacement] of before.placementByComponent.entries()) {
    const afterPlacement = after.placementByComponent.get(componentId);
    if (afterPlacement && afterPlacement !== beforePlacement) {
      movedComponents += 1;
    }
  }
  return {
    movedComponents,
    continuationPages: after.continuationPages,
    continuationDelta: after.continuationPages - before.continuationPages,
    issues: after.issues,
  };
}

function shouldVerifyAutoFitTrigger(trigger) {
  return trigger === "profile-change" || trigger === "explicit" || trigger === "import" || trigger === "reset";
}

function commitAutoFitReflowPass(snapshot, { historyLabel, skipHistory, reason } = {}) {
  withReflowSuspended(() => {
    store.commit((draft) => {
      performReflowInDraft(draft, { snapshot, reason });
    }, {
      historyLabel: historyLabel || "auto-flow",
      skipHistory: Boolean(skipHistory),
    });
  });
}

async function runAutoFitTransaction(runId, options = {}) {
  const request = normalizeAutoFitRequest(options);
  const profileId = store.getState().project.printProfile;
  const profileLabel = PRINT_PROFILES[profileId]?.label || profileId;

  if (!markAutoFitPhase(runId, request, "prepare", profileLabel)) {
    return { cancelled: true };
  }

  if (!markAutoFitPhase(runId, request, "settle", profileLabel)) {
    return { cancelled: true };
  }
  const settle = await waitForLayoutSettle({
    profileId,
    runId,
    maxFrames: AUTO_FIT_SETTLE_DEFAULTS.maxFrames,
    timeoutMs: AUTO_FIT_SETTLE_DEFAULTS.timeoutMs,
    fontsTimeoutMs: AUTO_FIT_SETTLE_DEFAULTS.fontsTimeoutMs,
  });
  if (!isAutoFitRunActive(runId) || settle.cancelled) {
    return { cancelled: true };
  }

  if (!markAutoFitPhase(runId, request, "measure", profileLabel)) {
    return { cancelled: true };
  }
  const before = summarizeReflowState(store.getState(), profileId);
  const snapshot = collectReflowMeasurements(store.getState());
  if (!isAutoFitRunActive(runId)) {
    return { cancelled: true };
  }

  if (!markAutoFitPhase(runId, request, "reflow", profileLabel)) {
    return { cancelled: true };
  }
  const explicitHistory = request.trigger === "explicit";
  commitAutoFitReflowPass(snapshot, {
    historyLabel: explicitHistory ? "auto-fit-report" : "auto-flow",
    skipHistory: !explicitHistory,
    reason: request.reason,
  });
  if (!isAutoFitRunActive(runId)) {
    return { cancelled: true };
  }

  await waitForAnimationFrames(2, runId);
  if (!isAutoFitRunActive(runId)) {
    return { cancelled: true };
  }

  let verification = {
    ran: false,
    rerun: false,
    beforeIssues: collectAutoFitIssues(store.getState()),
    afterIssues: null,
  };

  if (shouldVerifyAutoFitTrigger(request.trigger)) {
    if (!markAutoFitPhase(runId, request, "verify", profileLabel)) {
      return { cancelled: true };
    }
    verification.ran = true;
    if (verification.beforeIssues.hasIssues) {
      const verifySnapshot = collectReflowMeasurements(store.getState());
      commitAutoFitReflowPass(verifySnapshot, {
        historyLabel: "auto-flow-verify",
        skipHistory: true,
        reason: `${request.reason}:verify`,
      });
      verification.rerun = true;
      await waitForAnimationFrames(2, runId);
      if (!isAutoFitRunActive(runId)) {
        return { cancelled: true };
      }
    }
  }
  verification.afterIssues = collectAutoFitIssues(store.getState());

  if (!markAutoFitPhase(runId, request, "finalize", profileLabel)) {
    return { cancelled: true };
  }

  await waitForAnimationFrames(1, runId);
  if (!isAutoFitRunActive(runId)) {
    return { cancelled: true };
  }

  const after = summarizeReflowState(store.getState(), store.getState().project.printProfile);
  const summary = summarizeReflowDelta(before, after);
  const settleWarning = settle.settleTimedOut || settle.fontsTimedOut;
  const shouldToastSummary = request.trigger !== "debounced";
  if (shouldToastSummary) {
    showToast(
      `Auto-fit complete · moved ${summary.movedComponents} · continuation pages ${summary.continuationPages} · warnings ${summary.issues.overflowCount + summary.issues.impossibleFitCount}`,
      2400,
    );
  }
  if (settleWarning && request.trigger !== "debounced") {
    showToast("Auto-fit used best available geometry after settle timeout.", 2400);
  }

  return {
    cancelled: false,
    request,
    settle,
    summary,
    verification,
  };
}

async function drainAutoFitQueue() {
  if (autoFitRuntime.running) return;
  while (autoFitRuntime.queued) {
    const request = autoFitRuntime.queued;
    autoFitRuntime.queued = null;
    const runId = autoFitRuntime.runId;
    autoFitRuntime.running = true;
    autoFitRuntime.startedAt = Date.now();
    try {
      const result = await runAutoFitTransaction(runId, request);
      if (isAutoFitRunActive(runId) && result && !result.cancelled) {
        autoFitRuntime.lastResult = result;
      }
    } catch (error) {
      console.error("Auto-fit failed", error);
      if (isAutoFitRunActive(runId)) {
        showToast("Auto-fit failed");
      }
    } finally {
      autoFitRuntime.running = false;
      if (!autoFitRuntime.queued) {
        autoFitRuntime.phase = "idle";
        setAutoFitOverlay({ visible: false });
        document.body.classList.remove("auto-fit-busy");
      }
    }
  }
}

function requestAutoFit(options = {}) {
  if (reflowSuspendCount > 0) return;
  const request = normalizeAutoFitRequest(options);
  if (request.trigger !== "debounced") {
    pendingAutoReflowReason = null;
  }
  autoFitRuntime.runId += 1;
  autoFitRuntime.queued = request;
  if (!autoFitRuntime.running) {
    void drainAutoFitQueue();
  }
}

function isAutoContinuationPage(page) {
  return Boolean(page?.isAutoContinuation && page?.continuationSourceId);
}

function isDefaultPageHeaderComponent(component) {
  return Boolean(
    component?.slotId === "default-page-title"
    || component?.isDefaultPageTitle === true,
  );
}

function componentMeasurementKey(pageId, componentId) {
  return `${String(pageId || "")}:${String(componentId || "")}`;
}

function collectReflowMeasurements(state = store.getState()) {
  const componentHeights = new Map();
  const pageMetrics = new Map();
  if (!refs.pages) {
    return { componentHeights, pageMetrics };
  }

  refs.pages.querySelectorAll(".page[data-page-id]").forEach((pageNode) => {
    const pageId = pageNode.dataset.pageId;
    if (!pageId) return;
    const pageBody = pageNode.querySelector(".page-body");
    if (pageBody instanceof HTMLElement) {
      const metrics = readGridMetrics(pageBody);
      pageMetrics.set(pageId, {
        cols: metrics.cols,
        row: metrics.row,
        gap: metrics.gap,
        rowsAvailable: metrics.rowsAvailable,
      });
    }

    pageNode.querySelectorAll(".canvas-component[data-component-id]").forEach((node) => {
      const componentId = node.dataset.componentId;
      if (!componentId) return;
      const content = node.querySelector(REFLOW_CONTENT_SELECTOR) || node;
      const measured = measureNaturalSize(content);
      componentHeights.set(componentMeasurementKey(pageId, componentId), measured);
    });
  });

  if (pageMetrics.size === 0) {
    const fallbackBody = refs.pages.querySelector(".page .page-body");
    if (fallbackBody instanceof HTMLElement) {
      const metrics = readGridMetrics(fallbackBody);
      for (const page of state.pages || []) {
        pageMetrics.set(page.id, {
          cols: metrics.cols,
          row: metrics.row,
          gap: metrics.gap,
          rowsAvailable: metrics.rowsAvailable,
        });
      }
    }
  }

  return { componentHeights, pageMetrics };
}

function getFallbackPageMetrics(snapshot, fallbackPageId = null) {
  if (fallbackPageId && snapshot.pageMetrics.has(fallbackPageId)) {
    return snapshot.pageMetrics.get(fallbackPageId);
  }
  if (snapshot.pageMetrics.size > 0) {
    return snapshot.pageMetrics.values().next().value;
  }
  return { cols: 24, row: 10, gap: 6, rowsAvailable: 120 };
}

function makeRect(layout) {
  return {
    colStart: layout.colStart,
    colEnd: layout.colStart + layout.colSpan - 1,
    rowStart: layout.rowStart,
    rowEnd: layout.rowStart + layout.rowSpan - 1,
  };
}

function rectsOverlap(a, b) {
  const colsOverlap = a.colStart <= b.colEnd && b.colStart <= a.colEnd;
  if (!colsOverlap) return false;
  return a.rowStart <= b.rowEnd && b.rowStart <= a.rowEnd;
}

function findFitRow(metrics, occupied, colStart, colSpan, rowSpan, preferredStart = 1) {
  const maxRowStart = Math.max(1, metrics.rowsAvailable - rowSpan + 1);
  const safePreferred = Math.max(1, Math.min(maxRowStart, preferredStart));
  for (let rowStart = safePreferred; rowStart <= maxRowStart; rowStart += 1) {
    const candidate = makeRect({ colStart, colSpan, rowStart, rowSpan });
    if (!occupied.some((rect) => rectsOverlap(rect, candidate))) {
      return rowStart;
    }
  }
  for (let rowStart = 1; rowStart < safePreferred; rowStart += 1) {
    const candidate = makeRect({ colStart, colSpan, rowStart, rowSpan });
    if (!occupied.some((rect) => rectsOverlap(rect, candidate))) {
      return rowStart;
    }
  }
  return null;
}

function upsertLayoutDiagnostics(component, patch = {}) {
  if (!component || typeof component !== "object") return;
  if (!component.layoutDiagnostics || typeof component.layoutDiagnostics !== "object") {
    component.layoutDiagnostics = {};
  }
  Object.assign(component.layoutDiagnostics, patch);
}

function clearLayoutDiagnostics(component) {
  if (!component || typeof component !== "object") return;
  upsertLayoutDiagnostics(component, { impossibleFit: false });
}

function createContinuationPage(basePage, existingPage = null, continuationIndex = 1) {
  const page = {
    id: existingPage?.id || `pg_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`,
    templateId: basePage.templateId || "custom",
    pageKind: PAGE_KINDS.content,
    fullBleed: typeof basePage.fullBleed === "boolean" ? basePage.fullBleed : false,
    theme: basePage.theme || "light_data",
    title: existingPage?.title || `${basePage.title || "Page"} (cont. ${continuationIndex})`,
    subtitle: basePage.subtitle || "",
    sectionId: basePage.sectionId || "Content",
    showGrid: Boolean(existingPage?.showGrid ?? basePage.showGrid),
    layoutMode: "free",
    isAutoContinuation: continuationIndex > 0,
    continuationSourceId: continuationIndex > 0 ? basePage.id : null,
    components: [],
  };
  if (continuationIndex === 0) {
    page.id = basePage.id;
    page.title = basePage.title;
    page.subtitle = basePage.subtitle || "";
    page.sectionId = basePage.sectionId || "Content";
    page.pageKind = basePage.pageKind || PAGE_KINDS.content;
    page.isAutoContinuation = false;
    page.continuationSourceId = null;
  }
  enforcePageContracts(page, { syncTitle: true });
  return page;
}

function resolveRowSpanForComponent(component, measuredHeight, metrics, profileId) {
  const layout = getComponentLayout(component, profileId);
  const minRowSpan = Math.max(1, Number(component.layoutConstraints?.minRowSpan) || 1);
  const maxByConstraint = Math.max(minRowSpan, Number(component.layoutConstraints?.maxRowSpan) || 400);
  const measured = Math.max(0, Number.isFinite(measuredHeight) ? measuredHeight : 0);
  const neededRowSpan = Math.max(1, Math.ceil((measured + metrics.gap + 6) / (metrics.row + metrics.gap)));
  const bounded = Math.max(minRowSpan, Math.min(maxByConstraint, neededRowSpan));
  return {
    bounded,
    current: Math.max(1, Number(layout.rowSpan) || 1),
    minRowSpan,
  };
}

function resolveColSpanForComponent(component, measuredSize, metrics, profileId) {
  const layout = getComponentLayout(component, profileId);
  const minColSpan = Math.max(1, Number(component.layoutConstraints?.minColSpan) || 1);
  const maxByConstraint = Math.max(minColSpan, Number(component.layoutConstraints?.maxColSpan) || metrics.cols);
  const maxColSpan = Math.max(minColSpan, Math.min(metrics.cols, maxByConstraint));
  let bounded = Math.max(minColSpan, Math.min(maxColSpan, Number(layout.colSpan) || 1));

  if (measuredSize && measuredSize.horizontalOverflow && measuredSize.clientWidth > 0) {
    const overflowRatio = measuredSize.scrollWidth / measuredSize.clientWidth;
    const needed = Math.ceil(bounded * overflowRatio);
    bounded = Math.max(bounded, Math.min(maxColSpan, needed));
  }

  return {
    bounded,
    current: Math.max(1, Number(layout.colSpan) || 1),
    minColSpan,
    maxColSpan,
  };
}

function measureComponentForReflow(snapshot, pageId, componentId, component, profileId, metrics) {
  const key = componentMeasurementKey(pageId, componentId);
  const measured = snapshot.componentHeights.get(key);
  if (measured && typeof measured === "object") {
    return {
      height: Math.max(0, Number(measured.height) || 0),
      clientWidth: Math.max(0, Number(measured.clientWidth) || 0),
      scrollWidth: Math.max(0, Number(measured.scrollWidth) || 0),
      horizontalOverflow: Boolean(measured.horizontalOverflow),
    };
  }
  if (Number.isFinite(measured) && measured > 0) {
    return {
      height: measured,
      clientWidth: 0,
      scrollWidth: 0,
      horizontalOverflow: false,
    };
  }
  const layout = getComponentLayout(component, profileId);
  return {
    height: Math.max(0, (Math.max(1, Number(layout.rowSpan) || 1) * (metrics.row + metrics.gap)) - metrics.gap - 6),
    clientWidth: 0,
    scrollWidth: 0,
    horizontalOverflow: false,
  };
}

function normalizeSelectionAfterReflow(draft) {
  if (!Array.isArray(draft.pages) || draft.pages.length === 0) {
    draft.ui.selectedPageId = null;
    draft.ui.selectedComponentId = null;
    draft.ui.activePageId = null;
    return;
  }

  const selectedPage = findPage(draft, draft.ui.selectedPageId);
  if (!selectedPage) {
    draft.ui.selectedPageId = draft.pages[0].id;
    draft.ui.activePageId = draft.pages[0].id;
    draft.ui.selectedComponentId = null;
    return;
  }

  draft.ui.activePageId = selectedPage.id;
  if (!findComponent(selectedPage, draft.ui.selectedComponentId)) {
    draft.ui.selectedComponentId = null;
  }
}

function reflowContentGroup(basePage, groupedPages, snapshot, profileId) {
  const baseMetrics = getFallbackPageMetrics(snapshot, basePage.id);
  const buckets = groupedPages.map((sourcePage, index) => {
    const page = createContinuationPage(basePage, sourcePage, index);
    const metrics = snapshot.pageMetrics.get(sourcePage.id) || baseMetrics;
    const occupied = [];
    for (const component of page.components || []) {
      clearLayoutDiagnostics(component);
      const layout = getComponentLayout(component, profileId);
      occupied.push(makeRect(layout));
    }
    return {
      page,
      metrics,
      occupied,
      continuationIndex: index,
    };
  });

  const lockedItems = [];
  const flowItems = [];
  groupedPages.forEach((sourcePage, bucketIndex) => {
    (sourcePage.components || []).forEach((component, order) => {
      if (isDefaultPageHeaderComponent(component)) return;
      clearLayoutDiagnostics(component);
      const layout = getComponentLayout(component, profileId);
      const item = { component, sourcePageId: sourcePage.id, bucketIndex, order, layout };
      if (component.layoutConstraints?.locked) {
        lockedItems.push(item);
      } else {
        flowItems.push(item);
      }
    });
  });

  function ensureBucket(index) {
    if (buckets[index]) return buckets[index];
    const existingPage = groupedPages[index] || null;
    const page = createContinuationPage(basePage, existingPage, index);
    const metrics = snapshot.pageMetrics.get(existingPage?.id || "") || baseMetrics;
    const bucket = {
      page,
      metrics,
      occupied: [],
      continuationIndex: index,
    };
    for (const component of page.components || []) {
      clearLayoutDiagnostics(component);
      bucket.occupied.push(makeRect(getComponentLayout(component, profileId)));
    }
    buckets[index] = bucket;
    return bucket;
  }

  const sortedLocked = lockedItems.sort((a, b) => (
    a.bucketIndex - b.bucketIndex
    || a.layout.rowStart - b.layout.rowStart
    || a.layout.colStart - b.layout.colStart
    || a.order - b.order
  ));

  for (const item of sortedLocked) {
    const bucket = ensureBucket(item.bucketIndex);
    const metrics = bucket.metrics;
    const measured = measureComponentForReflow(
      snapshot,
      item.sourcePageId,
      item.component.id,
      item.component,
      profileId,
      metrics,
    );
    const colSpanInfo = resolveColSpanForComponent(item.component, measured, metrics, profileId);
    const colSpan = colSpanInfo.bounded;
    const colStart = Math.max(1, Math.min(metrics.cols - colSpan + 1, Number(item.layout.colStart) || 1));
    const span = resolveRowSpanForComponent(item.component, measured.height, metrics, profileId);
    let rowSpan = Math.max(span.minRowSpan, span.bounded);
    if (rowSpan > metrics.rowsAvailable) {
      rowSpan = metrics.rowsAvailable;
      upsertLayoutDiagnostics(item.component, { impossibleFit: true });
    } else {
      clearLayoutDiagnostics(item.component);
    }
    const preferredRow = Math.max(1, Math.min(metrics.rowsAvailable - rowSpan + 1, Number(item.layout.rowStart) || 1));
    const rowStart = findFitRow(metrics, bucket.occupied, colStart, colSpan, rowSpan, preferredRow);
    if (rowStart == null) {
      upsertLayoutDiagnostics(item.component, { impossibleFit: true });
      continue;
    }
    setComponentLayout(item.component, profileId, { colStart, colSpan, rowStart, rowSpan });
    bucket.page.components.push(item.component);
    bucket.occupied.push(makeRect({ colStart, colSpan, rowStart, rowSpan }));
  }

  const sortedFlow = flowItems.sort((a, b) => (
    a.bucketIndex - b.bucketIndex
    || a.layout.rowStart - b.layout.rowStart
    || a.layout.colStart - b.layout.colStart
    || a.order - b.order
  ));

  const BALANCED_CARD_TYPES = new Set(["delta_card", "recommendation_card"]);
  const balancedRowSpanByGroup = new Map();
  const balancedColSpanByGroup = new Map();
  for (const item of sortedFlow) {
    if (!BALANCED_CARD_TYPES.has(item.component?.type || "")) continue;
    const bucket = buckets[item.bucketIndex] || ensureBucket(item.bucketIndex);
    const metrics = bucket.metrics;
    const measured = measureComponentForReflow(
      snapshot,
      item.sourcePageId,
      item.component.id,
      item.component,
      profileId,
      metrics,
    );
    const colSpanInfo = resolveColSpanForComponent(item.component, measured, metrics, profileId);
    const rowSpanInfo = resolveRowSpanForComponent(item.component, measured.height, metrics, profileId);
    const groupKey = `${item.bucketIndex}:${item.layout.rowStart}:${item.component.type}`;
    const prevRow = balancedRowSpanByGroup.get(groupKey) || 0;
    const prevCol = balancedColSpanByGroup.get(groupKey) || 0;
    balancedRowSpanByGroup.set(groupKey, Math.max(prevRow, rowSpanInfo.bounded));
    balancedColSpanByGroup.set(groupKey, Math.max(prevCol, colSpanInfo.bounded));
  }

  for (const item of sortedFlow) {
    let targetBucketIndex = item.bucketIndex;
    let placed = false;
    while (!placed) {
      const bucket = ensureBucket(targetBucketIndex);
      const metrics = bucket.metrics;
      const measured = measureComponentForReflow(
        snapshot,
        item.sourcePageId,
        item.component.id,
        item.component,
        profileId,
        metrics,
      );
      const colSpanInfo = resolveColSpanForComponent(item.component, measured, metrics, profileId);
      const balanceKey = `${item.bucketIndex}:${item.layout.rowStart}:${item.component.type}`;
      let colSpan = colSpanInfo.bounded;
      const balancedColSpan = balancedColSpanByGroup.get(balanceKey);
      if (Number.isFinite(balancedColSpan)) {
        colSpan = Math.max(colSpan, Math.min(colSpanInfo.maxColSpan, Math.max(1, Number(balancedColSpan) || 1)));
      }
      const colStart = Math.max(1, Math.min(metrics.cols - colSpan + 1, Number(item.layout.colStart) || 1));
      const span = resolveRowSpanForComponent(item.component, measured.height, metrics, profileId);
      let rowSpan = Math.max(span.minRowSpan, span.bounded);
      const balancedRowSpan = balancedRowSpanByGroup.get(balanceKey);
      if (Number.isFinite(balancedRowSpan)) {
        rowSpan = Math.max(rowSpan, Math.max(span.minRowSpan, Number(balancedRowSpan) || rowSpan));
      }
      if (rowSpan > metrics.rowsAvailable) {
        rowSpan = metrics.rowsAvailable;
        upsertLayoutDiagnostics(item.component, { impossibleFit: true });
      } else {
        clearLayoutDiagnostics(item.component);
      }

      const preferredRow = targetBucketIndex === item.bucketIndex
        ? Math.max(1, Number(item.layout.rowStart) || 1)
        : 1;
      const rowStart = findFitRow(metrics, bucket.occupied, colStart, colSpan, rowSpan, preferredRow);
      if (rowStart == null) {
        targetBucketIndex += 1;
        if (targetBucketIndex > buckets.length + 40) {
          upsertLayoutDiagnostics(item.component, { impossibleFit: true });
          break;
        }
        continue;
      }

      setComponentLayout(item.component, profileId, { colStart, colSpan, rowStart, rowSpan });
      bucket.page.components.push(item.component);
      bucket.occupied.push(makeRect({ colStart, colSpan, rowStart, rowSpan }));
      placed = true;
    }
  }

  const outPages = [];
  buckets.forEach((bucket, index) => {
    const nonHeaderCount = bucket.page.components.filter((component) => !isDefaultPageHeaderComponent(component)).length;
    if (index > 0 && nonHeaderCount === 0) {
      return;
    }
    const sortedComponents = [...bucket.page.components].sort((left, right) => {
      const leftIsHeader = isDefaultPageHeaderComponent(left) ? 1 : 0;
      const rightIsHeader = isDefaultPageHeaderComponent(right) ? 1 : 0;
      if (leftIsHeader !== rightIsHeader) return rightIsHeader - leftIsHeader;
      const leftLayout = getComponentLayout(left, profileId);
      const rightLayout = getComponentLayout(right, profileId);
      return (
        leftLayout.rowStart - rightLayout.rowStart
        || leftLayout.colStart - rightLayout.colStart
      );
    });
    bucket.page.components = sortedComponents;
    if (index === 0) {
      bucket.page.isAutoContinuation = false;
      delete bucket.page.continuationSourceId;
    } else {
      bucket.page.pageKind = PAGE_KINDS.content;
      bucket.page.isAutoContinuation = true;
      bucket.page.continuationSourceId = basePage.id;
    }
    enforcePageContracts(bucket.page, { syncTitle: true });
    outPages.push(bucket.page);
  });

  return { pages: outPages };
}

function performReflowInDraft(draft, options = {}) {
  const snapshot = options.snapshot || collectReflowMeasurements(draft);
  const profileId = draft.project.printProfile;
  const nextPages = [];
  const pages = Array.isArray(draft.pages) ? draft.pages : [];

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (!page || typeof page !== "object") continue;
    if (isAutoContinuationPage(page)) continue;

    enforcePageContracts(page, { syncTitle: true });
    if (!isContentPageKind(page.pageKind)) {
      page.isAutoContinuation = false;
      delete page.continuationSourceId;
      for (const component of page.components || []) {
        clearLayoutDiagnostics(component);
      }
      nextPages.push(page);
      while (index + 1 < pages.length && isAutoContinuationPage(pages[index + 1]) && pages[index + 1].continuationSourceId === page.id) {
        index += 1;
      }
      continue;
    }

    const groupedPages = [page];
    while (index + 1 < pages.length && isAutoContinuationPage(pages[index + 1]) && pages[index + 1].continuationSourceId === page.id) {
      groupedPages.push(pages[index + 1]);
      index += 1;
    }

    const result = reflowContentGroup(page, groupedPages, snapshot, profileId);
    nextPages.push(...result.pages);
  }

  draft.pages = nextPages;
  normalizeSelectionAfterReflow(draft);
}

function resolveComponentContextFromTarget(targetNode) {
  if (!(targetNode instanceof HTMLElement)) return null;
  const pageId = targetNode.dataset.pageId;
  const componentId = targetNode.dataset.componentId;
  if (!pageId || !componentId) return null;

  const state = store.getState();
  const page = findPage(state, pageId);
  const component = findComponent(page, componentId);
  const pageBody = targetNode.closest(".page-body");
  if (!page || !component || !pageBody) return null;

  return {
    pageId,
    componentId,
    page,
    component,
    pageBody,
    layout: getComponentLayout(component, state.project.printProfile),
    metrics: readGridMetrics(pageBody),
  };
}

function syncMoveableTarget(state) {
  const instance = moveableRuntime.instance;
  if (!instance || moveableRuntime.active) return;

  const selectedPage = findPage(state, state.ui.selectedPageId);
  const selectedComponent = findComponent(selectedPage, state.ui.selectedComponentId);
  if (!selectedPage || !selectedComponent) {
    if (instance.target) {
      instance.target = null;
      instance.updateRect();
    }
    return;
  }

  const targetNode = refs.pages.querySelector(
    `[data-page-id="${selectedPage.id}"] [data-component-id="${selectedComponent.id}"]`,
  );
  if (!(targetNode instanceof HTMLElement)) {
    if (instance.target) {
      instance.target = null;
      instance.updateRect();
    }
    return;
  }

  if (instance.target !== targetNode) {
    instance.target = targetNode;
  }
  instance.draggable = true;
  instance.resizable = false;
  instance.edge = false;
  instance.renderDirections = [];
  instance.updateRect();
}

function ensureMoveableRuntime() {
  if (moveableRuntime.instance) return moveableRuntime.instance;
  if (typeof window === "undefined" || !refs.pages) return null;
  if (typeof window.Moveable !== "function") {
    if (!moveableRuntime.warnedMissing) {
      moveableRuntime.warnedMissing = true;
      showToast("Moveable failed to load");
    }
    return null;
  }

  const instance = new window.Moveable(refs.pages, {
    target: null,
    draggable: true,
    resizable: false,
    origin: false,
    edge: false,
    keepRatio: false,
    checkInput: true,
    hideDefaultLines: false,
    renderDirections: [],
    throttleDrag: 0,
    throttleResize: 0,
  });

  instance.on("dragStart", (event) => {
    const inputTarget = event.inputEvent?.target;
    if (
      inputTarget instanceof Element &&
      inputTarget.closest('.component-toolbar, button, input, select, textarea, a, label, [contenteditable], [contenteditable="true"], [data-inline-editing="true"]')
    ) {
      event.stop?.();
      return;
    }

    const context = resolveComponentContextFromTarget(event.target);
    if (!context || context.component.layoutConstraints?.locked) {
      event.stop?.();
      return;
    }

    moveableRuntime.active = {
      mode: "drag",
      pageId: context.pageId,
      componentId: context.componentId,
      pageBody: context.pageBody,
      startLayout: { ...context.layout },
      nextLayout: { ...context.layout },
      metrics: context.metrics,
      tx: 0,
      ty: 0,
    };
    event.target.classList.add("is-dragging");
  });

  instance.on("drag", (event) => {
    const active = moveableRuntime.active;
    if (!active || active.mode !== "drag") return;

    const metrics = readGridMetrics(active.pageBody);
    active.metrics = metrics;

    const rawTx = Number(event.beforeTranslate?.[0] ?? 0);
    const rawTy = Number(event.beforeTranslate?.[1] ?? 0);
    const rawCol = active.startLayout.colStart + Math.round(rawTx / metrics.cellW);
    const rawRow = active.startLayout.rowStart + Math.round(rawTy / metrics.cellH);
    const next = clampMoveToGrid(
      rawCol,
      rawRow,
      active.startLayout.colSpan,
      active.startLayout.rowSpan,
      metrics,
    );

    const snappedTx = (next.colStart - active.startLayout.colStart) * metrics.cellW;
    const snappedTy = (next.rowStart - active.startLayout.rowStart) * metrics.cellH;
    active.tx = snappedTx;
    active.ty = snappedTy;
    active.nextLayout.colStart = next.colStart;
    active.nextLayout.rowStart = next.rowStart;
    event.target.style.transform = `translate(${snappedTx}px, ${snappedTy}px)`;
  });

  instance.on("dragEnd", (event) => {
    const active = moveableRuntime.active;
    if (!active || active.mode !== "drag") return;

    event.target.style.transform = "";
    event.target.classList.remove("is-dragging");
    moveableRuntime.active = null;

    if (
      active.nextLayout.colStart === active.startLayout.colStart &&
      active.nextLayout.rowStart === active.startLayout.rowStart
    ) {
      return;
    }

    resizeComponent(active.pageId, active.componentId, {
      colStart: active.nextLayout.colStart,
      rowStart: active.nextLayout.rowStart,
    });
  });

  instance.on("resizeStart", (event) => {
    const context = resolveComponentContextFromTarget(event.target);
    if (!context || context.component.layoutConstraints?.locked) {
      event.stop?.();
      return;
    }

    event.dragStart?.set([0, 0]);

    moveableRuntime.active = {
      mode: "resize",
      pageId: context.pageId,
      componentId: context.componentId,
      pageBody: context.pageBody,
      startLayout: { ...context.layout },
      nextLayout: { ...context.layout },
      metrics: context.metrics,
    };

    event.target.classList.add("is-resizing");
    document.body.classList.add("is-resizing-component");
  });

  instance.on("resize", (event) => {
    const active = moveableRuntime.active;
    if (!active || active.mode !== "resize") return;

    const metrics = readGridMetrics(active.pageBody);
    active.metrics = metrics;
    const maxColSpan = Math.max(1, metrics.cols - active.startLayout.colStart + 1);
    const maxRowSpan = Math.max(1, metrics.rowsAvailable - active.startLayout.rowStart + 1);

    const rawColSpan = Math.round((Math.max(1, Number(event.width) || 1) + metrics.gap) / metrics.cellW);
    const rawRowSpan = Math.round((Math.max(1, Number(event.height) || 1) + metrics.gap) / metrics.cellH);
    const nextColSpan = Math.max(1, Math.min(maxColSpan, rawColSpan));
    const nextRowSpan = Math.max(1, Math.min(maxRowSpan, rawRowSpan));

    const rawTx = Number(event.drag?.beforeTranslate?.[0] ?? 0);
    const rawTy = Number(event.drag?.beforeTranslate?.[1] ?? 0);
    const rawCol = active.startLayout.colStart + Math.round(rawTx / metrics.cellW);
    const rawRow = active.startLayout.rowStart + Math.round(rawTy / metrics.cellH);
    const nextPos = clampMoveToGrid(rawCol, rawRow, nextColSpan, nextRowSpan, metrics);

    const snappedTx = (nextPos.colStart - active.startLayout.colStart) * metrics.cellW;
    const snappedTy = (nextPos.rowStart - active.startLayout.rowStart) * metrics.cellH;
    const snappedWidth = nextColSpan * metrics.colW + (nextColSpan - 1) * metrics.gap;
    const snappedHeight = nextRowSpan * metrics.row + (nextRowSpan - 1) * metrics.gap;

    active.nextLayout.colStart = nextPos.colStart;
    active.nextLayout.rowStart = nextPos.rowStart;
    active.nextLayout.colSpan = nextColSpan;
    active.nextLayout.rowSpan = nextRowSpan;

    event.target.style.width = `${snappedWidth}px`;
    event.target.style.height = `${snappedHeight}px`;
    event.target.style.transform = `translate(${snappedTx}px, ${snappedTy}px)`;
  });

  instance.on("resizeEnd", (event) => {
    const active = moveableRuntime.active;
    if (!active || active.mode !== "resize") return;

    event.target.style.width = "";
    event.target.style.height = "";
    event.target.style.transform = "";
    event.target.classList.remove("is-resizing");
    document.body.classList.remove("is-resizing-component");
    moveableRuntime.active = null;

    const patch = {};
    if (active.nextLayout.colStart !== active.startLayout.colStart) {
      patch.colStart = active.nextLayout.colStart;
    }
    if (active.nextLayout.rowStart !== active.startLayout.rowStart) {
      patch.rowStart = active.nextLayout.rowStart;
    }
    if (active.nextLayout.colSpan !== active.startLayout.colSpan) {
      patch.colSpan = active.nextLayout.colSpan;
    }
    if (active.nextLayout.rowSpan !== active.startLayout.rowSpan) {
      patch.rowSpan = active.nextLayout.rowSpan;
    }

    if (Object.keys(patch).length > 0) {
      resizeComponent(active.pageId, active.componentId, patch);
    }
  });

  moveableRuntime.instance = instance;
  return instance;
}

function palettePreviewHtml(componentType) {
  switch (componentType) {
    case "all_caps_title":
      return `<div class="palette-preview palette-preview--all-caps">SECTION TITLE</div>`;
    case "header_3":
      return `<div class="palette-preview palette-preview--header3">Header 3</div>`;
    case "copy_block":
      return `<div class="palette-preview palette-preview--copy">Body copy preview line.</div>`;
    case "kpi":
      return `<div class="palette-preview palette-preview--kpi"><strong>72%</strong><span>KPI</span></div>`;
    case "gauge":
      return `<div class="palette-preview palette-preview--metric"><strong>54</strong><span>Gauge</span></div>`;
    case "line":
      return `<div class="palette-preview palette-preview--spark"><span></span></div>`;
    case "bar":
      return `<div class="palette-preview palette-preview--bars"><span></span><span></span><span></span></div>`;
    case "waffle":
      return `<div class="palette-preview palette-preview--waffle">${Array.from({ length: 16 }).map(() => "<i></i>").join("")}</div>`;
    case "donut":
      return `<div class="palette-preview palette-preview--donut"><span></span></div>`;
    case "lollipop":
      return `<div class="palette-preview palette-preview--lollipop"><span></span></div>`;
    default:
      return "";
  }
}

function componentTypeLabel(type) {
  if (type === "all_caps_title") return "Header 1";
  return kebabToTitle(type || "component");
}

function paletteComponentCardHtml(component) {
  return `
    <div class="drawer-card drawer-card--component" draggable="true" data-drag="component:${component.type}" data-component-type="${escapeHtml(component.type)}">
      ${palettePreviewHtml(component.type)}
      <strong>${escapeHtml(component.label)}</strong>
      <span>${escapeHtml(component.description)}</span>
      <button class="icon-btn" type="button" data-add-component="${component.type}">Add</button>
    </div>
  `;
}

function renderPalette(state) {
  const root = refs.palette;
  const tool = state.ui.workbenchTool || "pages";
  const descriptions = {
    pages: "Manage page order and add templates.",
    design: "Drag reusable design elements onto the stage.",
    components: "Add non-chart components such as KPIs and cards to the selected page.",
    charts: "Browse chart families, then drag or add chart variants to the selected page.",
    resources: "Manage datasets and assets.",
    styles: "Edit theme tokens and status colors.",
  };
  const titles = {
    pages: "Pages",
    design: "Design Elements",
    components: "Components",
    charts: "CH Charts",
    resources: "Resources",
    styles: "Styles",
  };

  if (refs.paletteTitle) refs.paletteTitle.textContent = titles[tool] || "Workbench";
  if (refs.paletteDescription) refs.paletteDescription.textContent = descriptions[tool] || "";
  refs.workbenchRail?.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === tool);
  });
  if (tool !== "pages" && pageReorderRuntime.isActive) {
    resetPageReorderRuntime({ restoreSource: false });
  }

  if (tool === "pages") {
    const pagePanelTab = state.ui.pagePanelTab === "templates" ? "templates" : "pages";
    const pageSearchRaw = state.ui.pageSearch || "";
    const pageSearch = pageSearchRaw.toLowerCase();
    const templateSearchRaw = state.ui.templateSearch || "";
    const templateSearch = templateSearchRaw.toLowerCase().trim();
    const reorderEnabled = pagePanelTab === "pages" && pageSearchRaw.trim().length === 0;
    if (pagePanelTab !== "pages" && pageReorderRuntime.isActive) {
      resetPageReorderRuntime({ restoreSource: false });
    }
    const selectedPage = findPage(state, state.ui.selectedPageId || state.ui.activePageId);
    const pageSettingsTarget = findPage(state, state.ui.pageSettingsPageId);
    const pages = (state.pages || []).filter((page) => {
      if (!pageSearch) return true;
      return `${page.title || ""} ${page.templateId || ""}`.toLowerCase().includes(pageSearch);
    });
    const templateMatches = TEMPLATE_LIBRARY.filter((template) => {
      const text = `${template.label} ${template.description} ${(template.tags || []).join(" ")}`.toLowerCase();
      return !templateSearch || text.includes(templateSearch);
    });
    const pageSettingsFlyoutHtml = (page) => {
      const warningList = state.ui.warnings?.[page.id] || [];
      return `
        <div class="drawer-list-settings-row page-settings-flyout" data-page-settings-flyout data-page-settings-for="${page.id}">
          <div class="page-settings-flyout__head">
            <strong>Page Settings</strong>
            <button class="icon-btn" type="button" data-close-page-settings>Close</button>
          </div>
          <div class="form-grid">
            <div class="form-group"><label>Page Title</label><input class="form-input" id="pageTitleFlyout" value="${escapeHtml(page.title || "")}"></div>
            <div class="form-group"><label>Subtitle</label><input class="form-input" id="pageSubtitleFlyout" value="${escapeHtml(page.subtitle || "")}"></div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>Theme</label>
              <select class="form-select" id="pageThemeFlyout">
                <option value="light_data" ${page.theme === "light_data" ? "selected" : ""}>Light data</option>
                <option value="dark_intro" ${page.theme === "dark_intro" ? "selected" : ""}>Dark intro</option>
              </select>
            </div>
            <div class="form-group">
              <label>Page kind</label>
              <select class="form-select" id="pageKindFlyout">
                <option value="${PAGE_KINDS.cover}" ${page.pageKind === PAGE_KINDS.cover ? "selected" : ""}>Cover</option>
                <option value="${PAGE_KINDS.divider}" ${page.pageKind === PAGE_KINDS.divider ? "selected" : ""}>Divider</option>
                <option value="${PAGE_KINDS.agenda}" ${page.pageKind === PAGE_KINDS.agenda ? "selected" : ""}>Agenda</option>
                <option value="${PAGE_KINDS.content}" ${page.pageKind === PAGE_KINDS.content ? "selected" : ""}>Content</option>
                <option value="${PAGE_KINDS.end}" ${page.pageKind === PAGE_KINDS.end ? "selected" : ""}>End</option>
                <option value="${PAGE_KINDS.custom}" ${page.pageKind === PAGE_KINDS.custom ? "selected" : ""}>Custom</option>
              </select>
            </div>
            <div class="form-group">
              <label>Show grid</label>
              <select class="form-select" id="pageGridFlyout">
                <option value="false" ${!page.showGrid ? "selected" : ""}>No</option>
                <option value="true" ${page.showGrid ? "selected" : ""}>Yes</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Layout mode</label>
            <select class="form-select" id="pageLayoutModeFlyout">
              <option value="template" ${page.layoutMode === "template" ? "selected" : ""}>Template locked</option>
              <option value="free" ${page.layoutMode === "free" ? "selected" : ""}>Free layout</option>
            </select>
          </div>
          <div class="form-group">
            <label>Full bleed page</label>
            <select class="form-select" id="pageFullBleedFlyout">
              <option value="false" ${!page.fullBleed ? "selected" : ""}>No</option>
              <option value="true" ${page.fullBleed ? "selected" : ""}>Yes</option>
            </select>
            <div class="helper">Use for cover/intro pages that need edge-to-edge backgrounds.</div>
          </div>
          ${
            warningList.length
              ? `<div class="warning-list">Overflow detected in ${warningList.length} component(s).</div>`
              : ""
          }
        </div>
      `;
    };
    root.innerHTML = `
      <div class="drawer-tabs">
        <button class="drawer-tab-btn ${pagePanelTab === "pages" ? "is-active" : ""}" type="button" data-page-panel-tab="pages">Pages</button>
        <button class="drawer-tab-btn ${pagePanelTab === "templates" ? "is-active" : ""}" type="button" data-page-panel-tab="templates">Templates</button>
      </div>
      ${
        pagePanelTab === "pages"
          ? `
            <div class="form-group">
              <label>Search Pages</label>
              <input class="form-input" id="pageSearch" placeholder="Find pages" value="${escapeHtml(state.ui.pageSearch || "")}">
            </div>
            <details class="drawer-section" open>
              <summary>Report Pages</summary>
              <div class="helper drawer-reorder-hint" data-page-reorder-hint ${reorderEnabled ? "hidden" : ""}>Clear search to reorder pages.</div>
              <div class="sr-only" id="pageReorderLive" aria-live="polite" aria-atomic="true"></div>
              <div class="drawer-list" data-page-list>
                ${
                  pages.length
                    ? pages
                        .map(
                          (page) => `
                          <div class="drawer-list-row ${state.ui.activePageId === page.id ? "is-active" : ""} ${state.ui.pageSettingsPageId === page.id ? "is-settings-open" : ""}" data-page-row data-page-id="${page.id}">
                            <button
                              class="drawer-drag-handle"
                              type="button"
                              draggable="${reorderEnabled ? "true" : "false"}"
                              data-page-drag-handle
                              data-page-id="${page.id}"
                              aria-label="Reorder ${escapeHtml(pageLabel(page))}"
                              title="${reorderEnabled ? "Drag to reorder page" : "Clear search to reorder pages"}"
                              ${reorderEnabled ? "" : "disabled"}
                            >
                              <span aria-hidden="true">⋮⋮</span>
                            </button>
                            <button class="drawer-list-item" type="button" data-select-page="${page.id}">
                              <strong>${escapeHtml(page.title || page.templateId || "Untitled Page")}</strong>
                            </button>
                            <div class="drawer-item-actions">
                              <button class="mini-btn mini-btn--icon" type="button" data-page-dup="${page.id}" aria-label="Copy page" title="Copy page">
                                <span class="icon-duplicate" aria-hidden="true"></span>
                                <span class="sr-only">Copy page</span>
                              </button>
                              <button class="mini-btn mini-btn--icon mini-btn--danger" type="button" data-page-del="${page.id}" aria-label="Delete page" title="Delete page">
                                <span class="icon-trash" aria-hidden="true"></span>
                                <span class="sr-only">Delete page</span>
                              </button>
                              <button class="mini-btn mini-btn--icon ${state.ui.pageSettingsPageId === page.id ? "is-active" : ""}" type="button" data-page-settings="${page.id}" aria-label="Page settings" title="Page settings">
                                <span class="icon-cog" aria-hidden="true"></span>
                                <span class="sr-only">Page settings</span>
                              </button>
                            </div>
                          </div>
                          ${state.ui.pageSettingsPageId === page.id ? pageSettingsFlyoutHtml(page) : ""}
                        `,
                        )
                        .join("")
                    : `<div class="inspector-empty">No pages found.</div>`
                }
              </div>
            </details>
            ${
              pageSettingsTarget
                ? ""
                : '<div class="helper" style="margin:8px 0 10px;">Use the settings icon on a page row to open page settings.</div>'
            }
          `
          : `
            <div class="form-group">
              <label>Search Templates</label>
              <input class="form-input" id="templateSearch" placeholder="Find templates" value="${escapeHtml(templateSearchRaw)}">
            </div>
            <details class="drawer-section" open>
              <summary>Add From Template</summary>
              <div class="drawer-card-list">
                ${
                  templateMatches.length
                    ? templateMatches
                        .map(
                          (template) => `
                            <div class="drawer-card" draggable="true" data-drag="template:${template.id}">
                              <strong>${escapeHtml(template.label)}</strong>
                              <span>${escapeHtml(template.description)}</span>
                              <button class="icon-btn" type="button" data-add-template="${template.id}">Add</button>
                            </div>
                          `,
                        )
                        .join("")
                    : '<div class="inspector-empty">No templates match this search.</div>'
                }
              </div>
            </details>
          `
      }
      <div class="form-grid" style="margin-top:10px;">
        <button class="btn" type="button" id="btnAddCustomPageLeft">Add Custom Page</button>
        <button class="btn" type="button" id="btnAddMissingDefaultsLeft">Add Missing Default Pages</button>
        <button class="btn btn--danger" type="button" id="btnResetSamplePackLeft">Reset Sample Pack</button>
      </div>
    `;

    root.querySelectorAll("[data-page-panel-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextTab = button.dataset.pagePanelTab === "templates" ? "templates" : "pages";
        store.commit((draft) => {
          draft.ui.pagePanelTab = nextTab;
          if (nextTab === "templates") {
            draft.ui.pageSettingsPageId = null;
          }
        }, { historyLabel: "ui-page-panel-tab", skipHistory: true });
      });
    });

    root.querySelector("#pageSearch")?.addEventListener("input", (event) => {
      store.commit((draft) => {
        draft.ui.pageSearch = event.target.value;
      }, { historyLabel: "ui-page-search", skipHistory: true });
    });
    root.querySelector("#templateSearch")?.addEventListener("input", (event) => {
      store.commit((draft) => {
        draft.ui.templateSearch = event.target.value;
      }, { historyLabel: "ui-template-search", skipHistory: true });
    });
    root.querySelectorAll("[data-select-page]").forEach((button) => {
      button.addEventListener("click", () => {
        const pageId = button.dataset.selectPage;
        select(pageId, null);
        jumpToPage(pageId, "smooth");
      });
    });
    root.querySelectorAll("[data-page-settings]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const pageId = button.dataset.pageSettings;
        if (!pageId) return;
        store.commit((draft) => {
          const isOpen = draft.ui.pageSettingsPageId === pageId;
          draft.ui.pageSettingsPageId = isOpen ? null : pageId;
          draft.ui.pagePanelTab = "pages";
          if (!isOpen) {
            draft.ui.selectedPageId = pageId;
            draft.ui.activePageId = pageId;
            draft.ui.selectedComponentId = null;
            draft.ui.pendingDeleteComponentId = null;
          }
        }, { historyLabel: "ui-page-settings", skipHistory: true });
      });
    });
    root.querySelector("[data-close-page-settings]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      store.commit((draft) => {
        draft.ui.pageSettingsPageId = null;
      }, { historyLabel: "ui-page-settings", skipHistory: true });
    });
    root.querySelectorAll("[data-page-dup]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        duplicatePage(button.dataset.pageDup);
      });
    });
    root.querySelectorAll("[data-page-del]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deletePage(button.dataset.pageDel);
      });
    });
    if (pagePanelTab === "pages") {
      bindPageReorderDnD(root, { reorderEnabled });
    }
    root.querySelectorAll("[data-add-template]").forEach((button) => {
      button.addEventListener("click", () => addPageFromTemplate(button.dataset.addTemplate));
    });
    root.querySelectorAll("[data-drag]").forEach((node) => {
      node.addEventListener("dragstart", (event) => {
        const [kind, value] = node.dataset.drag.split(":");
        if (kind === "template") setDragData(event, { kind: "new-page-template", templateId: value });
      });
    });
    root.querySelector("#pageTitleFlyout")?.addEventListener("input", (event) => {
      if (!pageSettingsTarget) return;
      updatePage(pageSettingsTarget.id, { title: event.target.value });
    });
    root.querySelector("#pageSubtitleFlyout")?.addEventListener("input", (event) => {
      if (!pageSettingsTarget) return;
      updatePage(pageSettingsTarget.id, { subtitle: event.target.value });
    });
    root.querySelector("#pageThemeFlyout")?.addEventListener("change", (event) => {
      if (!pageSettingsTarget) return;
      updatePage(pageSettingsTarget.id, { theme: event.target.value });
    });
    root.querySelector("#pageKindFlyout")?.addEventListener("change", (event) => {
      if (!pageSettingsTarget) return;
      updatePage(pageSettingsTarget.id, { pageKind: event.target.value }, "page-kind");
    });
    root.querySelector("#pageGridFlyout")?.addEventListener("change", (event) => {
      if (!pageSettingsTarget) return;
      updatePage(pageSettingsTarget.id, { showGrid: event.target.value === "true" }, "grid");
    });
    root.querySelector("#pageLayoutModeFlyout")?.addEventListener("change", (event) => {
      if (!pageSettingsTarget) return;
      const nextMode = event.target.value;
      if (nextMode === "free") {
        unlockPage(pageSettingsTarget.id, "page-mode");
        return;
      }
      updatePage(pageSettingsTarget.id, { layoutMode: nextMode }, "page-mode");
    });
    root.querySelector("#pageFullBleedFlyout")?.addEventListener("change", (event) => {
      if (!pageSettingsTarget) return;
      updatePage(pageSettingsTarget.id, { fullBleed: event.target.value === "true" }, "page-full-bleed");
    });
    root.querySelector("#btnAddCustomPageLeft")?.addEventListener("click", () => addCustomPage());
    root.querySelector("#btnAddMissingDefaultsLeft")?.addEventListener("click", addMissingDefaultPages);
    root.querySelector("#btnResetSamplePackLeft")?.addEventListener("click", resetSamplePack);
    return;
  }

  if (tool === "design") {
    const searchRaw = state.ui.paletteSearch || "";
    const search = searchRaw.toLowerCase();
    const designMatches = COMPONENT_LIBRARY
      .filter((component) => (component.category || "design") === "design")
      .filter((component) => {
        const text = `${component.label} ${component.description} ${component.type}`.toLowerCase();
        return !search || text.includes(search);
      });

    root.innerHTML = `
      <div class="form-group">
        <label>Search Design Elements</label>
        <input class="form-input" id="paletteSearch" placeholder="Find design elements" value="${escapeHtml(searchRaw)}">
      </div>
      <details class="drawer-section" open>
        <summary>Design Elements</summary>
        <div class="drawer-card-list">
          ${
            designMatches.length
              ? designMatches.map((component) => paletteComponentCardHtml(component)).join("")
              : '<div class="inspector-empty">No design elements match this search.</div>'
          }
        </div>
      </details>
    `;

    root.querySelector("#paletteSearch")?.addEventListener("input", (event) => {
      store.commit((draft) => {
        draft.ui.paletteSearch = event.target.value;
      }, { historyLabel: "ui-palette-search", skipHistory: true });
    });

    root.querySelectorAll("[data-add-component]").forEach((button) => {
      button.addEventListener("click", () => {
        const snapshot = store.getState();
        const targetPageId = snapshot.ui.selectedPageId || snapshot.ui.activePageId || snapshot.pages[0]?.id;
        if (!targetPageId) {
          addCustomPage();
          const fallbackPage = store.getState().pages[0]?.id;
          if (!fallbackPage) return;
          addComponent(fallbackPage, button.dataset.addComponent, { colStart: 1, rowStart: 1 });
          return;
        }
        addComponent(targetPageId, button.dataset.addComponent, { colStart: 1, rowStart: 1 });
      });
    });

    root.querySelectorAll("[data-drag]").forEach((node) => {
      node.addEventListener("dragstart", (event) => {
        const [, value] = node.dataset.drag.split(":");
        setDragData(event, { kind: "new-component", componentType: value });
      });
    });
    return;
  }

  if (tool === "charts") {
    const searchRaw = state.ui.chartSearch || "";
    const search = String(searchRaw).toLowerCase().trim();
    const family = String(state.ui.chartFamily || "all").trim().toLowerCase();
    const familyOptions = CHART_FAMILY_OPTIONS;
    const variants = chartVariantsForFamily(family).filter((variant) => {
      const text = `${variant.label} ${variant.description || ""} ${variant.family}`.toLowerCase();
      return !search || text.includes(search);
    });

    root.innerHTML = `
      <div class="chart-gallery-controls">
        <div class="form-group">
          <label>Family</label>
          <select class="form-select" id="chartFamily">
            ${familyOptions
              .map((option) => `<option value="${option.key}" ${option.key === family ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
              .join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Search</label>
          <input class="form-input" id="chartSearch" placeholder="Find chart variants" value="${escapeHtml(searchRaw)}">
        </div>
      </div>
      <details class="drawer-section" open>
        <summary>Chart Variants</summary>
        <div class="chart-variant-grid">
          ${
            variants.length
              ? variants.map((variant) => chartVariantCardHtml(variant)).join("")
              : '<div class="inspector-empty">No chart variants match this filter.</div>'
          }
        </div>
      </details>
    `;

    root.querySelector("#chartFamily")?.addEventListener("change", (event) => {
      store.commit((draft) => {
        draft.ui.chartFamily = event.target.value;
      }, { historyLabel: "ui-chart-family", skipHistory: true });
    });
    root.querySelector("#chartSearch")?.addEventListener("input", (event) => {
      store.commit((draft) => {
        draft.ui.chartSearch = event.target.value;
      }, { historyLabel: "ui-chart-search", skipHistory: true });
    });
    root.querySelectorAll("[data-add-chart-variant]").forEach((button) => {
      button.addEventListener("click", () => {
        const chartVariant = button.dataset.addChartVariant;
        const snapshot = store.getState();
        const targetPageId = snapshot.ui.selectedPageId || snapshot.ui.activePageId || snapshot.pages[0]?.id;
        if (!targetPageId) {
          addCustomPage();
          const fallbackPage = store.getState().pages[0]?.id;
          if (!fallbackPage) return;
          addComponent(fallbackPage, "chart", { colStart: 1, rowStart: 1 }, { chartVariant });
          return;
        }
        addComponent(targetPageId, "chart", { colStart: 1, rowStart: 1 }, { chartVariant });
      });
    });
    root.querySelectorAll("[data-drag]").forEach((node) => {
      node.addEventListener("dragstart", (event) => {
        const [kind, value] = node.dataset.drag.split(":");
        if (kind !== "chart") return;
        setDragData(event, {
          kind: "new-component",
          componentType: "chart",
          componentOptions: { chartVariant: value },
        });
      });
    });
    return;
  }

  if (tool === "resources") {
    root.innerHTML = `
      ${renderResourceLists(state)}
    `;
    root.querySelector("#btnImportDataPanel")?.addEventListener("click", () => refs.fileCsv.click());
    root.querySelector("#btnImportImagePanel")?.addEventListener("click", () => refs.fileAsset.click());
    return;
  }

  if (tool === "styles") {
    const tokens = state.theme?.tokens || {};
    const statusLow = tokens.statusLow || cssVarHex("--status-low", "#f23f55");
    const statusMedium = tokens.statusMedium || cssVarHex("--status-medium", "#ffbf00");
    const statusHigh = tokens.statusHigh || cssVarHex("--status-high", "#12dd7e");
    const statusBlue = tokens.statusBlue || cssVarHex("--status-blue", "#3c64ff");
    const canvas = tokens.canvas || cssVarHex("--canvas", "#f5f5f9");
    const panel = tokens.panel || cssVarHex("--panel", "#ffffff");
    root.innerHTML = `
      <div class="style-token-list">
        <label class="style-token-row"><span>Status Low</span><input type="color" data-style-token="statusLow" value="${escapeHtml(statusLow)}"></label>
        <label class="style-token-row"><span>Status Medium</span><input type="color" data-style-token="statusMedium" value="${escapeHtml(statusMedium)}"></label>
        <label class="style-token-row"><span>Status High</span><input type="color" data-style-token="statusHigh" value="${escapeHtml(statusHigh)}"></label>
        <label class="style-token-row"><span>Primary Blue</span><input type="color" data-style-token="statusBlue" value="${escapeHtml(statusBlue)}"></label>
        <label class="style-token-row"><span>Canvas</span><input type="color" data-style-token="canvas" value="${escapeHtml(canvas)}"></label>
        <label class="style-token-row"><span>Panel</span><input type="color" data-style-token="panel" value="${escapeHtml(panel)}"></label>
      </div>
      <div class="form-group" style="margin-top:10px;">
        <button class="btn" type="button" id="btnResetStyleTokens">Reset Theme Tokens</button>
      </div>
      <div class="form-group">
        <button class="btn" type="button" id="btnResetAllChartStyles">Reset All Chart Styles to Brand Defaults</button>
      </div>
    `;
    root.querySelectorAll("[data-style-token]").forEach((input) => {
      input.addEventListener("input", (event) => {
        const key = event.target.dataset.styleToken;
        store.commit((draft) => {
          if (!draft.theme.tokens || typeof draft.theme.tokens !== "object") {
            draft.theme.tokens = {};
          }
          draft.theme.tokens[key] = event.target.value;
        }, { historyLabel: "style-token" });
      });
    });
    root.querySelector("#btnResetStyleTokens")?.addEventListener("click", () => {
      store.commit((draft) => {
        draft.theme.tokens = {};
      }, { historyLabel: "style-reset" });
    });
    root.querySelector("#btnResetAllChartStyles")?.addEventListener("click", () => {
      resetAllChartStylesToBrandDefaults();
    });
    return;
  }

  const searchRaw = state.ui.paletteSearch || "";
  const search = searchRaw.toLowerCase();
  let filter = state.ui.paletteFilter || "all";
  if (filter === "components") filter = "all";
  if (filter === "design") filter = "all";

  const validFilters = new Set([
    "all",
    "layouts",
    "metrics",
    "cards",
    "benchmark",
    "intro",
    "threat",
    "recommendations",
  ]);
  if (!validFilters.has(filter)) filter = "all";

  const legacyTemplateTagFilters = new Set(["benchmark", "intro", "threat", "recommendations"]);
  const templateMatches = TEMPLATE_LIBRARY.filter((template) => {
    const text = `${template.label} ${template.description} ${(template.tags || []).join(" ")}`.toLowerCase();
    if (search && !text.includes(search)) return false;
    if (filter === "all" || filter === "layouts") return true;
    if (legacyTemplateTagFilters.has(filter)) return (template.tags || []).includes(filter);
    return false;
  });

  const componentMatches = COMPONENT_LIBRARY.filter((component) => {
    const category = component.category || "design";
    const text = `${component.label} ${component.description} ${component.type} ${category}`.toLowerCase();
    if (search && !text.includes(search)) return false;
    if (category === "design") return false;
    if (filter === "all") return true;
    if (filter === "layouts") return false;
    if (legacyTemplateTagFilters.has(filter)) return false;
    return category === filter;
  });

  const componentGroups = [
    { key: "metrics", label: "Metric Elements", hint: "Single-value metric components." },
    { key: "cards", label: "Card Elements", hint: "Structured narrative and status cards." },
  ];

  const groupedComponentMatches = componentGroups
    .map((group) => ({
      ...group,
      items: componentMatches.filter((component) => (component.category || "design") === group.key),
    }))
    .filter((group) => group.items.length > 0);

  root.innerHTML = `
    <div class="form-group">
      <label>Search</label>
      <input class="form-input" id="paletteSearch" placeholder="Find page layouts or components" value="${escapeHtml(searchRaw)}">
    </div>
    <div class="form-group">
      <label>Filter</label>
      <select class="form-select" id="paletteFilter">
        <option value="all" ${filter === "all" ? "selected" : ""}>All</option>
        <option value="layouts" ${filter === "layouts" ? "selected" : ""}>Page Layout Templates</option>
        <option value="metrics" ${filter === "metrics" ? "selected" : ""}>Metric Elements</option>
        <option value="cards" ${filter === "cards" ? "selected" : ""}>Card Elements</option>
        <option value="benchmark" ${filter === "benchmark" ? "selected" : ""}>Layouts: Benchmark</option>
        <option value="intro" ${filter === "intro" ? "selected" : ""}>Layouts: Intro</option>
        <option value="threat" ${filter === "threat" ? "selected" : ""}>Layouts: Threat</option>
        <option value="recommendations" ${filter === "recommendations" ? "selected" : ""}>Layouts: Recommendations</option>
      </select>
    </div>
    <details class="drawer-section" open>
      <summary>Page Layout Templates</summary>
      <div class="drawer-card-list">
        ${
          templateMatches.length
            ? templateMatches
                .map(
                  (template) => `
                    <div class="drawer-card" draggable="true" data-drag="template:${template.id}">
                      <strong>${escapeHtml(template.label)}</strong>
                      <span>${escapeHtml(template.description)}</span>
                      <button class="icon-btn" type="button" data-add-template="${template.id}">Add</button>
                    </div>
                  `,
                )
                .join("")
            : '<div class="inspector-empty">No page layout templates match this filter.</div>'
        }
      </div>
    </details>
    <details class="drawer-section" open>
      <summary>On-Page Components</summary>
      ${
        groupedComponentMatches.length
          ? groupedComponentMatches
              .map(
                (group) => `
                  <div class="palette-group">
                    <label class="palette-label">${escapeHtml(group.label)}</label>
                    <div class="helper">${escapeHtml(group.hint)}</div>
                    <div class="drawer-card-list">
                      ${group.items
                        .map((component) => paletteComponentCardHtml(component))
                        .join("")}
                    </div>
                  </div>
                `,
              )
              .join("")
          : '<div class="inspector-empty">No on-page components match this filter.</div>'
      }
    </details>
  `;

  root.querySelector("#paletteSearch")?.addEventListener("input", (event) => {
    store.commit((draft) => {
      draft.ui.paletteSearch = event.target.value;
    }, { historyLabel: "ui-palette-search", skipHistory: true });
  });
  root.querySelector("#paletteFilter")?.addEventListener("change", (event) => {
    store.commit((draft) => {
      draft.ui.paletteFilter = event.target.value;
    }, { historyLabel: "ui-palette-filter", skipHistory: true });
  });
  root.querySelectorAll("[data-add-template]").forEach((button) => {
    button.addEventListener("click", () => addPageFromTemplate(button.dataset.addTemplate));
  });
  root.querySelectorAll("[data-add-component]").forEach((button) => {
    button.addEventListener("click", () => {
      const snapshot = store.getState();
      const targetPageId = snapshot.ui.selectedPageId || snapshot.ui.activePageId || snapshot.pages[0]?.id;
      if (!targetPageId) {
        addCustomPage();
        const fallbackPage = store.getState().pages[0]?.id;
        if (!fallbackPage) return;
        addComponent(fallbackPage, button.dataset.addComponent, { colStart: 1, rowStart: 1 });
        return;
      }
      addComponent(targetPageId, button.dataset.addComponent, { colStart: 1, rowStart: 1 });
    });
  });
  root.querySelectorAll("[data-drag]").forEach((node) => {
    node.addEventListener("dragstart", (event) => {
      const [kind, value] = node.dataset.drag.split(":");
      if (kind === "template") setDragData(event, { kind: "new-page-template", templateId: value });
      if (kind === "component") setDragData(event, { kind: "new-component", componentType: value });
    });
  });
}

function renderThumbnails(state) {
  if (!refs.thumbnails) return;
  refs.thumbnails.hidden = true;
  refs.thumbnails.innerHTML = "";
}

function renderPages(state) {
  const root = refs.pages;
  root.innerHTML = "";

  if (state.pages.length === 0) {
    root.innerHTML = '<div class="inspector-empty">No pages yet. Add a template or custom page.</div>';
    return;
  }

  const handlers = {
    select,
    setTextTarget: setCanvasTextTarget,
    commitInlineTextEdit,
    openComponentEditor,
    toggleComponentEditor,
    requestOrConfirmDeleteComponent,
    addComponent,
    moveComponent,
    resizeComponent,
    nudgeComponent,
    autoFitComponentHeight,
    resetComponentToDefault,
    toggleComponentLock,
    unlockPage,
    duplicatePage,
    deletePage,
    movePage,
    duplicateComponent,
    deleteComponent,
  };

  state.pages.forEach((page, index) => {
    const node = renderPageNode({
      state,
      page,
      pageIndex: index,
      pageCount: state.pages.length,
      handlers,
    });
    root.appendChild(node);
  });

  requestAnimationFrame(() => {
    const warnings = collectOverflowWarnings(root, state);
    updateWarnings(warnings);
  });
}

function renderBindingEditor(state, page, component) {
  if (!BINDABLE_TYPES.has(component.type)) {
    return "";
  }

  if (component.type === "chart") {
    const chartProps = component.props?.chart || {};
    const variantMeta = chartVariantById(chartProps.variant || "line_single");
    const familyOptions = CHART_FAMILY_OPTIONS.filter((option) => option.key !== "all");
    const family = familyOptions.some((option) => option.key === chartProps.family)
      ? chartProps.family
      : variantMeta.family;
    const variants = chartVariantsForFamily(family);
    const activeVariant = variants.find((variant) => variant.id === variantMeta.id)?.id || variants[0]?.id || variantMeta.id;
    const existingBinding = Array.isArray(component.dataBindings)
      ? component.dataBindings.find((binding) => String(binding?.mode || "").startsWith("chart_roles"))
      : null;
    const datasetId = existingBinding?.datasetId || "";
    const draftBinding = buildChartBindingDraft(component, state.datasets, datasetId);
    const columns = state.datasets.find((dataset) => dataset.id === datasetId)?.columns || [];
    const mapping = draftBinding.mapping || {};
    const transforms = draftBinding.transforms || {};
    const visual = chartProps.visual || {};
    const axis = chartProps.axis || {};
    const format = chartProps.format || {};
    const paletteOverrideInput = parsePaletteOverrideInput(visual.paletteOverride || visual.palette).join(", ");
    const columnOptions = (selected, blankLabel = "Select", allowBlank = true) => [
      allowBlank ? `<option value="">${blankLabel}</option>` : "",
      ...columns.map((column) => `<option value="${escapeHtml(column.key)}" ${selected === column.key ? "selected" : ""}>${escapeHtml(column.key)}</option>`),
    ].join("");
    const yPrimary = Array.isArray(mapping.y) ? mapping.y[0] || "" : "";
    const ySecondary = Array.isArray(mapping.y) ? mapping.y[1] || "" : "";

    return `
      <div class="hr"></div>
      <div class="form-group">
        <label>Chart Binding</label>
        <div class="helper">Basic controls configure chart type, data roles and transforms. Advanced controls tune axes and formatting.</div>
      </div>
      <details class="drawer-section" open>
        <summary>Basic</summary>
        <div class="form-grid">
          <div class="form-group">
            <label>Dataset</label>
            <select class="form-select" id="bindDataset">
              <option value="">None</option>
              ${state.datasets
                .map((dataset) => `<option value="${dataset.id}" ${dataset.id === datasetId ? "selected" : ""}>${escapeHtml(dataset.name)}</option>`)
                .join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Family</label>
            <select class="form-select" id="chartFamily">
              ${familyOptions
                .map((option) => `<option value="${option.key}" ${option.key === family ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
                .join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Variant</label>
            <select class="form-select" id="chartVariant">
              ${variants
                .map((variant) => `<option value="${variant.id}" ${variant.id === activeVariant ? "selected" : ""}>${escapeHtml(variant.label)}</option>`)
                .join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Aggregation</label>
            <select class="form-select" id="bindAgg">
              <option value="sum" ${transforms.aggregation === "sum" ? "selected" : ""}>Sum</option>
              <option value="avg" ${transforms.aggregation === "avg" ? "selected" : ""}>Average</option>
              <option value="min" ${transforms.aggregation === "min" ? "selected" : ""}>Min</option>
              <option value="max" ${transforms.aggregation === "max" ? "selected" : ""}>Max</option>
              <option value="count" ${transforms.aggregation === "count" ? "selected" : ""}>Count</option>
            </select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>X Role</label>
            <select class="form-select" id="bindXCol">${columnOptions(mapping.x, "Select x column")}</select>
          </div>
          <div class="form-group">
            <label>Y Role</label>
            <select class="form-select" id="bindYCol">${columnOptions(yPrimary, "Select y column")}</select>
          </div>
          <div class="form-group">
            <label>Y Role (Additional)</label>
            <select class="form-select" id="bindYCol2">${columnOptions(ySecondary, "Optional")}</select>
          </div>
          <div class="form-group">
            <label>Secondary Axis (Y2)</label>
            <select class="form-select" id="bindY2Col">${columnOptions(mapping.y2, "Optional")}</select>
          </div>
          <div class="form-group">
            <label>Series Role</label>
            <select class="form-select" id="bindSeriesCol">${columnOptions(mapping.series, "Optional")}</select>
          </div>
          <div class="form-group">
            <label>Size Role (Bubble)</label>
            <select class="form-select" id="bindSizeCol">${columnOptions(mapping.size, "Optional")}</select>
          </div>
          <div class="form-group">
            <label>Color Role</label>
            <select class="form-select" id="bindColorCol">${columnOptions(mapping.color, "Optional")}</select>
          </div>
          <div class="form-group">
            <label>Target Role</label>
            <select class="form-select" id="bindTargetCol">${columnOptions(mapping.target, "Optional")}</select>
          </div>
          <div class="form-group">
            <label>Label Role</label>
            <select class="form-select" id="bindLabelCol">${columnOptions(mapping.label, "Optional")}</select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Sort By</label>
            <select class="form-select" id="bindSortBy">
              <option value="x" ${transforms.sortBy === "x" ? "selected" : ""}>X</option>
              <option value="y" ${transforms.sortBy === "y" ? "selected" : ""}>Y</option>
              <option value="series" ${transforms.sortBy === "series" ? "selected" : ""}>Series</option>
              <option value="target" ${transforms.sortBy === "target" ? "selected" : ""}>Target</option>
              <option value="none" ${transforms.sortBy === "none" ? "selected" : ""}>None</option>
            </select>
          </div>
          <div class="form-group">
            <label>Sort Direction</label>
            <select class="form-select" id="bindSortDir">
              <option value="asc" ${transforms.sortDir === "asc" ? "selected" : ""}>Ascending</option>
              <option value="desc" ${transforms.sortDir === "desc" ? "selected" : ""}>Descending</option>
            </select>
          </div>
          <div class="form-group">
            <label>Top N</label>
            <input class="form-input" id="bindTopN" type="number" min="1" value="${escapeHtml(String(transforms.topN || ""))}" placeholder="All">
          </div>
          <div class="form-group">
            <label>Stack Mode</label>
            <select class="form-select" id="bindStackMode">
              <option value="none" ${transforms.stackMode === "none" ? "selected" : ""}>None</option>
              <option value="stack" ${transforms.stackMode === "stack" ? "selected" : ""}>Stack</option>
              <option value="percent" ${transforms.stackMode === "percent" ? "selected" : ""}>100%</option>
            </select>
          </div>
        </div>
      </details>
      <details class="drawer-section">
        <summary>Advanced</summary>
        <div class="form-grid">
          <div class="form-group">
            <label>X Axis Type</label>
            <select class="form-select" id="chartAxisXType">
              <option value="auto" ${axis.xType === "auto" ? "selected" : ""}>Auto</option>
              <option value="category" ${axis.xType === "category" ? "selected" : ""}>Category</option>
              <option value="value" ${axis.xType === "value" ? "selected" : ""}>Value</option>
              <option value="time" ${axis.xType === "time" ? "selected" : ""}>Time</option>
              <option value="log" ${axis.xType === "log" ? "selected" : ""}>Log</option>
            </select>
          </div>
          <div class="form-group">
            <label>Date Axis Mode</label>
            <select class="form-select" id="chartDateMode">
              <option value="auto" ${axis.dateMode === "auto" ? "selected" : ""}>Auto</option>
              <option value="time" ${axis.dateMode === "time" ? "selected" : ""}>Time</option>
              <option value="category" ${axis.dateMode === "category" ? "selected" : ""}>Category</option>
            </select>
          </div>
          <div class="form-group">
            <label>Y Min</label>
            <input class="form-input" id="chartYMin" type="number" step="any" value="${escapeHtml(axis.yMin ?? "")}">
          </div>
          <div class="form-group">
            <label>Y Max</label>
            <input class="form-input" id="chartYMax" type="number" step="any" value="${escapeHtml(axis.yMax ?? "")}">
          </div>
          <div class="form-group">
            <label>Y2 Min</label>
            <input class="form-input" id="chartY2Min" type="number" step="any" value="${escapeHtml(axis.y2Min ?? "")}">
          </div>
          <div class="form-group">
            <label>Y2 Max</label>
            <input class="form-input" id="chartY2Max" type="number" step="any" value="${escapeHtml(axis.y2Max ?? "")}">
          </div>
          <div class="form-group">
            <label>Show Legend</label>
            <select class="form-select" id="chartShowLegend">
              <option value="true" ${visual.showLegend !== false ? "selected" : ""}>Yes</option>
              <option value="false" ${visual.showLegend === false ? "selected" : ""}>No</option>
            </select>
          </div>
          <div class="form-group">
            <label>Show Labels</label>
            <select class="form-select" id="chartShowLabels">
              <option value="true" ${visual.showLabels === true ? "selected" : ""}>Yes</option>
              <option value="false" ${visual.showLabels !== true ? "selected" : ""}>No</option>
            </select>
          </div>
          <div class="form-group">
            <label>Smooth Lines</label>
            <select class="form-select" id="chartSmooth">
              <option value="true" ${visual.smooth === true ? "selected" : ""}>Yes</option>
              <option value="false" ${visual.smooth !== true ? "selected" : ""}>No</option>
            </select>
          </div>
          <div class="form-group">
            <label>Step Lines</label>
            <select class="form-select" id="chartStep">
              <option value="true" ${visual.step === true ? "selected" : ""}>Yes</option>
              <option value="false" ${visual.step !== true ? "selected" : ""}>No</option>
            </select>
          </div>
          <div class="form-group">
            <label>Use Brand Defaults</label>
            <select class="form-select" id="chartUseBrandDefaults">
              <option value="true" ${visual.useBrandDefaults !== false ? "selected" : ""}>Yes</option>
              <option value="false" ${visual.useBrandDefaults === false ? "selected" : ""}>No</option>
            </select>
          </div>
          <div class="form-group">
            <label>Palette Override</label>
            <input class="form-input" id="chartPalette" placeholder="#3C64FF,#F23F55,#12DD7E" value="${escapeHtml(paletteOverrideInput)}">
          </div>
          <div class="form-group">
            <label>Decimals</label>
            <input class="form-input" id="chartDecimals" type="number" min="0" max="8" value="${escapeHtml(format.decimals ?? "")}">
          </div>
          <div class="form-group">
            <label>Prefix</label>
            <input class="form-input" id="chartPrefix" value="${escapeHtml(format.prefix || "")}">
          </div>
          <div class="form-group">
            <label>Suffix</label>
            <input class="form-input" id="chartSuffix" value="${escapeHtml(format.suffix || "")}">
          </div>
        </div>
      </details>
      <div class="form-grid">
        <button class="btn" type="button" id="btnApplyBinding">Apply chart config</button>
        <button class="btn" type="button" id="btnResetChartStyle">Reset chart style</button>
        <button class="btn btn--danger" type="button" id="btnClearBinding">Clear dataset binding</button>
      </div>
    `;
  }

  const preset = bindingPresetForType(component.type);
  const binding = component.dataBindings?.[0] || buildBinding(component.type, {});
  const columns = state.datasets.find((dataset) => dataset.id === binding.datasetId)?.columns || [];

  return `
    <div class="hr"></div>
    <div class="form-group">
      <label>Dataset Binding</label>
      <div class="helper">${escapeHtml(preset?.help || "")}</div>
    </div>
    <div class="form-group">
      <label>Dataset</label>
      <select class="form-select" id="bindDataset">
        <option value="">None</option>
        ${state.datasets
          .map((dataset) => `<option value="${dataset.id}" ${binding.datasetId === dataset.id ? "selected" : ""}>${escapeHtml(dataset.name)}</option>`)
          .join("")}
      </select>
    </div>
    ${
      binding.mode === "series"
        ? `
          <div class="form-grid">
            <div class="form-group">
              <label>Label Column</label>
              <select class="form-select" id="bindLabelCol">
                <option value="">Select</option>
                ${columns
                  .map((column) => `<option value="${column.key}" ${binding.mapping?.labelColumn === column.key ? "selected" : ""}>${escapeHtml(column.key)}</option>`)
                  .join("")}
              </select>
            </div>
            <div class="form-group">
              <label>Value Column</label>
              <select class="form-select" id="bindValueCol">
                <option value="">Select</option>
                ${columns
                  .map((column) => `<option value="${column.key}" ${binding.mapping?.valueColumn === column.key ? "selected" : ""}>${escapeHtml(column.key)}</option>`)
                  .join("")}
              </select>
            </div>
          </div>
        `
        : component.type === "lollipop"
          ? `
            <div class="form-grid">
              <div class="form-group">
                <label>Your Value Column</label>
                <select class="form-select" id="bindYouCol">
                  <option value="">Select</option>
                  ${columns
                    .map((column) => `<option value="${column.key}" ${binding.mapping?.youColumn === column.key ? "selected" : ""}>${escapeHtml(column.key)}</option>`)
                    .join("")}
                </select>
              </div>
              <div class="form-group">
                <label>Benchmark Column</label>
                <select class="form-select" id="bindBenchmarkCol">
                  <option value="">Select</option>
                  ${columns
                    .map((column) => `<option value="${column.key}" ${binding.mapping?.benchmarkColumn === column.key ? "selected" : ""}>${escapeHtml(column.key)}</option>`)
                    .join("")}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Row Index</label>
              <input class="form-input" id="bindRowIndex" type="number" min="0" value="${escapeHtml(String(binding.mapping?.rowIndex ?? 0))}">
            </div>
          `
          : `
            <div class="form-grid">
              <div class="form-group">
                <label>Value Column</label>
                <select class="form-select" id="bindValueCol">
                  <option value="">Select</option>
                  ${columns
                    .map((column) => `<option value="${column.key}" ${binding.mapping?.valueColumn === column.key ? "selected" : ""}>${escapeHtml(column.key)}</option>`)
                    .join("")}
                </select>
              </div>
              <div class="form-group">
                <label>Row Index</label>
                <input class="form-input" id="bindRowIndex" type="number" min="0" value="${escapeHtml(String(binding.mapping?.rowIndex ?? 0))}">
              </div>
            </div>
          `
    }
    <div class="form-grid">
      <button class="btn" type="button" id="btnApplyBinding">Apply binding</button>
      <button class="btn btn--danger" type="button" id="btnClearBinding">Clear binding</button>
    </div>
  `;
}

function attachBindingEvents(root, page, component) {
  if (!BINDABLE_TYPES.has(component.type)) return;

  if (component.type === "chart") {
    const datasetSelect = root.querySelector("#bindDataset");
    const familySelect = root.querySelector("#chartFamily");
    const variantSelect = root.querySelector("#chartVariant");
    const resolveColumns = (datasetId) => {
      const state = store.getState();
      return state.datasets.find((dataset) => dataset.id === datasetId)?.columns || [];
    };
    const setValue = (selector, value = "") => {
      const node = root.querySelector(selector);
      if (!node) return;
      node.value = value == null ? "" : String(value);
    };
    const numOrNull = (selector) => {
      const value = root.querySelector(selector)?.value;
      if (value == null || value === "") return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };
    const setColumnSelectOptions = (selector, columns, selectedValue = "", blankLabel = "Optional") => {
      const node = root.querySelector(selector);
      if (!node) return;
      node.innerHTML = `
        <option value="">${blankLabel}</option>
        ${columns.map((column) => `<option value="${escapeHtml(column.key)}" ${selectedValue === column.key ? "selected" : ""}>${escapeHtml(column.key)}</option>`).join("")}
      `;
      node.value = selectedValue || "";
    };

    function repopulateVariants() {
      if (!familySelect || !variantSelect) return;
      const family = familySelect.value || "line";
      const variants = chartVariantsForFamily(family);
      if (!variants.length) return;
      const current = variantSelect.value;
      variantSelect.innerHTML = variants
        .map((variant) => `<option value="${variant.id}" ${variant.id === current ? "selected" : ""}>${escapeHtml(variant.label)}</option>`)
        .join("");
      if (!variants.some((variant) => variant.id === current)) {
        variantSelect.value = variants[0].id;
      }
    }

    function applyRoleAutofillPreview() {
      const datasetId = datasetSelect?.value || "";
      const variantId = variantSelect?.value || component.props?.chart?.variant || "line_single";
      const columns = resolveColumns(datasetId);
      const binding = buildBinding("chart", {
        datasetId,
        variantId,
        columns,
      });
      const mapping = binding?.mapping || {};
      const y = Array.isArray(mapping.y) ? mapping.y : [];
      setColumnSelectOptions("#bindXCol", columns, mapping.x || "", "Select x column");
      setColumnSelectOptions("#bindYCol", columns, y[0] || "", "Select y column");
      setColumnSelectOptions("#bindYCol2", columns, y[1] || "", "Optional");
      setColumnSelectOptions("#bindY2Col", columns, mapping.y2 || "", "Optional");
      setColumnSelectOptions("#bindSeriesCol", columns, mapping.series || "", "Optional");
      setColumnSelectOptions("#bindSizeCol", columns, mapping.size || "", "Optional");
      setColumnSelectOptions("#bindColorCol", columns, mapping.color || "", "Optional");
      setColumnSelectOptions("#bindTargetCol", columns, mapping.target || "", "Optional");
      setColumnSelectOptions("#bindLabelCol", columns, mapping.label || "", "Optional");
      setValue("#bindAgg", binding?.transforms?.aggregation || "sum");
      setValue("#bindSortBy", binding?.transforms?.sortBy || "x");
      setValue("#bindSortDir", binding?.transforms?.sortDir || "asc");
      setValue("#bindTopN", binding?.transforms?.topN || "");
      setValue("#bindStackMode", binding?.transforms?.stackMode || "none");
    }

    familySelect?.addEventListener("change", () => {
      repopulateVariants();
      applyRoleAutofillPreview();
    });
    variantSelect?.addEventListener("change", () => {
      applyRoleAutofillPreview();
    });
    datasetSelect?.addEventListener("change", () => {
      applyRoleAutofillPreview();
    });
    applyRoleAutofillPreview();

    root.querySelector("#btnApplyBinding")?.addEventListener("click", () => {
      const datasetId = datasetSelect?.value || "";
      const variantId = variantSelect?.value || component.props?.chart?.variant || "line_single";
      const columns = resolveColumns(datasetId);
      const nextVariant = chartVariantById(variantId);
      const paletteOverride = parsePaletteOverrideInput(root.querySelector("#chartPalette")?.value || "");
      const mapping = {
        x: root.querySelector("#bindXCol")?.value || "",
        y: [root.querySelector("#bindYCol")?.value || "", root.querySelector("#bindYCol2")?.value || ""].filter(Boolean),
        y2: root.querySelector("#bindY2Col")?.value || "",
        series: root.querySelector("#bindSeriesCol")?.value || "",
        size: root.querySelector("#bindSizeCol")?.value || "",
        color: root.querySelector("#bindColorCol")?.value || "",
        target: root.querySelector("#bindTargetCol")?.value || "",
        label: root.querySelector("#bindLabelCol")?.value || "",
      };
      const transforms = {
        aggregation: root.querySelector("#bindAgg")?.value || "sum",
        sortBy: root.querySelector("#bindSortBy")?.value || "x",
        sortDir: root.querySelector("#bindSortDir")?.value || "asc",
        topN: root.querySelector("#bindTopN")?.value || "",
        stackMode: root.querySelector("#bindStackMode")?.value || "none",
      };
      const binding = buildBinding("chart", {
        datasetId,
        variantId,
        columns,
        mapping,
        transforms,
      });

      const chart = component.props?.chart || {};
      const nextChart = {
        ...chart,
        family: nextVariant.family,
        variant: nextVariant.id,
        visual: {
          ...(chart.visual || {}),
          showLegend: (root.querySelector("#chartShowLegend")?.value || "true") === "true",
          showLabels: (root.querySelector("#chartShowLabels")?.value || "false") === "true",
          smooth: (root.querySelector("#chartSmooth")?.value || "false") === "true",
          step: (root.querySelector("#chartStep")?.value || "false") === "true",
          useBrandDefaults: (root.querySelector("#chartUseBrandDefaults")?.value || "true") === "true",
          palette: paletteOverride.join(","),
          paletteOverride,
        },
        axis: {
          ...(chart.axis || {}),
          xType: root.querySelector("#chartAxisXType")?.value || "auto",
          dateMode: root.querySelector("#chartDateMode")?.value || "auto",
          yMin: numOrNull("#chartYMin"),
          yMax: numOrNull("#chartYMax"),
          y2Min: numOrNull("#chartY2Min"),
          y2Max: numOrNull("#chartY2Max"),
        },
        format: {
          ...(chart.format || {}),
          decimals: numOrNull("#chartDecimals"),
          prefix: root.querySelector("#chartPrefix")?.value || "",
          suffix: root.querySelector("#chartSuffix")?.value || "",
        },
      };

      updateComponent(page.id, component.id, {
        props: {
          ...(component.props || {}),
          chart: nextChart,
        },
        dataBindings: datasetId ? [binding] : [],
      }, "bind-dataset");
      showToast("Chart config applied");
    });

    root.querySelector("#btnResetChartStyle")?.addEventListener("click", () => {
      const chartModel = component.props?.chart || {};
      if (!chartStyleNeedsReset(chartModel)) {
        showToast("Chart style already uses brand defaults");
        return;
      }
      updateComponent(page.id, component.id, {
        props: {
          ...(component.props || {}),
          chart: resetChartStyleModel(chartModel),
        },
      }, "reset-chart-style");
      showToast("Chart style reset to brand defaults");
    });

    root.querySelector("#btnClearBinding")?.addEventListener("click", () => {
      updateComponent(page.id, component.id, { dataBindings: [] }, "clear-binding");
      showToast("Dataset binding removed");
    });

    return;
  }

  root.querySelector("#btnApplyBinding")?.addEventListener("click", () => {
    const datasetId = root.querySelector("#bindDataset")?.value || "";
    const preset = bindingPresetForType(component.type);

    if (!datasetId) {
      showToast("Choose a dataset first");
      return;
    }

    const binding = buildBinding(component.type, {
      datasetId,
      mode: preset.mode,
      targetPath: preset.targetPath,
      mapping: {},
    });

    if (binding.mode === "series") {
      binding.mapping.labelColumn = root.querySelector("#bindLabelCol")?.value || "";
      binding.mapping.valueColumn = root.querySelector("#bindValueCol")?.value || "";
    } else if (component.type === "lollipop") {
      binding.mapping.youColumn = root.querySelector("#bindYouCol")?.value || "";
      binding.mapping.benchmarkColumn = root.querySelector("#bindBenchmarkCol")?.value || "";
      binding.mapping.rowIndex = Number(root.querySelector("#bindRowIndex")?.value || 0);
    } else {
      binding.mapping.valueColumn = root.querySelector("#bindValueCol")?.value || "";
      binding.mapping.rowIndex = Number(root.querySelector("#bindRowIndex")?.value || 0);
    }

    updateComponent(page.id, component.id, { dataBindings: [binding] }, "bind-dataset");
    showToast("Binding applied");
  });

  root.querySelector("#btnClearBinding")?.addEventListener("click", () => {
    updateComponent(page.id, component.id, { dataBindings: [] }, "clear-binding");
    showToast("Binding removed");
  });
}

function pathLeaf(path) {
  const tokens = String(path || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  return tokens[tokens.length - 1] || "";
}

function pathParent(path) {
  return String(path || "")
    .replace(/(\[[0-9]+\]|[^.[\]]+)$/, "")
    .replace(/\.$/, "");
}

function sliderSpecFor(path, value, props = {}) {
  const leaf = pathLeaf(path).toLowerCase();
  const loweredPath = String(path || "").toLowerCase();

  if (leaf === "scale" || leaf.endsWith("scale")) return { min: 0.4, max: 3, step: 0.05 };
  if (leaf.includes("percent") || loweredPath.includes("percent")) return { min: 0, max: 100, step: 1 };
  if (leaf === "delta" || leaf.endsWith("delta")) return { min: -100, max: 100, step: 1 };
  if (leaf === "rowindex") return { min: 0, max: 60, step: 1 };
  if (leaf === "fontsize") return { min: 8, max: 220, step: 1 };
  if (leaf === "lineheight") return { min: 0.8, max: 3, step: 0.05 };
  if (leaf === "letterspacing") return { min: -8, max: 20, step: 0.1 };

  const parent = pathParent(path);
  const siblingPath = (siblingLeaf) => (parent ? `${parent}.${siblingLeaf}` : siblingLeaf);

  if (leaf === "max") {
    const siblingMin = toNumber(getByPath(props, siblingPath("min")), 0);
    return { min: Math.min(siblingMin + 1, 1999), max: 2000, step: 1 };
  }

  if (leaf === "min") {
    const siblingMax = Math.max(50, toNumber(getByPath(props, siblingPath("max")), 1000));
    return { min: 0, max: siblingMax, step: 1 };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const absValue = Math.abs(value);
    const base = Math.max(100, absValue, 1);
    const min = value < 0 ? -base * 2 : 0;
    const max = Math.max(base * 2, 100);
    const step = absValue < 10 ? 0.1 : 1;
    return { min, max, step };
  }
  return { min: 0, max: 100, step: 1 };
}

function renderLeafControl(component, props, path, value, labelText) {
  if (!isControlPathVisible(component.type, path)) {
    return "";
  }

  const label = escapeHtml(labelText || propLabel(pathLeaf(path)));
  const safePath = escapeHtml(path);
  const controlId = escapeHtml(encodeURIComponent(path));

  if (typeof value === "boolean") {
    return `
      <div class="form-group">
        <label>${label}</label>
        <select class="form-select" data-prop-path="${safePath}" data-prop-type="boolean" data-prop-control-id="${controlId}">
          <option value="true" ${value ? "selected" : ""}>True</option>
          <option value="false" ${!value ? "selected" : ""}>False</option>
        </select>
      </div>
    `;
  }

  if (typeof value === "number") {
    const slider = sliderSpecFor(path, value, props);
    const minAttr = slider ? ` min="${slider.min}"` : "";
    const maxAttr = slider ? ` max="${slider.max}"` : "";
    const stepAttr = slider ? ` step="${slider.step}"` : ` step="any"`;
    return `
      <div class="form-group">
        <label>${label}</label>
        <input class="form-input" data-prop-path="${safePath}" data-prop-type="number" data-prop-control-id="${controlId}" type="number" value="${escapeHtml(String(value))}"${minAttr}${maxAttr}${stepAttr}>
        ${
          slider
            ? `<input class="form-range" data-prop-path="${safePath}" data-prop-type="number" data-prop-control-id="${controlId}" type="range" min="${slider.min}" max="${slider.max}" step="${slider.step}" value="${escapeHtml(String(value))}">`
            : ""
        }
      </div>
    `;
  }

  if (typeof value === "string" && String(value).length > 120) {
    return `
      <div class="form-group">
        <label>${label}</label>
        <textarea class="form-textarea" data-prop-path="${safePath}" data-prop-type="string" data-prop-control-id="${controlId}">${escapeHtml(String(value))}</textarea>
      </div>
    `;
  }

  if (typeof value === "string") {
    return `
      <div class="form-group">
        <label>${label}</label>
        <input class="form-input" data-prop-path="${safePath}" data-prop-type="string" data-prop-control-id="${controlId}" value="${escapeHtml(String(value))}">
      </div>
    `;
  }

  return "";
}

function renderValueControl(component, props, value, path, depth, key) {
  const label = propLabel(key || pathLeaf(path));

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return renderLeafControl(component, props, path, value, label);
  }

  if (Array.isArray(value)) {
    return renderArrayControlGroup(component, props, value, path, depth, key);
  }

  if (value && typeof value === "object") {
    const childHtml = renderObjectEntries(component, props, value, path, depth + 1);
    if (!childHtml) return "";
    const groupLabel = escapeHtml(groupLabelForPath(component.type, path, key));
    return `
      <section class="prop-group" data-prop-depth="${depth}">
        <div class="prop-group__header">${groupLabel}</div>
        <div class="prop-group__body">${childHtml}</div>
      </section>
    `;
  }

  return "";
}

function renderObjectEntries(component, props, objectValue, basePath, depth = 0) {
  return Object.entries(objectValue || {})
    .map(([key, child]) => {
      const nextPath = basePath ? `${basePath}.${key}` : key;
      return renderValueControl(component, props, child, nextPath, depth, key);
    })
    .filter(Boolean)
    .join("");
}

function renderArrayControlGroup(component, props, items, path, depth, key) {
  const list = Array.isArray(items) ? items : [];
  const spec = arrayControlSpecFor(component.type, path);
  const canAdd = spec.allowAddRemove && list.length < spec.maxItems;
  const headerLabel = escapeHtml(groupLabelForPath(component.type, path, key));
  const safePath = escapeHtml(path);

  const renderedItems = list
    .map((entry, index) => {
      const itemPath = `${path}[${index}]`;
      const itemLabel = `${spec.itemLabel} ${index + 1}`;
      let body = "";

      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        body = renderLeafControl(component, props, itemPath, entry, itemLabel);
      } else if (Array.isArray(entry)) {
        body = renderArrayControlGroup(component, props, entry, itemPath, depth + 1, itemLabel);
      } else if (entry && typeof entry === "object") {
        body = renderObjectEntries(component, props, entry, itemPath, depth + 2);
      }

      if (!body) return "";

      const canRemove = spec.allowAddRemove && list.length > spec.minItems;
      const removeButton = canRemove
        ? `<button class="btn btn--compact prop-array-item__remove" type="button" data-array-action="remove" data-array-path="${safePath}" data-array-index="${index}">-</button>`
        : "";

      return `
        <div class="prop-array-item" data-prop-depth="${depth + 1}">
          <div class="prop-array-item__header">
            <span>${escapeHtml(itemLabel)}</span>
            ${removeButton}
          </div>
          <div class="prop-array-item__body">${body}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  return `
    <section class="prop-group prop-array-group" data-prop-depth="${depth}">
      <div class="prop-group__header">
        <span>${headerLabel}</span>
      </div>
      <div class="prop-group__body">
        ${renderedItems || `<div class="helper">No items configured.</div>`}
        ${canAdd ? `<div class="prop-array-actions"><button class="btn" type="button" data-array-action="add" data-array-path="${safePath}">Add ${escapeHtml(spec.itemLabel)}</button></div>` : ""}
      </div>
    </section>
  `;
}

function renderPropsEditor(component) {
  const props = component?.props || {};
  const content = renderObjectEntries(component, props, props, "", 0);

  if (!content) {
    return '<div class="helper">No simple controls for this component. Use advanced JSON if needed.</div>';
  }

  return `<div class="prop-controls">${content}</div>`;
}

function attachPropEditorEvents(root, page, component) {
  let propPreviewSession = null;
  let propPreviewFrameId = null;
  let propPreviewPending = null;

  function clonePreviewValue(value) {
    if (value && typeof value === "object") return deepClone(value);
    return value;
  }

  function readFieldValue(field) {
    const valueType = field.dataset.propType;
    if (valueType === "number") {
      return toNumber(field.value, 0);
    }
    if (valueType === "boolean") {
      return field.value === "true";
    }
    return field.value;
  }

  function syncTwinFields(sourceField, value) {
    const controlId = sourceField.dataset.propControlId;
    if (!controlId) return;
    root.querySelectorAll(`[data-prop-control-id="${controlId}"]`).forEach((field) => {
      if (field === sourceField) return;
      field.value = String(value);
    });
  }

  function writePropPathInDraft(draft, path, nextValue) {
    const targetPage = findPage(draft, page.id);
    const targetComponent = findComponent(targetPage, component.id);
    if (!targetComponent) return false;
    if (!targetComponent.props || typeof targetComponent.props !== "object") {
      targetComponent.props = {};
    }
    const currentValue = getByPath(targetComponent.props, path);
    if (Object.is(currentValue, nextValue)) return false;
    setByPath(targetComponent.props, path, nextValue);
    return true;
  }

  function ensurePropPreviewSession(path) {
    const state = store.getState();
    const targetPage = findPage(state, page.id);
    const targetComponent = findComponent(targetPage, component.id);
    if (!targetComponent || !targetComponent.props || typeof targetComponent.props !== "object") {
      return false;
    }
    if (
      propPreviewSession &&
      propPreviewSession.pageId === page.id &&
      propPreviewSession.componentId === component.id &&
      propPreviewSession.path === path
    ) {
      return true;
    }
    propPreviewSession = {
      pageId: page.id,
      componentId: component.id,
      path,
      baseline: clonePreviewValue(getByPath(targetComponent.props, path)),
    };
    return true;
  }

  function queuePropPreview(path, nextValue) {
    if (!ensurePropPreviewSession(path)) return;
    propPreviewPending = { path, value: nextValue };
    if (propPreviewFrameId != null) return;
    propPreviewFrameId = window.requestAnimationFrame(() => {
      propPreviewFrameId = null;
      if (!propPreviewPending) return;
      const pending = propPreviewPending;
      propPreviewPending = null;
      store.commit((draft) => {
        writePropPathInDraft(draft, pending.path, pending.value);
      }, { historyLabel: "props-controls-preview", skipHistory: true });
    });
  }

  function commitPropPath(path, nextValue, historyLabel = "props-controls") {
    if (propPreviewFrameId != null) {
      window.cancelAnimationFrame(propPreviewFrameId);
      propPreviewFrameId = null;
    }
    propPreviewPending = null;

    const state = store.getState();
    const targetPage = findPage(state, page.id);
    const targetComponent = findComponent(targetPage, component.id);
    if (!targetComponent || !targetComponent.props || typeof targetComponent.props !== "object") {
      propPreviewSession = null;
      return;
    }

    const currentValue = getByPath(targetComponent.props, path);
    const hasSession = Boolean(
      propPreviewSession &&
      propPreviewSession.pageId === page.id &&
      propPreviewSession.componentId === component.id &&
      propPreviewSession.path === path,
    );

    if (hasSession) {
      const baseline = propPreviewSession.baseline;
      if (!Object.is(currentValue, baseline)) {
        store.commit((draft) => {
          writePropPathInDraft(draft, path, baseline);
        }, { historyLabel: "props-controls-preview", skipHistory: true });
      }
      if (!Object.is(baseline, nextValue)) {
        store.commit((draft) => {
          writePropPathInDraft(draft, path, nextValue);
        }, { historyLabel });
        scheduleDebouncedAutoReflow(`component:${historyLabel}`);
      }
      propPreviewSession = null;
      return;
    }

    if (Object.is(currentValue, nextValue)) return;
    store.commit((draft) => {
      writePropPathInDraft(draft, path, nextValue);
    }, { historyLabel });
    scheduleDebouncedAutoReflow(`component:${historyLabel}`);
  }

  root.querySelectorAll("[data-prop-path]").forEach((field) => {
    const path = field.dataset.propPath;
    if (!path) return;

    const commit = () => {
      const nextValue = readFieldValue(field);
      if (field.dataset.propType === "number") {
        syncTwinFields(field, nextValue);
      }
      commitPropPath(path, nextValue, "props-controls");
    };

    const preview = () => {
      const nextValue = readFieldValue(field);
      syncTwinFields(field, nextValue);
      queuePropPreview(path, nextValue);
    };

    field.addEventListener("change", commit);
    if (field.dataset.propType === "number") {
      if (field.type === "range") {
        field.addEventListener("input", preview);
      } else {
        field.addEventListener("input", () => {
          const nextValue = readFieldValue(field);
          syncTwinFields(field, nextValue);
        });
      }
    }
  });

  root.querySelectorAll("[data-array-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.dataset.arrayPath || "";
      const action = button.dataset.arrayAction || "";
      if (!path || !action) return;

      const state = store.getState();
      const targetPage = findPage(state, page.id);
      const targetComponent = findComponent(targetPage, component.id);
      if (!targetComponent) return;

      const nextProps = deepClone(targetComponent.props || {});
      const currentArray = getByPath(nextProps, path);
      const list = Array.isArray(currentArray) ? [...currentArray] : [];
      const spec = arrayControlSpecFor(targetComponent.type, path);

      if (action === "add") {
        if (!spec.allowAddRemove || list.length >= spec.maxItems) return;
        list.push(createArrayItemForPath(targetComponent.type, path, list));
      } else if (action === "remove") {
        if (!spec.allowAddRemove || list.length <= spec.minItems) return;
        const removeIndex = Number(button.dataset.arrayIndex);
        if (!Number.isInteger(removeIndex) || removeIndex < 0 || removeIndex >= list.length) return;
        list.splice(removeIndex, 1);
      } else {
        return;
      }

      setByPath(nextProps, path, list);
      updateComponent(page.id, component.id, { props: nextProps }, "props-controls-array");
    });
  });
}

function renderInspectorSettingsTab(state) {
  const root = refs.inspector;
  const { page, component } = selectedEntities(state);
  if (!page || !component) {
    root.innerHTML = `
      <div class="inspector-empty">Select a component, then click <strong>Edit</strong> on its toolbar to open controls.</div>
    `;
    return;
  }

  const layout = getComponentLayout(component, state.project.printProfile);
  const isLocked = Boolean(component.layoutConstraints?.locked);
  const controlsDefaultOpen = component.type !== "chart";
  const basicOpen = readInspectorSettingsSectionOpen("basic", true);
  const controlsOpen = readInspectorSettingsSectionOpen("controls", controlsDefaultOpen);
  const layoutOpen = readInspectorSettingsSectionOpen("layout", false);
  const advancedOpen = readInspectorSettingsSectionOpen("advanced", false);
  root.innerHTML = `
    <div class="inspector-summary-card">
      <div class="inspector-summary-grid">
        <div class="inspector-summary-item">
          <label>Page</label>
          <div>${escapeHtml(page.title || "Page")}</div>
        </div>
        <div class="inspector-summary-item">
          <label>Component</label>
          <div>${escapeHtml(componentTypeLabel(component.type))}</div>
        </div>
      </div>
      <div class="inspector-summary-lock">
        <button class="btn" type="button" id="btnToggleComponentLockInspector">${isLocked ? "Unlock" : "Lock"}</button>
        <div class="helper">${isLocked ? "Locked: drag/resize disabled." : "Unlocked: drag/resize enabled."}</div>
      </div>
    </div>

    <details class="inspector-section" data-inspector-section="basic" ${basicOpen ? "open" : ""}>
      <summary>Basic</summary>
      <div class="inspector-section-body">
        <div class="form-grid">
          <div class="form-group"><label>Title</label><input class="form-input" id="componentTitle" value="${escapeHtml(component.title || "")}"></div>
          <div class="form-group">
            <label>Status</label>
            <select class="form-select" id="componentStatus">
              <option value="" ${!component.status ? "selected" : ""}>None</option>
              <option value="low" ${component.status === "low" ? "selected" : ""}>Low</option>
              <option value="medium" ${component.status === "medium" ? "selected" : ""}>Medium</option>
              <option value="high" ${component.status === "high" ? "selected" : ""}>High</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Body</label>
          <textarea class="form-textarea" id="componentBody">${escapeHtml(component.body || "")}</textarea>
        </div>
      </div>
    </details>

    <details class="inspector-section" data-inspector-section="controls" ${controlsOpen ? "open" : ""}>
      <summary>Component Controls</summary>
      <div class="inspector-section-body">
        ${renderPropsEditor(component)}
        ${
          component.type === "cover_hero"
            ? `
              <div class="form-group">
                <label>Cover Image Asset</label>
                <select class="form-select" id="coverAssetSelect">
                  <option value="">Use URL in props</option>
                  ${state.assets
                    .filter((asset) => asset.type === "image")
                    .map(
                      (asset) =>
                        `<option value="${asset.id}" ${
                          component.props?.imageAssetId === asset.id ? "selected" : ""
                        }>${escapeHtml(asset.filename)}</option>`,
                    )
                    .join("")}
                </select>
                <div class="helper">Import an image from the Settings drawer, then select it here.</div>
              </div>
              <div class="form-group">
                <label>Headline Vertical Offset</label>
                <input class="form-input" id="coverContentOffsetY" type="number" min="-260" max="260" step="1" value="${escapeHtml(String(toNumber(component.props?.contentOffsetY, 0)))}">
                <input class="form-range" id="coverContentOffsetYRange" type="range" min="-260" max="260" step="1" value="${escapeHtml(String(toNumber(component.props?.contentOffsetY, 0)))}">
                <div class="helper">Move the cover headline block up/down to avoid clipping.</div>
              </div>
            `
            : ""
        }
      </div>
    </details>

    <details class="inspector-section" data-inspector-section="layout" ${layoutOpen ? "open" : ""}>
      <summary>Layout & Sizing</summary>
      <div class="inspector-section-body">
        <div class="form-group">
          <button class="btn" type="button" id="btnFitComponent">Auto-fit Component Height</button>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>Column Start</label><input class="form-input" id="layoutColStart" type="number" min="1" max="24" value="${layout.colStart}" ${isLocked ? "disabled" : ""}></div>
          <div class="form-group"><label>Column Span</label><input class="form-input" id="layoutColSpan" type="number" min="1" max="24" value="${layout.colSpan}" ${isLocked ? "disabled" : ""}></div>
          <div class="form-group"><label>Row Start</label><input class="form-input" id="layoutRowStart" type="number" min="1" max="800" value="${layout.rowStart}" ${isLocked ? "disabled" : ""}></div>
          <div class="form-group"><label>Row Span</label><input class="form-input" id="layoutRowSpan" type="number" min="1" max="800" value="${layout.rowSpan}" ${isLocked ? "disabled" : ""}></div>
        </div>
      </div>
    </details>

    <details class="inspector-section advanced-json" data-inspector-section="advanced" ${advancedOpen ? "open" : ""}>
      <summary>Advanced Props (JSON)</summary>
      <div class="inspector-section-body">
        <div class="form-group">
          <textarea class="form-textarea" id="componentProps">${escapeHtml(JSON.stringify(component.props || {}, null, 2))}</textarea>
          <div class="helper">Use this for advanced or bulk edits when needed.</div>
          </div>
      </div>
    </details>
  `;
  bindInspectorSettingsSectionToggles(root);

  root.querySelector("#btnToggleComponentLockInspector")?.addEventListener("click", () => {
    toggleComponentLock(page.id, component.id);
  });

  root.querySelector("#componentTitle")?.addEventListener("input", (event) => {
    previewInspectorComponentText(page.id, component.id, "title", event.target.value);
  });
  root.querySelector("#componentTitle")?.addEventListener("change", (event) => {
    commitInspectorComponentText(page.id, component.id, "title", event.target.value);
  });

  root.querySelector("#componentStatus")?.addEventListener("change", (event) => {
    updateComponent(page.id, component.id, { status: event.target.value });
  });

  root.querySelector("#componentBody")?.addEventListener("input", (event) => {
    previewInspectorComponentText(page.id, component.id, "body", event.target.value);
  });
  root.querySelector("#componentBody")?.addEventListener("change", (event) => {
    commitInspectorComponentText(page.id, component.id, "body", event.target.value);
  });

  attachPropEditorEvents(root, page, component);

  root.querySelector("#componentProps")?.addEventListener("change", (event) => {
    const parsed = safeJsonParse(event.target.value);
    if (!parsed.ok || typeof parsed.value !== "object") {
      showToast("Invalid JSON in props editor");
      return;
    }
    updateComponent(page.id, component.id, { props: parsed.value }, "props-json");
  });

  root.querySelector("#coverAssetSelect")?.addEventListener("change", (event) => {
    const assetId = event.target.value;
    const asset = state.assets.find((entry) => entry.id === assetId);
    const nextProps = {
      ...(component.props || {}),
      imageAssetId: assetId || null,
    };
    if (asset?.dataUrl) {
      nextProps.imageUrl = asset.dataUrl;
    }
    updateComponent(page.id, component.id, { props: nextProps }, "cover-asset");
  });

  function setCoverContentOffset(value, { commit = false } = {}) {
    const nextOffset = Math.max(-260, Math.min(260, Math.round(toNumber(value, 0))));
    const numeric = root.querySelector("#coverContentOffsetY");
    const range = root.querySelector("#coverContentOffsetYRange");
    if (numeric) numeric.value = String(nextOffset);
    if (range) range.value = String(nextOffset);

    if (commit) {
      const snapshot = store.getState();
      const targetPage = findPage(snapshot, page.id);
      const targetComponent = findComponent(targetPage, component.id);
      if (!targetComponent) return;
      const currentOffset = Math.round(toNumber(targetComponent.props?.contentOffsetY, 0));
      if (currentOffset === nextOffset) return;
      updateComponent(page.id, component.id, {
        props: {
          ...(targetComponent.props || {}),
          contentOffsetY: nextOffset,
        },
      }, "cover-content-offset");
      return;
    }

    store.commit((draft) => {
      const targetPage = findPage(draft, page.id);
      const targetComponent = findComponent(targetPage, component.id);
      if (!targetComponent) return;
      const currentOffset = Math.round(toNumber(targetComponent.props?.contentOffsetY, 0));
      if (currentOffset === nextOffset) return;
      targetComponent.props = {
        ...(targetComponent.props || {}),
        contentOffsetY: nextOffset,
      };
    }, { historyLabel: "cover-content-offset-preview", skipHistory: true });
  }

  root.querySelector("#coverContentOffsetY")?.addEventListener("input", (event) => {
    setCoverContentOffset(event.target.value, { commit: false });
  });
  root.querySelector("#coverContentOffsetYRange")?.addEventListener("input", (event) => {
    setCoverContentOffset(event.target.value, { commit: false });
  });
  root.querySelector("#coverContentOffsetY")?.addEventListener("change", (event) => {
    setCoverContentOffset(event.target.value, { commit: true });
  });
  root.querySelector("#coverContentOffsetYRange")?.addEventListener("change", (event) => {
    setCoverContentOffset(event.target.value, { commit: true });
  });

  root.querySelector("#btnFitComponent")?.addEventListener("click", () => {
    const node = refs.pages.querySelector(`[data-page-id="${page.id}"] [data-component-id="${component.id}"]`);
    const content =
      node?.querySelector(
        ".panel-card, .design-text, .delta-card, .cover-hero, .section-intro, .recommendation-card, .response-pair, .kpi-columns",
      ) || node;
    if (!content) return;
    autoFitComponentHeight(page.id, component.id, content);
    showToast("Component height fitted to content");
  });

  const layoutFields = ["layoutColStart", "layoutColSpan", "layoutRowStart", "layoutRowSpan"];
  layoutFields.forEach((field) => {
    root.querySelector(`#${field}`)?.addEventListener("input", () => {
      updateComponentLayout(page.id, component.id, {
        colStart: root.querySelector("#layoutColStart")?.value,
        colSpan: root.querySelector("#layoutColSpan")?.value,
        rowStart: root.querySelector("#layoutRowStart")?.value,
        rowSpan: root.querySelector("#layoutRowSpan")?.value,
      });
    });
  });
}

function renderResourceLists(state) {
  return `
    <div class="form-group">
      <label>Datasets</label>
      <div class="helper">${state.datasets.length} dataset(s) loaded</div>
      ${
        state.datasets.length
          ? `
            <ul class="resource-list">
              ${state.datasets
                .map(
                  (dataset) =>
                    `<li><strong>${escapeHtml(dataset.name)}</strong><span>${dataset.rows?.length || 0} rows · ${dataset.columns?.length || 0} cols</span></li>`,
                )
                .join("")}
            </ul>
          `
          : `<div class="helper">No datasets imported yet.</div>`
      }
      <div class="form-group" style="margin-top:8px;">
        <button class="btn" type="button" id="btnImportDataPanel">Import Data</button>
      </div>
    </div>
    <div class="form-group">
      <label>Image Assets</label>
      <div class="helper">${state.assets.length} asset(s) loaded</div>
      ${
        state.assets.length
          ? `
            <ul class="resource-list">
              ${state.assets
                .map(
                  (asset) =>
                    `<li><strong>${escapeHtml(asset.filename || asset.id)}</strong><span>${Math.max(1, Math.round((asset.size || 0) / 1024))} KB</span></li>`,
                )
                .join("")}
            </ul>
          `
          : `<div class="helper">No images imported yet.</div>`
      }
      <div class="form-group" style="margin-top:8px;">
        <button class="btn" type="button" id="btnImportImagePanel">Import Image</button>
      </div>
    </div>
  `;
}

function renderInspectorLayoutTab(state) {
  const root = refs.inspector;
  const { page, component } = selectedEntities(state);
  root.innerHTML = `
    ${
      !page
        ? '<div class="inspector-empty">Select a page to edit layout controls.</div>'
        : `
          <div class="form-group">
            <label>Selected Page</label>
            <div class="helper">${escapeHtml(page.title || page.templateId)}</div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>Theme</label>
              <select class="form-select" id="pageTheme">
                <option value="light_data" ${page.theme === "light_data" ? "selected" : ""}>Light data</option>
                <option value="dark_intro" ${page.theme === "dark_intro" ? "selected" : ""}>Dark intro</option>
              </select>
            </div>
            <div class="form-group">
              <label>Page Kind</label>
              <select class="form-select" id="pageKind">
                <option value="${PAGE_KINDS.cover}" ${page.pageKind === PAGE_KINDS.cover ? "selected" : ""}>Cover</option>
                <option value="${PAGE_KINDS.divider}" ${page.pageKind === PAGE_KINDS.divider ? "selected" : ""}>Divider</option>
                <option value="${PAGE_KINDS.agenda}" ${page.pageKind === PAGE_KINDS.agenda ? "selected" : ""}>Agenda</option>
                <option value="${PAGE_KINDS.content}" ${page.pageKind === PAGE_KINDS.content ? "selected" : ""}>Content</option>
                <option value="${PAGE_KINDS.end}" ${page.pageKind === PAGE_KINDS.end ? "selected" : ""}>End</option>
                <option value="${PAGE_KINDS.custom}" ${page.pageKind === PAGE_KINDS.custom ? "selected" : ""}>Custom</option>
              </select>
            </div>
            <div class="form-group">
              <label>Show grid</label>
              <select class="form-select" id="pageGrid">
                <option value="false" ${!page.showGrid ? "selected" : ""}>No</option>
                <option value="true" ${page.showGrid ? "selected" : ""}>Yes</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Layout Mode</label>
            <select class="form-select" id="pageLayoutMode">
              <option value="template" ${page.layoutMode === "template" ? "selected" : ""}>Template locked</option>
              <option value="free" ${page.layoutMode === "free" ? "selected" : ""}>Free layout</option>
            </select>
          </div>
          <div class="form-group">
            <label>Full Bleed Page</label>
            <select class="form-select" id="pageFullBleed">
              <option value="false" ${!page.fullBleed ? "selected" : ""}>No</option>
              <option value="true" ${page.fullBleed ? "selected" : ""}>Yes</option>
            </select>
          </div>
        `
    }
    <div class="hr"></div>
    ${
      !component
        ? '<div class="inspector-empty">Select a component to change column/row sizing.</div>'
        : `
          <div class="form-group">
            <label>Selected Component</label>
            <div class="helper">${escapeHtml(componentTypeLabel(component.type))} ${component.layoutConstraints?.locked ? "(locked slot)" : ""}</div>
          </div>
          <div class="form-grid">
            <div class="form-group"><label>Column Start</label><input class="form-input" id="layoutColStart" type="number" min="1" max="24" value="${getComponentLayout(component, state.project.printProfile).colStart}" ${component.layoutConstraints?.locked ? "disabled" : ""}></div>
            <div class="form-group"><label>Column Span</label><input class="form-input" id="layoutColSpan" type="number" min="1" max="24" value="${getComponentLayout(component, state.project.printProfile).colSpan}" ${component.layoutConstraints?.locked ? "disabled" : ""}></div>
            <div class="form-group"><label>Row Start</label><input class="form-input" id="layoutRowStart" type="number" min="1" max="800" value="${getComponentLayout(component, state.project.printProfile).rowStart}" ${component.layoutConstraints?.locked ? "disabled" : ""}></div>
            <div class="form-group"><label>Row Span</label><input class="form-input" id="layoutRowSpan" type="number" min="1" max="800" value="${getComponentLayout(component, state.project.printProfile).rowSpan}" ${component.layoutConstraints?.locked ? "disabled" : ""}></div>
          </div>
          <div class="form-group">
            <button class="btn" type="button" id="btnFitComponent">Auto-fit Component Height</button>
          </div>
        `
    }
  `;

  if (!page) return;

  root.querySelector("#pageTheme")?.addEventListener("change", (event) => updatePage(page.id, { theme: event.target.value }));
  root.querySelector("#pageKind")?.addEventListener("change", (event) => updatePage(page.id, { pageKind: event.target.value }, "page-kind"));
  root.querySelector("#pageGrid")?.addEventListener("change", (event) => updatePage(page.id, { showGrid: event.target.value === "true" }, "grid"));
  root.querySelector("#pageLayoutMode")?.addEventListener("change", (event) => {
    const nextMode = event.target.value;
    if (nextMode === "free") {
      unlockPage(page.id, "page-mode");
      return;
    }
    updatePage(page.id, { layoutMode: nextMode }, "page-mode");
  });
  root.querySelector("#pageFullBleed")?.addEventListener("change", (event) => {
    updatePage(page.id, { fullBleed: event.target.value === "true" }, "page-full-bleed");
  });

  if (!component) return;
  const layoutFields = ["layoutColStart", "layoutColSpan", "layoutRowStart", "layoutRowSpan"];
  layoutFields.forEach((field) => {
    root.querySelector(`#${field}`)?.addEventListener("input", () => {
      updateComponentLayout(page.id, component.id, {
        colStart: root.querySelector("#layoutColStart")?.value,
        colSpan: root.querySelector("#layoutColSpan")?.value,
        rowStart: root.querySelector("#layoutRowStart")?.value,
        rowSpan: root.querySelector("#layoutRowSpan")?.value,
      });
    });
  });

  root.querySelector("#btnFitComponent")?.addEventListener("click", () => {
    const node = refs.pages.querySelector(`[data-page-id="${page.id}"] [data-component-id="${component.id}"]`);
    const content =
      node?.querySelector(
        ".panel-card, .design-text, .delta-card, .cover-hero, .section-intro, .recommendation-card, .response-pair, .kpi-columns",
      ) || node;
    if (!content) return;
    autoFitComponentHeight(page.id, component.id, content);
    showToast("Component height fitted to content");
  });
}

function renderInspectorDataTab(state) {
  const root = refs.inspector;
  const { page, component } = selectedEntities(state);
  root.innerHTML = `
    ${renderResourceLists(state)}
    ${
      page && component && BINDABLE_TYPES.has(component.type)
        ? `
          <div class="hr"></div>
          <div class="form-group">
            <label>Selected Component</label>
            <div class="helper">${escapeHtml(componentTypeLabel(component.type))}</div>
          </div>
          ${renderBindingEditor(state, page, component)}
        `
        : '<div class="hr"></div><div class="inspector-empty">Select a bindable chart/KPI component to configure dataset bindings.</div>'
    }
  `;

  root.querySelector("#btnImportDataPanel")?.addEventListener("click", () => refs.fileCsv.click());
  root.querySelector("#btnImportImagePanel")?.addEventListener("click", () => refs.fileAsset.click());
  if (page && component && BINDABLE_TYPES.has(component.type)) {
    attachBindingEvents(root, page, component);
  }
}

function renderInspector(state) {
  const tab = state.ui.inspectorTab === "data" ? "data" : "settings";
  if (tab === "data") {
    renderInspectorDataTab(state);
    return;
  }
  renderInspectorSettingsTab(state);
}

function applyThemeTokens(state) {
  const tokens = state.theme?.tokens || {};
  const map = {
    statusLow: "--status-low",
    statusMedium: "--status-medium",
    statusHigh: "--status-high",
    statusBlue: "--status-blue",
    canvas: "--canvas",
    panel: "--panel",
  };
  for (const [tokenKey, cssVar] of Object.entries(map)) {
    const value = tokens[tokenKey];
    if (typeof value === "string" && value.trim()) {
      document.documentElement.style.setProperty(cssVar, value.trim());
    } else {
      document.documentElement.style.removeProperty(cssVar);
    }
  }
}

function syncTopbar(state) {
  const normalizedMargins = normalizeMargins(state.project.marginsMm);
  if (refs.title) refs.title.textContent = state.project.name;
  if (refs.subtitle) {
    refs.subtitle.textContent = `${state.project.org} · ${state.project.period} · ${PRINT_PROFILES[state.project.printProfile]?.label || state.project.printProfile}`;
  }
  if (refs.profile) refs.profile.value = state.project.printProfile;
  if (refs.marginTopMm) refs.marginTopMm.value = String(normalizedMargins.top);
  if (refs.marginRightMm) refs.marginRightMm.value = String(normalizedMargins.right);
  if (refs.marginBottomMm) refs.marginBottomMm.value = String(normalizedMargins.bottom);
  if (refs.marginLeftMm) refs.marginLeftMm.value = String(normalizedMargins.left);
  applyCanvasZoom(state.ui?.canvasZoom ?? 1, state.ui?.canvasZoomMode ?? CANVAS_ZOOM_MODE_MANUAL);
  if (refs.btnTogglePalette) {
    refs.btnTogglePalette.textContent = state.ui.paletteOpen ? "Hide Left Drawer" : "Show Left Drawer";
    refs.btnTogglePalette.classList.toggle("is-active", state.ui.paletteOpen);
  }
  if (refs.btnToggleInspector) {
    refs.btnToggleInspector.textContent = state.ui.inspectorOpen ? "Hide Inspector" : "Show Inspector";
    refs.btnToggleInspector.classList.toggle("is-active", state.ui.inspectorOpen);
  }
  refs.inspectorTabs?.querySelectorAll("[data-inspector-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.inspectorTab === state.ui.inspectorTab);
  });
  refs.btnUndo.disabled = !store.canUndo();
  refs.btnRedo.disabled = !store.canRedo();
  syncTopbarTextControls(state);
}

const PALETTE_ONLY_ACTIONS = new Set([
  "ui-page-search",
  "ui-palette-search",
  "ui-palette-filter",
  "ui-chart-search",
  "ui-chart-family",
  "ui-workbench-tool",
]);

const INSPECTOR_ONLY_ACTIONS = new Set([
  "ui-inspector-tab",
]);

const PAGE_ONLY_ACTIONS = new Set([
  "ui-canvas-text-target",
  "ui-canvas-zoom",
  "topbar-typography-preview",
  "topbar-surface-preview",
  "inspector-title-preview",
  "inspector-body-preview",
  "props-controls-preview",
]);

const SHELL_ONLY_ACTIONS = new Set([
  "ui-toggle-palette",
  "ui-toggle-inspector",
  "ui-close-inspector",
  "ui-close-palette",
]);

function renderPlanForAction(action, state) {
  const plan = {
    palette: true,
    pages: true,
    inspector: true,
  };

  if (PALETTE_ONLY_ACTIONS.has(action)) {
    plan.pages = false;
    plan.inspector = false;
    return plan;
  }

  if (INSPECTOR_ONLY_ACTIONS.has(action)) {
    plan.palette = false;
    plan.pages = false;
    return plan;
  }

  if (PAGE_ONLY_ACTIONS.has(action)) {
    plan.palette = false;
    plan.inspector = false;
    return plan;
  }

  if (action === "ui-toggle-palette") {
    plan.palette = Boolean(state?.ui?.paletteOpen);
    plan.pages = false;
    plan.inspector = false;
    return plan;
  }

  if (action === "ui-toggle-inspector") {
    plan.palette = false;
    plan.pages = false;
    plan.inspector = Boolean(state?.ui?.inspectorOpen);
    return plan;
  }

  if (SHELL_ONLY_ACTIONS.has(action)) {
    plan.palette = false;
    plan.pages = false;
    plan.inspector = false;
    return plan;
  }

  return plan;
}

function render(trigger = "state-change", action = "change") {
  const stopRenderTimer = startPerfTimer("render", { trigger, action });
  const state = store.getState();
  const plan = renderPlanForAction(action, state);
  refs.app.classList.toggle("palette-collapsed", !state.ui.paletteOpen);
  refs.app.classList.toggle("inspector-open", state.ui.inspectorOpen);
  refs.app.classList.toggle("inspector-closed", !state.ui.inspectorOpen);
  syncTopbar(state);
  applyThemeTokens(state);
  applyRuntimeProfile(state);
  updatePrintCss(state);

  if (plan.palette) {
    renderPalette(state);
  }

  let chartSample = null;
  if (plan.pages) {
    renderThumbnails(state);
    renderPages(state);
    chartSample = mountRuntimeCharts(refs.pages);
    ensureMoveableRuntime();
    syncMoveableTarget(state);
  }

  if (plan.inspector) {
    renderInspector(state);
  }

  if (isCanvasFitMode(state)) {
    scheduleCanvasFitZoom({ withTransitionPass: SHELL_ONLY_ACTIONS.has(action) });
  }

  const warningCount = state.ui?.warnings ? Object.keys(state.ui.warnings).length : 0;
  return stopRenderTimer({
    plan,
    pageCount: Array.isArray(state.pages) ? state.pages.length : 0,
    warningCount,
    chartHosts: Number(chartSample?.hosts || 0),
    chartDurationMs: Number(chartSample?.durationMs || 0),
  });
}

store.subscribe((_state, eventMeta = {}) => {
  render("store-subscribe", eventMeta.action || "change");
});

if (refs.profile) {
  refs.profile.innerHTML = Object.values(PRINT_PROFILES)
    .map((profile) => `<option value="${profile.id}">${escapeHtml(profile.label)}</option>`)
    .join("");

  refs.profile.addEventListener("change", (event) => {
    store.commit((draft) => {
      draft.project.printProfile = event.target.value;
    }, { historyLabel: "profile" });
    requestAutoFit({ trigger: "profile-change", reason: "profile-change" });
  });
}

function commitPrintMarginsFromInputs() {
  const nextMargins = normalizeMargins({
    top: refs.marginTopMm?.value,
    right: refs.marginRightMm?.value,
    bottom: refs.marginBottomMm?.value,
    left: refs.marginLeftMm?.value,
  });
  const current = normalizeMargins(store.getState().project.marginsMm);
  if (
    nextMargins.top === current.top &&
    nextMargins.right === current.right &&
    nextMargins.bottom === current.bottom &&
    nextMargins.left === current.left
  ) {
    return;
  }
  store.commit((draft) => {
    draft.project.marginsMm = nextMargins;
  }, { historyLabel: "margins" });
}

[refs.marginTopMm, refs.marginRightMm, refs.marginBottomMm, refs.marginLeftMm]
  .filter(Boolean)
  .forEach((input) => {
    input.addEventListener("change", commitPrintMarginsFromInputs);
  });

refs.workbenchRail?.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => {
    const tool = button.dataset.tool;
    store.commit((draft) => {
      if (draft.ui.workbenchTool === tool && draft.ui.paletteOpen) {
        draft.ui.paletteOpen = false;
        return;
      }
      draft.ui.workbenchTool = tool;
      draft.ui.paletteOpen = true;
    }, { historyLabel: "ui-workbench-tool", skipHistory: true });
  });
});

refs.inspectorTabs?.querySelectorAll("[data-inspector-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.inspectorTab;
    store.commit((draft) => {
      draft.ui.inspectorTab = tab;
      draft.ui.inspectorOpen = true;
    }, { historyLabel: "ui-inspector-tab", skipHistory: true });
  });
});

refs.btnTogglePalette?.addEventListener("click", () => {
  store.commit((draft) => {
    draft.ui.paletteOpen = !draft.ui.paletteOpen;
  }, { historyLabel: "ui-toggle-palette", skipHistory: true });
});

refs.btnToggleInspector?.addEventListener("click", () => {
  store.commit((draft) => {
    draft.ui.inspectorOpen = !draft.ui.inspectorOpen;
  }, { historyLabel: "ui-toggle-inspector", skipHistory: true });
});

refs.selectCanvasZoom?.addEventListener("change", (event) => {
  if (event.target.value === CANVAS_ZOOM_MODE_FIT) {
    enableCanvasFitMode();
    return;
  }
  updateCanvasZoom(event.target.value, { mode: CANVAS_ZOOM_MODE_MANUAL });
});

refs.btnCanvasZoomOut?.addEventListener("click", () => {
  stepCanvasZoom(-1);
});

refs.btnCanvasZoomFit?.addEventListener("click", () => {
  enableCanvasFitMode();
});

refs.btnCanvasZoomIn?.addEventListener("click", () => {
  stepCanvasZoom(1);
});

refs.btnCloseInspector?.addEventListener("click", () => {
  store.commit((draft) => {
    draft.ui.inspectorOpen = false;
  }, { historyLabel: "ui-close-inspector", skipHistory: true });
});

refs.btnClosePalette?.addEventListener("click", () => {
  store.commit((draft) => {
    draft.ui.paletteOpen = false;
  }, { historyLabel: "ui-close-palette", skipHistory: true });
});

refs.btnOpenSettingsDrawer?.addEventListener("click", () => {
  setSettingsDrawerOpen(!settingsDrawerOpen);
});

refs.btnCloseSettingsDrawer?.addEventListener("click", () => {
  setSettingsDrawerOpen(false);
});

refs.btnImportProjectTrigger?.addEventListener("click", () => refs.btnImport?.click());
refs.btnImportDataTrigger?.addEventListener("click", () => refs.fileCsv?.click());
refs.btnImportImageTrigger?.addEventListener("click", () => refs.fileAsset?.click());

refs.btnUndo.addEventListener("click", () => store.undo());
refs.btnRedo.addEventListener("click", () => store.redo());

refs.btnGrid.addEventListener("click", () => {
  store.commit((draft) => {
    draft.ui.showGridAll = !draft.ui.showGridAll;
  }, { skipHistory: true });
  showToast(store.getState().ui.showGridAll ? "Grid on" : "Grid off");
});

refs.topbarFontFamily?.addEventListener("change", (event) => {
  commitSelectedTextTypography({ fontFamily: event.target.value }, "topbar-font-family");
});

refs.topbarFontSize?.addEventListener("input", (event) => {
  const next = Number.parseInt(event.target.value, 10);
  if (!Number.isFinite(next)) return;
  previewSelectedTextTypography({ fontSize: next });
});

refs.topbarFontSize?.addEventListener("change", (event) => {
  const next = Number.parseInt(event.target.value, 10);
  if (!Number.isFinite(next)) return;
  commitSelectedTextTypography({ fontSize: next }, "topbar-font-size");
});

refs.btnTopbarFontSizeDec?.addEventListener("click", () => adjustSelectedTextFontSize(-1));
refs.btnTopbarFontSizeInc?.addEventListener("click", () => adjustSelectedTextFontSize(1));

refs.topbarFontWeight?.addEventListener("change", (event) => {
  const next = Number.parseInt(event.target.value, 10);
  if (!Number.isFinite(next)) return;
  commitSelectedTextTypography({ fontWeight: next }, "topbar-font-weight");
});

refs.btnTopbarBold?.addEventListener("click", () => {
  const state = store.getState();
  const { component } = selectedTextEntities(state);
  if (!component) return;
  const target = resolveTopbarTextTarget(state.ui);
  const current = readTypographyStyle(component, target);
  const nextWeight = Number(current.fontWeight) >= 600 ? 400 : 700;
  commitSelectedTextTypography({ fontWeight: nextWeight }, "topbar-bold");
});

refs.btnTopbarItalic?.addEventListener("click", () => {
  const state = store.getState();
  const { component } = selectedTextEntities(state);
  if (!component) return;
  const target = resolveTopbarTextTarget(state.ui);
  const current = readTypographyStyle(component, target);
  commitSelectedTextTypography(
    { fontStyle: current.fontStyle === "italic" ? "normal" : "italic" },
    "topbar-italic",
  );
});

refs.btnTopbarUnderline?.addEventListener("click", () => {
  const state = store.getState();
  const { component } = selectedTextEntities(state);
  if (!component) return;
  const target = resolveTopbarTextTarget(state.ui);
  const current = readTypographyStyle(component, target);
  commitSelectedTextTypography(
    { textDecoration: current.textDecoration === "underline" ? "none" : "underline" },
    "topbar-underline",
  );
});

refs.btnTopbarAlignLeft?.addEventListener("click", () => {
  commitSelectedTextTypography({ textAlign: "left" }, "topbar-align");
});
refs.btnTopbarAlignCenter?.addEventListener("click", () => {
  commitSelectedTextTypography({ textAlign: "center" }, "topbar-align");
});
refs.btnTopbarAlignRight?.addEventListener("click", () => {
  commitSelectedTextTypography({ textAlign: "right" }, "topbar-align");
});

refs.topbarLineHeight?.addEventListener("input", (event) => {
  const next = toNumber(event.target.value, NaN);
  if (!Number.isFinite(next)) return;
  previewSelectedTextTypography({ lineHeight: next });
});

refs.topbarLineHeight?.addEventListener("change", (event) => {
  const next = toNumber(event.target.value, NaN);
  if (!Number.isFinite(next)) return;
  commitSelectedTextTypography({ lineHeight: next }, "topbar-line-height");
});

refs.topbarLetterSpacing?.addEventListener("input", (event) => {
  const next = toNumber(event.target.value, NaN);
  if (!Number.isFinite(next)) return;
  previewSelectedTextTypography({ letterSpacing: next });
});

refs.topbarLetterSpacing?.addEventListener("change", (event) => {
  const next = toNumber(event.target.value, NaN);
  if (!Number.isFinite(next)) return;
  commitSelectedTextTypography({ letterSpacing: next }, "topbar-letter-spacing");
});

refs.topbarTextTransform?.addEventListener("change", (event) => {
  commitSelectedTextTypography({ textTransform: event.target.value }, "topbar-text-transform");
});
refs.btnTopbarCaseNormal?.addEventListener("click", () => {
  commitSelectedTextTypography({ textTransform: "none" }, "topbar-text-transform");
});
refs.btnTopbarCaseUpper?.addEventListener("click", () => {
  commitSelectedTextTypography({ textTransform: "uppercase" }, "topbar-text-transform");
});

refs.topbarTextColor?.addEventListener("input", (event) => {
  if (!event.target.value) return;
  previewSelectedTextTypography({ color: event.target.value });
});

refs.topbarTextColor?.addEventListener("change", (event) => {
  if (!event.target.value) return;
  commitSelectedTextTypography({ color: event.target.value }, "topbar-color");
});

refs.topbarKeyline?.addEventListener("change", (event) => {
  commitSelectedTextSurface({ keyline: event.target.value }, "topbar-keyline");
});

refs.topbarKeylineColor?.addEventListener("input", (event) => {
  if (!event.target.value) return;
  previewSelectedTextSurface({ keylineColor: event.target.value });
});

refs.topbarKeylineColor?.addEventListener("change", (event) => {
  if (!event.target.value) return;
  commitSelectedTextSurface({ keylineColor: event.target.value }, "topbar-keyline-color");
});

refs.topbarBackgroundColor?.addEventListener("input", (event) => {
  if (!event.target.value) return;
  previewSelectedTextSurface({ backgroundColor: event.target.value });
});

refs.topbarBackgroundColor?.addEventListener("change", (event) => {
  if (!event.target.value) return;
  commitSelectedTextSurface({ backgroundColor: event.target.value }, "topbar-background-color");
});

refs.btnTopbarBackgroundNone?.addEventListener("click", () => {
  commitSelectedTextSurface({ backgroundColor: "transparent" }, "topbar-background-none");
});

function exportProjectBundle() {
  const bundle = buildProjectBundle(store.getState());
  downloadText("immersive-report-project-v0.2.json", JSON.stringify(bundle, null, 2));
  showToast("Project exported");
}

refs.btnExport.addEventListener("click", exportProjectBundle);
refs.btnTopbarExport?.addEventListener("click", exportProjectBundle);
refs.btnTopbarPurge?.addEventListener("click", purgeAllAndResetDefaults);
refs.btnTopbarAutoFit?.addEventListener("click", () => {
  requestAutoFit({ trigger: "explicit", reason: "topbar-auto-fit" });
});

refs.btnImport.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    showToast("Invalid JSON file");
    return;
  }

  const hydrated = hydrateBundle(parsed.value);
  if (!hydrated.ok) {
    showToast(hydrated.error || "Import failed");
    return;
  }

  store.replace(hydrated.value, { skipHistory: true });
  store.commit((draft) => {
    ensureTargetGridDensity(draft);
    normalizeUiSelectionInDraft(draft);
    draft.ui.pendingDeleteComponentId = null;
  }, { skipHistory: true });
  store.clearHistory();
  showToast("Project imported");
  requestAutoFit({ trigger: "import", reason: "project-import" });
  event.target.value = "";
});

refs.btnReset.addEventListener("click", resetSamplePack);

refs.btnCustomPage?.addEventListener("click", () => addCustomPage());

refs.btnPrint.addEventListener("click", async () => {
  const warnings = Object.values(store.getState().ui.warnings || {}).reduce((count, list) => count + list.length, 0);
  if (warnings > 0) {
    const proceed = await requestDecision({
      title: "Overflow warnings detected",
      message: `Overflow warnings were detected in ${warnings} component(s). Continue to print anyway?`,
      confirmLabel: "Print anyway",
      cancelLabel: "Cancel",
      tone: "default",
    });
    if (!proceed) return;
  }
  hideDecisionDialog();
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  printProject(store.getState());
});

refs.fileCsv.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const isJson = file.name.toLowerCase().endsWith(".json") || file.type.includes("json");
  let parsed;
  if (isJson) {
    const json = safeJsonParse(text);
    if (!json.ok) {
      showToast("Invalid dataset JSON");
      return;
    }
    parsed = parseDatasetJson(json.value, file.name.replace(/\.(csv|json)$/i, ""));
  } else {
    parsed = parseCsvText(text);
  }
  if (!parsed.ok) {
    showToast(parsed.error || "Dataset import failed");
    return;
  }
  store.commit((draft) => {
    parsed.value.name = parsed.value.name.replace("Imported", file.name.replace(/\.(csv|json)$/i, ""));
    draft.datasets.push(parsed.value);
  }, { historyLabel: "import-dataset" });
  showToast("Dataset imported");
  requestAutoFit({ trigger: "import", reason: "dataset-import" });
  event.target.value = "";
});

refs.fileAsset.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const result = await importAssetFile(file);
  if (!result.ok) {
    showToast(result.error || "Asset import failed");
    return;
  }
  store.commit((draft) => {
    draft.assets.push(result.value);

    const { page, component } = selectedEntities(draft);
    if (component && component.type === "cover_hero") {
      component.props.imageAssetId = result.value.id;
      component.props.imageUrl = result.value.dataUrl;
    }
  }, { historyLabel: "import-asset" });
  showToast("Image imported");
  requestAutoFit({ trigger: "import", reason: "asset-import" });
  event.target.value = "";
});

refs.pages.addEventListener("dragover", (event) => {
  const raw = event.dataTransfer?.getData(DND_MIME);
  if (!raw) return;
  const data = safeJsonParse(raw);
  if (!data.ok) return;
  if (data.value.kind === "new-page-template") {
    event.preventDefault();
  }
});

refs.pages.addEventListener("drop", (event) => {
  const raw = event.dataTransfer?.getData(DND_MIME);
  if (!raw) return;
  const data = safeJsonParse(raw);
  if (!data.ok || data.value.kind !== "new-page-template") return;
  event.preventDefault();
  addPageFromTemplate(data.value.templateId);
});

refs.canvasPanel?.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".canvas-component")) return;
  const pageNode = target.closest(".page[data-page-id]");
  deselectComponent(pageNode?.dataset.pageId || null);
});

window.addEventListener("keydown", (event) => {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const modifier = isMac ? event.metaKey : event.ctrlKey;
  const typingTarget = isTypingTarget(event.target);

  if (event.key === "Escape") {
    store.commit((draft) => {
      draft.ui.inspectorOpen = false;
      draft.ui.pendingDeleteComponentId = null;
    }, { skipHistory: true });
    setSettingsDrawerOpen(false);
  }

  if (!typingTarget && modifier && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    store.undo();
  }

  if (!typingTarget && modifier && ((event.key.toLowerCase() === "z" && event.shiftKey) || event.key.toLowerCase() === "y")) {
    event.preventDefault();
    store.redo();
  }

  if (!typingTarget && modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "c") {
    if (copySelectedComponentToClipboard()) {
      event.preventDefault();
    }
    return;
  }

  if (!typingTarget && modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "v") {
    if (pasteComponentFromClipboard()) {
      event.preventDefault();
    }
    return;
  }

  if (!typingTarget && !modifier && event.altKey && !event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    if (String(store.getState().ui?.pageSearch || "").trim()) {
      return;
    }
    const target = event.target;
    const row = target instanceof Element ? target.closest("[data-page-row]") : null;
    const pageId = row instanceof HTMLElement ? row.dataset.pageId : null;
    if (pageId) {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? -1 : 1;
      const moved = movePage(pageId, direction, { announce: true });
      if (moved) {
        focusPageDragHandle(pageId);
      }
      return;
    }
  }

  if ((event.key === "Delete" || event.key === "Backspace") && !modifier && !event.altKey && !event.shiftKey) {
    if (typingTarget) return;
    const state = store.getState();
    const page = findPage(state, state.ui.selectedPageId);
    const component = findComponent(page, state.ui.selectedComponentId);
    if (!page || !component) return;
    event.preventDefault();
    deleteComponent(page.id, component.id);
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!settingsDrawerOpen) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (refs.settingsDrawer?.contains(target)) return;
  if (refs.btnOpenSettingsDrawer?.contains(target)) return;
  setSettingsDrawerOpen(false);
});

if (typeof ResizeObserver === "function" && refs.canvasPanel) {
  const canvasPanelResizeObserver = new ResizeObserver(() => {
    scheduleCanvasFitZoom();
  });
  canvasPanelResizeObserver.observe(refs.canvasPanel);
}

window.addEventListener("resize", () => {
  scheduleCanvasFitZoom({ withTransitionPass: true });
});

render("bootstrap", "bootstrap");

// Resolve hero image from asset references after first render.
store.commit((draft) => {
  for (const page of draft.pages) {
    if (page.templateId === "benchmark_industry_light") {
      for (const component of page.components || []) {
        if (component.slotId === "waffles") {
          for (const profile of ["LETTER_portrait", "A4_portrait"]) {
            const layout = getComponentLayout(component, profile);
            if (layout.rowStart === 11 && layout.rowSpan === 12) {
              setComponentLayout(component, profile, { rowStart: 11, rowSpan: 13 });
            } else if (layout.rowStart === 21 && layout.rowSpan === 24) {
              setComponentLayout(component, profile, { rowStart: 21, rowSpan: 26 });
            }
          }
        }
        if (component.slotId === "donuts") {
          for (const profile of ["LETTER_portrait", "A4_portrait"]) {
            const layout = getComponentLayout(component, profile);
            if (layout.rowStart === 23 && layout.rowSpan === 10) {
              setComponentLayout(component, profile, { rowStart: 24, rowSpan: 10 });
            } else if (layout.rowStart === 45 && layout.rowSpan === 20) {
              setComponentLayout(component, profile, { rowStart: 47, rowSpan: 20 });
            }
          }
        }
        if (component.slotId === "lollipop") {
          for (const profile of ["LETTER_portrait", "A4_portrait"]) {
            const layout = getComponentLayout(component, profile);
            if (layout.rowStart === 33 && layout.rowSpan === 8) {
              setComponentLayout(component, profile, { rowStart: 34, rowSpan: 8 });
            } else if (layout.rowStart === 65 && layout.rowSpan === 16) {
              setComponentLayout(component, profile, { rowStart: 67, rowSpan: 16 });
            }
          }
        }
      }
    }

    for (const component of page.components || []) {
      if (component.type === "cover_hero" && component.props.imageAssetId) {
        const asset = draft.assets.find((entry) => entry.id === component.props.imageAssetId);
        if (asset?.dataUrl) {
          component.props.imageUrl = asset.dataUrl;
        }
      }

      if ((component.type === "line" || component.type === "bar") && typeof component.props.points === "string") {
        component.props.points = csvToPairs(component.props.points);
      }
    }
  }
}, { skipHistory: true });
