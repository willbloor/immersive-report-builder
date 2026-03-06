import { escapeHtml } from "../utils/helpers.js";

export const CHART_FAMILY_OPTIONS = [
  { key: "all", label: "All Families" },
  { key: "column", label: "Column" },
  { key: "bar", label: "Bar" },
  { key: "line", label: "Line" },
  { key: "area", label: "Area" },
  { key: "combo", label: "Combo" },
  { key: "pie", label: "Pie" },
  { key: "scatter", label: "Scatter" },
  { key: "advanced", label: "Advanced" },
];

export const CHART_VARIANTS = [
  { id: "column_clustered", family: "column", styleProfile: "figma_combo", label: "Clustered Column", description: "Compare categories side-by-side." },
  { id: "column_stacked", family: "column", styleProfile: "figma_combo", label: "Stacked Column", description: "Compare totals and composition." },
  { id: "column_100", family: "column", styleProfile: "figma_combo", label: "100% Stacked Column", description: "Compare percentage composition." },
  { id: "bar_clustered", family: "bar", styleProfile: "figma_bar", label: "Clustered Bar", description: "Horizontal category comparisons." },
  { id: "bar_stacked", family: "bar", styleProfile: "figma_bar", label: "Stacked Bar", description: "Horizontal totals + composition." },
  { id: "bar_100", family: "bar", styleProfile: "figma_bar", label: "100% Stacked Bar", description: "Horizontal percentage composition." },
  { id: "line_single", family: "line", styleProfile: "figma_line", label: "Line", description: "Single trend over categories/time." },
  { id: "line_multi", family: "line", styleProfile: "figma_line", label: "Multi-Line", description: "Multiple trend lines." },
  { id: "line_smooth", family: "line", styleProfile: "figma_line", label: "Smoothed Line", description: "Smoothed trend lines." },
  { id: "line_step", family: "line", styleProfile: "figma_line", label: "Step Line", description: "Step-wise value transitions." },
  { id: "area_standard", family: "area", styleProfile: "figma_line", label: "Area", description: "Filled trend area." },
  { id: "area_stacked", family: "area", styleProfile: "figma_line", label: "Stacked Area", description: "Stacked filled trends." },
  { id: "area_100", family: "area", styleProfile: "figma_line", label: "100% Stacked Area", description: "Percentage-filled stacked trends." },
  { id: "combo_column_line", family: "combo", styleProfile: "figma_combo", label: "Column + Line", description: "Bar and line in one chart." },
  { id: "combo_dual_axis", family: "combo", styleProfile: "figma_combo", label: "Dual Axis Combo", description: "Secondary axis comparison." },
  { id: "pie_standard", family: "pie", styleProfile: "normalized", label: "Pie", description: "Part-to-whole slices." },
  { id: "pie_donut", family: "pie", styleProfile: "figma_donut_offset", label: "Donut", description: "Ring-style part-to-whole." },
  { id: "scatter_standard", family: "scatter", styleProfile: "normalized", label: "Scatter", description: "Relationship between two numeric fields." },
  { id: "scatter_bubble", family: "scatter", styleProfile: "normalized", label: "Bubble", description: "Scatter with size dimension." },
  { id: "histogram", family: "advanced", styleProfile: "normalized", label: "Histogram", description: "Distribution by value bins." },
  { id: "waterfall", family: "advanced", styleProfile: "normalized", label: "Waterfall", description: "Running deltas and total change." },
  { id: "treemap", family: "advanced", styleProfile: "normalized", label: "Treemap", description: "Hierarchy/category area comparison." },
  { id: "heatmap", family: "advanced", styleProfile: "normalized", label: "Heatmap", description: "Matrix intensity by value." },
  { id: "radar", family: "advanced", styleProfile: "figma_radar", label: "Radar", description: "Multi-metric radial comparison." },
  { id: "funnel", family: "advanced", styleProfile: "normalized", label: "Funnel", description: "Stage drop-off comparison." },
  // Legacy compatibility variants used for auto-migration.
  { id: "gauge", family: "advanced", styleProfile: "normalized", label: "Gauge", description: "Semi-arc gauge value.", hidden: true },
  { id: "lollipop", family: "advanced", styleProfile: "normalized", label: "Lollipop", description: "Target vs benchmark marker chart.", hidden: true },
  { id: "waffle", family: "advanced", styleProfile: "normalized", label: "Waffle", description: "10x10 completion grid.", hidden: true },
];

const VARIANT_MAP = new Map(CHART_VARIANTS.map((variant) => [variant.id, variant]));

export const LEGACY_CHART_VARIANT_BY_TYPE = {
  line: "line_single",
  bar: "bar_clustered",
  donut: "pie_donut",
  waffle: "waffle",
  lollipop: "lollipop",
  gauge: "gauge",
};

export function chartVariantById(variantId) {
  return VARIANT_MAP.get(String(variantId || "").trim()) || VARIANT_MAP.get("line_single");
}

export function chartVariantsForFamily(familyKey = "all") {
  const key = String(familyKey || "all").trim().toLowerCase();
  return CHART_VARIANTS.filter((variant) => {
    if (variant.hidden) return false;
    if (key === "all") return true;
    return variant.family === key;
  });
}

function seedRowsForVariant(variantId) {
  const id = chartVariantById(variantId).id;
  const dualSeriesRows = [
    { category: "Jan", series: "Series A", value: 34, value2: 22, target: 40 },
    { category: "Jan", series: "Series B", value: 22, value2: 18, target: 32 },
    { category: "Feb", series: "Series A", value: 41, value2: 28, target: 45 },
    { category: "Feb", series: "Series B", value: 29, value2: 24, target: 34 },
    { category: "Mar", series: "Series A", value: 38, value2: 31, target: 42 },
    { category: "Mar", series: "Series B", value: 31, value2: 26, target: 36 },
    { category: "Apr", series: "Series A", value: 49, value2: 35, target: 50 },
    { category: "Apr", series: "Series B", value: 37, value2: 29, target: 40 },
  ];
  switch (id) {
    case "column_clustered":
    case "column_stacked":
    case "column_100":
    case "bar_clustered":
    case "bar_stacked":
    case "bar_100":
    case "line_single":
    case "line_multi":
    case "line_smooth":
    case "line_step":
    case "area_standard":
    case "area_stacked":
    case "area_100":
      return dualSeriesRows;
    case "scatter_standard":
      return [
        { x: 12, value: 28, series: "Group A", size: 16, label: "A1" },
        { x: 16, value: 34, series: "Group A", size: 22, label: "A2" },
        { x: 22, value: 31, series: "Group B", size: 18, label: "B1" },
        { x: 28, value: 45, series: "Group B", size: 24, label: "B2" },
      ];
    case "scatter_bubble":
      return [
        { x: 10, value: 18, series: "North", size: 24, label: "N" },
        { x: 18, value: 27, series: "North", size: 36, label: "N2" },
        { x: 26, value: 22, series: "South", size: 30, label: "S" },
        { x: 34, value: 36, series: "South", size: 44, label: "S2" },
      ];
    case "pie_standard":
    case "pie_donut":
    case "treemap":
    case "funnel":
      return [
        { category: "Category A", value: 42, series: "Series A", target: 52 },
        { category: "Category B", value: 31, series: "Series A", target: 38 },
        { category: "Category C", value: 24, series: "Series A", target: 30 },
        { category: "Category D", value: 16, series: "Series A", target: 22 },
      ];
    case "histogram":
      return [
        { category: "Sample 1", value: 5 },
        { category: "Sample 2", value: 9 },
        { category: "Sample 3", value: 11 },
        { category: "Sample 4", value: 16 },
        { category: "Sample 5", value: 18 },
        { category: "Sample 6", value: 20 },
        { category: "Sample 7", value: 26 },
        { category: "Sample 8", value: 29 },
      ];
    case "waterfall":
      return [
        { category: "Start", value: 120 },
        { category: "Gain", value: 32 },
        { category: "Loss", value: -18 },
        { category: "Final", value: 134 },
      ];
    case "heatmap":
      return [
        { category: "Mon", series: "Morning", value: 14 },
        { category: "Mon", series: "Evening", value: 19 },
        { category: "Tue", series: "Morning", value: 17 },
        { category: "Tue", series: "Evening", value: 11 },
        { category: "Wed", series: "Morning", value: 22 },
        { category: "Wed", series: "Evening", value: 15 },
      ];
    case "radar":
      return [
        { category: "Detect", series: "Team A", value: 72 },
        { category: "Respond", series: "Team A", value: 63 },
        { category: "Recover", series: "Team A", value: 58 },
        { category: "Detect", series: "Team B", value: 65 },
        { category: "Respond", series: "Team B", value: 68 },
        { category: "Recover", series: "Team B", value: 61 },
      ];
    case "combo_dual_axis":
      return [
        { category: "Jan", value: 36, value2: 72, series: "Series A", target: 48 },
        { category: "Feb", value: 42, value2: 69, series: "Series A", target: 52 },
        { category: "Mar", value: 39, value2: 74, series: "Series A", target: 50 },
        { category: "Apr", value: 47, value2: 77, series: "Series A", target: 56 },
      ];
    default:
      return [
        { category: "Jan", value: 34, value2: 22, series: "Series A", target: 40 },
        { category: "Feb", value: 41, value2: 28, series: "Series A", target: 45 },
        { category: "Mar", value: 38, value2: 31, series: "Series A", target: 42 },
        { category: "Apr", value: 49, value2: 35, series: "Series A", target: 50 },
      ];
  }
}

function stackModeForVariant(variantId) {
  const id = chartVariantById(variantId).id;
  if (id.endsWith("_100") || id === "area_100" || id === "bar_100") return "percent";
  if (id.includes("_stacked")) return "stack";
  return "none";
}

export function defaultChartModel(variantId = "line_single") {
  const variant = chartVariantById(variantId);
  return {
    family: variant.family,
    variant: variant.id,
    visual: {
      showLegend: true,
      showLabels: false,
      useBrandDefaults: true,
      paletteOverride: [],
      palette: "",
      smooth: variant.id === "line_smooth",
      step: variant.id === "line_step",
    },
    axis: {
      xType: "auto",
      yMin: null,
      yMax: null,
      y2Min: null,
      y2Max: null,
      dateMode: "auto",
    },
    format: {
      decimals: null,
      prefix: "",
      suffix: "",
    },
    overrides: {},
    seedRows: seedRowsForVariant(variant.id),
  };
}

function defaultMappingForVariant(variantId = "line_single") {
  const id = chartVariantById(variantId).id;
  const base = {
    x: "category",
    y: ["value"],
    y2: "",
    series: "series",
    size: "size",
    color: "",
    target: "target",
    label: "label",
  };

  if (id === "scatter_standard" || id === "scatter_bubble") {
    return { ...base, x: "x", y: ["value"], series: "series", size: "size" };
  }
  if (id === "histogram") {
    return { ...base, x: "", y: ["value"], series: "", target: "" };
  }
  if (id === "pie_standard" || id === "pie_donut" || id === "treemap" || id === "funnel") {
    return { ...base, x: "category", y: ["value"], series: "", y2: "", size: "", target: "" };
  }
  if (id === "combo_dual_axis") {
    return { ...base, x: "category", y: ["value"], y2: "value2", series: "", target: "target" };
  }
  if (id === "combo_column_line") {
    return { ...base, x: "category", y: ["value"], y2: "value2", series: "", target: "" };
  }
  if (id === "heatmap") {
    return { ...base, x: "category", y: ["value"], series: "series", y2: "", size: "", target: "" };
  }
  if (id === "radar") {
    return { ...base, x: "category", y: ["value"], series: "series", y2: "", size: "", target: "" };
  }
  if (id === "gauge") {
    return { ...base, x: "", y: ["value"], series: "", y2: "", size: "", target: "target" };
  }
  if (id === "lollipop") {
    return { ...base, x: "category", y: ["value"], series: "", y2: "", size: "", target: "target" };
  }
  if (id === "waffle") {
    return { ...base, x: "category", y: ["value"], series: "", y2: "", size: "", target: "" };
  }
  return base;
}

export function defaultChartBinding(variantId = "line_single") {
  return {
    mode: "chart_roles_v1",
    datasetId: "",
    mapping: defaultMappingForVariant(variantId),
    transforms: {
      aggregation: "sum",
      sortBy: "x",
      sortDir: "asc",
      topN: "",
      stackMode: stackModeForVariant(variantId),
    },
  };
}

function previewForFamily(family) {
  switch (family) {
    case "column":
      return '<div class="palette-preview palette-preview--bars"><span></span><span></span><span></span></div>';
    case "bar":
      return '<div class="palette-preview palette-preview--bars palette-preview--bars-horizontal"><span></span><span></span><span></span></div>';
    case "line":
      return '<div class="palette-preview palette-preview--spark"><span></span></div>';
    case "area":
      return '<div class="palette-preview palette-preview--area"><span></span></div>';
    case "combo":
      return '<div class="palette-preview palette-preview--combo"><span></span></div>';
    case "pie":
      return '<div class="palette-preview palette-preview--donut"><span></span></div>';
    case "scatter":
      return '<div class="palette-preview palette-preview--scatter"><span></span></div>';
    case "advanced":
      return '<div class="palette-preview palette-preview--advanced"><span></span></div>';
    default:
      return '<div class="palette-preview palette-preview--spark"><span></span></div>';
  }
}

export function chartVariantPreviewHtml(variantId) {
  const variant = chartVariantById(variantId);
  return previewForFamily(variant.family);
}

export function chartVariantCardHtml(variant) {
  const preview = chartVariantPreviewHtml(variant.id);
  return `
    <div class="drawer-card drawer-card--component chart-variant-card" draggable="true" data-drag="chart:${escapeHtml(variant.id)}" data-chart-variant="${escapeHtml(variant.id)}">
      ${preview}
      <strong>${escapeHtml(variant.label)}</strong>
      <span>${escapeHtml(variant.description || "")}</span>
      <button class="icon-btn" type="button" data-add-chart-variant="${escapeHtml(variant.id)}">Add</button>
    </div>
  `;
}
