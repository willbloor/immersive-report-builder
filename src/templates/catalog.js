import { profileKeys } from "../print/profiles.js";
import { clamp, deepClone, uid } from "../utils/helpers.js";
import { normalizeTypographyProps } from "../utils/typography.js";

export const PAGE_THEMES = {
  dark_intro: "dark_intro",
  light_data: "light_data",
};

export const PAGE_KINDS = {
  cover: "cover",
  divider: "divider",
  agenda: "agenda",
  content: "content",
  end: "end",
  custom: "custom",
};

export const BINDABLE_TYPES = new Set(["kpi", "gauge", "line", "bar", "waffle", "donut", "lollipop"]);
export const GRID_COLS = 24;
export const GRID_ROWS_MAX = 800;

const ALL_PROFILES = profileKeys();
const GLOBAL_SECTION_NAV = [
  "Executive Summary",
  "Benchmarking",
  "Threat Response",
  "Technical Skills",
  "Compliance",
  "Secure Code",
  "C7 Insights",
  "Conclusion",
];
const FULL_BLEED_TEMPLATE_IDS = new Set([
  "cover_hero_landscape",
  "section_intro_dark",
  "technical_skills_intro_dark",
  "agenda_dark",
  "end_dark",
]);
export const DEFAULT_PAGE_TITLE_SLOT_ID = "default-page-title";
const VALID_PAGE_KINDS = new Set(Object.values(PAGE_KINDS));
const ART_PAGE_KINDS = new Set([PAGE_KINDS.cover, PAGE_KINDS.divider, PAGE_KINDS.agenda, PAGE_KINDS.end]);
const CONTENT_PAGE_KINDS = new Set([PAGE_KINDS.content, PAGE_KINDS.custom]);
const PAGE_KIND_BY_TEMPLATE_ID = {
  cover_hero_landscape: PAGE_KINDS.cover,
  section_intro_dark: PAGE_KINDS.divider,
  technical_skills_intro_dark: PAGE_KINDS.divider,
  agenda_dark: PAGE_KINDS.agenda,
  end_dark: PAGE_KINDS.end,
  benchmark_industry_light: PAGE_KINDS.content,
  benchmark_region_light: PAGE_KINDS.content,
  threat_response_metrics_light: PAGE_KINDS.content,
  recommendations_three_column_light: PAGE_KINDS.content,
  custom: PAGE_KINDS.content,
  legacy_import: PAGE_KINDS.content,
};

export function defaultPageKind(templateId) {
  const key = String(templateId || "").trim();
  if (!key) return PAGE_KINDS.content;
  return PAGE_KIND_BY_TEMPLATE_ID[key] || PAGE_KINDS.content;
}

export function isArtPageKind(kind) {
  return ART_PAGE_KINDS.has(String(kind || "").trim());
}

export function isContentPageKind(kind) {
  return CONTENT_PAGE_KINDS.has(String(kind || "").trim());
}

export function ensurePageKind(page) {
  if (!page || typeof page !== "object") return page;
  const candidate = String(page.pageKind || "").trim();
  if (!VALID_PAGE_KINDS.has(candidate)) {
    page.pageKind = defaultPageKind(page.templateId);
  }
  return page;
}

function fillLayouts(layouts) {
  const out = {};
  const fallback = layouts.LETTER_landscape || Object.values(layouts)[0];
  for (const profile of ALL_PROFILES) {
    const src = layouts[profile] || fallback;
    out[profile] = {
      colStart: clamp(Number(src.colStart) || 1, 1, GRID_COLS),
      colSpan: clamp(Number(src.colSpan) || 4, 1, GRID_COLS),
      rowStart: clamp(Number(src.rowStart) || 1, 1, GRID_ROWS_MAX),
      rowSpan: clamp(Number(src.rowSpan) || 4, 1, GRID_ROWS_MAX),
    };
  }
  return out;
}

export function makeComponent({
  type,
  title = "",
  body = "",
  status = "",
  props = {},
  dataBindings = [],
  layouts,
  slotId = null,
  layoutConstraints = {},
}) {
  const resolvedLayouts = fillLayouts(layouts);
  const component = {
    id: uid("cmp"),
    type,
    title,
    body,
    status,
    props: normalizeTypographyProps(type, props),
    dataBindings,
    slotId,
    layoutConstraints: {
      locked: Boolean(layoutConstraints.locked),
      minColSpan: layoutConstraints.minColSpan ?? 1,
      maxColSpan: layoutConstraints.maxColSpan ?? GRID_COLS,
      minRowSpan: layoutConstraints.minRowSpan ?? 1,
      maxRowSpan: layoutConstraints.maxRowSpan ?? 400,
      allowedTypes: layoutConstraints.allowedTypes || null,
    },
    layouts: deepClone(resolvedLayouts),
    defaultLayouts: deepClone(resolvedLayouts),
  };
  component.defaultState = {
    title: component.title,
    body: component.body,
    status: component.status,
    props: deepClone(component.props || {}),
    dataBindings: deepClone(component.dataBindings || []),
    layouts: deepClone(component.defaultLayouts || component.layouts || {}),
  };
  return component;
}

export function getComponentLayout(component, profileId) {
  const layout = component.layouts?.[profileId] || component.layouts?.LETTER_landscape;
  return layout || { colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 4 };
}

export function setComponentLayout(component, profileId, patch) {
  const active = getComponentLayout(component, profileId);
  const next = {
    colStart: clamp(Number(patch.colStart ?? active.colStart) || 1, 1, GRID_COLS),
    colSpan: clamp(Number(patch.colSpan ?? active.colSpan) || 4, 1, GRID_COLS),
    rowStart: clamp(Number(patch.rowStart ?? active.rowStart) || 1, 1, GRID_ROWS_MAX),
    rowSpan: clamp(Number(patch.rowSpan ?? active.rowSpan) || 4, 1, GRID_ROWS_MAX),
  };
  next.colStart = clamp(next.colStart, 1, GRID_COLS - next.colSpan + 1);
  if (!component.layouts) component.layouts = {};
  component.layouts[profileId] = next;
}

export function resetComponentLayouts(component) {
  if (!component?.defaultLayouts || typeof component.defaultLayouts !== "object") return false;
  component.layouts = deepClone(component.defaultLayouts);
  return true;
}

export function defaultPageFullBleed(templateId) {
  return FULL_BLEED_TEMPLATE_IDS.has(String(templateId || ""));
}

export function ensurePageFullBleed(page) {
  if (!page || typeof page !== "object") return page;
  if (typeof page.fullBleed !== "boolean") {
    page.fullBleed = defaultPageFullBleed(page.templateId);
  }
  return page;
}

function defaultAllCapsTitleForPage(page) {
  const raw = String(page?.title || page?.sectionId || "Section").trim();
  return raw ? raw.toUpperCase() : "SECTION";
}

function defaultHeaderTitleColorForPage(page) {
  return page?.theme === PAGE_THEMES.dark_intro ? "#F2F5FF" : "#17181C";
}

function defaultHeaderMinColSpanForProfile(profileId) {
  return String(profileId || "").includes("_portrait") ? 11 : 7;
}

function enforceDefaultHeaderLayouts(component) {
  if (!component || typeof component !== "object") return;
  const minRowSpan = 6;
  const normalizeLayouts = (layouts) => {
    if (!layouts || typeof layouts !== "object") return;
    for (const profileId of Object.keys(layouts)) {
      const layout = layouts[profileId];
      if (!layout || typeof layout !== "object") continue;
      const minColSpan = defaultHeaderMinColSpanForProfile(profileId);
      const colSpan = clamp(Math.max(minColSpan, Number(layout.colSpan) || minColSpan), 1, GRID_COLS);
      layout.colSpan = colSpan;
      layout.colStart = clamp(Number(layout.colStart) || 1, 1, GRID_COLS - colSpan + 1);
      layout.rowStart = clamp(Number(layout.rowStart) || 1, 1, GRID_ROWS_MAX);
      layout.rowSpan = clamp(Math.max(minRowSpan, Number(layout.rowSpan) || minRowSpan), 1, GRID_ROWS_MAX);
    }
  };
  normalizeLayouts(component.layouts);
  normalizeLayouts(component.defaultLayouts);
  normalizeLayouts(component.defaultState?.layouts);
}

function applyDefaultHeaderContract(component, page) {
  if (!component || typeof component !== "object") return component;
  if (!component.layoutConstraints || typeof component.layoutConstraints !== "object") {
    component.layoutConstraints = {};
  }
  component.layoutConstraints.locked = true;
  component.layoutConstraints.allowedTypes = ["all_caps_title"];
  component.layoutConstraints.minColSpan = Math.max(7, Number(component.layoutConstraints.minColSpan) || 7);
  component.layoutConstraints.minRowSpan = Math.max(6, Number(component.layoutConstraints.minRowSpan) || 6);
  component.layoutConstraints.maxRowSpan = Math.max(component.layoutConstraints.minRowSpan, Number(component.layoutConstraints.maxRowSpan) || 18);
  component.slotId = DEFAULT_PAGE_TITLE_SLOT_ID;
  component.isDefaultPageTitle = true;
  enforceDefaultHeaderLayouts(component);

  const candidateProps = component.props && typeof component.props === "object" ? component.props : {};
  const nextProps = {
    ...candidateProps,
    scale: Number.isFinite(Number(candidateProps.scale)) ? Number(candidateProps.scale) : 0.78,
    surface: {
      ...(candidateProps.surface && typeof candidateProps.surface === "object" ? candidateProps.surface : {}),
      backgroundColor: "transparent",
      keyline: "none",
    },
    typography: {
      ...(candidateProps.typography && typeof candidateProps.typography === "object" ? candidateProps.typography : {}),
      title: {
        ...(candidateProps.typography?.title && typeof candidateProps.typography.title === "object"
          ? candidateProps.typography.title
          : {}),
        textTransform: "uppercase",
        color: defaultHeaderTitleColorForPage(page),
      },
      body: {
        ...(candidateProps.typography?.body && typeof candidateProps.typography.body === "object"
          ? candidateProps.typography.body
          : {}),
        color: defaultHeaderTitleColorForPage(page),
      },
    },
  };
  component.props = normalizeTypographyProps("all_caps_title", nextProps);
  return component;
}

function makeDefaultAllCapsTitleComponent(page) {
  const props = {
    scale: 0.78,
    surface: {
      backgroundColor: "transparent",
      keyline: "none",
      keylineColor: "#D7D7E7",
    },
    typography: {
      title: { color: defaultHeaderTitleColorForPage(page), textTransform: "uppercase" },
      body: { color: defaultHeaderTitleColorForPage(page) },
    },
  };
  const component = makeComponent({
    type: "all_caps_title",
    title: defaultAllCapsTitleForPage(page),
    body: "",
    slotId: DEFAULT_PAGE_TITLE_SLOT_ID,
    props,
    layoutConstraints: {
      locked: true,
      allowedTypes: ["all_caps_title"],
      minColSpan: 7,
      maxColSpan: 24,
      minRowSpan: 6,
      maxRowSpan: 18,
    },
    layouts: {
      LETTER_landscape: { colStart: 1, colSpan: 7, rowStart: 1, rowSpan: 6 },
      LETTER_portrait: { colStart: 1, colSpan: 11, rowStart: 1, rowSpan: 6 },
      A4_landscape: { colStart: 1, colSpan: 7, rowStart: 1, rowSpan: 6 },
      A4_portrait: { colStart: 1, colSpan: 11, rowStart: 1, rowSpan: 6 },
    },
  });
  component.isDefaultPageTitle = true;
  return component;
}

export function ensurePageDefaultAllCapsTitle(page, options = {}) {
  if (!page || !Array.isArray(page.components)) return page;
  ensurePageKind(page);
  const shouldShowDefaultHeader = isContentPageKind(page.pageKind);
  const hasPageTitleSlot = (component) => (
    component?.slotId === DEFAULT_PAGE_TITLE_SLOT_ID
    || component?.isDefaultPageTitle === true
  );
  if (!shouldShowDefaultHeader) {
    page.components = page.components.filter((component) => !hasPageTitleSlot(component));
    return page;
  }

  const syncTitle = options.syncTitle === true;
  const existingDefault = page.components.find((component) => hasPageTitleSlot(component));

  if (existingDefault) {
    if (syncTitle) {
      existingDefault.title = defaultAllCapsTitleForPage(page);
    }
    applyDefaultHeaderContract(existingDefault, page);
    return page;
  }

  const existingAllCaps = page.components.find((component) => component?.type === "all_caps_title");
  if (existingAllCaps) {
    if (syncTitle) {
      existingAllCaps.title = defaultAllCapsTitleForPage(page);
    }
    applyDefaultHeaderContract(existingAllCaps, page);
    return page;
  }

  const component = makeDefaultAllCapsTitleComponent(page);
  applyDefaultHeaderContract(component, page);
  page.components.push(component);
  return page;
}

export function enforcePageContracts(page, options = {}) {
  if (!page || typeof page !== "object") return page;
  ensurePageKind(page);
  ensurePageFullBleed(page);
  ensurePageDefaultAllCapsTitle(page, options);
  return page;
}

function buildFallbackDefaultState(component) {
  const baselineLayouts = deepClone(component?.defaultLayouts || component?.layouts || {});
  const rawProps = component?.props && typeof component.props === "object" ? deepClone(component.props) : {};
  if (rawProps && typeof rawProps === "object") {
    delete rawProps.typography;
    delete rawProps.surface;
  }
  return {
    title: component?.title ?? "",
    body: component?.body ?? "",
    status: component?.status ?? "",
    props: normalizeTypographyProps(component?.type, rawProps),
    dataBindings: Array.isArray(component?.dataBindings) ? deepClone(component.dataBindings) : [],
    layouts: baselineLayouts,
  };
}

export function ensureComponentDefaultState(component) {
  if (!component || typeof component !== "object") return;
  if (component.defaultState && typeof component.defaultState === "object") return;
  component.defaultState = buildFallbackDefaultState(component);
}

export function resetComponentToDefaults(component) {
  if (!component || typeof component !== "object") return false;
  ensureComponentDefaultState(component);
  const state = component.defaultState && typeof component.defaultState === "object"
    ? deepClone(component.defaultState)
    : buildFallbackDefaultState(component);
  if (!state || typeof state !== "object") return false;

  component.title = state.title ?? "";
  component.body = state.body ?? "";
  component.status = state.status ?? "";
  component.props = normalizeTypographyProps(component.type, state.props && typeof state.props === "object" ? state.props : {});
  component.dataBindings = Array.isArray(state.dataBindings) ? deepClone(state.dataBindings) : [];

  const resetLayouts = state.layouts && typeof state.layouts === "object"
    ? deepClone(state.layouts)
    : deepClone(component.defaultLayouts || component.layouts || {});
  if (resetLayouts && typeof resetLayouts === "object" && Object.keys(resetLayouts).length) {
    component.layouts = deepClone(resetLayouts);
  }
  return true;
}

function makePageEditable(page) {
  if (!page) return page;
  page.layoutMode = "free";
  for (const component of page.components || []) {
    if (!component.layoutConstraints || typeof component.layoutConstraints !== "object") {
      component.layoutConstraints = {};
    }
    component.layoutConstraints.locked = false;
    component.layoutConstraints.allowedTypes = null;
    component.slotId = null;
  }
  return page;
}

function makeCoverPage() {
  return {
    id: uid("pg"),
    templateId: "cover_hero_landscape",
    pageKind: PAGE_KINDS.cover,
    fullBleed: true,
    theme: PAGE_THEMES.dark_intro,
    title: "Executive Readiness Pack",
    subtitle: "H1 2025",
    sectionId: "cover",
    showGrid: false,
    layoutMode: "template",
    components: [
      makeComponent({
        type: "cover_hero",
        title: "Executive Readiness Pack",
        body: "Immersive - All Rights Reserved 2025",
        props: {
          org: "ORCHID BANK",
          period: "H1 2025",
          imageAssetId: null,
          imageUrl:
            "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1800&q=80",
          overlay: "rgba(6,10,26,0.60)",
        },
        slotId: "cover-main",
        layoutConstraints: { locked: true, allowedTypes: ["cover_hero"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 30 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 42 },
          A4_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 31 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 44 },
        },
      }),
    ],
  };
}

function makeSectionIntro({ id, sectionIndex, sectionTitle, sectionBody, sectionMenu }) {
  return {
    id: uid("pg"),
    templateId: id,
    pageKind: defaultPageKind(id),
    fullBleed: true,
    theme: PAGE_THEMES.dark_intro,
    title: sectionTitle,
    subtitle: "",
    sectionId: sectionTitle,
    showGrid: false,
    layoutMode: "template",
    components: [
      makeComponent({
        type: "section_intro",
        title: sectionTitle,
        body: sectionBody,
        props: {
          sectionIndex,
          sectionMenu,
          primaryNav: GLOBAL_SECTION_NAV,
          activeSection: sectionTitle,
        },
        slotId: "section-intro",
        layoutConstraints: { locked: true, allowedTypes: ["section_intro"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 30 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 42 },
          A4_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 31 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 44 },
        },
      }),
    ],
  };
}

function makeBenchmarkIndustryPage() {
  return {
    id: uid("pg"),
    templateId: "benchmark_industry_light",
    pageKind: PAGE_KINDS.content,
    theme: PAGE_THEMES.light_data,
    title: "Benchmarking Against Your Industry",
    subtitle: "",
    sectionId: "Benchmarking",
    showGrid: false,
    layoutMode: "template",
    components: [
      makeComponent({
        type: "delta_card",
        title: "Defensive Team",
        body: "Your defensive team is 4% lower than average for coverage on MITRE ATT&CK defensive techniques.",
        status: "low",
        props: { delta: -4, unit: "%" },
        slotId: "delta-a",
        layoutConstraints: { locked: true, allowedTypes: ["delta_card"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 3, rowStart: 2, rowSpan: 7 },
          LETTER_portrait: { colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 7 },
          A4_landscape: { colStart: 1, colSpan: 3, rowStart: 2, rowSpan: 7 },
          A4_portrait: { colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 7 },
        },
      }),
      makeComponent({
        type: "delta_card",
        title: "Offensive Team",
        body: "Your offensive team is 7% lower than average for coverage on MITRE ATT&CK offensive techniques.",
        status: "low",
        props: { delta: -7, unit: "%" },
        slotId: "delta-b",
        layoutConstraints: { locked: true, allowedTypes: ["delta_card"] },
        layouts: {
          LETTER_landscape: { colStart: 4, colSpan: 3, rowStart: 2, rowSpan: 7 },
          LETTER_portrait: { colStart: 7, colSpan: 6, rowStart: 3, rowSpan: 7 },
          A4_landscape: { colStart: 4, colSpan: 3, rowStart: 2, rowSpan: 7 },
          A4_portrait: { colStart: 7, colSpan: 6, rowStart: 3, rowSpan: 7 },
        },
      }),
      makeComponent({
        type: "waffle_group",
        title: "Industry Highlights",
        props: {
          items: [
            { percent: 16, label: "Faster assigned learning completion than industry average.", accent: "var(--status-high)" },
            { percent: 14, label: "More scenarios completed than regional average.", accent: "var(--status-low)" },
            { percent: 12, label: "More CVE-related labs completed than peers.", accent: "var(--status-high)" },
          ],
        },
        slotId: "waffles",
        layoutConstraints: { locked: true, allowedTypes: ["waffle_group"] },
        layouts: {
          LETTER_landscape: { colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 10 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 11, rowSpan: 13 },
          A4_landscape: { colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 10 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 11, rowSpan: 13 },
        },
      }),
      makeComponent({
        type: "donut_pair",
        title: "Multipliers",
        props: {
          items: [
            { value: 1.08, unit: "x", label: "Developers learned remediation paths faster.", percent: 8 },
            { value: 1.04, unit: "x", label: "Responding to emerging threats faster.", percent: 4 },
          ],
        },
        slotId: "donuts",
        layoutConstraints: { locked: true, allowedTypes: ["donut_pair"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 10, rowSpan: 9 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 24, rowSpan: 10 },
          A4_landscape: { colStart: 1, colSpan: 6, rowStart: 10, rowSpan: 9 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 24, rowSpan: 10 },
        },
      }),
      makeComponent({
        type: "lollipop",
        title: "Average difficulty comparison",
        body: "The average difficulty level of your users is lower than the industry average.",
        props: {
          min: 5,
          max: 8,
          you: 6,
          benchmark: 7,
          leftLabel: "Your Average",
          rightLabel: "Industry Average",
        },
        slotId: "lollipop",
        layoutConstraints: { locked: true, allowedTypes: ["lollipop"] },
        layouts: {
          LETTER_landscape: { colStart: 7, colSpan: 6, rowStart: 12, rowSpan: 7 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 34, rowSpan: 8 },
          A4_landscape: { colStart: 7, colSpan: 6, rowStart: 12, rowSpan: 7 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 34, rowSpan: 8 },
        },
      }),
    ],
  };
}

function makeBenchmarkRegionPage() {
  return {
    id: uid("pg"),
    templateId: "benchmark_region_light",
    pageKind: PAGE_KINDS.content,
    theme: PAGE_THEMES.light_data,
    title: "Benchmarking Against Your Region",
    subtitle: "",
    sectionId: "Benchmarking",
    showGrid: false,
    layoutMode: "template",
    components: [
      makeComponent({
        type: "lollipop",
        title: "Average difficulty comparison",
        body: "Your users are below the regional industry average difficulty level.",
        props: { min: 5, max: 8, you: 6, benchmark: 7, leftLabel: "Your Average", rightLabel: "Industry Average" },
        slotId: "lollipop",
        layoutConstraints: { locked: true, allowedTypes: ["lollipop"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 7, rowStart: 2, rowSpan: 8 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 8 },
          A4_landscape: { colStart: 1, colSpan: 7, rowStart: 2, rowSpan: 8 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 8 },
        },
      }),
      makeComponent({
        type: "donut_pair",
        title: "Regional multipliers",
        props: {
          items: [
            { value: 0.92, unit: "x", label: "Fewer CVE-related labs completed.", percent: 8 },
            { value: 1.16, unit: "x", label: "Assigned learning paths completed faster.", percent: 16 },
          ],
        },
        slotId: "donuts",
        layoutConstraints: { locked: true, allowedTypes: ["donut_pair"] },
        layouts: {
          LETTER_landscape: { colStart: 8, colSpan: 5, rowStart: 2, rowSpan: 11 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 10, rowSpan: 11 },
          A4_landscape: { colStart: 8, colSpan: 5, rowStart: 2, rowSpan: 11 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 10, rowSpan: 11 },
        },
      }),
      makeComponent({
        type: "waffle_group",
        title: "Regional highlights",
        props: {
          items: [
            { percent: 12, label: "Faster threat response than regional average.", accent: "var(--status-high)" },
            { percent: 17, label: "More vulnerabilities learned by developers.", accent: "var(--status-high)" },
            { percent: 23, label: "More scenarios completed by workforce.", accent: "var(--status-high)" },
          ],
        },
        slotId: "waffles",
        layoutConstraints: { locked: true, allowedTypes: ["waffle_group"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 7, rowStart: 10, rowSpan: 11 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 21, rowSpan: 11 },
          A4_landscape: { colStart: 1, colSpan: 7, rowStart: 10, rowSpan: 11 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 21, rowSpan: 11 },
        },
      }),
      makeComponent({
        type: "delta_card",
        title: "Defensive Team",
        body: "Your defensive team is 4% lower than average for defensive techniques.",
        status: "low",
        props: { delta: -4, unit: "%" },
        slotId: "delta-a",
        layoutConstraints: { locked: true, allowedTypes: ["delta_card"] },
        layouts: {
          LETTER_landscape: { colStart: 8, colSpan: 2, rowStart: 13, rowSpan: 8 },
          LETTER_portrait: { colStart: 1, colSpan: 6, rowStart: 32, rowSpan: 8 },
          A4_landscape: { colStart: 8, colSpan: 2, rowStart: 13, rowSpan: 8 },
          A4_portrait: { colStart: 1, colSpan: 6, rowStart: 32, rowSpan: 8 },
        },
      }),
      makeComponent({
        type: "delta_card",
        title: "Offensive Team",
        body: "Your offensive team is 7% lower than average for offensive techniques.",
        status: "low",
        props: { delta: -7, unit: "%" },
        slotId: "delta-b",
        layoutConstraints: { locked: true, allowedTypes: ["delta_card"] },
        layouts: {
          LETTER_landscape: { colStart: 10, colSpan: 3, rowStart: 13, rowSpan: 8 },
          LETTER_portrait: { colStart: 7, colSpan: 6, rowStart: 32, rowSpan: 8 },
          A4_landscape: { colStart: 10, colSpan: 3, rowStart: 13, rowSpan: 8 },
          A4_portrait: { colStart: 7, colSpan: 6, rowStart: 32, rowSpan: 8 },
        },
      }),
    ],
  };
}

function makeThreatResponsePage() {
  return {
    id: uid("pg"),
    templateId: "threat_response_metrics_light",
    pageKind: PAGE_KINDS.content,
    theme: PAGE_THEMES.light_data,
    title: "CTI Lab Completion",
    subtitle: "",
    sectionId: "Threat Response",
    showGrid: false,
    layoutMode: "template",
    components: [
      makeComponent({
        type: "kpi",
        title: "CTI Lab Completion",
        body: "The overall performance score highlights an opportunity for improvement in CTI lab participation.",
        props: { value: 26, unit: "/100", delta: 45, updated: "26 Aug 2025" },
        status: "low",
        slotId: "kpi-main",
        layoutConstraints: { locked: true, allowedTypes: ["kpi"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 9 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 9 },
          A4_landscape: { colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 9 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 9 },
        },
      }),
      makeComponent({
        type: "response_time_pair",
        title: "MTTD / MTTE",
        props: {
          left: { label: "Mean Time To Detect", value: 100, unit: "MIN", accent: "var(--status-high)" },
          right: { label: "Mean Time To Escalate", value: 50, unit: "MIN", accent: "var(--status-blue)" },
        },
        slotId: "response-cards",
        layoutConstraints: { locked: true, allowedTypes: ["response_time_pair"] },
        layouts: {
          LETTER_landscape: { colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 5 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 11, rowSpan: 5 },
          A4_landscape: { colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 5 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 11, rowSpan: 5 },
        },
      }),
      makeComponent({
        type: "text",
        title: "Your mean time to detect and escalate are currently at an average level",
        body: "This means your team is identifying and escalating threats at a standard pace. Accelerating response times will significantly enhance your overall resilience and readiness.",
        slotId: "narrative",
        layoutConstraints: { locked: true, allowedTypes: ["text"] },
        layouts: {
          LETTER_landscape: { colStart: 7, colSpan: 6, rowStart: 7, rowSpan: 4 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 16, rowSpan: 4 },
          A4_landscape: { colStart: 7, colSpan: 6, rowStart: 7, rowSpan: 4 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 16, rowSpan: 4 },
        },
      }),
      makeComponent({
        type: "kpi_columns",
        title: "Operational KPIs",
        props: {
          items: [
            { label: "Users completed within a week", value: 6, status: "low" },
            { label: "Above industry benchmark", value: 99, unit: "%", status: "high" },
            { label: "Average completion time", value: 20, unit: "d", status: "medium" },
          ],
        },
        slotId: "kpi-columns",
        layoutConstraints: { locked: true, allowedTypes: ["kpi_columns"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 11, rowSpan: 8 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 20, rowSpan: 8 },
          A4_landscape: { colStart: 1, colSpan: 6, rowStart: 11, rowSpan: 8 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 20, rowSpan: 8 },
        },
      }),
      makeComponent({
        type: "line",
        title: "Score over time",
        props: {
          points: [
            { label: "Jan", value: 30 },
            { label: "Feb", value: 22 },
            { label: "Mar", value: 40 },
            { label: "Apr", value: 52 },
            { label: "May", value: 41 },
            { label: "Jun", value: 36 },
          ],
          max: 100,
          min: 0,
        },
        slotId: "line",
        layoutConstraints: { locked: true, allowedTypes: ["line"] },
        layouts: {
          LETTER_landscape: { colStart: 7, colSpan: 6, rowStart: 11, rowSpan: 8 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 28, rowSpan: 8 },
          A4_landscape: { colStart: 7, colSpan: 6, rowStart: 11, rowSpan: 8 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 28, rowSpan: 8 },
        },
      }),
    ],
  };
}

function makeRecommendationsPage() {
  return {
    id: uid("pg"),
    templateId: "recommendations_three_column_light",
    pageKind: PAGE_KINDS.content,
    theme: PAGE_THEMES.light_data,
    title: "Threat Response: Recommendations",
    subtitle: "",
    sectionId: "Threat Response",
    showGrid: false,
    layoutMode: "template",
    components: [
      makeComponent({
        type: "text",
        title:
          "Based on your recent threat response performance, here are personalized recommendations for your organization.",
        body: "",
        slotId: "heading",
        layoutConstraints: { locked: true, allowedTypes: ["text"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 4 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 4 },
          A4_landscape: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 4 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 4 },
        },
      }),
      makeComponent({
        type: "recommendation_card",
        title: "Assign CTI Labs",
        body: "Assign CTI labs as soon as they are released to users to elevate resilience score and confidence.",
        props: { ordinal: "01", badge: "Recommendation 1" },
        slotId: "rec-a",
        layoutConstraints: { locked: true, allowedTypes: ["recommendation_card"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 4, rowStart: 6, rowSpan: 12 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 6, rowSpan: 10 },
          A4_landscape: { colStart: 1, colSpan: 4, rowStart: 6, rowSpan: 12 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 6, rowSpan: 10 },
        },
      }),
      makeComponent({
        type: "recommendation_card",
        title: "Identify Internal Champions",
        body: "Identify users excelling in labs and position them as internal champions to drive engagement.",
        props: { ordinal: "02", badge: "Recommendation 2" },
        slotId: "rec-b",
        layoutConstraints: { locked: true, allowedTypes: ["recommendation_card"] },
        layouts: {
          LETTER_landscape: { colStart: 5, colSpan: 4, rowStart: 6, rowSpan: 12 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 16, rowSpan: 10 },
          A4_landscape: { colStart: 5, colSpan: 4, rowStart: 6, rowSpan: 12 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 16, rowSpan: 10 },
        },
      }),
      makeComponent({
        type: "recommendation_card",
        title: "Complete Upskill Labs",
        body: "Complete paired upskilling labs to strengthen MITRE ATT&CK coverage and close key skill gaps.",
        props: { ordinal: "03", badge: "Recommendation 3" },
        slotId: "rec-c",
        layoutConstraints: { locked: true, allowedTypes: ["recommendation_card"] },
        layouts: {
          LETTER_landscape: { colStart: 9, colSpan: 4, rowStart: 6, rowSpan: 12 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 26, rowSpan: 10 },
          A4_landscape: { colStart: 9, colSpan: 4, rowStart: 6, rowSpan: 12 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 26, rowSpan: 10 },
        },
      }),
    ],
  };
}

function makeTechnicalIntroPage() {
  return makeSectionIntro({
    id: "technical_skills_intro_dark",
    sectionIndex: "04",
    sectionTitle: "Technical Skills",
    sectionBody:
      "Technical skills are essential to defend your organization against both internal and external cyber threats. This section uses measurable evidence to highlight strengths, uncover gaps, and provide actionable recommendations.",
    sectionMenu: [
      "Introduction",
      "MITRE ATT&CK Coverage",
      "Upskilling Engagement",
      "Performance Analysis",
      "Recommendations",
    ],
  });
}

function makeExecutiveIntroPage() {
  return makeSectionIntro({
    id: "section_intro_dark",
    sectionIndex: "01",
    sectionTitle: "Executive Summary",
    sectionBody:
      "The Executive Readiness Pack transforms data directly from Immersive One into actionable insight for your board, auditors, and regulators.",
    sectionMenu: ["Introduction", "Resilience Score"],
  });
}

function makeAgendaPage() {
  return {
    id: uid("pg"),
    templateId: "agenda_dark",
    pageKind: PAGE_KINDS.agenda,
    fullBleed: true,
    theme: PAGE_THEMES.dark_intro,
    title: "Agenda",
    subtitle: "",
    sectionId: "Agenda",
    showGrid: false,
    layoutMode: "template",
    components: [
      makeComponent({
        type: "section_intro",
        title: "Agenda",
        body: "Executive Readiness Pack contents and reading order.",
        props: {
          sectionIndex: "00",
          sectionMenu: GLOBAL_SECTION_NAV,
          primaryNav: GLOBAL_SECTION_NAV,
          activeSection: "Agenda",
        },
        slotId: "agenda-main",
        layoutConstraints: { locked: true, allowedTypes: ["section_intro"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 30 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 42 },
          A4_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 31 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 44 },
        },
      }),
    ],
  };
}

function makeEndPage() {
  return {
    id: uid("pg"),
    templateId: "end_dark",
    pageKind: PAGE_KINDS.end,
    fullBleed: true,
    theme: PAGE_THEMES.dark_intro,
    title: "Closing",
    subtitle: "",
    sectionId: "Closing",
    showGrid: false,
    layoutMode: "template",
    components: [
      makeComponent({
        type: "cover_hero",
        title: "Thank You",
        body: "Immersive - All Rights Reserved 2026",
        props: {
          org: "Executive Readiness Pack",
          period: "End of Report",
          imageAssetId: null,
          imageUrl:
            "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1800&q=80",
          overlay: "rgba(6,10,26,0.68)",
        },
        slotId: "end-main",
        layoutConstraints: { locked: true, allowedTypes: ["cover_hero"] },
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 30 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 42 },
          A4_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 31 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 44 },
        },
      }),
    ],
  };
}

export const TEMPLATE_LIBRARY = [
  {
    id: "cover_hero_landscape",
    label: "Cover Hero",
    description: "Logo, organization, title, period and hero image.",
    theme: PAGE_THEMES.dark_intro,
    pageKind: PAGE_KINDS.cover,
    tags: ["cover", "landscape"],
    make: makeCoverPage,
  },
  {
    id: "section_intro_dark",
    label: "Section Intro (Dark)",
    description: "Left rail navigation and large section narrative.",
    theme: PAGE_THEMES.dark_intro,
    pageKind: PAGE_KINDS.divider,
    tags: ["intro", "dark"],
    make: makeExecutiveIntroPage,
  },
  {
    id: "agenda_dark",
    label: "Agenda (Dark)",
    description: "Full-bleed agenda overview page.",
    theme: PAGE_THEMES.dark_intro,
    pageKind: PAGE_KINDS.agenda,
    tags: ["agenda", "dark", "intro"],
    make: makeAgendaPage,
  },
  {
    id: "benchmark_industry_light",
    label: "Benchmark Industry",
    description: "Delta cards, waffle trio, donut metrics and lollipop panel.",
    theme: PAGE_THEMES.light_data,
    pageKind: PAGE_KINDS.content,
    tags: ["benchmark", "light"],
    make: makeBenchmarkIndustryPage,
  },
  {
    id: "benchmark_region_light",
    label: "Benchmark Region",
    description: "Regional comparison mix of lollipop, donuts, waffles and deltas.",
    theme: PAGE_THEMES.light_data,
    pageKind: PAGE_KINDS.content,
    tags: ["benchmark", "light"],
    make: makeBenchmarkRegionPage,
  },
  {
    id: "threat_response_metrics_light",
    label: "Threat Response Metrics",
    description: "Large KPI, response cards, KPI columns and line chart.",
    theme: PAGE_THEMES.light_data,
    pageKind: PAGE_KINDS.content,
    tags: ["threat", "metrics"],
    make: makeThreatResponsePage,
  },
  {
    id: "recommendations_three_column_light",
    label: "Recommendations (3 column)",
    description: "Three recommendation cards with heading narrative.",
    theme: PAGE_THEMES.light_data,
    pageKind: PAGE_KINDS.content,
    tags: ["recommendations"],
    make: makeRecommendationsPage,
  },
  {
    id: "technical_skills_intro_dark",
    label: "Technical Skills Intro",
    description: "Dark section intro configured for technical skills.",
    theme: PAGE_THEMES.dark_intro,
    pageKind: PAGE_KINDS.divider,
    tags: ["technical", "intro", "dark"],
    make: makeTechnicalIntroPage,
  },
  {
    id: "end_dark",
    label: "End Page (Dark)",
    description: "Closing full-bleed outro page.",
    theme: PAGE_THEMES.dark_intro,
    pageKind: PAGE_KINDS.end,
    tags: ["end", "dark", "outro"],
    make: makeEndPage,
  },
];

export const COMPONENT_LIBRARY = [
  { type: "text", label: "Text", description: "Heading and narrative paragraph.", category: "design" },
  { type: "all_caps_title", label: "Header 1", description: "Primary uppercase section title.", category: "design" },
  { type: "header_3", label: "Header 3", description: "Medium-weight heading style.", category: "design" },
  { type: "copy_block", label: "Copy Block", description: "Muted paragraph copy style.", category: "design" },
  { type: "kpi", label: "KPI", description: "Large number with optional unit and delta.", category: "metrics" },
  { type: "gauge", label: "Gauge", description: "Semi-arc gauge value.", category: "metrics" },
  { type: "line", label: "Line Chart", description: "Time-series trend line.", category: "charts" },
  { type: "bar", label: "Bar Chart", description: "Category bars for comparison.", category: "charts" },
  { type: "waffle", label: "Waffle", description: "10x10 completion grid.", category: "charts" },
  { type: "donut", label: "Donut", description: "Ring style ratio metric.", category: "charts" },
  { type: "lollipop", label: "Lollipop", description: "Your vs benchmark marker chart.", category: "charts" },
  { type: "recommendation_card", label: "Recommendation Card", description: "Targeted recommendation content card.", category: "cards" },
  { type: "delta_card", label: "Delta Card", description: "Status card with delta percent.", category: "cards" },
];

export function createPageFromTemplate(templateId) {
  const template = TEMPLATE_LIBRARY.find((entry) => entry.id === templateId);
  if (!template) return null;
  const page = makePageEditable(template.make());
  page.pageKind = template.pageKind || defaultPageKind(page.templateId);
  return enforcePageContracts(page, { syncTitle: true });
}

export function makeCustomPage(title = "Custom Page") {
  const page = {
    id: uid("pg"),
    templateId: "custom",
    pageKind: PAGE_KINDS.content,
    fullBleed: false,
    theme: PAGE_THEMES.light_data,
    title,
    subtitle: "",
    sectionId: "Custom",
    showGrid: false,
    layoutMode: "free",
    components: [
      makeComponent({
        type: "text",
        title: "Section Heading",
        body: "Use this page for custom composition.",
        layouts: {
          LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 6 },
          LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 6 },
          A4_landscape: { colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 6 },
          A4_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 6 },
        },
      }),
    ],
  };
  return enforcePageContracts(page, { syncTitle: true });
}

export function createInitialPages() {
  return [
    makeCoverPage(),
    makeAgendaPage(),
    makeExecutiveIntroPage(),
    makeBenchmarkIndustryPage(),
    makeBenchmarkRegionPage(),
    makeThreatResponsePage(),
    makeRecommendationsPage(),
    makeTechnicalIntroPage(),
    makeEndPage(),
  ].map((page) => {
    const editable = makePageEditable(page);
    return enforcePageContracts(editable, { syncTitle: true });
  });
}

export function buildComponentFromType(type) {
  if (type === "all_caps_title") {
    return makeComponent({
      type,
      title: "HEADER 1",
      body: "",
      props: {
        scale: 1,
        surface: {
          backgroundColor: "transparent",
          keyline: "none",
          keylineColor: "#D7D7E7",
        },
        typography: {
          title: {
            textTransform: "uppercase",
          },
        },
      },
      layoutConstraints: {
        locked: true,
        allowedTypes: ["all_caps_title"],
        minColSpan: 7,
        maxColSpan: 24,
        minRowSpan: 6,
        maxRowSpan: 18,
      },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 7, rowStart: 1, rowSpan: 6 },
        LETTER_portrait: { colStart: 1, colSpan: 11, rowStart: 1, rowSpan: 6 },
        A4_landscape: { colStart: 1, colSpan: 7, rowStart: 1, rowSpan: 6 },
        A4_portrait: { colStart: 1, colSpan: 11, rowStart: 1, rowSpan: 6 },
      },
    });
  }

  if (type === "header_3") {
    return makeComponent({
      type,
      title: "Header 3",
      body: "",
      props: { scale: 1 },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 5 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 5 },
        A4_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 5 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 5 },
      },
    });
  }

  if (type === "copy_block") {
    return makeComponent({
      type,
      title: "",
      body: "Developers are significantly more willing to engage with targeted, language-specific content. While still below the benchmark, the score of 35/100 is much better, and a majority of developers, 34 out of 67 (51%), have completed these modules.",
      props: { scale: 1 },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 7 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 7 },
        A4_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 7 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 7 },
      },
    });
  }

  if (type === "kpi") {
    return makeComponent({
      type,
      title: "KPI",
      body: "",
      props: { value: 72, unit: "%", delta: 5 },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 5 },
        LETTER_portrait: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 5 },
        A4_landscape: { colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 5 },
        A4_portrait: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 5 },
      },
    });
  }

  if (type === "gauge") {
    return makeComponent({
      type,
      title: "Gauge",
      body: "",
      props: { value: 54, max: 100, unit: "/100" },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 8 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 8 },
        A4_landscape: { colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 8 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 8 },
      },
    });
  }

  if (type === "line" || type === "bar") {
    return makeComponent({
      type,
      title: type === "line" ? "Trend" : "Bars",
      body: "",
      props: {
        points: [
          { label: "Jan", value: 30 },
          { label: "Feb", value: 42 },
          { label: "Mar", value: 38 },
          { label: "Apr", value: 50 },
          { label: "May", value: 58 },
          { label: "Jun", value: 62 },
        ],
        max: 100,
      },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 7 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 7 },
        A4_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 7 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 7 },
      },
    });
  }

  if (type === "waffle") {
    return makeComponent({
      type,
      title: "Completion",
      body: "",
      props: { percent: 68, accent: "var(--status-high)", label: "Completion metric" },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 8 },
        LETTER_portrait: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 8 },
        A4_landscape: { colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 8 },
        A4_portrait: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 8 },
      },
    });
  }

  if (type === "donut") {
    return makeComponent({
      type,
      title: "Ratio",
      body: "",
      props: { percent: 18, value: 1.18, unit: "x", label: "vs benchmark" },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 8 },
        LETTER_portrait: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 8 },
        A4_landscape: { colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 8 },
        A4_portrait: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 8 },
      },
    });
  }

  if (type === "lollipop") {
    return makeComponent({
      type,
      title: "Comparison",
      body: "",
      props: { min: 1, max: 10, you: 6, benchmark: 7, leftLabel: "You", rightLabel: "Benchmark" },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 6 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 6 },
        A4_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 6 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 6 },
      },
    });
  }

  if (type === "cover_hero") {
    return makeComponent({
      type,
      title: "Executive Readiness Pack",
      body: "Immersive - All Rights Reserved 2025",
      props: {
        org: "ORCHID BANK",
        period: "H1 2025",
        imageAssetId: null,
        imageUrl:
          "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1800&q=80",
        overlay: "rgba(6,10,26,0.60)",
      },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 30 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 42 },
        A4_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 31 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 44 },
      },
    });
  }

  if (type === "section_intro") {
    return makeComponent({
      type,
      title: "Executive Summary",
      body: "Transform your readiness data into board-ready action.",
      props: {
        sectionIndex: "01",
        sectionMenu: ["Introduction", "Resilience Score"],
        primaryNav: GLOBAL_SECTION_NAV,
        activeSection: "Executive Summary",
      },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 30 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 42 },
        A4_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 31 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 44 },
      },
    });
  }

  if (type === "waffle_group") {
    return makeComponent({
      type,
      title: "Industry Highlights",
      props: {
        items: [
          { percent: 16, label: "Faster assigned learning completion than industry average.", accent: "var(--status-high)" },
          { percent: 14, label: "More scenarios completed than regional average.", accent: "var(--status-low)" },
          { percent: 12, label: "More CVE-related labs completed than peers.", accent: "var(--status-high)" },
        ],
      },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 10 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 13 },
        A4_landscape: { colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 10 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 13 },
      },
    });
  }

  if (type === "donut_pair") {
    return makeComponent({
      type,
      title: "Multipliers",
      props: {
        items: [
          { value: 1.08, unit: "x", label: "Developers learned remediation paths faster.", percent: 8 },
          { value: 1.04, unit: "x", label: "Responding to emerging threats faster.", percent: 4 },
        ],
      },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 10 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 10 },
        A4_landscape: { colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 10 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 10 },
      },
    });
  }

  if (type === "response_time_pair") {
    return makeComponent({
      type,
      props: {
        left: { label: "Median", value: 36, unit: "h", accent: "var(--status-blue)" },
        right: { label: "P90", value: 68, unit: "h", accent: "var(--status-blue)" },
      },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 6 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 6 },
        A4_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 6 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 6 },
      },
    });
  }

  if (type === "kpi_columns") {
    return makeComponent({
      type,
      props: {
        items: [
          { status: "high", value: 91, unit: "%", label: "Threat simulations completed." },
          { status: "medium", value: 72, unit: "%", label: "Teams remediating within SLA." },
          { status: "low", value: 48, unit: "%", label: "Open critical exposures." },
        ],
      },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 7 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 9 },
        A4_landscape: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 7 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 9 },
      },
    });
  }

  if (type === "recommendation_card") {
    return makeComponent({
      type,
      title: "Recommendation",
      body: "Action recommendation text.",
      props: { ordinal: "01", badge: "Recommendation" },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 10 },
        LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 10 },
        A4_landscape: { colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 10 },
        A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 10 },
      },
    });
  }

  if (type === "delta_card") {
    return makeComponent({
      type,
      title: "Delta",
      body: "Delta explanation",
      status: "low",
      props: { delta: -4, unit: "%" },
      layouts: {
        LETTER_landscape: { colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 7 },
        LETTER_portrait: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 7 },
        A4_landscape: { colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 7 },
        A4_portrait: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 7 },
      },
    });
  }

  return makeComponent({
    type: "text",
    title: "Text",
    body: "",
    layouts: {
      LETTER_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 6 },
      LETTER_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 6 },
      A4_landscape: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 6 },
      A4_portrait: { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 6 },
    },
  });
}

export function clonePage(page) {
  const copy = deepClone(page);
  copy.id = uid("pg");
  copy.title = `${copy.title} (copy)`;
  copy.pageKind = VALID_PAGE_KINDS.has(String(copy.pageKind || "").trim())
    ? copy.pageKind
    : defaultPageKind(copy.templateId);
  copy.components = copy.components.map((component) => ({
    ...component,
    id: uid("cmp"),
  }));
  return enforcePageContracts(copy, { syncTitle: true });
}
