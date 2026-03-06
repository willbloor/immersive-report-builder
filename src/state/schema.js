import { DEFAULT_PRINT_PROFILE } from "../print/profiles.js";
import { APP_VERSION, nowIso, uid } from "../utils/helpers.js";

export const STORAGE_KEY_V2 = "doc-builder.state.v0_2";
export const STORAGE_KEY_V1 = "il_report_builder_state_v0_1";

export const REPORT_SECTIONS = [
  "Executive Summary",
  "Benchmarking",
  "Threat Response",
  "Technical Skills",
  "Compliance",
  "Secure Code",
  "C7 Insights",
  "Conclusion",
];

export function makeDefaultProjectMeta() {
  const ts = nowIso();
  return {
    id: uid("prj"),
    name: "Executive Readiness Pack",
    org: "Orchid Bank",
    period: "H1 2025",
    locale: "en-GB",
    printProfile: DEFAULT_PRINT_PROFILE,
    marginsMm: {
      top: 8,
      right: 8,
      bottom: 10,
      left: 8,
    },
    createdAt: ts,
    updatedAt: ts,
  };
}

export function makeDefaultFooter(projectMeta) {
  return {
    enabled: true,
    reportLabel: `${projectMeta.name} - Q2 2025`,
    confidentiality: "",
    pageNumberStyle: "zeroPad2",
  };
}

export function makeEmptyState() {
  const project = makeDefaultProjectMeta();
  return {
    schemaVersion: APP_VERSION,
    project,
    footer: makeDefaultFooter(project),
    theme: {
      themeId: "immersive-default",
      tokens: {},
      statusPalettes: {
        low: "var(--status-low)",
        medium: "var(--status-medium)",
        high: "var(--status-high)",
      },
    },
    datasets: [],
    assets: [],
    pages: [],
    ui: {
      selectedPageId: null,
      selectedComponentId: null,
      pendingDeleteComponentId: null,
      showGridAll: false,
      activePageId: null,
      pageSettingsPageId: null,
      pagePanelTab: "pages",
      templateSearch: "",
      warnings: {},
      paletteOpen: true,
      inspectorOpen: false,
      workbenchTool: "pages",
      inspectorTab: "settings",
      topbarTextTarget: "title",
      canvasZoomMode: "manual",
      canvasZoom: 1,
    },
  };
}

export function isV2Project(candidate) {
  return candidate && candidate.schemaVersion === "0.2" && Array.isArray(candidate.pages);
}

export function hasV1Shape(candidate) {
  return candidate && Array.isArray(candidate.pages) && typeof candidate.reportTitle === "string";
}

export function ensureUiState(state) {
  if (!state.ui || typeof state.ui !== "object") {
    state.ui = {
      selectedPageId: null,
      selectedComponentId: null,
      pendingDeleteComponentId: null,
      showGridAll: false,
      activePageId: null,
      pageSettingsPageId: null,
      pagePanelTab: "pages",
      templateSearch: "",
      warnings: {},
      paletteOpen: true,
      inspectorOpen: false,
      workbenchTool: "pages",
      inspectorTab: "settings",
      topbarTextTarget: "title",
      canvasZoomMode: "manual",
      canvasZoom: 1,
    };
  }
  if (!state.ui.warnings || typeof state.ui.warnings !== "object") {
    state.ui.warnings = {};
  }
  if (typeof state.ui.pendingDeleteComponentId !== "string") {
    state.ui.pendingDeleteComponentId = null;
  }
  if (typeof state.ui.pageSettingsPageId !== "string") {
    state.ui.pageSettingsPageId = null;
  }
  if (!["pages", "templates"].includes(state.ui.pagePanelTab)) {
    state.ui.pagePanelTab = "pages";
  }
  if (typeof state.ui.templateSearch !== "string") {
    state.ui.templateSearch = "";
  }
  if (typeof state.ui.paletteOpen !== "boolean") {
    state.ui.paletteOpen = true;
  }
  if (typeof state.ui.inspectorOpen !== "boolean") {
    state.ui.inspectorOpen = false;
  }
  if (!["pages", "design", "components", "charts", "resources", "styles"].includes(state.ui.workbenchTool)) {
    state.ui.workbenchTool = "pages";
  }
  if (!["settings", "data"].includes(state.ui.inspectorTab)) {
    state.ui.inspectorTab = "settings";
  }
  if (!["title", "body"].includes(state.ui.topbarTextTarget)) {
    state.ui.topbarTextTarget = "title";
  }
  if (!["manual", "fit"].includes(state.ui.canvasZoomMode)) {
    state.ui.canvasZoomMode = "manual";
  }
  const zoom = Number(state.ui.canvasZoom);
  if (!Number.isFinite(zoom)) {
    state.ui.canvasZoom = 1;
  } else {
    state.ui.canvasZoom = Math.max(0.5, Math.min(1.5, Math.round(zoom * 100) / 100));
  }
}

export function touchUpdatedAt(state) {
  if (state?.project) {
    state.project.updatedAt = nowIso();
  }
}
