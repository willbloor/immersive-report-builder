import { importAssetFile, importAssetUrl } from "../assets/asset-manager.js?v=20260401r";
import { clamp, debounce, deepClone, escapeHtml, nowIso, uid } from "../utils/helpers.js?v=20260401g";
import {
  ARCHETYPE_OPTIONS,
  ASPECT_RATIO_PRESETS,
  BACKGROUND_PRESETS,
  COLOR_ROLE_OPTIONS,
  DEFAULT_ASPECT_RATIO_ID,
  ELEMENT_TYPE_OPTIONS,
  LAYER_ROLE_OPTIONS,
  OUTPUT_MODE_OPTIONS,
  RESOURCE_SOURCE_OPTIONS,
  TEXT_STYLE_PRESETS,
  getAspectRatioPreset,
} from "./constants.js?v=20260401ac";
import {
  createDocumentMetaFromState,
  deleteDocumentState,
  duplicateDocumentState,
  loadDocumentIndex,
  loadDocumentState,
  migrateLegacyDraftsToDocuments,
  removeDocumentMeta,
  saveDocumentIndex,
  saveDocumentState,
  sortDocumentsByUpdatedAt,
  upsertDocumentMeta,
} from "./documents.js?v=20260401r";
import { exportFramePng, exportFramesPdf, exportProjectJson } from "./export.js?v=20260401r";
import { hydrateLinkedInState, makeEmptyLinkedInState } from "./schema.js?v=20260401al";
import { loadSharedAssetLibrary, mergeAssetLibraries, saveSharedAssetLibrary } from "./shared-assets.js?v=20260401r";
import { createLinkedInStore } from "./store.js?v=20260401al";
import { initPerf, startPerfTimer } from "../utils/perf.js?v=20260401m";
import {
  archetypeLabel,
  applyMediaCoverageBackground,
  applyMediaCoverageTextLayout,
  cloneFrame,
  createLooseElement,
  createFrameFromTemplate,
  defaultTemplateIdForArchetype,
  getLinkedInTemplateAsset,
  getTemplate,
  isMediaCoverageTemplate,
  mapElementsToAspectRatio,
  mediaCoverageBackgroundOptions,
  mediaCoverageTemplateIdForVariant,
  mediaCoverageTextLayoutOptions,
  TEMPLATE_LIBRARY,
} from "./templates.js?v=20260401ah";

const store = createLinkedInStore(makeEmptyLinkedInState());

const refs = {
  app: document.getElementById("app"),
  toast: document.getElementById("toast"),
  fileMenu: document.getElementById("fileMenu"),
  btnFileMenu: document.getElementById("btnFileMenu"),
  fileMenuPanel: document.getElementById("fileMenuPanel"),
  btnBrandHome: document.getElementById("btnBrandHome"),
  btnTopbarNewPost: document.getElementById("btnTopbarNewPost"),
  btnTopbarNewCarousel: document.getElementById("btnTopbarNewCarousel"),
  btnOpenLocalhost: document.getElementById("btnOpenLocalhost"),
  btnBackToDashboard: document.getElementById("btnBackToDashboard"),
  dashboardView: document.getElementById("dashboardView"),
  dashboardPanel: document.getElementById("dashboardPanel"),
  editorView: document.getElementById("editorView"),
  sidebarPanel: document.getElementById("sidebarPanel"),
  canvasViewport: document.getElementById("canvasViewport"),
  canvasFrameTitle: document.getElementById("canvasFrameTitle"),
  canvasFrameMeta: document.getElementById("canvasFrameMeta"),
  inspector: document.getElementById("inspector"),
  fileImportImage: document.getElementById("fileImportImage"),
  fileImportJson: document.getElementById("fileImportJson"),
  btnUndo: document.getElementById("btnUndo"),
  btnRedo: document.getElementById("btnRedo"),
  btnExportPng: document.getElementById("btnExportPng"),
  btnExportPdf: document.getElementById("btnExportPdf"),
  btnExportJson: document.getElementById("btnExportJson"),
  btnImportJson: document.getElementById("btnImportJson"),
  btnImportImage: document.getElementById("btnImportImage"),
  btnResetProject: document.getElementById("btnResetProject"),
  btnCanvasZoomOut: document.getElementById("btnCanvasZoomOut"),
  btnCanvasZoomFit: document.getElementById("btnCanvasZoomFit"),
  btnCanvasZoomIn: document.getElementById("btnCanvasZoomIn"),
  canvasZoomLabel: document.getElementById("canvasZoomLabel"),
};

const runtime = {
  stageScale: 0.54,
  stageScaleMode: "fit",
  toastTimer: null,
  pointerInteraction: null,
  dragFrameId: null,
  resourceForm: blankResourceForm(),
  editingResourceId: null,
  resizeObserver: null,
  exportBusy: false,
  hydratingTemplateAssets: new Set(),
  dashboardPreviewCache: new Map(),
  imageImportContext: "library",
};

const appState = {
  currentView: "dashboard",
  currentDocumentId: null,
  documentIndex: migrateLegacyDraftsToDocuments({ hydrate: hydrateLinkedInState }) || loadDocumentIndex(),
  sharedAssets: loadSharedAssetLibrary(),
  documentPersistDebounced: null,
  thumbnailCaptureActive: false,
  pendingThumbnailRequest: null,
};

appState.documentPersistDebounced = debounce((state, meaningful, documentId, sourceAction) => {
  persistCurrentDocumentState({ state, meaningful, documentId, sourceAction });
}, 220);

const TEXT_FAMILY_OPTIONS = [
  { id: "heading", label: "Sora" },
  { id: "body", label: "Manrope" },
  { id: "ui", label: "Geologica" },
  { id: "mono", label: "IBM Plex Mono" },
];

const LAYER_ROLE_ORDER = ["background", "foreground", "text", "cta"];
const LINKEDIN_PERF_STORAGE_KEY = "linkedin_perf";
const EDITOR_RENDER_TARGETS_ALL = Object.freeze({
  sidebar: true,
  canvas: true,
  inspector: true,
});
const RENDER_INVALIDATION_BY_ACTION = Object.freeze({
  "ui-select-element": { sidebar: false, canvas: true, inspector: true },
  "ui-select-frame": { sidebar: true, canvas: true, inspector: true },
  "ui-assetSearch": { sidebar: true, canvas: false, inspector: false },
  "ui-assetFilter": { sidebar: true, canvas: false, inspector: false },
  "ui-assetSort": { sidebar: true, canvas: false, inspector: false },
  "ui-template-search": { sidebar: true, canvas: false, inspector: false },
  "ui-resource-search": { sidebar: true, canvas: false, inspector: false },
  "ui-resource-source-filter": { sidebar: true, canvas: false, inspector: false },
  "ui-resource-archetype-filter": { sidebar: true, canvas: false, inspector: false },
  "ui-panel": { sidebar: true, canvas: false, inspector: false },
  "ui-inspector-tab": { sidebar: false, canvas: false, inspector: true },
});
const THUMBNAIL_REFRESH_ACTIONS = new Set([
  "add-asset-to-canvas",
  "apply-asset",
  "dashboard-return",
  "import-image",
  "import-json",
  "open-document",
  "save-to-library",
]);
const MIN_STAGE_SCALE = 0.18;
const MAX_STAGE_SCALE = 2.4;
const STAGE_ZOOM_STEP = 1.15;
const LOCALHOST_ORIGIN = "http://localhost:4173";

function linkedInPerfEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    const queryValue = url.searchParams.get("perf");
    if (queryValue === "1") return true;
    if (queryValue === "0") return false;
  } catch (_error) {
    // Fall through to the persisted flag.
  }

  try {
    return localStorage.getItem(LINKEDIN_PERF_STORAGE_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

const perfEnabled = linkedInPerfEnabled();
const perfRuntime = initPerf({
  app: "linkedin-builder",
  route: typeof window !== "undefined" ? window.location.pathname : "/",
  schemaVersion: "2026-04-01",
  surface: "linkedin",
});
perfRuntime?.setEnabled(perfEnabled);
if (perfEnabled) {
  perfRuntime?.clear();
}

function startLinkedInPerfTimer(channel, action, context = {}) {
  return startPerfTimer(channel, {
    action,
    app: "linkedin-builder",
    surface: "linkedin",
    ...context,
  });
}

function localhostHref() {
  if (typeof window === "undefined") return LOCALHOST_ORIGIN;
  const path = String(window.location.pathname || "/");
  const search = String(window.location.search || "");
  const hash = String(window.location.hash || "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${LOCALHOST_ORIGIN}${normalizedPath}${search}${hash}`;
}

function shouldShowLocalhostLink() {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  if (window.location.protocol === "file:") return true;
  return !["localhost", "127.0.0.1", "[::1]"].includes(host);
}

function shouldPersistDocumentChange(meta = {}) {
  const action = String(meta?.action || "");
  if (!action) return false;
  if (meta?.kind === "undo" || meta?.kind === "redo") return true;
  if (action === "open-document" || action === "clear-editor") return false;
  if (action.startsWith("ui-")) return false;
  if (action === "sync-text-bounds" && meta?.skipHistory) return false;
  return true;
}

function isMeaningfulPersistAction(meta = {}) {
  const action = String(meta?.action || "");
  if (!action) return false;
  if (meta?.kind === "undo" || meta?.kind === "redo") return true;
  if (action === "open-document" || action === "clear-editor") return false;
  if (action.startsWith("ui-")) return false;
  if (action === "sync-text-bounds") return false;
  if (action === "bind-template-assets" || action === "import-template-asset") return false;
  return true;
}

function shouldRefreshThumbnail(meta = {}) {
  return THUMBNAIL_REFRESH_ACTIONS.has(String(meta?.action || ""));
}

function resolveEditorRenderTargets(meta = {}) {
  const action = String(meta?.action || "");
  if (!action) return EDITOR_RENDER_TARGETS_ALL;
  if (meta?.kind === "undo" || meta?.kind === "redo") return EDITOR_RENDER_TARGETS_ALL;
  return RENDER_INVALIDATION_BY_ACTION[action] || EDITOR_RENDER_TARGETS_ALL;
}

function defaultTextStylePresetId() {
  return TEXT_STYLE_PRESETS[0]?.id || null;
}

function projectAspectRatio(state = store.getState()) {
  return getAspectRatioPreset(state?.project?.aspectRatio || DEFAULT_ASPECT_RATIO_ID).id;
}

function canvasMetrics(input = store.getState()) {
  if (typeof input === "string") {
    return getAspectRatioPreset(input);
  }
  return getAspectRatioPreset(projectAspectRatio(input));
}

function canvasWidth(input = store.getState()) {
  return canvasMetrics(input).width;
}

function canvasHeight(input = store.getState()) {
  return canvasMetrics(input).height;
}

function defaultLayerRole(type) {
  if (type === "image") return "foreground";
  if (type === "button") return "cta";
  if (type === "text") return "text";
  return "background";
}

document.body.dataset.appBooted = "1";

function blankResourceForm(resource = null) {
  return {
    title: String(resource?.title || ""),
    sourceType: resource?.sourceType || "figma_link",
    url: String(resource?.url || ""),
    tags: Array.isArray(resource?.tags) ? resource.tags.join(", ") : "",
    notes: String(resource?.notes || ""),
    archetypes: Array.isArray(resource?.archetypes) ? resource.archetypes.join(", ") : "",
    previewAssetId: resource?.previewAssetId || "",
  };
}

function currentDocumentMeta(documentId = appState.currentDocumentId) {
  return appState.documentIndex.documents.find((entry) => entry.id === documentId) || null;
}

function persistDocumentIndex(nextIndex) {
  appState.documentIndex = saveDocumentIndex(nextIndex);
  return appState.documentIndex;
}

function sharedAssetsSnapshot() {
  return deepClone(appState.sharedAssets || []);
}

function assignSharedAssets(state, assets = appState.sharedAssets) {
  if (!state || typeof state !== "object") return state;
  state.assets = deepClone(assets || []);
  return state;
}

function sharedAssetsForState(state = store.getState()) {
  if (Array.isArray(appState.sharedAssets) && appState.sharedAssets.length) {
    return appState.sharedAssets;
  }
  return Array.isArray(state?.assets) ? state.assets : [];
}

function syncStoreAssetLibrary() {
  store.commit((draft) => {
    draft.assets = sharedAssetsSnapshot();
  }, { historyLabel: "ui-sync-asset-library", skipHistory: true });
}

function replaceSharedAssetLibrary(assets = [], { syncStore = true } = {}) {
  appState.sharedAssets = saveSharedAssetLibrary(assets);
  if (syncStore) {
    syncStoreAssetLibrary();
  }
  return appState.sharedAssets;
}

function mergeIntoSharedAssetLibrary(incomingAssets = [], { syncStore = true } = {}) {
  const nextAssets = mergeAssetLibraries(appState.sharedAssets, incomingAssets);
  return replaceSharedAssetLibrary(nextAssets, { syncStore });
}

function migrateDocumentAssetsIntoSharedLibrary() {
  let merged = mergeAssetLibraries([], appState.sharedAssets);
  for (const entry of appState.documentIndex.documents || []) {
    const rawState = loadDocumentState(entry.id, (value) => value || null);
    if (!rawState || typeof rawState !== "object" || !Array.isArray(rawState.assets) || !rawState.assets.length) {
      continue;
    }
    merged = mergeAssetLibraries(merged, rawState.assets);
  }
  appState.sharedAssets = saveSharedAssetLibrary(merged);
  return appState.sharedAssets;
}

function documentStorageSnapshot(state) {
  const snapshot = hydrateLinkedInState(state);
  snapshot.assets = [];
  return snapshot;
}

function recentDraftEntries() {
  return sortDocumentsByUpdatedAt(appState.documentIndex.documents);
}

function listLibraryEntries() {
  return recentDraftEntries().filter((entry) => entry.isSaved);
}

function upsertDocumentRecord(state, overrides = {}) {
  const meta = createDocumentMetaFromState(state, overrides);
  const snapshot = documentStorageSnapshot(state);
  snapshot.project.id = meta.id;
  snapshot.project.updatedAt = meta.updatedAt;
  saveDocumentState(meta.id, snapshot);
  return persistDocumentIndex(upsertDocumentMeta(appState.documentIndex, meta));
}

function setCurrentView(nextView) {
  appState.currentView = nextView === "editor" ? "editor" : "dashboard";
}

function formatSavedAt(value) {
  if (!value) return "Saved locally";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved locally";
  return date.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createNewDocumentFromState(state, overrides = {}) {
  const documentState = assignSharedAssets(hydrateLinkedInState(state));
  const documentId = String(overrides.id || documentState.project.id || uid("linkedin_doc"));
  documentState.project.id = documentId;
  upsertDocumentRecord(documentState, {
    ...overrides,
    id: documentId,
  });
  return documentId;
}

function openDocument(documentId) {
  const meta = appState.documentIndex.documents.find((entry) => entry.id === documentId);
  if (!meta) {
    showToast("That draft is no longer available.", "error");
    return;
  }
  const state = loadDocumentState(documentId, hydrateLinkedInState);
  if (Array.isArray(state?.assets) && state.assets.length) {
    mergeIntoSharedAssetLibrary(state.assets, { syncStore: false });
  }
  appState.currentDocumentId = documentId;
  const updatedAt = nowIso();
  const hydrated = assignSharedAssets(hydrateLinkedInState(state));
  hydrated.project.id = documentId;
  hydrated.project.updatedAt = updatedAt;
  setCurrentView("editor");
  store.replace(hydrated, { skipHistory: true, historyLabel: "open-document" });
  store.clearHistory();
  runtime.resourceForm = blankResourceForm();
  runtime.editingResourceId = null;
  persistDocumentIndex({
    ...appState.documentIndex,
    lastOpenedDocumentId: documentId,
    documents: appState.documentIndex.documents.map((entry) => (
      entry.id === documentId
        ? { ...entry, updatedAt }
        : entry
    )),
  });
  saveDocumentState(documentId, documentStorageSnapshot(hydrated));
  syncAllTextBounds(true);
  hydrateTemplateAssetsForCurrentDocument("open-document", store.getState());
  requestDocumentThumbnailRefresh("open-document", {
    state: store.getState(),
    documentId,
  });
}

function duplicateDocumentEntry(documentId, { open = false } = {}) {
  const sourceMeta = appState.documentIndex.documents.find((entry) => entry.id === documentId);
  if (!sourceMeta) return;
  const sourceState = loadDocumentState(documentId, hydrateLinkedInState);
  const copyState = duplicateDocumentState(sourceState);
  const nextId = createNewDocumentFromState(copyState, {
    name: copyState.project.name,
    thumbnail: sourceMeta.thumbnail || "",
    isSaved: sourceMeta.isSaved,
  });
  if (open) {
    openDocument(nextId);
    return;
  }
  render();
  showToast("Draft duplicated.");
}

function deleteDocumentEntry(documentId) {
  const entry = appState.documentIndex.documents.find((item) => item.id === documentId);
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    const label = entry?.name || "this draft";
    if (!window.confirm(`Delete ${label}?`)) {
      return;
    }
  }
  const nextIndex = removeDocumentMeta(appState.documentIndex, documentId);
  deleteDocumentState(documentId);
  persistDocumentIndex(nextIndex);
  if (appState.currentDocumentId === documentId) {
    appState.currentDocumentId = null;
    setCurrentView("dashboard");
    store.replace(makeEmptyLinkedInState(), { skipHistory: true, historyLabel: "clear-editor" });
    store.clearHistory();
  }
  render();
  showToast("Draft removed.");
}

function showToast(message, kind = "info") {
  if (!refs.toast) return;
  refs.toast.textContent = message;
  refs.toast.dataset.kind = kind;
  refs.toast.hidden = false;
  clearTimeout(runtime.toastTimer);
  runtime.toastTimer = window.setTimeout(() => {
    refs.toast.hidden = true;
  }, 2600);
}

function setFileMenuOpen(open) {
  if (!refs.fileMenuPanel || !refs.btnFileMenu || !refs.fileMenu) return;
  refs.fileMenuPanel.hidden = !open;
  refs.btnFileMenu.setAttribute("aria-expanded", open ? "true" : "false");
  refs.fileMenu.dataset.open = open ? "true" : "false";
}

function toggleFileMenu(force = null) {
  const nextOpen = typeof force === "boolean"
    ? force
    : Boolean(refs.fileMenuPanel?.hidden);
  setFileMenuOpen(nextOpen);
}

function findFrame(state, frameId) {
  return (state.frames || []).find((frame) => frame.id === frameId) || null;
}

function findFrameIndex(state, frameId) {
  return (state.frames || []).findIndex((frame) => frame.id === frameId);
}

function findElement(frame, elementId) {
  return (frame?.elements || []).find((element) => element.id === elementId) || null;
}

function findElementIndex(frame, elementId) {
  return (frame?.elements || []).findIndex((element) => element.id === elementId);
}

function editableStackElements(frame) {
  return (frame?.elements || []).filter((element) => element.locked !== true);
}

function canMoveElementInStack(frame, elementId, action) {
  const editable = editableStackElements(frame);
  const index = editable.findIndex((element) => element.id === elementId);
  if (index < 0) return false;
  if (action === "front" || action === "forward") return index < editable.length - 1;
  if (action === "back" || action === "backward") return index > 0;
  return false;
}

function frameElementsByLayer(frame, layerRole) {
  return (frame?.elements || []).filter((element) =>
    element.locked !== true
    && element.visible !== false
    && (element.layerRole || defaultLayerRole(element.type)) === layerRole);
}

function primaryImageElement(frame) {
  return (frame?.elements || []).find((element) => element.type === "image" && element.locked !== true)
    || (frame?.elements || []).find((element) => element.type === "image")
    || null;
}

function isLockedBackgroundImage(element) {
  return element?.type === "image"
    && element?.locked === true
    && (((element?.layerRole || "") === "background") || element?.templateKey === "bg-media-coverage");
}

function imageMedia(element, frame = null) {
  if (isLockedBackgroundImage(element)) {
    return {
      assetId: element?.media?.assetId || null,
      imageUrl: String(element?.media?.imageUrl || ""),
      objectFit: "cover",
      objectPositionX: 50,
      objectPositionY: 50,
      scale: 1,
    };
  }
  const explicitFit = element?.media?.objectFit === "contain" || element?.media?.objectFit === "cover"
    ? element.media.objectFit
    : null;
  return {
    assetId: element?.media?.assetId || frame?.media?.assetId || null,
    imageUrl: String(element?.media?.imageUrl || frame?.media?.imageUrl || ""),
    objectFit: explicitFit || (frame?.media?.objectFit === "contain" ? "contain" : "cover"),
    objectPositionX: clamp(Number(element?.media?.objectPositionX ?? frame?.media?.objectPositionX ?? 50), 0, 100),
    objectPositionY: clamp(Number(element?.media?.objectPositionY ?? frame?.media?.objectPositionY ?? 50), 0, 100),
    scale: clamp(Number(element?.media?.scale ?? frame?.media?.scale ?? 1), 0.5, 4),
  };
}

function normalizedSubjectBounds(asset) {
  const bounds = asset?.subjectBounds || {};
  const x = clamp(Number(bounds.x), 0, 1);
  const y = clamp(Number(bounds.y), 0, 1);
  const w = clamp(Number(bounds.w), 0, 1);
  const h = clamp(Number(bounds.h), 0, 1);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }
  return {
    x,
    y,
    w: Math.min(1 - x, w),
    h: Math.min(1 - y, h),
  };
}

function imageSelectionBounds(element, frame, state) {
  if (element?.type !== "image") return null;
  const fullBounds = {
    x: 0,
    y: 0,
    w: Math.max(0, Number(element.w) || 0),
    h: Math.max(0, Number(element.h) || 0),
  };
  const media = imageMedia(element, frame);
  const asset = findAsset(state, media.assetId) || findTemplateAssetRecord(state, element.media?.templateAssetId);
  const assetWidth = Number(asset?.width) || 0;
  const assetHeight = Number(asset?.height) || 0;
  if (!assetWidth || !assetHeight || !Number(element.w) || !Number(element.h)) return fullBounds;

  const fit = media.objectFit === "contain" ? "contain" : "cover";
  const zoom = clamp(Number(media.scale || 1), 0.5, 4);
  const baseScale = fit === "contain"
    ? Math.min(Number(element.w) / assetWidth, Number(element.h) / assetHeight)
    : Math.max(Number(element.w) / assetWidth, Number(element.h) / assetHeight);
  const renderWidth = assetWidth * baseScale * zoom;
  const renderHeight = assetHeight * baseScale * zoom;
  const offsetX = (Number(element.w) - renderWidth) * (clamp(Number(media.objectPositionX || 50), 0, 100) / 100);
  const offsetY = (Number(element.h) - renderHeight) * (clamp(Number(media.objectPositionY || 50), 0, 100) / 100);
  const subject = normalizedSubjectBounds(asset);
  const rawLeft = offsetX + (renderWidth * subject.x);
  const rawTop = offsetY + (renderHeight * subject.y);
  const rawRight = rawLeft + (renderWidth * subject.w);
  const rawBottom = rawTop + (renderHeight * subject.h);
  const left = clamp(rawLeft, 0, Number(element.w));
  const top = clamp(rawTop, 0, Number(element.h));
  const right = clamp(rawRight, 0, Number(element.w));
  const bottom = clamp(rawBottom, 0, Number(element.h));
  const width = right - left;
  const height = bottom - top;
  if (width < 12 || height < 12) return fullBounds;
  const paddingX = Math.max(24, fullBounds.w * 0.08);
  const paddingY = Math.max(24, fullBounds.h * 0.08);
  const expandedLeft = clamp(left - paddingX, 0, fullBounds.w);
  const expandedTop = clamp(top - paddingY, 0, fullBounds.h);
  const expandedRight = clamp(right + paddingX, 0, fullBounds.w);
  const expandedBottom = clamp(bottom + paddingY, 0, fullBounds.h);
  const expandedWidth = expandedRight - expandedLeft;
  const expandedHeight = expandedBottom - expandedTop;
  if (expandedWidth < fullBounds.w * 0.82 || expandedHeight < fullBounds.h * 0.82) {
    return fullBounds;
  }
  return { x: expandedLeft, y: expandedTop, w: expandedWidth, h: expandedHeight };
}

function resolveTargetImageElement(state = store.getState()) {
  const frame = selectedFrame(state);
  if (!frame) return null;
  const selected = selectedElement(state);
  if (selected?.type === "image") return selected;
  return primaryImageElement(frame);
}

function findAsset(state, assetId) {
  return sharedAssetsForState(state).find((asset) => asset.id === assetId) || null;
}

function findTemplateAssetRecord(state, templateAssetId) {
  return sharedAssetsForState(state).find((asset) => asset.templateAssetId === templateAssetId) || null;
}

function mediaKeyForElement(element) {
  return String(element?.media?.assetId || element?.media?.templateAssetId || element?.media?.imageUrl || "").trim();
}

function overlapRatioBetweenElements(a, b) {
  const left = Math.max(Number(a?.x || 0), Number(b?.x || 0));
  const top = Math.max(Number(a?.y || 0), Number(b?.y || 0));
  const right = Math.min(Number(a?.x || 0) + Number(a?.w || 0), Number(b?.x || 0) + Number(b?.w || 0));
  const bottom = Math.min(Number(a?.y || 0) + Number(a?.h || 0), Number(b?.y || 0) + Number(b?.h || 0));
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const overlapArea = width * height;
  const aArea = Math.max(1, Number(a?.w || 0) * Number(a?.h || 0));
  const bArea = Math.max(1, Number(b?.w || 0) * Number(b?.h || 0));
  return overlapArea / Math.max(1, Math.min(aArea, bArea));
}

function cleanupMediaCoverageSpeakerImages(frame, preferredElementId = null) {
  if (!frame || frame.designFamily !== "media_coverage_portrait") return;
  const candidates = (frame.elements || []).filter((element) => element?.type === "image" && element?.locked !== true);
  if (!candidates.length) return;
  if (candidates.length === 1) return;

  const templateSpeaker = candidates.find((element) => element.templateKey === "speaker-image") || null;
  const preferred = candidates.find((element) => element.id === preferredElementId) || null;
  const canonical = templateSpeaker
    || preferred
    || [...candidates].sort((a, b) => (Number(b?.w || 0) * Number(b?.h || 0)) - (Number(a?.w || 0) * Number(a?.h || 0)))[0]
    || candidates[0];

  if (templateSpeaker && preferred && preferred.id !== templateSpeaker.id) {
    const shouldPromotePreferredMedia = overlapRatioBetweenElements(templateSpeaker, preferred) >= 0.18
      || mediaKeyForElement(preferred) !== mediaKeyForElement(templateSpeaker);
    if (shouldPromotePreferredMedia) {
      templateSpeaker.media = {
        ...imageMedia(templateSpeaker, frame),
        ...imageMedia(preferred, frame),
      };
    }
  }

  const canonicalKey = mediaKeyForElement(canonical);
  frame.elements = (frame.elements || []).filter((element) => {
    if (element?.type !== "image" || element?.locked === true) return true;
    if (element.id === canonical.id) return true;
    if (element.templateKey === "speaker-image") return false;
    if (canonicalKey && mediaKeyForElement(element) === canonicalKey) return false;
    if (overlapRatioBetweenElements(canonical, element) >= 0.18) return false;
    return true;
  });
}

function bindTemplateAssetsInDraft(draft) {
  let touched = false;
  for (const frame of draft.frames || []) {
    let frameTouched = false;
    for (const element of frame.elements || []) {
      if (element.type !== "image") continue;
      const templateAssetId = element.media?.templateAssetId;
      if (!templateAssetId) continue;
      const asset = findTemplateAssetRecord(draft, templateAssetId);
      if (!asset) continue;
      const nextImageUrl = asset.dataUrl || element.media?.imageUrl || "";
      if (element.media?.assetId === asset.id && element.media?.imageUrl === nextImageUrl) continue;
      element.media = {
        ...imageMedia(element, frame),
        assetId: asset.id,
        imageUrl: nextImageUrl,
      };
      touched = true;
      frameTouched = true;
    }
    if (frameTouched) {
      cleanupMediaCoverageSpeakerImages(frame);
      syncLegacyFrameMedia(frame);
    }
  }
  return touched;
}

function syncTemplateAssetsFromLibrary() {
  const state = store.getState();
  const shouldBind = (state.frames || []).some((frame) => (frame.elements || []).some((element) => {
    if (element.type !== "image") return false;
    const templateAssetId = element.media?.templateAssetId;
    if (!templateAssetId) return false;
    const asset = findTemplateAssetRecord(state, templateAssetId);
    if (!asset) return false;
    return element.media?.assetId !== asset.id || element.media?.imageUrl !== asset.dataUrl;
  }));
  if (!shouldBind) return;
  store.commit((draft) => {
    bindTemplateAssetsInDraft(draft);
  }, { historyLabel: "ui-bind-template-assets", skipHistory: true });
}

async function ensureTemplateAssetsLoaded(state = store.getState(), meta = {}) {
  syncTemplateAssetsFromLibrary();
  const liveState = store.getState();
  const templateAssetsToLoad = new Map();
  for (const frame of liveState.frames || []) {
    for (const element of frame.elements || []) {
      if (element.type !== "image") continue;
      const templateAssetId = element.media?.templateAssetId;
      if (!templateAssetId) continue;
      const assetMeta = getLinkedInTemplateAsset(templateAssetId);
      const existingAsset = findTemplateAssetRecord(liveState, templateAssetId);
      if (
        existingAsset?.trimProcessed === true
        && Number(existingAsset?.width) > 0
        && Number(existingAsset?.height) > 0
        && existingAsset?.subjectBounds
        && existingAsset?.sourceUrl === assetMeta?.url
      ) continue;
      if (runtime.hydratingTemplateAssets.has(templateAssetId)) continue;
      if (!assetMeta?.url) continue;
      templateAssetsToLoad.set(templateAssetId, assetMeta);
    }
  }

  const stopHydrationTimer = startLinkedInPerfTimer("persist", "template-asset-hydration", {
    sourceAction: String(meta?.action || "manual"),
    requestedCount: templateAssetsToLoad.size,
  });
  let importedCount = 0;
  for (const [templateAssetId, assetMeta] of templateAssetsToLoad.entries()) {
    runtime.hydratingTemplateAssets.add(templateAssetId);
    try {
      const imported = await importAssetUrl(assetMeta.url, assetMeta.filename || `${templateAssetId}.png`);
      if (!imported.ok) continue;
      importedCount += 1;
      const existingAsset = findTemplateAssetRecord(store.getState(), templateAssetId);
      const nextAssets = mergeIntoSharedAssetLibrary([{
        ...imported.value,
        id: existingAsset?.id || imported.value.id,
        templateAssetId,
        sourceUrl: assetMeta.url,
        addedAt: existingAsset?.addedAt || nowIso(),
      }], { syncStore: false });
      store.commit((draft) => {
        draft.assets = deepClone(nextAssets);
        bindTemplateAssetsInDraft(draft);
      }, { historyLabel: "import-template-asset", skipHistory: true });
    } catch (_error) {
      // Ignore template asset fetch failures and keep the remote URL in place.
    } finally {
      runtime.hydratingTemplateAssets.delete(templateAssetId);
    }
  }
  stopHydrationTimer({
    importedCount,
    requestedCount: templateAssetsToLoad.size,
  });
}

function hydrateTemplateAssetsForCurrentDocument(action, state = store.getState()) {
  return ensureTemplateAssetsLoaded(state, { action }).catch(() => {});
}

function requestDocumentThumbnailRefresh(action, {
  state = store.getState(),
  meaningful = false,
  documentId = appState.currentDocumentId,
} = {}) {
  if (!shouldRefreshThumbnail({ action })) return;
  queueDocumentThumbnail({
    state,
    meaningful,
    documentId,
    sourceAction: action,
  });
}

function findResource(state, resourceId) {
  return (state.resources || []).find((resource) => resource.id === resourceId) || null;
}

function selectedFrame(state = store.getState()) {
  return findFrame(state, state.ui.selectedFrameId) || state.frames[0] || null;
}

function selectedElement(state = store.getState()) {
  const frame = selectedFrame(state);
  return findElement(frame, state.ui.selectedElementId);
}

function ensureSelection(draft) {
  const frame = findFrame(draft, draft.ui.selectedFrameId) || draft.frames[0] || null;
  if (!frame) {
    draft.ui.selectedFrameId = null;
    draft.ui.selectedElementId = null;
    return;
  }
  draft.ui.selectedFrameId = frame.id;
  if (draft.ui.selectedElementId == null) {
    return;
  }
  if (!findElement(frame, draft.ui.selectedElementId)) {
    draft.ui.selectedElementId = null;
  }
}

function buildExportFilename(state, extension) {
  const base = String(state.project.name || "linkedin-builder")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "linkedin-builder";
  const mode = state.project.outputMode === "carousel" ? "carousel" : "static";
  return `${base}-${mode}.${extension}`;
}

function parseCommaList(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveStageScale() {
  if (runtime.stageScaleMode !== "fit") {
    runtime.stageScale = clamp(Number(runtime.stageScale || 0.54), MIN_STAGE_SCALE, MAX_STAGE_SCALE);
    return;
  }
  const width = refs.canvasViewport?.clientWidth || 960;
  const height = refs.canvasViewport?.clientHeight || 960;
  const metrics = canvasMetrics();
  const nextScale = Math.min((width - 36) / metrics.width, (height - 36) / metrics.height, 1);
  runtime.stageScale = clamp(Number.isFinite(nextScale) ? nextScale : 0.54, MIN_STAGE_SCALE, 1);
}

function updateCanvasZoomUi(frame = selectedFrame()) {
  const hasFrame = Boolean(frame);
  const zoomPercent = `${Math.round((runtime.stageScale || 0.54) * 100)}%`;
  if (refs.canvasZoomLabel) {
    refs.canvasZoomLabel.textContent = runtime.stageScaleMode === "fit" ? `Fit · ${zoomPercent}` : zoomPercent;
  }
  if (refs.btnCanvasZoomOut) refs.btnCanvasZoomOut.disabled = !hasFrame;
  if (refs.btnCanvasZoomIn) refs.btnCanvasZoomIn.disabled = !hasFrame;
  if (refs.btnCanvasZoomFit) {
    refs.btnCanvasZoomFit.disabled = !hasFrame;
    refs.btnCanvasZoomFit.setAttribute("aria-pressed", runtime.stageScaleMode === "fit" ? "true" : "false");
  }
}

function zoomCanvasToFit() {
  runtime.stageScaleMode = "fit";
  renderCanvas(store.getState());
}

function zoomCanvasBy(multiplier) {
  const frame = selectedFrame();
  if (!frame) return;
  resolveStageScale();
  runtime.stageScaleMode = "manual";
  runtime.stageScale = clamp(
    Number(runtime.stageScale || 0.54) * Number(multiplier || 1),
    MIN_STAGE_SCALE,
    MAX_STAGE_SCALE,
  );
  renderCanvas(store.getState());
}

function fontCssRole(fontRole) {
  if (fontRole === "ui") return "var(--font-ui)";
  if (fontRole === "heading") return "var(--font-heading)";
  if (fontRole === "mono") return "var(--font-mono)";
  return "var(--font-body)";
}

function resolveColor(frame, style, property, roleProperty) {
  const custom = style?.[property];
  if (custom) return custom;
  const role = style?.[roleProperty];
  if (role && frame.colors?.[role]) return frame.colors[role];
  if (role === "custom") return style?.[property] || frame.colors.text;
  if (property === "strokeColor") return frame.colors.border;
  return frame.colors.text;
}

function frameUsesImage(frame) {
  return (frame.elements || []).some((element) => element.type === "image");
}

function isMediaCoverageFrame(frame) {
  if (!frame) return false;
  return frame.designFamily === "media_coverage_portrait" || isMediaCoverageTemplate(frame.templateId);
}

function templatePreferredAspectRatio(template) {
  return template?.defaultAspectRatio || DEFAULT_ASPECT_RATIO_ID;
}

function shouldPreserveTargetElementOnTemplateSwap(targetElement) {
  return !(targetElement?.locked === true || targetElement?.preserveOnTemplateSwap === false);
}

function setSelectedFrame(frameId) {
  store.commit((draft) => {
    draft.ui.selectedFrameId = frameId;
    draft.ui.selectedElementId = null;
    if (draft.ui.activeInspectorTab !== "layers") {
      draft.ui.activeInspectorTab = "style";
    }
    ensureSelection(draft);
  }, { historyLabel: "ui-select-frame", skipHistory: true });
}

function setSelectedElement(frameId, elementId) {
  store.commit((draft) => {
    draft.ui.selectedFrameId = frameId;
    draft.ui.selectedElementId = elementId;
    if (draft.ui.activeInspectorTab !== "layers") {
      draft.ui.activeInspectorTab = "style";
    }
    ensureSelection(draft);
  }, { historyLabel: "ui-select-element", skipHistory: true });
}

function setInspectorTab(tab) {
  store.commit((draft) => {
    draft.ui.activeInspectorTab = tab === "layers" ? "layers" : "style";
  }, { historyLabel: "ui-inspector-tab", skipHistory: true });
}

function commitFrame(frameId, mutator, historyLabel = "frame-change") {
  store.commit((draft) => {
    const frame = findFrame(draft, frameId);
    if (!frame) return;
    mutator(frame, draft);
    ensureSelection(draft);
  }, { historyLabel });
}

function commitElement(frameId, elementId, mutator, historyLabel = "element-change") {
  store.commit((draft) => {
    const frame = findFrame(draft, frameId);
    const element = findElement(frame, elementId);
    if (!frame || !element) return;
    mutator(element, frame, draft);
    ensureSelection(draft);
  }, { historyLabel });
}

function applyTemplateToFrame(frameId, templateId, historyLabel = "apply-template") {
  store.commit((draft) => {
    const frameIndex = findFrameIndex(draft, frameId);
    if (frameIndex < 0) return;
    const current = draft.frames[frameIndex];
    const targetTemplate = getTemplate(templateId);
    const currentTextStylePresetId = current.textStylePresetId || defaultTextStylePresetId();
    const replacement = createFrameFromTemplate(templateId, {
      index: frameIndex,
      aspectRatio: draft.project.aspectRatio,
      title: current.title,
      altText: current.altText,
      resourceIds: current.resourceIds,
      content: current.content,
      layoutLocked: current.layoutLocked,
    });
    replacement.id = current.id;
    if (!isMediaCoverageTemplate(targetTemplate)) {
      replacement.colors = {
        ...replacement.colors,
        ...deepClone(current.colors || {}),
      };
    }
    replacement.layoutTouched = false;
    const usedIndexes = new Set();
    replacement.elements = replacement.elements.map((element) => {
      const match = matchElementForTemplate(current.elements || [], element, usedIndexes);
      if (!match) return element;
      return {
        ...element,
        text: match.text || element.text,
        layerRole: match.layerRole || element.layerRole,
        style: {
          ...(element.style || {}),
          ...(match.style || {}),
        },
        media: match.type === "image"
          ? {
            ...imageMedia(element, current),
            ...imageMedia(match, current),
          }
        : element.media,
      };
    });
    cleanupMediaCoverageSpeakerImages(replacement);
    syncLegacyFrameMedia(replacement);
    const nextTextStylePresetId = isMediaCoverageTemplate(targetTemplate) && current.designFamily !== replacement.designFamily
      ? (targetTemplate?.defaultTextStylePresetId || currentTextStylePresetId)
      : currentTextStylePresetId;
    applyTextStylePresetToFrame(replacement, nextTextStylePresetId);
    draft.frames.splice(frameIndex, 1, replacement);
    draft.project.templateId = templateId;
    draft.project.archetype = replacement.archetype;
    draft.ui.selectedFrameId = replacement.id;
    draft.ui.selectedElementId = null;
    ensureSelection(draft);
  }, { historyLabel });
  hydrateTemplateAssetsForCurrentDocument(historyLabel);
}

function setProjectArchetype(archetype) {
  const nextTemplateId = defaultTemplateIdForArchetype(archetype);
  const frame = selectedFrame();
  if (!frame) return;
  store.commit((draft) => {
    draft.project.archetype = archetype;
    draft.project.templateId = nextTemplateId;
    const frameIndex = findFrameIndex(draft, draft.ui.selectedFrameId);
    if (frameIndex < 0) return;
    const current = draft.frames[frameIndex];
    const targetTemplate = getTemplate(nextTemplateId);
    const currentTextStylePresetId = current.textStylePresetId || defaultTextStylePresetId();
    const replacement = createFrameFromTemplate(nextTemplateId, {
      index: frameIndex,
      aspectRatio: draft.project.aspectRatio,
      title: current.title,
      altText: current.altText,
      resourceIds: current.resourceIds,
      content: current.content,
      layoutLocked: current.layoutLocked,
    });
    replacement.id = current.id;
    if (!isMediaCoverageTemplate(targetTemplate)) {
      replacement.colors = {
        ...replacement.colors,
        ...deepClone(current.colors || {}),
      };
    }
    replacement.layoutTouched = false;
    const usedIndexes = new Set();
    replacement.elements = replacement.elements.map((element) => {
      const match = matchElementForTemplate(current.elements || [], element, usedIndexes);
      if (!match) return element;
      return {
        ...element,
        text: match.text || element.text,
        layerRole: match.layerRole || element.layerRole,
        style: {
          ...(element.style || {}),
          ...(match.style || {}),
        },
        media: match.type === "image"
          ? {
            ...imageMedia(element, current),
            ...imageMedia(match, current),
          }
        : element.media,
      };
    });
    cleanupMediaCoverageSpeakerImages(replacement);
    syncLegacyFrameMedia(replacement);
    const nextTextStylePresetId = isMediaCoverageTemplate(targetTemplate) && current.designFamily !== replacement.designFamily
      ? (targetTemplate?.defaultTextStylePresetId || currentTextStylePresetId)
      : currentTextStylePresetId;
    applyTextStylePresetToFrame(replacement, nextTextStylePresetId);
    draft.frames.splice(frameIndex, 1, replacement);
    draft.ui.selectedElementId = null;
    ensureSelection(draft);
  }, { historyLabel: "set-archetype" });
  hydrateTemplateAssetsForCurrentDocument("set-archetype");
}

function setOutputMode(outputMode) {
  store.commit((draft) => {
    draft.project.outputMode = outputMode;
    if (outputMode === "static" && draft.frames.length > 1) {
      draft.frames = [draft.frames[0]];
    }
    ensureSelection(draft);
  }, { historyLabel: "set-output-mode" });
}

function setProjectName(name) {
  store.commit((draft) => {
    draft.project.name = String(name || "").trim() || "LinkedIn Builder Draft";
  }, { historyLabel: "set-project-name" });
}

function textStylePreset(frame) {
  return TEXT_STYLE_PRESETS.find((entry) => entry.id === frame?.textStylePresetId)
    || TEXT_STYLE_PRESETS[0]
    || null;
}

function applyTextStylePresetToFrame(frame, presetId) {
  const preset = TEXT_STYLE_PRESETS.find((entry) => entry.id === presetId) || TEXT_STYLE_PRESETS[0];
  if (!frame || !preset) return;
  const semanticRoleBySlot = {
    eyebrow: "body",
    headline: "heading",
    supporting_copy: "body",
    speaker_name: "body",
    proof_stat: "mono",
    cta: "body",
    author_or_source: "body",
  };
  frame.textStylePresetId = preset.id;
  for (const element of frame.elements || []) {
    if (element.type !== "text") continue;
    const baseRole = semanticRoleBySlot[element.slotKey] || element.style?.fontRole || "body";
    const defaultPatch = preset.defaults?.[baseRole] || {};
    const slotPatch = element.slotKey ? (preset.slots?.[element.slotKey] || {}) : {};
    element.style = {
      ...(element.style || {}),
      ...defaultPatch,
      ...slotPatch,
    };
  }
  fitTextElementsInFrame(frame);
}

function applyBackgroundPreset(frameId, presetId) {
  const preset = BACKGROUND_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return;
  commitFrame(frameId, (frame) => {
    frame.colors = {
      ...frame.colors,
      ...deepClone(preset.colors),
    };
  }, "apply-background-preset");
}

function applyCtaPreset(frameId, cta) {
  updateFrameSlot(frameId, "cta", cta);
}

function applyMediaCoverageVariantToFrame(frameId, variantId) {
  const templateId = mediaCoverageTemplateIdForVariant(variantId);
  if (!templateId) return;
  applyTemplateToFrame(frameId, templateId, "apply-media-coverage-variant");
}

function applyMediaCoverageBackgroundToFrame(frameId, variantId) {
  commitFrame(frameId, (frame) => {
    applyMediaCoverageBackground(frame, variantId);
    sortElementsByLayer(frame);
    syncLegacyFrameMedia(frame);
    frame.layoutTouched = true;
  }, "apply-media-coverage-background");
  hydrateTemplateAssetsForCurrentDocument("apply-media-coverage-background");
}

function applyMediaCoverageTextLayoutToFrame(frameId, layoutMode) {
  commitFrame(frameId, (frame) => {
    applyMediaCoverageTextLayout(frame, layoutMode);
    sortElementsByLayer(frame);
    fitTextElementsInFrame(frame);
    frame.layoutTouched = true;
  }, "apply-media-coverage-text-layout");
}

function applyTextStylePreset(frameId, presetId) {
  commitFrame(frameId, (frame) => {
    applyTextStylePresetToFrame(frame, presetId);
  }, "apply-text-style-preset");
}

function backgroundPresetActive(frame, preset) {
  return ["background", "accent", "text", "muted", "panel", "border"].every((key) =>
    String(frame?.colors?.[key] || "") === String(preset.colors[key] || ""));
}

function createFreshProject(outputMode = "static") {
  const fresh = makeEmptyLinkedInState();
  fresh.project.outputMode = outputMode;
  fresh.project.name = outputMode === "carousel" ? "LinkedIn Carousel Draft" : "LinkedIn Static Post";
  if (outputMode === "carousel") {
    fresh.frames[0].title = "Slide 1";
  }
  applyTextStylePresetToFrame(fresh.frames[0], defaultTextStylePresetId());
  const documentId = createNewDocumentFromState(fresh, { isSaved: false });
  openDocument(documentId);
  showToast(outputMode === "carousel" ? "New carousel draft ready." : "New static post ready.");
}

function saveCurrentProjectToLibrary() {
  const state = store.getState();
  const documentId = appState.currentDocumentId || state.project.id;
  const updatedAt = nowIso();
  appState.currentDocumentId = documentId;
  upsertDocumentRecord(state, {
    id: documentId,
    updatedAt,
    thumbnail: currentDocumentMeta()?.thumbnail || "",
    isSaved: true,
  });
  render();
  requestDocumentThumbnailRefresh("save-to-library", {
    state,
    documentId,
  });
  showToast("Saved to library.");
}

function loadProjectFromLibrary(entryId) {
  openDocument(entryId);
  showToast("Loaded draft.");
}

function deleteProjectFromLibrary(entryId) {
  deleteDocumentEntry(entryId);
}

function addFrame(templateId = null) {
  const state = store.getState();
  const nextTemplateId = templateId || state.project.templateId || defaultTemplateIdForArchetype(state.project.archetype);
  const nextTextStylePresetId = selectedFrame(state)?.textStylePresetId || defaultTextStylePresetId();
  store.commit((draft) => {
    if (draft.project.outputMode !== "carousel") {
      draft.project.outputMode = "carousel";
    }
    const frame = createFrameFromTemplate(nextTemplateId, {
      index: draft.frames.length,
      aspectRatio: draft.project.aspectRatio,
    });
    frame.title = `Slide ${draft.frames.length + 1}`;
    applyTextStylePresetToFrame(frame, nextTextStylePresetId);
    draft.frames.push(frame);
    draft.ui.selectedFrameId = frame.id;
    draft.ui.selectedElementId = null;
    ensureSelection(draft);
  }, { historyLabel: "add-frame" });
}

function duplicateFrameById(frameId) {
  store.commit((draft) => {
    const frameIndex = findFrameIndex(draft, frameId);
    if (frameIndex < 0) return;
    const duplicate = cloneFrame(draft.frames[frameIndex]);
    duplicate.title = `${draft.frames[frameIndex].title} Copy`;
    draft.frames.splice(frameIndex + 1, 0, duplicate);
    draft.project.outputMode = draft.frames.length > 1 ? "carousel" : draft.project.outputMode;
    draft.ui.selectedFrameId = duplicate.id;
    draft.ui.selectedElementId = null;
    ensureSelection(draft);
  }, { historyLabel: "duplicate-frame" });
}

function moveFrameRelative(frameId, targetFrameId, placeAfter = false) {
  store.commit((draft) => {
    const fromIndex = findFrameIndex(draft, frameId);
    const targetIndex = findFrameIndex(draft, targetFrameId);
    if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return;
    const [frame] = draft.frames.splice(fromIndex, 1);
    let insertionIndex = targetIndex;
    if (fromIndex < targetIndex) insertionIndex -= 1;
    if (placeAfter) insertionIndex += 1;
    insertionIndex = Math.max(0, Math.min(insertionIndex, draft.frames.length));
    draft.frames.splice(insertionIndex, 0, frame);
    ensureSelection(draft);
  }, { historyLabel: "reorder-frame" });
}

function deleteFrame(frameId) {
  const frame = findFrame(store.getState(), frameId);
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    const label = frame?.title || "this page";
    if (!window.confirm(`Delete ${label}?`)) {
      return;
    }
  }
  store.commit((draft) => {
    const frameIndex = findFrameIndex(draft, frameId);
    if (frameIndex < 0) return;
    draft.frames.splice(frameIndex, 1);
    if (!draft.frames.length) {
      const fallbackFrame = createFrameFromTemplate(draft.project.templateId || defaultTemplateIdForArchetype(draft.project.archetype), {
        aspectRatio: draft.project.aspectRatio,
      });
      applyTextStylePresetToFrame(fallbackFrame, defaultTextStylePresetId());
      draft.frames = [fallbackFrame];
    }
    if (draft.project.outputMode === "static" && draft.frames.length > 1) {
      draft.frames = [draft.frames[0]];
    }
    ensureSelection(draft);
  }, { historyLabel: "delete-frame" });
}

function resetProject() {
  const fresh = assignSharedAssets(makeEmptyLinkedInState());
  store.replace(fresh, { skipHistory: true, historyLabel: "reset-project" });
  syncAllTextBounds(true);
  store.clearHistory();
  store.flush();
  runtime.resourceForm = blankResourceForm();
  runtime.editingResourceId = null;
  showToast("Draft reset.");
}

async function handleImageImport(file) {
  const importContext = runtime.imageImportContext || "library";
  runtime.imageImportContext = "library";
  const result = await importAssetFile(file);
  if (!result.ok) {
    showToast(result.error || "Image import failed.", "error");
    return;
  }

  result.value.addedAt = nowIso();
  const nextAssets = mergeIntoSharedAssetLibrary([result.value], { syncStore: false });

  store.commit((draft) => {
    draft.assets = deepClone(nextAssets);
    if (importContext === "resource-preview") {
      runtime.resourceForm.previewAssetId = result.value.id;
    }
  }, { historyLabel: "import-image" });

  requestDocumentThumbnailRefresh("import-image", {
    state: store.getState(),
  });
  if (importContext === "resource-preview") {
    renderSidebar(store.getState());
    showToast("Preview uploaded to the asset library.");
  } else {
    showToast("Asset uploaded to the asset library.");
  }
}

async function handleJsonImport(file) {
  const raw = await file.text();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    showToast("That JSON file could not be parsed.", "error");
    return;
  }
  const hydrated = hydrateLinkedInState(parsed);
  const nextAssets = mergeIntoSharedAssetLibrary(hydrated.assets || [], { syncStore: false });
  hydrated.assets = deepClone(nextAssets);
  store.replace(hydrated, { skipHistory: true, historyLabel: "import-json" });
  syncAllTextBounds(true);
  store.clearHistory();
  runtime.resourceForm = blankResourceForm();
  runtime.editingResourceId = null;
  hydrateTemplateAssetsForCurrentDocument("import-json", store.getState());
  requestDocumentThumbnailRefresh("import-json", {
    state: store.getState(),
  });
  showToast("Draft imported.");
}

function upsertResourceFromForm() {
  const title = runtime.resourceForm.title.trim();
  if (!title) {
    showToast("Add a title before saving the resource.", "error");
    return;
  }
  const payload = {
    id: runtime.editingResourceId || uid("res"),
    title,
    sourceType: runtime.resourceForm.sourceType,
    url: runtime.resourceForm.url.trim(),
    tags: parseCommaList(runtime.resourceForm.tags),
    notes: runtime.resourceForm.notes.trim(),
    archetypes: parseCommaList(runtime.resourceForm.archetypes).filter((value) =>
      ARCHETYPE_OPTIONS.some((entry) => entry.id === value)),
    previewAssetId: runtime.resourceForm.previewAssetId || null,
  };

  store.commit((draft) => {
    const existingIndex = draft.resources.findIndex((resource) => resource.id === payload.id);
    if (existingIndex >= 0) {
      draft.resources.splice(existingIndex, 1, payload);
    } else {
      draft.resources.unshift(payload);
    }
  }, { historyLabel: runtime.editingResourceId ? "update-resource" : "add-resource" });

  runtime.resourceForm = blankResourceForm();
  runtime.editingResourceId = null;
  renderSidebar(store.getState());
  renderInspector(store.getState());
  showToast("Resource library updated.");
}

function beginEditResource(resourceId) {
  const resource = findResource(store.getState(), resourceId);
  if (!resource) return;
  runtime.resourceForm = blankResourceForm(resource);
  runtime.editingResourceId = resource.id;
  renderSidebar(store.getState());
}

function deleteResource(resourceId) {
  const resource = findResource(store.getState(), resourceId);
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    const label = resource?.title || "this reference";
    if (!window.confirm(`Delete ${label}?`)) {
      return;
    }
  }
  store.commit((draft) => {
    draft.resources = draft.resources.filter((resource) => resource.id !== resourceId);
    for (const frame of draft.frames || []) {
      frame.resourceIds = (frame.resourceIds || []).filter((id) => id !== resourceId);
    }
  }, { historyLabel: "delete-resource" });
  if (runtime.editingResourceId === resourceId) {
    runtime.editingResourceId = null;
    runtime.resourceForm = blankResourceForm();
  }
  renderSidebar(store.getState());
  renderInspector(store.getState());
  showToast("Resource removed.");
}

function toggleResourceForFrame(frameId, resourceId) {
  commitFrame(frameId, (frame) => {
    const currentIds = new Set(frame.resourceIds || []);
    if (currentIds.has(resourceId)) {
      frame.resourceIds = [...currentIds].filter((id) => id !== resourceId);
    } else {
      currentIds.add(resourceId);
      frame.resourceIds = [...currentIds];
    }
  }, "toggle-resource-link");
}

function setSidebarPanel(panel) {
  store.commit((draft) => {
    draft.ui.activePanel = ["build", "templates", "assets"].includes(panel) ? panel : "build";
  }, { historyLabel: "ui-panel", skipHistory: true });
}

function updateResourceFormField(key, value) {
  runtime.resourceForm[key] = value;
}

function updateSidebarUiField(key, value) {
  store.commit((draft) => {
    draft.ui[key] = value;
  }, { historyLabel: `ui-${key}`, skipHistory: true });
}

function openImageImport(context = "library") {
  runtime.imageImportContext = context;
  refs.fileImportImage?.click();
}

function sidebarNavHtml(state) {
  const active = String(state.ui.activePanel || "build");
  const items = [
    { id: "build", label: "Build" },
    { id: "templates", label: "Templates" },
    { id: "assets", label: "Assets" },
  ];
  return `
    <div class="sidebar-nav" role="tablist" aria-label="Sidebar panels">
      ${items.map((item) => `
        <button
          class="sidebar-nav__button ${active === item.id ? "is-active" : ""}"
          type="button"
          role="tab"
          aria-selected="${active === item.id ? "true" : "false"}"
          data-sidebar-panel="${item.id}"
        >${escapeHtml(item.label)}</button>
      `).join("")}
    </div>
  `;
}

function bindSidebarNav() {
  refs.sidebarPanel.querySelectorAll("[data-sidebar-panel]").forEach((button) => {
    button.addEventListener("click", () => setSidebarPanel(button.dataset.sidebarPanel));
  });
}

function colorInput(value) {
  const text = String(value || "").trim();
  if (!text) return "#000000";

  if (/^#[\da-f]{6}$/i.test(text)) {
    return text;
  }

  const shortHex = text.match(/^#([\da-f]{3})$/i);
  if (shortHex) {
    return `#${shortHex[1].split("").map((part) => `${part}${part}`).join("")}`;
  }

  const alphaHex = text.match(/^#([\da-f]{8})$/i);
  if (alphaHex) {
    return `#${alphaHex[1].slice(0, 6)}`;
  }

  const rgb = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)$/i);
  if (rgb) {
    return `#${rgb
      .slice(1, 4)
      .map((channel) => clamp(Math.round(Number(channel) || 0), 0, 255).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  return "#000000";
}

function resolveTextValue(frame, element) {
  if (!element?.slotKey) return element?.text || "";
  return frame.content?.[element.slotKey] || "";
}

const textMeasureContext = document.createElement("canvas").getContext("2d");

function fontFamilyName(fontRole) {
  if (fontRole === "ui") return "Geologica";
  if (fontRole === "heading") return "Sora";
  if (fontRole === "mono") return "\"IBM Plex Mono\"";
  return "Manrope";
}

function measureTextWidth(value, style) {
  if (!textMeasureContext) return String(value || "").length * (Number(style?.fontSize) || 28) * 0.52;
  const fontSize = Number(style?.fontSize) || 28;
  const fontWeight = Number(style?.fontWeight) || 500;
  textMeasureContext.font = `${fontWeight} ${fontSize}px ${fontFamilyName(style?.fontRole)}`;
  const text = String(value || "");
  const letterSpacing = Number(style?.letterSpacing) || 0;
  return textMeasureContext.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing;
}

function wrapTextLines(value, maxWidth, style) {
  const text = String(value || "");
  if (!text.trim()) return [""];
  const paragraphs = text.split("\n");
  const lines = [];
  const availableWidth = Math.max(40, Number(maxWidth) || 40);

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/).filter(Boolean);
    let currentLine = "";
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (!currentLine || measureTextWidth(candidate, style) <= availableWidth) {
        currentLine = candidate;
        continue;
      }
      if (measureTextWidth(word, style) > availableWidth) {
        let fragment = "";
        for (const char of word) {
          const fragmentCandidate = `${fragment}${char}`;
          if (fragment && measureTextWidth(fragmentCandidate, style) > availableWidth) {
            lines.push(currentLine || fragment);
            currentLine = "";
            fragment = char;
          } else {
            fragment = fragmentCandidate;
          }
        }
        currentLine = fragment;
        continue;
      }
      lines.push(currentLine);
      currentLine = word;
    }
    lines.push(currentLine);
  }

  return lines.filter((line, index) => line !== "" || index === lines.length - 1 || lines.length === 1);
}

function fitTextElementToContent(frame, element) {
  if (!frame || element?.type !== "text") return;
  const rawValue = resolveTextValue(frame, element) || element.label || "";
  const textValue = element.style?.textTransform === "uppercase" ? rawValue.toUpperCase() : rawValue;
  const lineHeight = Number(element.style?.lineHeight) || 1.2;
  const fontSize = Number(element.style?.fontSize) || 28;
  const lines = wrapTextLines(textValue, element.w, element.style || {});
  const minHeight = Number(element.minH) || 40;
  const contentHeight = Math.ceil((Math.max(1, lines.length) * fontSize * lineHeight) + 6);
  element.h = clamp(contentHeight, minHeight, canvasHeight(frame.aspectRatio || projectAspectRatio()) - element.y);
}

function fitTextElementsInFrame(frame) {
  for (const element of frame?.elements || []) {
    fitTextElementToContent(frame, element);
  }
}

function syncAllTextBounds(skipHistory = true) {
  store.commit((draft) => {
    for (const frame of draft.frames || []) {
      fitTextElementsInFrame(frame);
    }
  }, { historyLabel: "sync-text-bounds", skipHistory });
}

function updateFrameSlot(frameId, slotKey, value) {
  commitFrame(frameId, (frame) => {
    frame.content[slotKey] = value;
    fitTextElementsInFrame(frame);
  }, `slot-${slotKey}`);
}

function updateElementText(frameId, elementId, value) {
  commitElement(frameId, elementId, (element, frame) => {
    element.text = value;
    if (element.type === "text") {
      fitTextElementToContent(frame, element);
    }
  }, "element-text");
}

function updateFrameField(frameId, field, value) {
  commitFrame(frameId, (frame) => {
    frame[field] = value;
  }, `frame-${field}`);
}

function updateFrameColor(frameId, colorKey, value) {
  commitFrame(frameId, (frame) => {
    frame.colors[colorKey] = value;
  }, `frame-color-${colorKey}`);
}

function syncLegacyFrameMedia(frame) {
  const imageElement = primaryImageElement(frame);
  frame.media = imageElement
    ? { ...imageMedia(imageElement, frame) }
    : {
      assetId: null,
      imageUrl: "",
      objectFit: "cover",
      objectPositionX: 50,
      objectPositionY: 50,
      scale: 1,
    };
}

function updateImageElementMedia(frameId, elementId, patch, historyLabel = "element-media") {
  commitFrame(frameId, (frame) => {
    const target = elementId ? findElement(frame, elementId) : primaryImageElement(frame);
    if (!target || target.type !== "image") return;
    target.media = {
      ...imageMedia(target, frame),
      ...patch,
    };
    cleanupMediaCoverageSpeakerImages(frame, target.id);
    syncLegacyFrameMedia(frame);
  }, historyLabel);
}

function updateElementRect(frameId, elementId, patch) {
  commitElement(frameId, elementId, (element, frame) => {
    const metrics = canvasMetrics(frame.aspectRatio || projectAspectRatio());
    const rawX = Number(patch.x);
    const rawY = Number(patch.y);
    const rawW = Number(patch.w);
    const rawH = Number(patch.h);
    const widthCandidate = Number.isFinite(rawW) ? rawW : element.w;
    const heightCandidate = Number.isFinite(rawH) ? rawH : element.h;
    let nextX;
    let nextY;
    let nextW;
    let nextH;
    if (element.allowOverflow === true) {
      nextX = clamp(Number.isFinite(rawX) ? rawX : element.x, -metrics.width * 0.85, metrics.width * 1.35);
      nextY = clamp(Number.isFinite(rawY) ? rawY : element.y, -metrics.height * 0.75, metrics.height * 1.35);
      nextW = clamp(widthCandidate, Number(element.minW) || 60, metrics.width * 2.4);
      nextH = clamp(heightCandidate, Number(element.minH) || 40, metrics.height * 2.4);
    } else {
      nextX = clamp(Number.isFinite(rawX) ? rawX : element.x, 0, metrics.width - Math.max(20, widthCandidate));
      nextY = clamp(Number.isFinite(rawY) ? rawY : element.y, 0, metrics.height - Math.max(20, heightCandidate));
      nextW = clamp(widthCandidate, Number(element.minW) || 60, metrics.width - nextX);
      nextH = clamp(heightCandidate, Number(element.minH) || 40, metrics.height - nextY);
    }
    element.x = nextX;
    element.y = nextY;
    element.w = nextW;
    element.h = nextH;
    if (element.type === "text") {
      fitTextElementToContent(frame, element);
    }
    frame.layoutTouched = true;
  }, "element-rect");
}

function updateTextElementStyle(frameId, elementId, patch) {
  commitElement(frameId, elementId, (element, frame) => {
    element.style = {
      ...(element.style || {}),
      ...patch,
    };
    fitTextElementToContent(frame, element);
  }, "text-style");
}

function updateShapeElementStyle(frameId, elementId, patch) {
  commitElement(frameId, elementId, (element) => {
    element.style = {
      ...(element.style || {}),
      ...patch,
    };
  }, "shape-style");
}

function updateButtonElementStyle(frameId, elementId, patch) {
  commitElement(frameId, elementId, (element) => {
    element.style = {
      ...(element.style || {}),
      ...patch,
    };
  }, "button-style");
}

function sortElementsByLayer(frame) {
  const grouped = new Map(LAYER_ROLE_ORDER.map((role) => [role, []]));
  for (const element of frame.elements || []) {
    const role = LAYER_ROLE_ORDER.includes(element.layerRole) ? element.layerRole : defaultLayerRole(element.type);
    grouped.get(role).push(element);
  }
  frame.elements = LAYER_ROLE_ORDER.flatMap((role) => grouped.get(role));
}

function addElementToFrame(frameId, type) {
  store.commit((draft) => {
    const frame = findFrame(draft, frameId);
    if (!frame) return;
    const element = createLooseElement(type, draft.project.aspectRatio);
    frame.elements.push(element);
    sortElementsByLayer(frame);
    frame.layoutTouched = true;
    draft.ui.selectedFrameId = frame.id;
    draft.ui.selectedElementId = element.id;
    ensureSelection(draft);
  }, { historyLabel: "add-element" });
}

function duplicateElement(frameId, elementId) {
  store.commit((draft) => {
    const frame = findFrame(draft, frameId);
    const elementIndex = findElementIndex(frame, elementId);
    if (!frame || elementIndex < 0) return;
    const source = deepClone(frame.elements[elementIndex]);
    const copy = {
      ...source,
      id: uid("elt"),
      label: `${source.label} Copy`,
      slotKey: "",
      text: source.slotKey ? resolveTextValue(frame, source) : source.text,
      x: clamp(Number(source.x || 0) + 28, 0, canvasWidth(draft.project.aspectRatio) - Number(source.w || 0)),
      y: clamp(Number(source.y || 0) + 28, 0, canvasHeight(draft.project.aspectRatio) - Number(source.h || 0)),
    };
    frame.elements.splice(elementIndex + 1, 0, copy);
    sortElementsByLayer(frame);
    frame.layoutTouched = true;
    draft.ui.selectedFrameId = frame.id;
    draft.ui.selectedElementId = copy.id;
    ensureSelection(draft);
  }, { historyLabel: "duplicate-element" });
}

function deleteElement(frameId, elementId) {
  const frame = findFrame(store.getState(), frameId);
  const element = findElement(frame, elementId);
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    const label = element?.label || "this element";
    if (!window.confirm(`Delete ${label}?`)) {
      return;
    }
  }
  store.commit((draft) => {
    const frame = findFrame(draft, frameId);
    if (!frame) return;
    frame.elements = (frame.elements || []).filter((element) => element.id !== elementId);
    sortElementsByLayer(frame);
    frame.layoutTouched = true;
    draft.ui.selectedFrameId = frame.id;
    draft.ui.selectedElementId = null;
    ensureSelection(draft);
    syncLegacyFrameMedia(frame);
  }, { historyLabel: "delete-element" });
}

function deleteCurrentSelection(state = store.getState()) {
  const frame = selectedFrame(state);
  const element = selectedElement(state);
  if (frame && element) {
    deleteElement(frame.id, element.id);
    return "element";
  }
  if (frame) {
    deleteFrame(frame.id);
    return "frame";
  }
  return null;
}

function moveElementWithinLayer(frameId, elementId, direction) {
  store.commit((draft) => {
    const frame = findFrame(draft, frameId);
    const element = findElement(frame, elementId);
    if (!frame || !element) return;
    const role = element.layerRole || defaultLayerRole(element.type);
    const indexes = (frame.elements || [])
      .map((candidate, index) => ((candidate.layerRole || defaultLayerRole(candidate.type)) === role ? index : -1))
      .filter((index) => index >= 0);
    const currentPointer = indexes.findIndex((index) => frame.elements[index]?.id === elementId);
    const nextPointer = currentPointer + direction;
    if (currentPointer < 0 || nextPointer < 0 || nextPointer >= indexes.length) return;
    const fromIndex = indexes[currentPointer];
    const toIndex = indexes[nextPointer];
    const [moved] = frame.elements.splice(fromIndex, 1);
    frame.elements.splice(toIndex, 0, moved);
    frame.layoutTouched = true;
    ensureSelection(draft);
  }, { historyLabel: "move-element" });
}

function moveElementInStack(frameId, elementId, action) {
  store.commit((draft) => {
    const frame = findFrame(draft, frameId);
    if (!frame) return;
    const editable = editableStackElements(frame);
    const currentIndex = editable.findIndex((element) => element.id === elementId);
    if (currentIndex < 0) return;

    let targetIndex = currentIndex;
    if (action === "front") targetIndex = editable.length - 1;
    if (action === "back") targetIndex = 0;
    if (action === "forward") targetIndex = Math.min(editable.length - 1, currentIndex + 1);
    if (action === "backward") targetIndex = Math.max(0, currentIndex - 1);
    if (targetIndex === currentIndex) return;

    const reordered = editable.slice();
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    let pointer = 0;
    frame.elements = (frame.elements || []).map((element) => (element.locked === true ? element : reordered[pointer++]));
    frame.layoutTouched = true;
    ensureSelection(draft);
  }, { historyLabel: "stack-element" });
}

function setElementLayerRole(frameId, elementId, layerRole) {
  store.commit((draft) => {
    const frame = findFrame(draft, frameId);
    const element = findElement(frame, elementId);
    if (!frame || !element || !LAYER_ROLE_ORDER.includes(layerRole)) return;
    element.layerRole = layerRole;
    sortElementsByLayer(frame);
    frame.layoutTouched = true;
    ensureSelection(draft);
  }, { historyLabel: "set-layer-role" });
}

function matchElementForTemplate(sourceElements, targetElement, usedIndexes) {
  if (!shouldPreserveTargetElementOnTemplateSwap(targetElement)) {
    return null;
  }
  let matchIndex = sourceElements.findIndex((candidate, index) => !usedIndexes.has(index)
    && targetElement.templateKey
    && candidate.templateKey === targetElement.templateKey
    && candidate.type === targetElement.type);
  if (matchIndex < 0) {
    matchIndex = sourceElements.findIndex((candidate, index) => !usedIndexes.has(index)
      && targetElement.slotKey
      && candidate.slotKey === targetElement.slotKey
      && candidate.type === targetElement.type);
  }
  if (matchIndex < 0) {
    matchIndex = sourceElements.findIndex((candidate, index) => !usedIndexes.has(index)
      && candidate.label === targetElement.label
      && candidate.type === targetElement.type);
  }
  if (matchIndex < 0 && !targetElement.templateKey && !targetElement.slotKey) {
    matchIndex = sourceElements.findIndex((candidate, index) => !usedIndexes.has(index)
      && candidate.type === targetElement.type);
  }
  if (matchIndex >= 0) {
    usedIndexes.add(matchIndex);
    return sourceElements[matchIndex];
  }
  return null;
}

function rebuildMediaCoverageFrameForAspectRatio(frame, nextAspectRatio, frameIndex) {
  const sourceAspectRatio = frame.aspectRatio || projectAspectRatio();
  const rebuilt = createFrameFromTemplate(frame.templateId, {
    index: frameIndex,
    aspectRatio: nextAspectRatio,
    title: frame.title,
    altText: frame.altText,
    resourceIds: frame.resourceIds,
    content: frame.content,
    layoutLocked: frame.layoutLocked,
    layoutTouched: frame.layoutTouched,
  });
  rebuilt.id = frame.id;
  rebuilt.colors = {
    ...rebuilt.colors,
    ...(frame.colors || {}),
  };
  rebuilt.textStylePresetId = frame.textStylePresetId;

  const usedIndexes = new Set();
  rebuilt.elements = rebuilt.elements.map((element) => {
    const match = matchElementForTemplate(frame.elements || [], element, usedIndexes);
    if (!match) return element;
    return {
      ...element,
      text: match.text || element.text,
      layerRole: match.layerRole || element.layerRole,
      style: {
        ...(element.style || {}),
        ...(match.style || {}),
      },
      media: match.type === "image"
        ? {
          ...imageMedia(element, frame),
          ...imageMedia(match, frame),
        }
        : element.media,
    };
  });

  const extraElements = (frame.elements || []).filter((element, index) =>
    !usedIndexes.has(index)
    && shouldPreserveTargetElementOnTemplateSwap(element)
    && !(element.locked === true && element.layerRole === "background"));
  if (extraElements.length) {
    rebuilt.elements.push(...mapElementsToAspectRatio(extraElements, sourceAspectRatio, nextAspectRatio));
  }

  cleanupMediaCoverageSpeakerImages(rebuilt);
  syncLegacyFrameMedia(rebuilt);
  fitTextElementsInFrame(rebuilt);
  return rebuilt;
}

function rebuildUntouchedFrameForAspectRatio(frame, nextAspectRatio, frameIndex) {
  const rebuilt = createFrameFromTemplate(frame.templateId, {
    index: frameIndex,
    aspectRatio: nextAspectRatio,
    title: frame.title,
    altText: frame.altText,
    resourceIds: frame.resourceIds,
    content: frame.content,
    layoutLocked: frame.layoutLocked,
    layoutTouched: false,
  });
  rebuilt.id = frame.id;
  rebuilt.colors = {
    ...rebuilt.colors,
    ...(frame.colors || {}),
  };
  rebuilt.textStylePresetId = frame.textStylePresetId;

  const usedIndexes = new Set();
  rebuilt.elements = rebuilt.elements.map((element) => {
    const match = matchElementForTemplate(frame.elements || [], element, usedIndexes);
    if (!match) return element;
    return {
      ...element,
      text: match.text || element.text,
      layerRole: match.layerRole || element.layerRole,
      style: {
        ...(element.style || {}),
        ...(match.style || {}),
      },
      media: match.type === "image"
        ? {
          ...imageMedia(element, frame),
          ...imageMedia(match, frame),
        }
        : element.media,
    };
  });
  cleanupMediaCoverageSpeakerImages(rebuilt);
  syncLegacyFrameMedia(rebuilt);
  fitTextElementsInFrame(rebuilt);
  return rebuilt;
}

function scaleEditedFrameForAspectRatio(frame, fromAspectRatio, nextAspectRatio) {
  const metrics = canvasMetrics(nextAspectRatio);
  const nextElements = mapElementsToAspectRatio(frame.elements || [], fromAspectRatio, nextAspectRatio)
    .map((element) => {
      const minW = Number(element.minW) || 60;
      const minH = Number(element.minH) || 40;
      const next = {
        ...element,
        x: Number(element.x || 0),
        y: Number(element.y || 0),
      };
      if (element.allowOverflow === true) {
        next.x = clamp(next.x, -metrics.width * 2, metrics.width * 2);
        next.y = clamp(next.y, -metrics.height * 2, metrics.height * 2);
        next.w = clamp(Number(element.w || 0), minW, metrics.width * 4);
        next.h = clamp(Number(element.h || 0), minH, metrics.height * 4);
      } else {
        next.x = clamp(next.x, 0, metrics.width);
        next.y = clamp(next.y, 0, metrics.height);
        next.w = clamp(Number(element.w || 0), minW, metrics.width - next.x);
        next.h = clamp(Number(element.h || 0), minH, metrics.height - next.y);
      }
      return next;
    });
  frame.elements = nextElements;
  frame.aspectRatio = nextAspectRatio;
  if (frame.designFamily === "media_coverage_portrait") {
    // Locked abstract background art should always refit to the new canvas ratio.
    applyMediaCoverageBackground(frame, frame.backgroundVariantId || frame.backgroundAssetId || frame.variantId);
    cleanupMediaCoverageSpeakerImages(frame);
  }
  syncLegacyFrameMedia(frame);
  fitTextElementsInFrame(frame);
}

function setAspectRatio(aspectRatio) {
  const nextAspectRatio = getAspectRatioPreset(aspectRatio).id;
  const currentAspectRatio = projectAspectRatio();
  if (nextAspectRatio === currentAspectRatio) return;
  store.commit((draft) => {
    draft.project.aspectRatio = nextAspectRatio;
    draft.project.format = nextAspectRatio;
    draft.frames = (draft.frames || []).map((frame, frameIndex) => {
      if (frame.designFamily === "media_coverage_portrait") {
        return rebuildMediaCoverageFrameForAspectRatio(frame, nextAspectRatio, frameIndex);
      }
      if (!frame.layoutTouched) {
        return rebuildUntouchedFrameForAspectRatio(frame, nextAspectRatio, frameIndex);
      }
      const scaled = deepClone(frame);
      scaleEditedFrameForAspectRatio(scaled, currentAspectRatio, nextAspectRatio);
      return scaled;
    });
    ensureSelection(draft);
  }, { historyLabel: "set-aspect-ratio" });
}

function toggleLayoutLock(frameId) {
  commitFrame(frameId, (frame) => {
    frame.layoutLocked = !frame.layoutLocked;
  }, "toggle-layout-lock");
}

function resourceCardHtml(resource, frame, state) {
  const attached = Boolean(frame?.resourceIds?.includes(resource.id));
  const preview = resource.previewAssetId ? findAsset(state, resource.previewAssetId) : null;
  const tagHtml = resource.tags.length
    ? `<div class="resource-tags">${resource.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`
    : "";
  const archetypeHtml = resource.archetypes.length
    ? `<div class="helper">${resource.archetypes.map(archetypeLabel).join(" · ")}</div>`
    : "";
  return `
    <article class="resource-card">
      ${preview?.dataUrl ? `<img class="resource-card__preview" src="${preview.dataUrl}" alt="">` : '<div class="resource-card__preview resource-card__preview--empty">Preview</div>'}
      <div class="resource-card__body">
        <div class="resource-card__head">
          <strong>${escapeHtml(resource.title)}</strong>
          <span class="resource-source">${escapeHtml(RESOURCE_SOURCE_OPTIONS.find((entry) => entry.id === resource.sourceType)?.label || resource.sourceType)}</span>
        </div>
        ${tagHtml}
        ${archetypeHtml}
        ${resource.notes ? `<p>${escapeHtml(resource.notes)}</p>` : ""}
        <div class="resource-card__actions">
          <button class="btn btn--ghost" type="button" data-toggle-resource="${resource.id}">${attached ? "Detach" : "Attach"}</button>
          <button class="btn btn--ghost" type="button" data-edit-resource="${resource.id}">Edit</button>
          <button class="btn btn--ghost btn--danger-outline" type="button" data-delete-resource="${resource.id}">Delete</button>
          ${resource.url ? `<a class="btn btn--ghost" href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">Open</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

function assetCardHtml(asset, frame, state = store.getState()) {
  const targetImage = resolveTargetImageElement(state) || primaryImageElement(frame);
  const applied = targetImage?.media?.assetId === asset.id;
  return `
    <article class="asset-card">
      <img src="${asset.dataUrl}" alt="${escapeHtml(asset.filename)}">
      <div class="asset-card__meta">
        <strong>${escapeHtml(asset.filename)}</strong>
        <span>${Math.max(1, Math.round((asset.size || 0) / 1024))} KB</span>
      </div>
      <button class="btn btn--ghost" type="button" data-apply-asset="${asset.id}">${applied ? "Applied" : "Use on frame"}</button>
    </article>
  `;
}

function assetLibraryCardHtml(asset, state = store.getState()) {
  const frame = selectedFrame(state);
  const targetImage = resolveTargetImageElement(state) || primaryImageElement(frame);
  const applied = targetImage?.media?.assetId === asset.id;
  const actionLabel = targetImage ? (applied ? "Applied" : "Apply") : "Add to canvas";
  return `
    <button
      class="asset-library-card asset-library-card--thumb ${applied ? "is-applied" : ""}"
      type="button"
      data-apply-library-asset="${asset.id}"
      aria-label="${escapeHtml(`${actionLabel} ${asset.filename}`)}"
      title="${escapeHtml(asset.filename)}"
    >
      <div class="asset-library-card__thumb">
        <img src="${asset.dataUrl}" alt="${escapeHtml(asset.filename)}">
      </div>
    </button>
  `;
}

function assetMatchesSearch(search, ...values) {
  const normalized = String(search || "").trim().toLowerCase();
  if (!normalized) return true;
  return values
    .map((value) => String(value || "").toLowerCase())
    .join(" ")
    .includes(normalized);
}

function uploadedAssetLibrary(state) {
  return sharedAssetsForState(state).filter((asset) => !asset.templateAssetId);
}

function assetCategoryTabsHtml(activeFilter) {
  const items = [
    { id: "all", label: "All assets" },
    { id: "images", label: "Images" },
    { id: "backgrounds", label: "Backgrounds" },
    { id: "buttons", label: "Buttons" },
  ];
  return `
    <div class="asset-filter-tabs" role="tablist" aria-label="Asset categories">
      ${items.map((item) => `
        <button
          class="asset-filter-tab ${activeFilter === item.id ? "is-active" : ""}"
          type="button"
          role="tab"
          aria-selected="${activeFilter === item.id ? "true" : "false"}"
          data-asset-filter="${item.id}"
        >${escapeHtml(item.label)}</button>
      `).join("")}
    </div>
  `;
}

function visualChoiceCardHtml({
  label,
  active = false,
  thumbUrl = "",
  swatchStyle = "",
  dataAttr = "",
  dataValue = "",
}) {
  const attr = dataAttr ? `${dataAttr}="${escapeHtml(dataValue)}"` : "";
  const thumb = thumbUrl
    ? `<span class="choice-card__media"><img src="${escapeHtml(thumbUrl)}" alt=""></span>`
    : `<span class="choice-card__swatch" style="${swatchStyle}"></span>`;
  return `
    <button
      class="choice-card choice-card--visual choice-card--thumb ${active ? "is-active" : ""}"
      type="button"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      ${attr}
    >
      ${thumb}
    </button>
  `;
}

function mediaCoverageBackgroundCardHtml(background, active) {
  const asset = getLinkedInTemplateAsset(background.backgroundAssetId || background.id);
  return visualChoiceCardHtml({
    label: background.label,
    active,
    thumbUrl: asset?.url || "",
    dataAttr: "data-media-background",
    dataValue: background.id,
  });
}

function presetBackgroundCardHtml(preset, active) {
  return visualChoiceCardHtml({
    label: preset.label,
    active,
    swatchStyle: `--swatch-bg:${preset.colors.background}; --swatch-accent:${preset.colors.accent}; --swatch-panel:${preset.colors.panel};`,
    dataAttr: "data-select-background",
    dataValue: preset.id,
  });
}

function buttonAssetCardHtml() {
  return `
    <button
      class="asset-library-card asset-library-card--thumb asset-library-card--label"
      type="button"
      data-add-button-asset="cta"
      aria-label="Add CTA button"
      title="CTA button"
    >
      <div class="asset-library-card__thumb asset-library-card__thumb--label">CTA</div>
    </button>
  `;
}

function applyAssetFromLibrary(assetId) {
  const state = store.getState();
  const frame = selectedFrame(state);
  const asset = findAsset(state, assetId);
  if (!frame || !asset) return;
  const targetImage = resolveTargetImageElement(state) || primaryImageElement(frame);
  if (targetImage?.type === "image") {
    updateImageElementMedia(frame.id, targetImage.id, {
      assetId: asset.id,
      imageUrl: asset.dataUrl,
    }, "apply-asset");
    requestDocumentThumbnailRefresh("apply-asset", {
      state: store.getState(),
    });
    showToast("Asset applied.");
    return;
  }

  store.commit((draft) => {
    const liveFrame = findFrame(draft, draft.ui.selectedFrameId);
    if (!liveFrame) return;
    const element = createLooseElement("image", draft.project.aspectRatio);
    element.label = asset.filename || "Image";
    element.x = Math.round((canvasWidth(draft.project.aspectRatio) - element.w) / 2);
    element.y = Math.round((canvasHeight(draft.project.aspectRatio) - element.h) / 2);
    element.media = {
      ...imageMedia(element, liveFrame),
      assetId: asset.id,
      imageUrl: asset.dataUrl,
    };
    liveFrame.elements.push(element);
    sortElementsByLayer(liveFrame);
    syncLegacyFrameMedia(liveFrame);
    liveFrame.layoutTouched = true;
    draft.ui.selectedFrameId = liveFrame.id;
    draft.ui.selectedElementId = element.id;
    ensureSelection(draft);
  }, { historyLabel: "add-asset-to-canvas" });
  requestDocumentThumbnailRefresh("add-asset-to-canvas", {
    state: store.getState(),
  });
  showToast("Asset added to canvas.");
}

function renderAssetsPanel(state) {
  const frame = selectedFrame(state);
  const filterValue = String(state.ui.assetFilter || "all");
  const filter = ["all", "images", "backgrounds", "buttons"].includes(filterValue)
    ? filterValue
    : (filterValue === "uploaded" ? "images" : (filterValue === "template" ? "backgrounds" : "all"));
  const search = String(state.ui.assetSearch || "").trim();
  const mediaCoverageActive = isMediaCoverageFrame(frame);
  const imageAssets = uploadedAssetLibrary(state).filter((asset) =>
    assetMatchesSearch(search, asset.filename, asset.id));
  const mediaBackgrounds = mediaCoverageBackgroundOptions().filter((background) =>
    assetMatchesSearch(search, background.label, background.id));
  const presetBackgrounds = BACKGROUND_PRESETS.filter((preset) =>
    assetMatchesSearch(search, preset.label, preset.id));
  const buttonAssets = assetMatchesSearch(search, "cta button add button call to action")
    ? [{ id: "cta", label: "CTA button" }]
    : [];
  const showImages = filter === "all" || filter === "images";
  const showBackgrounds = filter === "all" || filter === "backgrounds";
  const showButtons = filter === "all" || filter === "buttons";
  const backgroundCards = mediaCoverageActive
    ? mediaBackgrounds.map((background) =>
      mediaCoverageBackgroundCardHtml(background, (frame?.backgroundAssetId || frame?.backgroundVariantId) === background.id))
    : presetBackgrounds.map((preset) => presetBackgroundCardHtml(preset, Boolean(frame && backgroundPresetActive(frame, preset))));

  refs.sidebarPanel.innerHTML = `
    ${sidebarNavHtml(state)}
    <section class="panel-section panel-section--dense">
      <div class="panel-section__head panel-section__head--compact">
        <h2>Assets</h2>
        <button class="btn btn--ghost btn--mini" id="btnUploadAssetLibrary" type="button">Upload</button>
      </div>
      ${assetCategoryTabsHtml(filter)}
      <input
        class="asset-search-input"
        id="assetSearch"
        type="text"
        value="${escapeHtml(state.ui.assetSearch || "")}"
        placeholder="Search assets"
        aria-label="Search assets"
      >
    </section>

    ${showImages ? `
      <section class="panel-section panel-section--dense">
        <div class="panel-section__head panel-section__head--compact">
          <h2>Images</h2>
        </div>
        <div class="asset-library-grid asset-library-grid--thumbs">
          ${imageAssets.map((asset) => assetLibraryCardHtml(asset, state)).join("")}
          ${!imageAssets.length ? '<div class="empty-state empty-state--small empty-state--inline">Upload images to build your library.</div>' : ""}
        </div>
      </section>
    ` : ""}

    ${showBackgrounds ? `
      <section class="panel-section panel-section--dense">
        <div class="panel-section__head panel-section__head--compact">
          <h2>Backgrounds</h2>
        </div>
        <div class="choice-grid choice-grid--asset-thumbs">
          ${backgroundCards.join("")}
          ${!backgroundCards.length ? '<div class="empty-state empty-state--small empty-state--inline">No backgrounds match that search.</div>' : ""}
        </div>
      </section>
    ` : ""}

    ${showButtons ? `
      <section class="panel-section panel-section--dense">
        <div class="panel-section__head panel-section__head--compact">
          <h2>Buttons</h2>
        </div>
        <div class="asset-library-grid asset-library-grid--thumbs">
          ${buttonAssets.map(() => buttonAssetCardHtml()).join("")}
          ${!buttonAssets.length ? '<div class="empty-state empty-state--small empty-state--inline">No button assets match that search.</div>' : ""}
        </div>
      </section>
    ` : ""}
  `;

  bindSidebarNav();
  refs.sidebarPanel.querySelector("#btnUploadAssetLibrary")?.addEventListener("click", () => openImageImport("library"));
  refs.sidebarPanel.querySelectorAll("[data-asset-filter]").forEach((button) => {
    button.addEventListener("click", () => updateSidebarUiField("assetFilter", button.dataset.assetFilter));
  });
  refs.sidebarPanel.querySelector("#assetSearch")?.addEventListener("input", (event) => updateSidebarUiField("assetSearch", event.target.value));
  refs.sidebarPanel.querySelectorAll("[data-apply-library-asset]").forEach((button) => {
    button.addEventListener("click", () => applyAssetFromLibrary(button.dataset.applyLibraryAsset));
  });
  refs.sidebarPanel.querySelectorAll("[data-add-button-asset]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!frame) return;
      addElementToFrame(frame.id, "button");
    });
  });
  refs.sidebarPanel.querySelectorAll("[data-media-background]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!frame) return;
      applyMediaCoverageBackgroundToFrame(frame.id, button.dataset.mediaBackground);
    });
  });
  refs.sidebarPanel.querySelectorAll("[data-select-background]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!frame) return;
      applyBackgroundPreset(frame.id, button.dataset.selectBackground);
    });
  });
}

function renderBuildPanel(state) {
  const ratio = projectAspectRatio(state);
  const documentMeta = currentDocumentMeta();
  const outputLabel = OUTPUT_MODE_OPTIONS.find((option) => option.id === state.project.outputMode)?.label || state.project.outputMode;
  const ratioLabel = getAspectRatioPreset(ratio).label;
  refs.sidebarPanel.innerHTML = `
    ${sidebarNavHtml(state)}
    <section class="panel-section">
      <div class="panel-section__head">
        <h2>Document</h2>
      </div>
      <label class="field">
        <span>Post name</span>
        <input id="projectName" type="text" value="${escapeHtml(state.project.name || "")}" placeholder="Q2 founder spotlight">
      </label>
      <div class="inline-actions">
        <button class="btn" id="btnSaveToLibrary" type="button">Save to library</button>
      </div>
      <div class="current-template-card">
        <strong>${documentMeta?.isSaved ? "Saved post" : "Draft"}</strong>
        <span>${escapeHtml(outputLabel)} · ${escapeHtml(ratioLabel)}</span>
        <span>${escapeHtml(archetypeLabel(state.project.archetype))}</span>
      </div>
    </section>

    <section class="panel-section">
      <div class="panel-section__head">
        <h2>Aspect Ratio</h2>
      </div>
      <div class="choice-grid">
        ${ASPECT_RATIO_PRESETS.map((preset) => `
          <button class="choice-card ${ratio === preset.id ? "is-active" : ""}" type="button" data-select-ratio="${preset.id}">
            <strong>${escapeHtml(preset.label)}</strong>
            <span>${preset.width} × ${preset.height}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;

  bindSidebarNav();
  refs.sidebarPanel.querySelector("#projectName")?.addEventListener("change", (event) => {
    setProjectName(event.target.value);
  });
  refs.sidebarPanel.querySelector("#btnSaveToLibrary")?.addEventListener("click", saveCurrentProjectToLibrary);
  refs.sidebarPanel.querySelectorAll("[data-select-ratio]").forEach((button) => {
    button.addEventListener("click", () => setAspectRatio(button.dataset.selectRatio));
  });
}

function renderTemplatesPanel(state) {
  const search = String(state.ui.templateSearch || "").toLowerCase().trim();
  const frame = selectedFrame(state);
  const template = getTemplate(frame?.templateId || state.project.templateId);
  const mediaCoverageActive = isMediaCoverageFrame(frame);
  const activeTextStylePreset = textStylePreset(frame);
  const activeTextLayoutMode = frame?.textLayoutMode || template?.textLayoutMode || "";
  const templates = TEMPLATE_LIBRARY.filter((template) => {
    if (template.archetype !== state.project.archetype) return false;
    if (!search) return true;
    const text = `${template.label} ${template.description}`.toLowerCase();
    return text.includes(search);
  });

  refs.sidebarPanel.innerHTML = `
    ${sidebarNavHtml(state)}
    <section class="panel-section">
      <div class="panel-section__head">
        <h2>Post Type</h2>
      </div>
      <div class="choice-grid">
        ${ARCHETYPE_OPTIONS.map((option) => `
          <button class="choice-card ${state.project.archetype === option.id ? "is-active" : ""}" type="button" data-select-archetype="${option.id}">
            <strong>${escapeHtml(option.label)}</strong>
          </button>
        `).join("")}
      </div>
    </section>

    <section class="panel-section">
      <div class="panel-section__head">
        <h2>Layouts</h2>
      </div>
      <label class="field">
        <span>Search layouts</span>
        <input id="templateSearch" type="text" value="${escapeHtml(state.ui.templateSearch || "")}" placeholder="Find a layout">
      </label>
      <div class="template-grid">
        ${templates.map((template) => `
          <button
            class="template-card template-card--thumbnail ${frame?.templateId === template.id ? "is-active" : ""}"
            style="--template-accent:${template.swatch}"
            type="button"
            title="${escapeHtml(template.label)}"
            aria-label="${escapeHtml(template.label)}"
            data-apply-template="${template.id}"
          >
            <div class="template-card__preview-mount" data-sidebar-template-preview="${template.id}"></div>
          </button>
        `).join("")}
        ${!templates.length ? '<div class="empty-state">No layouts.</div>' : ""}
      </div>
    </section>

    ${mediaCoverageActive ? `
      <section class="panel-section">
        <div class="panel-section__head">
          <h2>Text Layout</h2>
        </div>
        <label class="field">
          <span>Text layout</span>
          <select id="mediaCoverageTextLayout">
            ${mediaCoverageTextLayoutOptions().map((option) => `<option value="${option.id}" ${activeTextLayoutMode === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
      </section>
    ` : ""}

    <section class="panel-section">
      <div class="panel-section__head">
        <h2>Text Style</h2>
      </div>
      <div class="choice-grid">
        ${TEXT_STYLE_PRESETS.map((preset) => `
          <button class="choice-card ${activeTextStylePreset?.id === preset.id ? "is-active" : ""}" type="button" data-select-text-style="${preset.id}">
            <strong>${escapeHtml(preset.label)}</strong>
          </button>
        `).join("")}
      </div>
    </section>
  `;

  bindSidebarNav();
  refs.sidebarPanel.querySelectorAll("[data-select-archetype]").forEach((button) => {
    button.addEventListener("click", () => setProjectArchetype(button.dataset.selectArchetype));
  });
  refs.sidebarPanel.querySelector("#templateSearch")?.addEventListener("input", (event) => {
    store.commit((draft) => {
      draft.ui.templateSearch = event.target.value;
    }, { historyLabel: "ui-template-search", skipHistory: true });
  });
  refs.sidebarPanel.querySelectorAll("[data-apply-template]").forEach((button) => {
    button.addEventListener("click", () => {
      const activeFrame = selectedFrame();
      if (!activeFrame) return;
      applyTemplateToFrame(activeFrame.id, button.dataset.applyTemplate);
    });
  });
  refs.sidebarPanel.querySelector("#mediaCoverageTextLayout")?.addEventListener("change", (event) => {
    if (!frame) return;
    applyMediaCoverageTextLayoutToFrame(frame.id, event.target.value);
  });
  refs.sidebarPanel.querySelectorAll("[data-select-text-style]").forEach((button) => {
    button.addEventListener("click", () => {
      const activeFrame = selectedFrame();
      if (!activeFrame) return;
      applyTextStylePreset(activeFrame.id, button.dataset.selectTextStyle);
    });
  });
  refs.sidebarPanel.querySelectorAll("[data-sidebar-template-preview]").forEach((mount) => {
    const previewTemplate = getTemplate(mount.dataset.sidebarTemplatePreview);
    if (!previewTemplate) return;
    mount.replaceChildren(sidebarTemplatePreviewNode(previewTemplate, state.project.aspectRatio));
  });
}

function renderResourcesPanel(state) {
  const frame = selectedFrame(state);
  const assets = sharedAssetsForState(state);
  const search = String(state.ui.resourceSearch || "").toLowerCase().trim();
  const sourceFilter = state.ui.resourceSourceFilter || "all";
  const archetypeFilter = state.ui.resourceArchetypeFilter || "all";

  const resources = (state.resources || []).filter((resource) => {
    if (sourceFilter !== "all" && resource.sourceType !== sourceFilter) return false;
    if (archetypeFilter !== "all" && !resource.archetypes.includes(archetypeFilter)) return false;
    if (!search) return true;
    const text = `${resource.title} ${resource.notes} ${resource.tags.join(" ")}`.toLowerCase();
    return text.includes(search);
  });

  refs.sidebarPanel.innerHTML = `
    ${sidebarNavHtml(state)}
    <section class="panel-section">
      <div class="panel-section__head">
        <h2>Reference Library</h2>
      </div>
      <label class="field">
        <span>Search resources</span>
        <input id="resourceSearch" type="text" value="${escapeHtml(state.ui.resourceSearch || "")}" placeholder="Search references">
      </label>
      <div class="field-grid">
        <label class="field">
          <span>Source</span>
          <select id="resourceSourceFilter">
            <option value="all" ${sourceFilter === "all" ? "selected" : ""}>All</option>
            ${RESOURCE_SOURCE_OPTIONS.map((option) => `<option value="${option.id}" ${sourceFilter === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>Archetype</span>
          <select id="resourceArchetypeFilter">
            <option value="all" ${archetypeFilter === "all" ? "selected" : ""}>All</option>
            ${ARCHETYPE_OPTIONS.map((option) => `<option value="${option.id}" ${archetypeFilter === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="resource-listing">
        ${resources.map((resource) => resourceCardHtml(resource, frame, state)).join("")}
        ${!resources.length ? '<div class="empty-state">No resources.</div>' : ""}
      </div>
    </section>

    <section class="panel-section">
      <div class="panel-section__head">
        <h2>${runtime.editingResourceId ? "Edit resource" : "Add resource"}</h2>
      </div>
      <label class="field">
        <span>Title</span>
        <input id="resourceTitle" type="text" value="${escapeHtml(runtime.resourceForm.title)}" placeholder="Q2 proof point reference">
      </label>
      <div class="field-grid">
        <label class="field">
          <span>Source type</span>
          <select id="resourceSourceType">
            ${RESOURCE_SOURCE_OPTIONS.map((option) => `<option value="${option.id}" ${runtime.resourceForm.sourceType === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>Preview image</span>
          <select id="resourcePreviewAsset">
            <option value="">No preview</option>
            ${assets.map((asset) => `<option value="${asset.id}" ${runtime.resourceForm.previewAssetId === asset.id ? "selected" : ""}>${escapeHtml(asset.filename)}</option>`).join("")}
          </select>
        </label>
      </div>
      <label class="field">
        <span>URL</span>
        <input id="resourceUrl" type="url" value="${escapeHtml(runtime.resourceForm.url)}" placeholder="https://www.figma.com/design/...">
      </label>
      <label class="field">
        <span>Tags</span>
        <input id="resourceTags" type="text" value="${escapeHtml(runtime.resourceForm.tags)}" placeholder="founder, stat, launch">
      </label>
      <label class="field">
        <span>Archetypes</span>
        <input id="resourceArchetypes" type="text" value="${escapeHtml(runtime.resourceForm.archetypes)}" placeholder="case_study, social_proof">
      </label>
      <label class="field">
        <span>Notes</span>
        <textarea id="resourceNotes" rows="4" placeholder="Notes">${escapeHtml(runtime.resourceForm.notes)}</textarea>
      </label>
      <div class="inline-actions">
        <button class="btn" id="btnSaveResource" type="button">${runtime.editingResourceId ? "Update resource" : "Save resource"}</button>
        <button class="btn btn--ghost" id="btnResetResourceForm" type="button">Clear form</button>
        <button class="btn btn--ghost" id="btnUploadResourceImage" type="button">Upload preview</button>
      </div>
    </section>

    <section class="panel-section">
      <div class="panel-section__head">
        <h2>Assets</h2>
      </div>
      <div class="inline-actions">
        <button class="btn btn--ghost" id="btnResourcesOpenAssets" type="button">Open asset library</button>
        <button class="btn btn--ghost" id="btnResourcesUploadAsset" type="button">Upload asset</button>
      </div>
      <div class="helper">${assets.length} asset${assets.length === 1 ? "" : "s"} available for previews and canvas use.</div>
    </section>
  `;

  bindSidebarNav();
  refs.sidebarPanel.querySelector("#resourceSearch")?.addEventListener("input", (event) => {
    store.commit((draft) => {
      draft.ui.resourceSearch = event.target.value;
    }, { historyLabel: "ui-resource-search", skipHistory: true });
  });
  refs.sidebarPanel.querySelector("#resourceSourceFilter")?.addEventListener("change", (event) => {
    store.commit((draft) => {
      draft.ui.resourceSourceFilter = event.target.value;
    }, { historyLabel: "ui-resource-source-filter", skipHistory: true });
  });
  refs.sidebarPanel.querySelector("#resourceArchetypeFilter")?.addEventListener("change", (event) => {
    store.commit((draft) => {
      draft.ui.resourceArchetypeFilter = event.target.value;
    }, { historyLabel: "ui-resource-archetype-filter", skipHistory: true });
  });

  refs.sidebarPanel.querySelector("#resourceTitle")?.addEventListener("input", (event) => updateResourceFormField("title", event.target.value));
  refs.sidebarPanel.querySelector("#resourceSourceType")?.addEventListener("change", (event) => updateResourceFormField("sourceType", event.target.value));
  refs.sidebarPanel.querySelector("#resourceUrl")?.addEventListener("input", (event) => updateResourceFormField("url", event.target.value));
  refs.sidebarPanel.querySelector("#resourceTags")?.addEventListener("input", (event) => updateResourceFormField("tags", event.target.value));
  refs.sidebarPanel.querySelector("#resourceArchetypes")?.addEventListener("input", (event) => updateResourceFormField("archetypes", event.target.value));
  refs.sidebarPanel.querySelector("#resourceNotes")?.addEventListener("input", (event) => updateResourceFormField("notes", event.target.value));
  refs.sidebarPanel.querySelector("#resourcePreviewAsset")?.addEventListener("change", (event) => updateResourceFormField("previewAssetId", event.target.value));

  refs.sidebarPanel.querySelector("#btnSaveResource")?.addEventListener("click", upsertResourceFromForm);
  refs.sidebarPanel.querySelector("#btnResetResourceForm")?.addEventListener("click", () => {
    runtime.resourceForm = blankResourceForm();
    runtime.editingResourceId = null;
    renderSidebar(store.getState());
  });
  refs.sidebarPanel.querySelector("#btnUploadResourceImage")?.addEventListener("click", () => openImageImport("resource-preview"));
  refs.sidebarPanel.querySelector("#btnResourcesOpenAssets")?.addEventListener("click", () => setSidebarPanel("assets"));
  refs.sidebarPanel.querySelector("#btnResourcesUploadAsset")?.addEventListener("click", () => {
    setSidebarPanel("assets");
    openImageImport("library");
  });

  refs.sidebarPanel.querySelectorAll("[data-toggle-resource]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!frame) return;
      toggleResourceForFrame(frame.id, button.dataset.toggleResource);
    });
  });
  refs.sidebarPanel.querySelectorAll("[data-edit-resource]").forEach((button) => {
    button.addEventListener("click", () => beginEditResource(button.dataset.editResource));
  });
  refs.sidebarPanel.querySelectorAll("[data-delete-resource]").forEach((button) => {
    button.addEventListener("click", () => deleteResource(button.dataset.deleteResource));
  });
  refs.sidebarPanel.querySelectorAll("[data-apply-asset]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!frame) return;
      const asset = findAsset(store.getState(), button.dataset.applyAsset);
      const imageElement = resolveTargetImageElement(store.getState());
      if (!asset || !imageElement) return;
      updateImageElementMedia(frame.id, imageElement.id, {
        assetId: asset.id,
        imageUrl: asset.dataUrl,
      }, "apply-asset");
    });
  });
}

function createProjectFromTemplate(templateId, outputMode = "static") {
  const template = getTemplate(templateId);
  if (!template) return;
  const fresh = makeEmptyLinkedInState();
  fresh.project.outputMode = outputMode === "carousel" ? "carousel" : "static";
  fresh.project.archetype = template.archetype;
  fresh.project.templateId = template.id;
  fresh.project.aspectRatio = templatePreferredAspectRatio(template);
  fresh.project.format = fresh.project.aspectRatio;
  fresh.project.name = template.label;
  fresh.frames = [
    createFrameFromTemplate(template.id, {
      index: 0,
      aspectRatio: fresh.project.aspectRatio,
      title: fresh.project.outputMode === "carousel" ? "Slide 1" : undefined,
    }),
  ];
  applyTextStylePresetToFrame(fresh.frames[0], template.defaultTextStylePresetId || defaultTextStylePresetId());
  fresh.ui.selectedFrameId = fresh.frames[0].id;
  fresh.ui.selectedElementId = null;
  const documentId = createNewDocumentFromState(fresh, {
    name: template.label,
    outputMode: fresh.project.outputMode,
    archetype: template.archetype,
    templateId: template.id,
    aspectRatio: fresh.project.aspectRatio,
    isSaved: false,
  });
  openDocument(documentId);
  showToast(`${template.label} ready.`);
}

function templatePreviewCacheKey(template, aspectRatio = null, scale = 0.148) {
  return `${template.id}:${aspectRatio || templatePreferredAspectRatio(template)}:${scale}`;
}

function buildTemplatePreview(template, { aspectRatio = null, scale = 0.148 } = {}) {
  const previewState = assignSharedAssets(makeEmptyLinkedInState());
  previewState.project.aspectRatio = aspectRatio || templatePreferredAspectRatio(template);
  previewState.project.templateId = template.id;
  previewState.project.archetype = template.archetype;
  previewState.frames = [
    createFrameFromTemplate(template.id, {
      index: 0,
      aspectRatio: previewState.project.aspectRatio,
    }),
  ];
  applyTextStylePresetToFrame(previewState.frames[0], template.defaultTextStylePresetId || defaultTextStylePresetId());
  previewState.ui.selectedFrameId = previewState.frames[0].id;
  previewState.ui.selectedElementId = null;
  return createFrameStageNode(previewState.frames[0], previewState, {
    scale,
    thumbnail: true,
    includeResources: false,
    suppressSelection: true,
  });
}

function dashboardTemplatePreviewNode(template) {
  const cacheKey = templatePreviewCacheKey(template, null, 0.148);
  const cached = runtime.dashboardPreviewCache.get(cacheKey);
  if (cached) {
    return cached.cloneNode(true);
  }
  const previewNode = buildTemplatePreview(template, { scale: 0.148 });
  runtime.dashboardPreviewCache.set(cacheKey, previewNode.cloneNode(true));
  return previewNode;
}

function sidebarTemplatePreviewNode(template, aspectRatio) {
  const resolvedAspectRatio = aspectRatio || templatePreferredAspectRatio(template);
  const cacheKey = templatePreviewCacheKey(template, resolvedAspectRatio, 0.118);
  const cached = runtime.dashboardPreviewCache.get(cacheKey);
  if (cached) {
    return cached.cloneNode(true);
  }
  const previewNode = buildTemplatePreview(template, {
    aspectRatio: resolvedAspectRatio,
    scale: 0.118,
  });
  runtime.dashboardPreviewCache.set(cacheKey, previewNode.cloneNode(true));
  return previewNode;
}

function documentCardHtml(entry, { section = "recent" } = {}) {
  const outputLabel = OUTPUT_MODE_OPTIONS.find((option) => option.id === entry.outputMode)?.label || entry.outputMode;
  const ratioLabel = getAspectRatioPreset(entry.aspectRatio || DEFAULT_ASPECT_RATIO_ID).label;
  const archetype = entry.archetype ? archetypeLabel(entry.archetype) : "LinkedIn post";
  const thumbnail = entry.thumbnail
    ? `<img class="dashboard-card__thumb-image" src="${entry.thumbnail}" alt="">`
    : `<div class="dashboard-card__thumb-placeholder">${escapeHtml((entry.name || "Post").slice(0, 1).toUpperCase())}</div>`;
  return `
    <article class="dashboard-card">
      <div class="dashboard-card__thumb">${thumbnail}</div>
      <div class="dashboard-card__body">
        <strong>${escapeHtml(entry.name || "Untitled post")}</strong>
        <div class="dashboard-card__meta">${escapeHtml(outputLabel)} · ${escapeHtml(ratioLabel)} · ${escapeHtml(archetype)}</div>
        <div class="dashboard-card__subtle">${escapeHtml(formatSavedAt(entry.updatedAt))}</div>
        <div class="dashboard-card__actions">
          <button class="btn btn--ghost btn--mini" type="button" data-open-document="${entry.id}">Open</button>
          <button class="btn btn--ghost btn--mini" type="button" data-duplicate-document="${entry.id}">Duplicate</button>
          <button class="btn btn--ghost btn--mini btn--danger-outline" type="button" data-delete-document="${entry.id}">Delete</button>
        </div>
      </div>
      ${section === "saved" ? '<div class="dashboard-card__badge">Saved</div>' : ""}
    </article>
  `;
}

function templateDashboardCardHtml(template) {
  return `
    <article class="dashboard-card dashboard-card--template" style="--dashboard-template-accent:${template.swatch}">
      <button class="dashboard-card__template-hit" type="button" data-create-template="${template.id}" aria-label="Start from ${escapeHtml(template.label)}"></button>
      <div class="dashboard-card__thumb dashboard-card__thumb--template">
        <div class="dashboard-template-preview-mount" data-template-preview="${template.id}"></div>
      </div>
      <div class="dashboard-card__body">
        <strong>${escapeHtml(template.label)}</strong>
        <div class="dashboard-card__meta">${escapeHtml(archetypeLabel(template.archetype))}</div>
      </div>
    </article>
  `;
}

function renderDashboard() {
  if (!refs.dashboardPanel) return;
  const recentEntries = recentDraftEntries();
  const savedEntries = listLibraryEntries();
  refs.dashboardPanel.innerHTML = `
    <section class="dashboard-section">
      <div class="dashboard-section__head">
        <h2>Recent drafts</h2>
      </div>
      <div class="dashboard-card-grid">
        ${recentEntries.map((entry) => documentCardHtml(entry, { section: "recent" })).join("")}
        ${!recentEntries.length ? '<div class="dashboard-empty-note">No drafts yet. Use <strong>New post</strong> or <strong>New carousel</strong> above.</div>' : ""}
      </div>
    </section>

    <section class="dashboard-section">
      <div class="dashboard-section__head">
        <h2>Start from template</h2>
      </div>
      <div class="dashboard-card-grid dashboard-card-grid--templates">
        ${TEMPLATE_LIBRARY.map((template) => templateDashboardCardHtml(template)).join("")}
      </div>
    </section>

    ${savedEntries.length ? `
      <section class="dashboard-section">
        <div class="dashboard-section__head">
          <h2>Saved posts</h2>
        </div>
        <div class="dashboard-card-grid">
          ${savedEntries.map((entry) => documentCardHtml(entry, { section: "saved" })).join("")}
        </div>
      </section>
    ` : ""}
  `;
  refs.dashboardPanel.querySelectorAll("[data-open-document]").forEach((button) => {
    button.addEventListener("click", () => openDocument(button.dataset.openDocument));
  });
  refs.dashboardPanel.querySelectorAll("[data-duplicate-document]").forEach((button) => {
    button.addEventListener("click", () => duplicateDocumentEntry(button.dataset.duplicateDocument));
  });
  refs.dashboardPanel.querySelectorAll("[data-delete-document]").forEach((button) => {
    button.addEventListener("click", () => deleteDocumentEntry(button.dataset.deleteDocument));
  });
  refs.dashboardPanel.querySelectorAll("[data-create-template]").forEach((button) => {
    button.addEventListener("click", () => createProjectFromTemplate(button.dataset.createTemplate));
  });

  refs.dashboardPanel.querySelectorAll("[data-template-preview]").forEach((mount) => {
    const template = getTemplate(mount.dataset.templatePreview);
    if (!template) return;
    mount.replaceChildren(dashboardTemplatePreviewNode(template));
  });
}

function renderSidebar(state) {
  const stopSidebarTimer = startLinkedInPerfTimer("render", "sidebar-render", {
    frameId: selectedFrame(state)?.id || null,
    sourceAction: "render",
  });
  const panel = String(state.ui.activePanel || "build");
  if (panel === "assets") {
    renderAssetsPanel(state);
  } else if (panel === "templates") {
    renderTemplatesPanel(state);
  } else {
    renderBuildPanel(state);
  }
  stopSidebarTimer({
    assetCount: sharedAssetsForState(state).length,
    frameCount: Array.isArray(state.frames) ? state.frames.length : 0,
  });
}

function createResizeHandle(position) {
  const handle = document.createElement("button");
  handle.className = `resize-handle resize-handle--${position}`;
  handle.type = "button";
  handle.dataset.handle = position;
  handle.setAttribute("aria-label", `Resize ${position}`);
  return handle;
}

function createElementNode(frame, element, state, { thumbnail = false, suppressSelection = false } = {}) {
  const node = document.createElement("div");
  node.className = `frame-element frame-element--${element.type} frame-element--layer-${element.layerRole || defaultLayerRole(element.type)}`;
  node.dataset.elementId = element.id;
  node.dataset.elementType = element.type;
  if (element.locked === true) {
    node.dataset.locked = "true";
    node.classList.add("is-locked");
  }
  node.style.left = `${element.x}px`;
  node.style.top = `${element.y}px`;
  node.style.width = `${element.w}px`;
  node.style.height = `${element.h}px`;
  node.style.opacity = String(element.style?.opacity ?? 1);
  if (Number(element.style?.rotation || 0)) {
    node.style.transform = `rotate(${Number(element.style.rotation)}deg)`;
    node.style.transformOrigin = "center center";
  }

  const isSelected = !thumbnail
    && !suppressSelection
    && state.ui.selectedFrameId === frame.id
    && state.ui.selectedElementId === element.id;
  const imageBounds = null;
  if (isSelected) {
    node.classList.add("is-selected");
  }

  if (element.type === "shape") {
    node.style.borderRadius = `${Number(element.style?.radius) || 24}px`;
    node.style.background = resolveColor(frame, element.style, "fillColor", "fillRole");
    node.style.opacity = String(element.style?.opacity ?? 1);
    node.style.border = `${Number(element.style?.strokeWidth) || 0}px solid ${element.style?.strokeColor || "transparent"}`;
  }

  if (element.type === "image") {
    node.style.borderRadius = `${Number(element.style?.radius) || 32}px`;
    node.style.background = element.style?.backgroundColor || "rgba(255,255,255,0.82)";
    node.style.border = `${Number(element.style?.strokeWidth) || 0}px solid ${element.style?.strokeColor || "transparent"}`;
    const media = imageMedia(element, frame);
    if (media.imageUrl) {
      const image = document.createElement("img");
      image.src = media.imageUrl;
      image.alt = "";
      image.draggable = false;
      image.style.pointerEvents = "none";
      image.style.objectFit = media.objectFit || "cover";
      image.style.objectPosition = `${media.objectPositionX || 50}% ${media.objectPositionY || 50}%`;
      image.style.transformOrigin = `${media.objectPositionX || 50}% ${media.objectPositionY || 50}%`;
      image.style.transform = `scale(${Number(media.scale || 1)})`;
      node.appendChild(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "image-placeholder";
      placeholder.innerHTML = "<strong>No image</strong>";
      placeholder.style.pointerEvents = "none";
      node.appendChild(placeholder);
    }
  }

  if (element.type === "text") {
    const value = resolveTextValue(frame, element);
    const text = document.createElement("div");
    text.className = "frame-text-value";
    text.dataset.inlineText = element.slotKey || "";
    text.textContent = value || element.label;
    text.style.fontFamily = fontCssRole(element.style?.fontRole);
    text.style.fontSize = `${Number(element.style?.fontSize) || 28}px`;
    text.style.fontWeight = String(element.style?.fontWeight || 500);
    text.style.lineHeight = String(element.style?.lineHeight || 1.2);
    text.style.letterSpacing = `${Number(element.style?.letterSpacing) || 0}px`;
    text.style.textAlign = element.style?.align || "left";
    text.style.textTransform = element.style?.textTransform || "none";
    text.style.color = resolveColor(frame, element.style, "color", "colorRole");
    if (!value) {
      text.classList.add("is-placeholder");
    }
    node.appendChild(text);
  }

  if (element.type === "button") {
    const value = resolveTextValue(frame, element) || element.label;
    const button = document.createElement("div");
    button.className = "frame-button-value";
    button.dataset.inlineText = element.slotKey || "";
    button.textContent = value;
    button.style.fontFamily = fontCssRole(element.style?.fontRole);
    button.style.fontSize = `${Number(element.style?.fontSize) || 24}px`;
    button.style.fontWeight = String(element.style?.fontWeight || 700);
    button.style.lineHeight = String(element.style?.lineHeight || 1);
    button.style.letterSpacing = `${Number(element.style?.letterSpacing) || 0}px`;
    button.style.textAlign = element.style?.align || "center";
    button.style.textTransform = element.style?.textTransform || "none";
    button.style.color = resolveColor(frame, element.style, "textColor", "textColorRole");
    button.style.background = resolveColor(frame, element.style, "fillColor", "fillRole");
    button.style.border = `${Number(element.style?.strokeWidth) || 0}px solid ${element.style?.strokeColor || "transparent"}`;
    button.style.opacity = String(element.style?.opacity ?? 1);
    button.style.borderRadius = `${Number(element.style?.radius) || 0}px`;
    node.appendChild(button);
  }

  if (!thumbnail && !suppressSelection && element.locked !== true) {
    const selection = document.createElement("div");
    selection.className = "frame-element__selection";
    if (imageBounds) {
      selection.style.inset = "auto";
      selection.style.left = `${imageBounds.x - 7}px`;
      selection.style.top = `${imageBounds.y - 7}px`;
      selection.style.width = `${imageBounds.w + 14}px`;
      selection.style.height = `${imageBounds.h + 14}px`;
    }
    if (!isSelected) {
      selection.classList.add("is-passive");
    }
    node.appendChild(selection);
  }

  if (isSelected && !frame.layoutLocked && !thumbnail && !suppressSelection) {
    const handles = document.createElement("div");
    handles.className = "resize-handles";
    if (imageBounds) {
      handles.style.inset = "auto";
      handles.style.left = `${imageBounds.x - 10}px`;
      handles.style.top = `${imageBounds.y - 10}px`;
      handles.style.width = `${imageBounds.w + 20}px`;
      handles.style.height = `${imageBounds.h + 20}px`;
    }
    ["nw", "ne", "sw", "se"].forEach((position) => handles.appendChild(createResizeHandle(position)));
    node.appendChild(handles);
  }

  return node;
}

function createFrameStageNode(frame, state, { scale = 1, thumbnail = false, includeResources = true, suppressSelection = false } = {}) {
  const metrics = canvasMetrics(frame.aspectRatio || state.project.aspectRatio);
  const shell = document.createElement("div");
  shell.className = `frame-stage-shell${thumbnail ? " frame-stage-shell--thumbnail" : ""}`;
  shell.style.setProperty("--stage-scale", String(scale));
  shell.style.width = `${metrics.width * scale}px`;
  shell.style.height = `${metrics.height * scale}px`;

  const stage = document.createElement("div");
  stage.className = "frame-stage";
  stage.dataset.frameStage = frame.id;
  stage.style.width = `${metrics.width}px`;
  stage.style.height = `${metrics.height}px`;
  stage.style.background = frame.colors.background;
  stage.style.borderColor = frame.colors.border;

  for (const element of frame.elements || []) {
    if (element.visible === false) continue;
    stage.appendChild(createElementNode(frame, element, state, { thumbnail, suppressSelection }));
  }

  if (!thumbnail && includeResources && frame.resourceIds?.length) {
    const badgeRow = document.createElement("div");
    badgeRow.className = "frame-stage-badges no-export";
    for (const resourceId of frame.resourceIds) {
      const resource = findResource(state, resourceId);
      if (!resource) continue;
      const pill = document.createElement("span");
      pill.textContent = resource.title;
      badgeRow.appendChild(pill);
    }
    stage.appendChild(badgeRow);
  }

  shell.appendChild(stage);
  return shell;
}

function renderPageSorter(container, state) {
  if (!container) return;
  container.innerHTML = "";
  const canReorder = state.project.outputMode === "carousel" && (state.frames || []).length > 1;

  for (const [index, frame] of (state.frames || []).entries()) {
    const card = document.createElement("article");
    card.className = `page-sorter-card${state.ui.selectedFrameId === frame.id ? " is-active" : ""}`;
    card.dataset.frameCard = frame.id;
    card.draggable = canReorder;

    const previewButton = document.createElement("button");
    previewButton.className = "page-sorter-card__preview";
    previewButton.type = "button";
    previewButton.dataset.selectFrame = frame.id;
    previewButton.appendChild(createFrameStageNode(frame, state, { scale: 0.12, thumbnail: true }));

    const meta = document.createElement("div");
    meta.className = "page-sorter-card__meta";
    meta.innerHTML = `
      <strong>${escapeHtml(frame.title || `Slide ${index + 1}`)}</strong>
      <span>${escapeHtml(getTemplate(frame.templateId)?.label || frame.templateId)}</span>
    `;

    const dragBadge = document.createElement("div");
    dragBadge.className = "page-sorter-card__drag";
    dragBadge.textContent = canReorder ? "Drag" : "Page";

    const actions = document.createElement("div");
    actions.className = "page-sorter-card__actions";
    actions.innerHTML = `
      <button class="btn btn--ghost btn--mini" type="button" data-duplicate-frame="${frame.id}">Copy</button>
      <button class="btn btn--ghost btn--mini btn--danger-outline" type="button" data-delete-frame="${frame.id}">Delete</button>
    `;

    card.appendChild(previewButton);
    card.appendChild(meta);
    card.appendChild(dragBadge);
    card.appendChild(actions);
    container.appendChild(card);
  }

  container.querySelectorAll("[data-select-frame]").forEach((button) => {
    button.addEventListener("click", () => setSelectedFrame(button.dataset.selectFrame));
  });
  container.querySelectorAll("[data-duplicate-frame]").forEach((button) => {
    button.addEventListener("click", () => duplicateFrameById(button.dataset.duplicateFrame));
  });
  container.querySelectorAll("[data-delete-frame]").forEach((button) => {
    button.addEventListener("click", () => deleteFrame(button.dataset.deleteFrame));
  });

  if (!canReorder) return;

  const cards = Array.from(container.querySelectorAll("[data-frame-card]"));
  cards.forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      if (event.target.closest("button")) {
        event.preventDefault();
        return;
      }
      runtime.dragFrameId = card.dataset.frameCard;
      card.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", runtime.dragFrameId);
      }
    });

    card.addEventListener("dragover", (event) => {
      if (!runtime.dragFrameId || runtime.dragFrameId === card.dataset.frameCard) return;
      event.preventDefault();
      card.classList.add("is-drop-target");
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("is-drop-target");
    });

    card.addEventListener("drop", (event) => {
      if (!runtime.dragFrameId || runtime.dragFrameId === card.dataset.frameCard) return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const placeAfter = event.clientY > rect.top + rect.height / 2;
      moveFrameRelative(runtime.dragFrameId, card.dataset.frameCard, placeAfter);
    });

    card.addEventListener("dragend", () => {
      runtime.dragFrameId = null;
      container.querySelectorAll("[data-frame-card]").forEach((item) => {
        item.classList.remove("is-dragging", "is-drop-target");
      });
    });
  });
}

function attachInlineTextEditing(node, frameId, element) {
  if (!["text", "button"].includes(element.type)) return;
  const valueNode = node.querySelector("[data-inline-text]");
  if (!valueNode) return;

  node.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedElement(frameId, element.id);
    requestAnimationFrame(() => {
      const liveNode = refs.canvasViewport.querySelector(`[data-element-id="${element.id}"] [data-inline-text]`);
      if (!liveNode) return;
      const baseline = liveNode.textContent || "";
      liveNode.contentEditable = "true";
      liveNode.dataset.inlineEditing = "true";
      liveNode.classList.add("is-inline-editing");
      liveNode.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(liveNode);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);

      function finish(commit) {
        const nextValue = String(liveNode.textContent || "").trim();
        liveNode.removeAttribute("contenteditable");
        liveNode.removeAttribute("data-inline-editing");
        liveNode.classList.remove("is-inline-editing");
        liveNode.removeEventListener("keydown", onKeyDown);
        liveNode.removeEventListener("blur", onBlur);
        if (!commit) {
          liveNode.textContent = baseline;
          return;
        }
        if (nextValue !== baseline) {
          if (element.slotKey) {
            updateFrameSlot(frameId, element.slotKey, nextValue);
          } else {
            updateElementText(frameId, element.id, nextValue);
          }
        }
      }

      function onKeyDown(keyboardEvent) {
        if (keyboardEvent.key === "Escape") {
          keyboardEvent.preventDefault();
          finish(false);
        }
      }

      function onBlur() {
        finish(true);
      }

      liveNode.addEventListener("keydown", onKeyDown);
      liveNode.addEventListener("blur", onBlur, { once: true });
    });
  });
}

function attachCanvasInteractions(state, frame) {
  const stage = refs.canvasViewport.querySelector("[data-frame-stage]");
  if (!stage || !frame) return;

  refs.canvasViewport.onclick = (event) => {
    if (event.target === refs.canvasViewport) {
      setSelectedFrame(frame.id);
    }
  };

  stage.addEventListener("click", (event) => {
    if (event.target === stage) {
      setSelectedFrame(frame.id);
    }
  });

  stage.querySelectorAll("[data-element-id]").forEach((node) => {
    const elementId = node.dataset.elementId;
    const element = findElement(frame, elementId);
    if (!element) return;

    node.addEventListener("click", (event) => {
      event.stopPropagation();
      if (node.dataset.suppressClick === "true") {
        delete node.dataset.suppressClick;
        return;
      }
      if (element.locked === true || element.layerRole === "background") {
        setSelectedFrame(frame.id);
        return;
      }
      if (store.getState().ui.selectedElementId === element.id) return;
      setSelectedElement(frame.id, element.id);
    });

    attachInlineTextEditing(node, frame.id, element);

    const handlePointerDown = (event) => {
      if (frame.layoutLocked) return;
      if (element.locked === true) return;
      if (event.button !== 0) return;
      if (event.target.closest("[data-inline-editing='true']")) return;
      if (element.type !== "text" && store.getState().ui.selectedElementId !== element.id) {
        setSelectedElement(frame.id, element.id);
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const handle = event.target.closest("[data-handle]")?.dataset.handle || null;
      const rect = {
        x: element.x,
        y: element.y,
        w: element.w,
        h: element.h,
      };
      runtime.pointerInteraction = {
        frameId: frame.id,
        elementId: element.id,
        mode: handle ? "resize" : "drag",
        handle,
        scale: runtime.stageScale,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect: rect,
        liveNode: node,
        didMove: false,
      };
      node.classList.add("is-dragging");
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    };

    node.addEventListener("pointerdown", handlePointerDown);
  });
}

function clampInteractionRect(rect, element) {
  const metrics = canvasMetrics();
  const minW = Number(element.minW) || 60;
  const minH = Number(element.minH) || 40;
  if (element.allowOverflow === true) {
    return {
      x: clamp(rect.x, -metrics.width * 0.85, metrics.width * 1.35),
      y: clamp(rect.y, -metrics.height * 0.75, metrics.height * 1.35),
      w: clamp(rect.w, minW, metrics.width * 2.4),
      h: clamp(rect.h, minH, metrics.height * 2.4),
    };
  }
  const next = {
    x: clamp(rect.x, 0, metrics.width - minW),
    y: clamp(rect.y, 0, metrics.height - minH),
    w: clamp(rect.w, minW, metrics.width),
    h: clamp(rect.h, minH, metrics.height),
  };
  next.w = clamp(next.w, minW, metrics.width - next.x);
  next.h = clamp(next.h, minH, metrics.height - next.y);
  return next;
}

function applyLiveRect(node, rect) {
  node.style.left = `${rect.x}px`;
  node.style.top = `${rect.y}px`;
  node.style.width = `${rect.w}px`;
  node.style.height = `${rect.h}px`;
}

function onPointerMove(event) {
  const interaction = runtime.pointerInteraction;
  if (!interaction) return;
  const state = store.getState();
  const frame = findFrame(state, interaction.frameId);
  const element = findElement(frame, interaction.elementId);
  if (!frame || !element) return;

  const dx = (event.clientX - interaction.startClientX) / interaction.scale;
  const dy = (event.clientY - interaction.startClientY) / interaction.scale;
  const next = {
    ...interaction.startRect,
  };

  if (interaction.mode === "drag") {
    next.x = interaction.startRect.x + dx;
    next.y = interaction.startRect.y + dy;
  } else {
    const handle = interaction.handle || "se";
    if (handle.includes("e")) next.w = interaction.startRect.w + dx;
    if (handle.includes("s")) next.h = interaction.startRect.h + dy;
    if (handle.includes("w")) {
      next.x = interaction.startRect.x + dx;
      next.w = interaction.startRect.w - dx;
    }
    if (handle.includes("n")) {
      next.y = interaction.startRect.y + dy;
      next.h = interaction.startRect.h - dy;
    }
  }

  const clamped = clampInteractionRect(next, element);
  interaction.didMove = interaction.didMove
    || ["x", "y", "w", "h"].some((key) => Number(clamped[key]) !== Number(interaction.startRect[key]));
  interaction.previewRect = clamped;
  applyLiveRect(interaction.liveNode, clamped);
}

function onPointerUp() {
  const interaction = runtime.pointerInteraction;
  if (!interaction) return;
  const state = store.getState();
  const frame = findFrame(state, interaction.frameId);
  const element = findElement(frame, interaction.elementId);
  if (interaction.liveNode) {
    interaction.liveNode.classList.remove("is-dragging");
  }
  window.removeEventListener("pointermove", onPointerMove);
  if (frame && element && interaction.previewRect) {
    const changed = ["x", "y", "w", "h"].some((key) => Number(interaction.previewRect[key]) !== Number(interaction.startRect[key]));
    if (changed) {
      updateElementRect(interaction.frameId, interaction.elementId, interaction.previewRect);
      if (interaction.liveNode) {
        interaction.liveNode.dataset.suppressClick = "true";
      }
    } else {
      renderCanvas(state);
    }
  }
  runtime.pointerInteraction = null;
}

function renderCanvas(state) {
  const frame = selectedFrame(state);
  const stopCanvasTimer = startLinkedInPerfTimer("render", "canvas-render", {
    frameId: frame?.id || null,
    sourceAction: "render",
  });
  resolveStageScale();
  refs.canvasViewport.innerHTML = "";
  if (!frame) {
    refs.canvasFrameTitle.textContent = "No frame selected";
    refs.canvasFrameMeta.textContent = "";
    updateCanvasZoomUi(null);
    stopCanvasTimer({ elementCount: 0, scale: runtime.stageScale });
    return;
  }

  refs.canvasFrameTitle.textContent = frame.title || "Untitled frame";
  refs.canvasFrameMeta.textContent = `${archetypeLabel(frame.archetype)} · ${getAspectRatioPreset(frame.aspectRatio || state.project.aspectRatio).label} · ${frame.layoutLocked ? "Locked layout" : "Unlocked layout"}${state.project.outputMode === "carousel" ? ` · ${state.frames.length} pages` : ""}`;
  refs.canvasViewport.appendChild(createFrameStageNode(frame, state, { scale: runtime.stageScale }));
  attachCanvasInteractions(state, frame);
  updateCanvasZoomUi(frame);
  stopCanvasTimer({
    elementCount: Array.isArray(frame.elements) ? frame.elements.length : 0,
    scale: runtime.stageScale,
  });
}

function assetOptionsHtml(state, currentValue) {
  const assets = sharedAssetsForState(state);
  return `
    <option value="">No image selected</option>
    ${assets.map((asset) => `<option value="${asset.id}" ${currentValue === asset.id ? "selected" : ""}>${escapeHtml(asset.filename)}</option>`).join("")}
  `;
}

function stackActionButtonsHtml(frame, element, { mini = false } = {}) {
  const sizeClass = mini ? " btn--mini" : "";
  return `
    <button class="btn btn--ghost${sizeClass}" type="button" data-stack-element="${element.id}" data-stack-action="front" ${canMoveElementInStack(frame, element.id, "front") ? "" : "disabled"}>Front</button>
    <button class="btn btn--ghost${sizeClass}" type="button" data-stack-element="${element.id}" data-stack-action="back" ${canMoveElementInStack(frame, element.id, "back") ? "" : "disabled"}>Back</button>
    <button class="btn btn--ghost${sizeClass}" type="button" data-stack-element="${element.id}" data-stack-action="forward" ${canMoveElementInStack(frame, element.id, "forward") ? "" : "disabled"}>Up</button>
    <button class="btn btn--ghost${sizeClass}" type="button" data-stack-element="${element.id}" data-stack-action="backward" ${canMoveElementInStack(frame, element.id, "backward") ? "" : "disabled"}>Down</button>
  `;
}

function inspectorTabsHtml(activeTab = "style") {
  const items = [
    { id: "style", label: "Style" },
    { id: "layers", label: "Layers" },
  ];
  return `
    <div class="inspector-tabs" role="tablist" aria-label="Inspector panels">
      ${items.map((item) => `
        <button
          class="inspector-tab ${activeTab === item.id ? "is-active" : ""}"
          type="button"
          role="tab"
          aria-selected="${activeTab === item.id ? "true" : "false"}"
          data-inspector-tab="${item.id}"
        >${escapeHtml(item.label)}</button>
      `).join("")}
    </div>
  `;
}

function inspectorBlockHtml(title, body, { open = true } = {}) {
  return `
    <details class="inspector-block" ${open ? "open" : ""}>
      <summary>${escapeHtml(title)}</summary>
      <div class="inspector-block__body">${body}</div>
    </details>
  `;
}

function swatchControlHtml({ label, value, dataAttr, dataValue }) {
  const color = colorInput(value);
  return `
    <label class="swatch-field">
      <span class="swatch-field__label">${escapeHtml(label)}</span>
      <span class="swatch-field__chip" style="--swatch:${color}"></span>
      <input class="swatch-field__input" ${dataAttr}="${escapeHtml(dataValue)}" type="color" value="${color}">
    </label>
  `;
}

function renderPageThemeControls(frame) {
  return `
    <div class="swatch-grid">
      ${swatchControlHtml({ label: "Background", value: frame.colors.background, dataAttr: "data-frame-color", dataValue: "background" })}
      ${swatchControlHtml({ label: "Accent", value: frame.colors.accent, dataAttr: "data-frame-color", dataValue: "accent" })}
      ${swatchControlHtml({ label: "Text", value: frame.colors.text, dataAttr: "data-frame-color", dataValue: "text" })}
      ${swatchControlHtml({ label: "Muted", value: frame.colors.muted, dataAttr: "data-frame-color", dataValue: "muted" })}
      ${swatchControlHtml({ label: "Panel", value: frame.colors.panel, dataAttr: "data-frame-color", dataValue: "panel" })}
      ${swatchControlHtml({ label: "Border", value: frame.colors.border, dataAttr: "data-frame-color", dataValue: "border" })}
    </div>
  `;
}

function elementRowHtml(frame, element, isSelected) {
  return `
    <article class="element-row ${isSelected ? "is-active" : ""}">
      <button class="element-row__main" type="button" data-select-element-row="${element.id}">
        <strong>${escapeHtml(element.label)}</strong>
        <span>${escapeHtml(element.type)}</span>
      </button>
      ${isSelected ? `
        <div class="element-row__tools">
          ${stackActionButtonsHtml(frame, element, { mini: true })}
          <button class="btn btn--ghost btn--mini" type="button" data-duplicate-element="${element.id}">Copy</button>
          <button class="btn btn--ghost btn--mini btn--danger-outline" type="button" data-delete-element="${element.id}">Delete</button>
        </div>
        <label class="field element-row__layer">
          <span>Layer</span>
          <select data-element-layer="${element.id}">
            ${LAYER_ROLE_OPTIONS.map((option) => `<option value="${option.id}" ${option.id === (element.layerRole || defaultLayerRole(element.type)) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
      ` : ""}
    </article>
  `;
}

function renderElementManager(frame, state) {
  return `
    <section class="panel-section">
      <div class="panel-section__head">
        <h2>Elements</h2>
      </div>
      <div class="inline-actions inline-actions--compact">
        ${ELEMENT_TYPE_OPTIONS.map((option) => `<button class="btn btn--ghost btn--mini" type="button" data-add-element="${option.id}">Add ${escapeHtml(option.label)}</button>`).join("")}
      </div>
      <div class="element-groups">
        ${LAYER_ROLE_OPTIONS.map((group) => {
          const elements = frameElementsByLayer(frame, group.id);
          return `
            <div class="element-group">
              <div class="element-group__title">${escapeHtml(group.label)}</div>
              <div class="element-group__list">
                ${elements.map((element) => elementRowHtml(frame, element, state.ui.selectedElementId === element.id)).join("")}
                ${!elements.length ? '<div class="empty-state empty-state--small">Empty</div>' : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderSelectedElementControls(frame, element, state) {
  if (!element) {
    return '<div class="empty-state">No element selected.</div>';
  }

  const layoutDisabled = frame.layoutLocked ? "disabled" : "";
  const media = element.type === "image" ? imageMedia(element, frame) : null;
  const common = `
    <div class="field-grid">
      <label class="field">
        <span>X</span>
        <input data-element-rect="x" type="number" value="${Math.round(element.x)}" ${layoutDisabled}>
      </label>
      <label class="field">
        <span>Y</span>
        <input data-element-rect="y" type="number" value="${Math.round(element.y)}" ${layoutDisabled}>
      </label>
      <label class="field">
        <span>W</span>
        <input data-element-rect="w" type="number" value="${Math.round(element.w)}" ${layoutDisabled}>
      </label>
      <label class="field">
        <span>H</span>
        <input data-element-rect="h" type="number" value="${Math.round(element.h)}" ${layoutDisabled}>
      </label>
    </div>
  `;
  const textRect = `
    <div class="field-grid">
      <label class="field">
        <span>X</span>
        <input data-element-rect="x" type="number" value="${Math.round(element.x)}" ${layoutDisabled}>
      </label>
      <label class="field">
        <span>Y</span>
        <input data-element-rect="y" type="number" value="${Math.round(element.y)}" ${layoutDisabled}>
      </label>
      <label class="field">
        <span>W</span>
        <input data-element-rect="w" type="number" value="${Math.round(element.w)}" ${layoutDisabled}>
      </label>
    </div>
  `;

  if (element.type === "text") {
    return `
      ${inspectorBlockHtml("Typography", `
        <div class="field-grid">
          <label class="field">
            <span>Font family</span>
            <select data-text-style="fontRole">
              ${TEXT_FAMILY_OPTIONS.map((option) => `<option value="${option.id}" ${element.style?.fontRole === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Font size</span>
            <input data-text-style="fontSize" type="number" value="${Math.round(element.style?.fontSize || 28)}">
          </label>
          <label class="field">
            <span>Weight</span>
            <input data-text-style="fontWeight" type="number" min="300" max="800" step="100" value="${Math.round(element.style?.fontWeight || 500)}">
          </label>
          <label class="field">
            <span>Line height</span>
            <input data-text-style="lineHeight" type="number" min="0.8" max="2" step="0.05" value="${Number(element.style?.lineHeight || 1.2)}">
          </label>
          <label class="field">
            <span>Letter spacing</span>
            <input data-text-style="letterSpacing" type="number" min="-8" max="12" step="0.2" value="${Number(element.style?.letterSpacing || 0)}">
          </label>
          <label class="field">
            <span>Align</span>
            <select data-text-style="align">
              <option value="left" ${element.style?.align === "left" ? "selected" : ""}>Left</option>
              <option value="center" ${element.style?.align === "center" ? "selected" : ""}>Center</option>
              <option value="right" ${element.style?.align === "right" ? "selected" : ""}>Right</option>
            </select>
          </label>
          <label class="field">
            <span>Case</span>
            <select data-text-style="textTransform">
              <option value="none" ${element.style?.textTransform === "none" ? "selected" : ""}>Sentence</option>
              <option value="uppercase" ${element.style?.textTransform === "uppercase" ? "selected" : ""}>Uppercase</option>
            </select>
          </label>
        </div>
      `)}
      ${inspectorBlockHtml("Color", `
        <div class="field-grid">
          <label class="field">
            <span>Color mode</span>
            <select data-text-style="colorRole">
              ${COLOR_ROLE_OPTIONS.map((option) => `<option value="${option.id}" ${element.style?.colorRole === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
            </select>
          </label>
        </div>
        ${element.style?.colorRole === "custom" ? `<div class="swatch-grid">${swatchControlHtml({ label: "Custom", value: element.style?.color || frame.colors.text, dataAttr: "data-text-style", dataValue: "color" })}</div>` : ""}
      `)}
      ${inspectorBlockHtml("Box", textRect)}
    `;
  }

  if (element.type === "image") {
    return `
      ${inspectorBlockHtml("Image", `
        <label class="field">
          <span>Asset</span>
          <select id="elementImageAsset">${assetOptionsHtml(state, media?.assetId || "")}</select>
        </label>
        <div class="field-grid">
          <label class="field">
            <span>Fit</span>
            <select id="elementImageFit">
              <option value="cover" ${media?.objectFit !== "contain" ? "selected" : ""}>Cover</option>
              <option value="contain" ${media?.objectFit === "contain" ? "selected" : ""}>Contain</option>
            </select>
          </label>
          <label class="field">
            <span>Radius</span>
            <input id="elementImageRadius" type="number" min="0" max="120" step="1" value="${Math.round(element.style?.radius || 32)}">
          </label>
          <label class="field">
            <span>Focus X</span>
            <input id="elementImagePosX" type="number" min="0" max="100" step="1" value="${Math.round(media?.objectPositionX || 50)}">
          </label>
          <label class="field">
            <span>Focus Y</span>
            <input id="elementImagePosY" type="number" min="0" max="100" step="1" value="${Math.round(media?.objectPositionY || 50)}">
          </label>
          <label class="field">
            <span>Zoom</span>
            <input id="elementImageScale" type="number" min="0.5" max="4" step="0.05" value="${Number(media?.scale || 1)}">
          </label>
        </div>
      `)}
      ${inspectorBlockHtml("Box", common)}
    `;
  }

  if (element.type === "button") {
    return `
      ${inspectorBlockHtml("Button", `
        <div class="swatch-grid">
          ${swatchControlHtml({ label: "Fill", value: element.style?.fillColor || frame.colors.accent, dataAttr: "data-button-style", dataValue: "fillColor" })}
          ${swatchControlHtml({ label: "Text", value: element.style?.textColor || frame.colors.panel, dataAttr: "data-button-style", dataValue: "textColor" })}
          ${swatchControlHtml({ label: "Stroke", value: element.style?.strokeColor || frame.colors.accent, dataAttr: "data-button-style", dataValue: "strokeColor" })}
        </div>
        <div class="field-grid">
          <label class="field">
            <span>Radius</span>
            <input data-button-style="radius" type="number" min="0" max="120" step="1" value="${Math.round(element.style?.radius || 0)}">
          </label>
          <label class="field">
            <span>Opacity</span>
            <input data-button-style="opacity" type="number" min="0" max="1" step="0.05" value="${Number(element.style?.opacity ?? 1)}">
          </label>
          <label class="field">
            <span>Stroke width</span>
            <input data-button-style="strokeWidth" type="number" min="0" max="12" step="1" value="${Math.round(element.style?.strokeWidth || 0)}">
          </label>
        </div>
      `)}
      ${inspectorBlockHtml("Typography", `
        <div class="field-grid">
          <label class="field">
            <span>Font family</span>
            <select data-button-style="fontRole">
              ${TEXT_FAMILY_OPTIONS.map((option) => `<option value="${option.id}" ${element.style?.fontRole === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Font size</span>
            <input data-button-style="fontSize" type="number" min="12" max="120" step="1" value="${Math.round(element.style?.fontSize || 24)}">
          </label>
          <label class="field">
            <span>Weight</span>
            <input data-button-style="fontWeight" type="number" min="300" max="800" step="100" value="${Math.round(element.style?.fontWeight || 700)}">
          </label>
        </div>
      `)}
      ${inspectorBlockHtml("Box", common)}
    `;
  }

  return `
    ${inspectorBlockHtml("Fill & Stroke", `
      <div class="swatch-grid">
        ${swatchControlHtml({ label: "Fill", value: element.style?.fillColor || frame.colors.panel, dataAttr: "data-shape-style", dataValue: "fillColor" })}
        ${swatchControlHtml({ label: "Stroke", value: element.style?.strokeColor || frame.colors.border, dataAttr: "data-shape-style", dataValue: "strokeColor" })}
      </div>
      <div class="field-grid">
        <label class="field">
          <span>Opacity</span>
          <input data-shape-style="opacity" type="number" min="0" max="1" step="0.05" value="${Number(element.style?.opacity ?? 1)}">
        </label>
        <label class="field">
          <span>Radius</span>
          <input data-shape-style="radius" type="number" min="0" max="120" step="1" value="${Math.round(element.style?.radius || 24)}">
        </label>
      </div>
    `)}
    ${inspectorBlockHtml("Box", common)}
  `;
}

function renderFrameRailSections(frame, state) {
  return `
    <section class="panel-section panel-section--dense">
      <div class="panel-section__head">
        <h2>Page</h2>
      </div>
      ${inspectorBlockHtml("Page", `
        <label class="field">
          <span>Page title</span>
          <input id="frameTitle" type="text" value="${escapeHtml(frame.title || "")}">
        </label>
        <label class="field">
          <span>Alt text</span>
          <textarea id="frameAltText" rows="3">${escapeHtml(frame.altText || "")}</textarea>
        </label>
        <label class="checkbox">
          <input id="frameLayoutLocked" type="checkbox" ${frame.layoutLocked ? "checked" : ""}>
          <span>Lock layout</span>
        </label>
      `)}
      ${inspectorBlockHtml("Theme", renderPageThemeControls(frame))}
    </section>
  `;
}

function renderInspector(state) {
  const frame = selectedFrame(state);
  const element = selectedElement(state);
  const activeInspectorTab = state.ui.activeInspectorTab === "layers" ? "layers" : "style";
  const stopInspectorTimer = startLinkedInPerfTimer("render", "inspector-render", {
    frameId: frame?.id || null,
    selectedElementId: element?.id || null,
    sourceAction: "render",
  });

  if (!frame) {
    refs.inspector.innerHTML = '<div class="empty-state">No frame selected.</div>';
    stopInspectorTimer({ pageCount: 0, selectedElementType: null });
    return;
  }

  refs.inspector.innerHTML = `
    ${inspectorTabsHtml(activeInspectorTab)}
    ${activeInspectorTab === "style"
      ? (element
        ? `
          <section class="panel-section panel-section--dense">
            <div class="inspector-context-card">
              <div>
                <strong>${escapeHtml(element.label)}</strong>
                <span>${escapeHtml(element.type)}</span>
              </div>
              <button class="btn btn--ghost btn--mini" id="btnBackToPage" type="button">Page</button>
            </div>
            ${renderSelectedElementControls(frame, element, state)}
          </section>
        `
        : renderFrameRailSections(frame, state))
      : `
        ${renderElementManager(frame, state)}
        <section class="panel-section panel-section--dense">
          <div class="panel-section__head">
            <h2>Pages</h2>
          </div>
          <div class="inline-actions inline-actions--compact">
            <button class="btn btn--mini" id="btnRailAddFrame" type="button">Add page</button>
            <button class="btn btn--ghost btn--mini" id="btnRailDuplicateFrame" type="button">Copy page</button>
            <button class="btn btn--ghost btn--mini btn--danger-outline" id="btnRailDeleteFrame" type="button">Delete page</button>
          </div>
          <div class="page-sorter" id="pageSorter"></div>
        </section>
      `}
  `;

  refs.inspector.querySelectorAll("[data-inspector-tab]").forEach((button) => {
    button.addEventListener("click", () => setInspectorTab(button.dataset.inspectorTab));
  });

  if (activeInspectorTab === "layers") {
    renderPageSorter(refs.inspector.querySelector("#pageSorter"), state);
    refs.inspector.querySelector("#btnRailAddFrame")?.addEventListener("click", () => addFrame(frame.templateId));
    refs.inspector.querySelector("#btnRailDuplicateFrame")?.addEventListener("click", () => duplicateFrameById(frame.id));
    refs.inspector.querySelector("#btnRailDeleteFrame")?.addEventListener("click", () => deleteFrame(frame.id));
    refs.inspector.querySelectorAll("[data-add-element]").forEach((button) => {
      button.addEventListener("click", () => addElementToFrame(frame.id, button.dataset.addElement));
    });
    refs.inspector.querySelectorAll("[data-select-element-row]").forEach((button) => {
      button.addEventListener("click", () => setSelectedElement(frame.id, button.dataset.selectElementRow));
    });
    refs.inspector.querySelectorAll("[data-duplicate-element]").forEach((button) => {
      button.addEventListener("click", () => duplicateElement(frame.id, button.dataset.duplicateElement));
    });
    refs.inspector.querySelectorAll("[data-delete-element]").forEach((button) => {
      button.addEventListener("click", () => deleteElement(frame.id, button.dataset.deleteElement));
    });
    refs.inspector.querySelectorAll("[data-stack-element]").forEach((button) => {
      button.addEventListener("click", () => moveElementInStack(frame.id, button.dataset.stackElement, button.dataset.stackAction));
    });
    refs.inspector.querySelectorAll("[data-element-layer]").forEach((select) => {
      select.addEventListener("change", (event) => setElementLayerRole(frame.id, event.target.dataset.elementLayer, event.target.value));
    });
    stopInspectorTimer({
      pageCount: Array.isArray(state.frames) ? state.frames.length : 0,
      selectedElementType: element?.type || null,
    });
    return;
  }

  refs.inspector.querySelector("#btnBackToPage")?.addEventListener("click", () => setSelectedFrame(frame.id));

  if (!element) {
    refs.inspector.querySelector("#frameTitle")?.addEventListener("change", (event) => updateFrameField(frame.id, "title", event.target.value));
    refs.inspector.querySelector("#frameAltText")?.addEventListener("change", (event) => updateFrameField(frame.id, "altText", event.target.value));
    refs.inspector.querySelector("#frameLayoutLocked")?.addEventListener("change", () => toggleLayoutLock(frame.id));
    refs.inspector.querySelectorAll("[data-frame-color]").forEach((input) => {
      input.addEventListener("input", (event) => updateFrameColor(frame.id, event.target.dataset.frameColor, event.target.value));
    });
    stopInspectorTimer({
      pageCount: Array.isArray(state.frames) ? state.frames.length : 0,
      selectedElementType: null,
    });
    return;
  }

  refs.inspector.querySelectorAll("[data-element-rect]").forEach((field) => {
    field.addEventListener("change", () => {
      updateElementRect(frame.id, element.id, {
        x: refs.inspector.querySelector('[data-element-rect="x"]')?.value,
        y: refs.inspector.querySelector('[data-element-rect="y"]')?.value,
        w: refs.inspector.querySelector('[data-element-rect="w"]')?.value,
        h: refs.inspector.querySelector('[data-element-rect="h"]')?.value,
      });
    });
  });
  refs.inspector.querySelectorAll("[data-text-style]").forEach((field) => {
    field.addEventListener("change", (event) => {
      if (element.type !== "text") return;
      const key = event.target.dataset.textStyle;
      const rawValue = event.target.value;
      const numericKeys = new Set(["fontSize", "fontWeight", "lineHeight", "letterSpacing"]);
      const nextValue = numericKeys.has(key)
        ? Number.isFinite(Number(rawValue)) ? Number(rawValue) : element.style?.[key]
        : rawValue;
      updateTextElementStyle(frame.id, element.id, {
        [key]: nextValue,
      });
    });
  });
  refs.inspector.querySelectorAll("[data-shape-style]").forEach((field) => {
    field.addEventListener("change", (event) => {
      if (element.type !== "shape") return;
      const key = event.target.dataset.shapeStyle;
      const numericKeys = new Set(["opacity", "radius"]);
      const nextValue = numericKeys.has(key)
        ? Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : element.style?.[key]
        : event.target.value;
      updateShapeElementStyle(frame.id, element.id, {
        [key]: nextValue,
      });
    });
  });
  refs.inspector.querySelector("#elementImageAsset")?.addEventListener("change", (event) => {
    if (element.type !== "image") return;
    const asset = findAsset(store.getState(), event.target.value);
    updateImageElementMedia(frame.id, element.id, {
      assetId: event.target.value || null,
      imageUrl: asset?.dataUrl || "",
    }, "element-image-asset");
  });
  refs.inspector.querySelector("#elementImageFit")?.addEventListener("change", (event) => {
    if (element.type !== "image") return;
    updateImageElementMedia(frame.id, element.id, { objectFit: event.target.value }, "element-image-fit");
  });
  refs.inspector.querySelector("#elementImagePosX")?.addEventListener("change", (event) => {
    if (element.type !== "image") return;
    updateImageElementMedia(frame.id, element.id, { objectPositionX: Number(event.target.value) }, "element-image-pos");
  });
  refs.inspector.querySelector("#elementImagePosY")?.addEventListener("change", (event) => {
    if (element.type !== "image") return;
    updateImageElementMedia(frame.id, element.id, { objectPositionY: Number(event.target.value) }, "element-image-pos");
  });
  refs.inspector.querySelector("#elementImageScale")?.addEventListener("change", (event) => {
    if (element.type !== "image") return;
    updateImageElementMedia(frame.id, element.id, { scale: Number(event.target.value) }, "element-image-scale");
  });
  refs.inspector.querySelector("#elementImageRadius")?.addEventListener("change", (event) => {
    if (element.type !== "image") return;
    updateShapeElementStyle(frame.id, element.id, { radius: Number(event.target.value) });
  });
  refs.inspector.querySelectorAll("[data-button-style]").forEach((field) => {
    field.addEventListener("change", (event) => {
      if (element.type !== "button") return;
      const key = event.target.dataset.buttonStyle;
      const numericKeys = new Set(["fontSize", "fontWeight", "radius", "opacity", "strokeWidth"]);
      const nextValue = numericKeys.has(key)
        ? Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : element.style?.[key]
        : event.target.value;
      updateButtonElementStyle(frame.id, element.id, {
        [key]: nextValue,
      });
    });
  });
  stopInspectorTimer({
    pageCount: Array.isArray(state.frames) ? state.frames.length : 0,
    selectedElementType: element?.type || null,
  });
}

function render(state = store.getState(), meta = {}) {
  const isEditor = appState.currentView === "editor" && Boolean(appState.currentDocumentId);
  const renderAction = isEditor ? "editor-render" : "dashboard-render";
  const renderTargets = isEditor ? resolveEditorRenderTargets(meta) : null;
  const stopRenderTimer = startLinkedInPerfTimer("render", renderAction, {
    currentView: appState.currentView,
    sourceAction: String(meta?.action || "manual"),
  });
  if (refs.dashboardView) refs.dashboardView.hidden = isEditor;
  if (refs.editorView) refs.editorView.hidden = !isEditor;
  if (refs.btnBackToDashboard) refs.btnBackToDashboard.hidden = !isEditor;
  if (refs.btnUndo) refs.btnUndo.hidden = !isEditor;
  if (refs.btnRedo) refs.btnRedo.hidden = !isEditor;
  if (refs.fileMenu) refs.fileMenu.hidden = !isEditor;
  if (refs.btnTopbarNewPost) refs.btnTopbarNewPost.hidden = isEditor;
  if (refs.btnTopbarNewCarousel) refs.btnTopbarNewCarousel.hidden = isEditor;

  if (isEditor) {
    if (renderTargets.sidebar) renderSidebar(state);
    if (renderTargets.canvas) renderCanvas(state);
    if (renderTargets.inspector) renderInspector(state);
  } else {
    renderDashboard();
  }

  refs.btnUndo.disabled = !isEditor || !store.canUndo();
  refs.btnRedo.disabled = !isEditor || !store.canRedo();
  refs.btnExportPdf.disabled = !isEditor || runtime.exportBusy || state.project.outputMode !== "carousel";
  refs.btnExportPng.disabled = !isEditor || runtime.exportBusy;
  refs.btnExportJson.disabled = !isEditor || runtime.exportBusy;
  refs.btnImportImage.disabled = !isEditor || runtime.exportBusy;
  refs.btnImportJson.disabled = !isEditor || runtime.exportBusy;
  refs.btnResetProject.disabled = !isEditor || runtime.exportBusy;
  stopRenderTimer({
    canvasRendered: Boolean(isEditor && renderTargets?.canvas),
    frameCount: Array.isArray(state.frames) ? state.frames.length : 0,
    inspectorRendered: Boolean(isEditor && renderTargets?.inspector),
    sidebarRendered: Boolean(isEditor && renderTargets?.sidebar),
  });
}

async function withExportBusy(task) {
  runtime.exportBusy = true;
  render(store.getState());
  try {
    await task();
  } finally {
    runtime.exportBusy = false;
    render(store.getState());
  }
}

function buildExportNode(frame) {
  const exportState = store.getState();
  const metrics = canvasMetrics(frame.aspectRatio || exportState.project.aspectRatio);
  const wrapper = document.createElement("div");
  wrapper.className = "export-frame-root";
  wrapper.style.position = "fixed";
  wrapper.style.left = "-100000px";
  wrapper.style.top = "0";
  wrapper.style.width = `${metrics.width}px`;
  wrapper.style.height = `${metrics.height}px`;
  wrapper.appendChild(createFrameStageNode(frame, exportState, { scale: 1, includeResources: false, suppressSelection: true }));
  document.body.appendChild(wrapper);
  return wrapper;
}

function currentDocumentSnapshot(state = store.getState(), { meaningful = true, documentId = appState.currentDocumentId } = {}) {
  const snapshot = documentStorageSnapshot(state);
  const resolvedDocumentId = documentId || snapshot.project.id || uid("linkedin_doc");
  const meta = currentDocumentMeta(resolvedDocumentId);
  snapshot.project.id = resolvedDocumentId;
  snapshot.project.updatedAt = meaningful
    ? nowIso()
    : String(meta?.updatedAt || snapshot.project.updatedAt || nowIso());
  return snapshot;
}

function persistCurrentDocumentState({
  state = store.getState(),
  meaningful = true,
  thumbnail = null,
  documentId = appState.currentDocumentId,
  sourceAction = "manual",
} = {}) {
  if (!documentId) return;
  const stopPersistTimer = startLinkedInPerfTimer("persist", "document-persist", {
    documentId,
    meaningful,
    sourceAction,
    thumbnailIncluded: typeof thumbnail === "string",
  });
  const existingMeta = currentDocumentMeta(documentId);
  const snapshot = currentDocumentSnapshot(state, { meaningful, documentId });
  const nextMeta = createDocumentMetaFromState(snapshot, {
    id: documentId,
    thumbnail: typeof thumbnail === "string" ? thumbnail : (existingMeta?.thumbnail || ""),
    isSaved: existingMeta?.isSaved === true,
  });
  saveDocumentState(documentId, snapshot);
  persistDocumentIndex(upsertDocumentMeta(appState.documentIndex, nextMeta));
  stopPersistTimer({
    assetCount: Array.isArray(snapshot.assets) ? snapshot.assets.length : 0,
    frameCount: Array.isArray(snapshot.frames) ? snapshot.frames.length : 0,
    isSaved: nextMeta.isSaved === true,
  });
}

async function generateDocumentThumbnail(state = store.getState(), request = {}) {
  const frame = state.frames?.[0];
  if (!frame || typeof window.html2canvas !== "function") return "";
  const stopThumbnailTimer = startLinkedInPerfTimer("persist", "thumbnail-capture", {
    documentId: request.documentId || state.project?.id || null,
    frameId: frame.id,
    sourceAction: String(request.sourceAction || "manual"),
  });
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-100000px";
  wrapper.style.top = "0";
  wrapper.style.pointerEvents = "none";
  const thumbNode = createFrameStageNode(frame, state, {
    scale: 0.16,
    thumbnail: true,
    includeResources: false,
    suppressSelection: true,
  });
  wrapper.appendChild(thumbNode);
  document.body.appendChild(wrapper);
  try {
    const canvas = await window.html2canvas(thumbNode, {
      backgroundColor: null,
      logging: false,
      scale: 1,
      useCORS: true,
    });
    stopThumbnailTimer({
      ok: true,
      width: canvas.width,
      height: canvas.height,
    });
    return canvas.toDataURL("image/png", 0.92);
  } catch (_error) {
    stopThumbnailTimer({ ok: false });
    return "";
  } finally {
    wrapper.remove();
  }
}

async function flushQueuedDocumentThumbnail() {
  if (appState.thumbnailCaptureActive) return;
  const request = appState.pendingThumbnailRequest;
  if (!request?.documentId) return;

  appState.pendingThumbnailRequest = null;
  appState.thumbnailCaptureActive = true;
  try {
    const thumbnail = await generateDocumentThumbnail(request.state, request);
    persistCurrentDocumentState({
      state: request.state,
      meaningful: request.meaningful,
      thumbnail,
      documentId: request.documentId,
      sourceAction: request.sourceAction || "thumbnail-refresh",
    });
    if (appState.currentView === "dashboard") {
      render();
    }
  } finally {
    appState.thumbnailCaptureActive = false;
    if (appState.pendingThumbnailRequest) {
      flushQueuedDocumentThumbnail().catch(() => {});
    }
  }
}

function queueDocumentThumbnail({
  state = store.getState(),
  meaningful = true,
  documentId = appState.currentDocumentId,
  sourceAction = "manual",
} = {}) {
  if (!documentId) return;
  const previousRequest = appState.pendingThumbnailRequest;
  appState.pendingThumbnailRequest = {
    state,
    meaningful: previousRequest?.documentId === documentId
      ? Boolean(previousRequest?.meaningful) || Boolean(meaningful)
      : Boolean(meaningful),
    documentId,
    sourceAction,
  };
  if (!appState.thumbnailCaptureActive) {
    flushQueuedDocumentThumbnail().catch(() => {});
  }
}

function goBackToDashboard() {
  if (appState.currentDocumentId) {
    const documentId = appState.currentDocumentId;
    const state = store.getState();
    persistCurrentDocumentState({ state, meaningful: false, documentId, sourceAction: "dashboard-return" });
    requestDocumentThumbnailRefresh("dashboard-return", {
      state,
      documentId,
    });
  }
  setCurrentView("dashboard");
  render();
}

async function exportCurrentFramePng() {
  const state = store.getState();
  const frame = selectedFrame(state);
  if (!frame) return;
  await withExportBusy(async () => {
    const node = buildExportNode(frame);
    try {
      await exportFramePng(node, buildExportFilename(state, "png"), canvasMetrics(frame.aspectRatio || state.project.aspectRatio));
      showToast("PNG export generated.");
    } finally {
      node.remove();
    }
  });
}

async function exportCarouselPdf() {
  const state = store.getState();
  if (state.project.outputMode !== "carousel") return;
  await withExportBusy(async () => {
    const nodes = state.frames.map((frame) => buildExportNode(frame));
    try {
      await exportFramesPdf(nodes, buildExportFilename(state, "pdf"), canvasMetrics(state.project.aspectRatio));
      showToast("Carousel PDF generated.");
    } finally {
      nodes.forEach((node) => node.remove());
    }
  });
}

function shouldIgnoreGlobalShortcut(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function bindChrome() {
  if (refs.btnOpenLocalhost) {
    refs.btnOpenLocalhost.href = localhostHref();
    refs.btnOpenLocalhost.hidden = !shouldShowLocalhostLink();
  }
  refs.btnBrandHome?.addEventListener("click", () => {
    setFileMenuOpen(false);
    if (appState.currentView === "editor") {
      goBackToDashboard();
      return;
    }
    setCurrentView("dashboard");
    render();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
  refs.btnTopbarNewPost?.addEventListener("click", () => {
    setFileMenuOpen(false);
    createFreshProject("static");
  });
  refs.btnTopbarNewCarousel?.addEventListener("click", () => {
    setFileMenuOpen(false);
    createFreshProject("carousel");
  });
  refs.btnBackToDashboard?.addEventListener("click", () => {
    setFileMenuOpen(false);
    goBackToDashboard();
  });
  refs.btnFileMenu?.addEventListener("click", (event) => {
    if (appState.currentView !== "editor") return;
    event.stopPropagation();
    toggleFileMenu();
  });
  document.addEventListener("click", (event) => {
    if (!refs.fileMenu?.contains(event.target)) {
      setFileMenuOpen(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (appState.currentView !== "editor") {
      if (event.key === "Escape") {
        setFileMenuOpen(false);
      }
      return;
    }
    if (event.key === "Escape") {
      setFileMenuOpen(false);
      if (!shouldIgnoreGlobalShortcut(event.target)) {
        const frame = selectedFrame();
        if (frame && selectedElement()) {
          event.preventDefault();
          setSelectedFrame(frame.id);
          return;
        }
      }
    }
    if (!shouldIgnoreGlobalShortcut(event.target)) {
      if (event.key === "Backspace" || event.key === "Delete") {
        const deleted = deleteCurrentSelection();
        if (deleted) {
          event.preventDefault();
          return;
        }
      }
    }
    if (shouldIgnoreGlobalShortcut(event.target)) return;
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = String(event.key || "").toLowerCase();
    if (key === "z") {
      event.preventDefault();
      setFileMenuOpen(false);
      if (event.shiftKey) {
        store.redo();
      } else {
        store.undo();
      }
      return;
    }
    if (key === "y") {
      event.preventDefault();
      setFileMenuOpen(false);
      store.redo();
    }
  });

  refs.btnUndo?.addEventListener("click", () => store.undo());
  refs.btnRedo?.addEventListener("click", () => store.redo());
  refs.btnExportPng?.addEventListener("click", () => {
    setFileMenuOpen(false);
    exportCurrentFramePng().catch((error) => showToast(error.message || "PNG export failed.", "error"));
  });
  refs.btnExportPdf?.addEventListener("click", () => {
    setFileMenuOpen(false);
    exportCarouselPdf().catch((error) => showToast(error.message || "PDF export failed.", "error"));
  });
  refs.btnExportJson?.addEventListener("click", () => {
    setFileMenuOpen(false);
    exportProjectJson(store.getState(), buildExportFilename(store.getState(), "json"));
    showToast("Project JSON exported.");
  });
  refs.btnImportJson?.addEventListener("click", () => {
    setFileMenuOpen(false);
    refs.fileImportJson?.click();
  });
  refs.btnImportImage?.addEventListener("click", () => {
    setFileMenuOpen(false);
    openImageImport("library");
  });
  refs.btnResetProject?.addEventListener("click", () => {
    setFileMenuOpen(false);
    resetProject();
  });
  refs.btnCanvasZoomOut?.addEventListener("click", () => zoomCanvasBy(1 / STAGE_ZOOM_STEP));
  refs.btnCanvasZoomFit?.addEventListener("click", () => zoomCanvasToFit());
  refs.btnCanvasZoomIn?.addEventListener("click", () => zoomCanvasBy(STAGE_ZOOM_STEP));

  refs.fileImportImage?.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    event.target.value = "";
    if (!file) return;
    await handleImageImport(file);
  });
  refs.fileImportJson?.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    event.target.value = "";
    if (!file) return;
    await handleJsonImport(file);
  });
}

function initResizeObserver() {
  if (!refs.canvasViewport || typeof ResizeObserver !== "function") return;
  runtime.resizeObserver = new ResizeObserver(() => renderCanvas(store.getState()));
  runtime.resizeObserver.observe(refs.canvasViewport);
}

migrateDocumentAssetsIntoSharedLibrary();
syncStoreAssetLibrary();
syncAllTextBounds(true);
bindChrome();
store.subscribe((state, meta = {}) => {
  render(state, meta);
  if (appState.currentView !== "editor" || !appState.currentDocumentId) return;
  if (!shouldPersistDocumentChange(meta)) return;
  const documentId = appState.currentDocumentId;
  const meaningful = isMeaningfulPersistAction(meta);
  appState.documentPersistDebounced?.(state, meaningful, documentId, String(meta?.action || "commit"));
});
initResizeObserver();
render();
