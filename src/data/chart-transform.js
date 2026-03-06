import { deepClone, toNumber } from "../utils/helpers.js";
import {
  chartVariantById,
  defaultChartBinding,
  defaultChartModel,
  LEGACY_CHART_VARIANT_BY_TYPE,
} from "./chart-registry.js";

export const LEGACY_CHART_TYPES = new Set(Object.keys(LEGACY_CHART_VARIANT_BY_TYPE));

function asNonEmptyString(value) {
  const text = String(value || "").trim();
  return text || "";
}

function normalizeYList(value, fallback = ["value"]) {
  if (Array.isArray(value)) {
    const out = value.map((entry) => asNonEmptyString(entry)).filter(Boolean);
    if (out.length > 0) return out;
  }
  const one = asNonEmptyString(value);
  if (one) return [one];
  return [...fallback];
}

function isDateLike(value) {
  if (value == null || value === "") return false;
  if (value instanceof Date && Number.isFinite(value.getTime())) return true;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed);
}

export function inferColumnsFromRows(rows = []) {
  const keys = new Set();
  (rows || []).forEach((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    Object.keys(row).forEach((key) => keys.add(key));
  });

  return [...keys].map((key) => {
    let numeric = 0;
    let dateLike = 0;
    let nonEmpty = 0;
    rows.forEach((row) => {
      const value = row?.[key];
      if (value === "" || value == null) return;
      nonEmpty += 1;
      if (typeof value === "number" && Number.isFinite(value)) {
        numeric += 1;
      } else if (isDateLike(value)) {
        dateLike += 1;
      } else {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) numeric += 1;
      }
    });

    const majorityThreshold = Math.max(1, Math.ceil(nonEmpty * 0.6));
    let type = "string";
    if (numeric >= majorityThreshold) type = "number";
    else if (dateLike >= majorityThreshold) type = "date";
    return { key, type };
  });
}

function firstOfType(columns = [], type) {
  return columns.find((column) => column.type === type)?.key || "";
}

function firstNotType(columns = [], type) {
  return columns.find((column) => column.type !== type)?.key || "";
}

function defaultMappingForColumns(columns = []) {
  const numeric = columns.filter((column) => column.type === "number").map((column) => column.key);
  const dates = columns.filter((column) => column.type === "date").map((column) => column.key);
  const text = columns.filter((column) => column.type !== "number").map((column) => column.key);
  const xCandidate = dates[0] || text[0] || columns[0]?.key || "";
  const seriesCandidate = text.find((key) => key !== xCandidate) || "";

  return {
    x: xCandidate,
    y: numeric.length ? [numeric[0]] : columns[0]?.key ? [columns[0].key] : ["value"],
    y2: numeric[1] || "",
    series: seriesCandidate,
    size: numeric[2] || numeric[1] || "",
    color: "",
    target: numeric[1] || "",
    label: "",
  };
}

export function autoFillChartMapping(mapping, columns = [], variantId = "line_single") {
  const fallback = defaultMappingForColumns(columns);
  const next = {
    ...fallback,
    ...(mapping || {}),
  };

  next.x = asNonEmptyString(next.x) || fallback.x;
  next.y = normalizeYList(next.y, fallback.y);
  next.y2 = asNonEmptyString(next.y2);
  next.series = asNonEmptyString(next.series);
  next.size = asNonEmptyString(next.size);
  next.color = asNonEmptyString(next.color);
  next.target = asNonEmptyString(next.target);
  next.label = asNonEmptyString(next.label);

  const variant = chartVariantById(variantId).id;
  if (variant === "histogram") {
    next.x = "";
    next.series = "";
  }
  if (variant === "pie_standard" || variant === "pie_donut" || variant === "treemap" || variant === "funnel") {
    next.series = "";
    next.y2 = "";
    next.size = "";
  }
  if (variant === "scatter_standard") {
    const numeric = columns.filter((column) => column.type === "number").map((column) => column.key);
    next.x = asNonEmptyString(next.x) || numeric[0] || fallback.x;
    next.y = normalizeYList(next.y, [numeric[1] || numeric[0] || "value"]);
    next.series = asNonEmptyString(next.series);
    next.size = "";
  }
  if (variant === "scatter_bubble") {
    const numeric = columns.filter((column) => column.type === "number").map((column) => column.key);
    next.x = asNonEmptyString(next.x) || numeric[0] || fallback.x;
    next.y = normalizeYList(next.y, [numeric[1] || numeric[0] || "value"]);
    next.size = asNonEmptyString(next.size) || numeric[2] || numeric[1] || "";
  }
  if (variant === "gauge") {
    next.x = "";
    next.series = "";
    next.y2 = "";
    next.size = "";
  }
  if (variant === "lollipop") {
    next.series = "";
    next.y2 = "";
    next.size = "";
  }
  if (variant === "waffle") {
    next.series = "";
    next.y2 = "";
    next.size = "";
  }

  return next;
}

function normalizeTransforms(transforms = {}, variantId = "line_single") {
  const baseline = defaultChartBinding(variantId).transforms;
  const stackMode = asNonEmptyString(transforms.stackMode || baseline.stackMode || "none");
  return {
    aggregation: asNonEmptyString(transforms.aggregation || baseline.aggregation || "sum"),
    sortBy: asNonEmptyString(transforms.sortBy || baseline.sortBy || "x"),
    sortDir: asNonEmptyString(transforms.sortDir || baseline.sortDir || "asc"),
    topN: asNonEmptyString(transforms.topN),
    stackMode: ["none", "stack", "percent"].includes(stackMode) ? stackMode : "none",
  };
}

function normalizePaletteOverride(input) {
  if (Array.isArray(input)) {
    return input.map((entry) => asNonEmptyString(entry)).filter(Boolean);
  }
  if (typeof input === "string") {
    return input.split(",").map((entry) => asNonEmptyString(entry)).filter(Boolean);
  }
  return [];
}

export function normalizeChartModel(chartInput = {}, variantIdFallback = "line_single") {
  const fallbackVariant = chartVariantById(chartInput?.variant || variantIdFallback).id;
  const defaults = defaultChartModel(fallbackVariant);
  const incomingVisual = chartInput?.visual || {};
  const paletteOverride = normalizePaletteOverride(incomingVisual.paletteOverride || incomingVisual.palette);
  return {
    ...defaults,
    ...(chartInput || {}),
    family: chartVariantById(chartInput?.variant || fallbackVariant).family,
    variant: chartVariantById(chartInput?.variant || fallbackVariant).id,
    visual: {
      ...defaults.visual,
      ...incomingVisual,
      useBrandDefaults: incomingVisual.useBrandDefaults !== false,
      paletteOverride,
    },
    axis: {
      ...defaults.axis,
      ...(chartInput?.axis || {}),
    },
    format: {
      ...defaults.format,
      ...(chartInput?.format || {}),
    },
    overrides: {
      ...defaults.overrides,
      ...(chartInput?.overrides || {}),
    },
    seedRows: Array.isArray(chartInput?.seedRows) && chartInput.seedRows.length > 0
      ? deepClone(chartInput.seedRows)
      : deepClone(defaults.seedRows),
  };
}

export function normalizeChartBinding(bindingInput = {}, variantId = "line_single", columns = []) {
  const defaults = defaultChartBinding(variantId);
  const mode = asNonEmptyString(bindingInput.mode || defaults.mode) || "chart_roles_v1";
  const mapping = autoFillChartMapping(
    { ...(defaults.mapping || {}), ...(bindingInput.mapping || {}) },
    columns,
    variantId,
  );
  const transforms = normalizeTransforms(
    { ...(defaults.transforms || {}), ...(bindingInput.transforms || {}) },
    variantId,
  );
  return {
    mode,
    datasetId: asNonEmptyString(bindingInput.datasetId || defaults.datasetId),
    mapping,
    transforms,
  };
}

function rowsForChart(chartModel, dataset) {
  if (dataset && Array.isArray(dataset.rows) && dataset.rows.length > 0) {
    return deepClone(dataset.rows);
  }
  if (Array.isArray(chartModel.seedRows) && chartModel.seedRows.length > 0) {
    return deepClone(chartModel.seedRows);
  }
  return [];
}

export function buildChartRuntimeConfig(component, datasets = []) {
  const chartModel = normalizeChartModel(component?.props?.chart || {}, "line_single");
  const incomingBinding = Array.isArray(component?.dataBindings)
    ? component.dataBindings.find((binding) => String(binding?.mode || "").startsWith("chart_roles"))
    : null;
  const dataset = incomingBinding?.datasetId
    ? (datasets || []).find((entry) => entry.id === incomingBinding.datasetId)
    : null;
  const rows = rowsForChart(chartModel, dataset);
  const columns = Array.isArray(dataset?.columns) && dataset.columns.length > 0
    ? dataset.columns
    : inferColumnsFromRows(rows);
  const binding = normalizeChartBinding(
    incomingBinding || defaultChartBinding(chartModel.variant),
    chartModel.variant,
    columns,
  );

  return {
    variant: chartModel.variant,
    family: chartModel.family,
    rows,
    columns,
    mapping: binding.mapping,
    transforms: binding.transforms,
    visual: chartModel.visual,
    axis: chartModel.axis,
    format: chartModel.format,
    overrides: chartModel.overrides,
    datasetId: binding.datasetId || "",
  };
}

function convertLegacyPoints(points = []) {
  return (points || []).map((point) => ({
    category: String(point?.label || ""),
    value: toNumber(point?.value, 0),
    series: "Series A",
  }));
}

function migrateLegacyBinding(binding, variantId) {
  if (!binding || typeof binding !== "object") {
    return defaultChartBinding(variantId);
  }
  const next = defaultChartBinding(variantId);
  next.datasetId = asNonEmptyString(binding.datasetId || "");

  if (binding.mode === "series") {
    next.mapping.x = asNonEmptyString(binding.mapping?.labelColumn || next.mapping.x);
    next.mapping.y = normalizeYList(binding.mapping?.valueColumn || next.mapping.y?.[0], next.mapping.y);
    return next;
  }

  if (variantId === "lollipop") {
    next.mapping.y = normalizeYList(binding.mapping?.youColumn || next.mapping.y?.[0], next.mapping.y);
    next.mapping.target = asNonEmptyString(binding.mapping?.benchmarkColumn || next.mapping.target);
    next.transforms.sortBy = "none";
    return next;
  }

  next.mapping.y = normalizeYList(binding.mapping?.valueColumn || next.mapping.y?.[0], next.mapping.y);
  next.transforms.sortBy = "none";
  return next;
}

export function migrateLegacyChartComponent(component) {
  if (!component || typeof component !== "object") return component;
  const legacyType = String(component.type || "").trim();
  const variantId = LEGACY_CHART_VARIANT_BY_TYPE[legacyType];
  if (!variantId) return component;

  const legacyProps = deepClone(component.props || {});
  const chartModel = normalizeChartModel({}, variantId);
  const nextBinding = migrateLegacyBinding(component.dataBindings?.[0], variantId);

  if (legacyType === "line" || legacyType === "bar") {
    chartModel.seedRows = convertLegacyPoints(legacyProps.points || []);
    if (legacyType === "bar") chartModel.family = "bar";
    if (legacyProps.max != null) chartModel.axis.yMax = toNumber(legacyProps.max, null);
    if (legacyProps.min != null) chartModel.axis.yMin = toNumber(legacyProps.min, null);
    const legacyPalette = normalizePaletteOverride(legacyProps.color);
    if (legacyPalette.length) chartModel.visual.paletteOverride = legacyPalette;
  } else if (legacyType === "donut") {
    const value = toNumber(legacyProps.value ?? legacyProps.percent, 0);
    chartModel.seedRows = [{ category: legacyProps.label || "Value", value }];
    chartModel.format.suffix = legacyProps.unit || "";
    const legacyPalette = normalizePaletteOverride(legacyProps.color);
    if (legacyPalette.length) chartModel.visual.paletteOverride = legacyPalette;
  } else if (legacyType === "waffle") {
    const percent = toNumber(legacyProps.percent, 0);
    chartModel.seedRows = [{ category: legacyProps.label || "Completion", value: percent }];
    chartModel.format.suffix = "%";
    const legacyPalette = normalizePaletteOverride(legacyProps.accent || legacyProps.color);
    if (legacyPalette.length) chartModel.visual.paletteOverride = legacyPalette;
  } else if (legacyType === "lollipop") {
    chartModel.seedRows = [
      {
        category: legacyProps.leftLabel || "You",
        value: toNumber(legacyProps.you, 0),
        target: toNumber(legacyProps.benchmark, 0),
      },
    ];
    const legacyPalette = normalizePaletteOverride([legacyProps.youColor, legacyProps.benchmarkColor]);
    if (legacyPalette.length) chartModel.visual.paletteOverride = legacyPalette;
  } else if (legacyType === "gauge") {
    chartModel.seedRows = [
      {
        category: legacyProps.title || "Gauge",
        value: toNumber(legacyProps.value, 0),
        target: toNumber(legacyProps.max, 100),
      },
    ];
    chartModel.format.suffix = legacyProps.unit || "";
    const legacyPalette = normalizePaletteOverride(legacyProps.color);
    if (legacyPalette.length) chartModel.visual.paletteOverride = legacyPalette;
  }

  return {
    ...component,
    type: "chart",
    props: {
      ...legacyProps,
      chart: chartModel,
    },
    dataBindings: [nextBinding],
  };
}
