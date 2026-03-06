import { chartVariantById } from "../data/chart-registry.js";
import { startPerfTimer } from "../utils/perf.js";
import {
  createChartValueFormatter,
  readBrandChartTheme,
  readCssVar,
  resolveChartPalette,
  resolveThemeColor,
} from "./chart-theme.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch.map((entry) => (isObject(entry) ? deepMerge({}, entry) : entry));
  if (!isObject(base) || !isObject(patch)) return patch;
  const out = { ...base };
  Object.keys(patch).forEach((key) => {
    const baseValue = out[key];
    const patchValue = patch[key];
    if (isObject(baseValue) && isObject(patchValue)) {
      out[key] = deepMerge(baseValue, patchValue);
      return;
    }
    if (Array.isArray(patchValue)) {
      out[key] = patchValue.map((entry) => (isObject(entry) ? deepMerge({}, entry) : entry));
      return;
    }
    out[key] = patchValue;
  });
  return out;
}

const instances = new Map();
let resizeBound = false;

function parseConfig(host) {
  const raw = host.dataset.chartConfig || "";
  if (!raw) return {};
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch (_error) {
    return {};
  }
}

function cssVar(name, fallback) {
  return readCssVar(name, fallback);
}

function resolveColor(value, fallback) {
  return resolveThemeColor(value, fallback);
}

function asKey(value) {
  const key = String(value || "").trim();
  return key || "";
}

function safeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row === "object" && !Array.isArray(row));
}

function unique(values) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const key = `${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

function isDateLike(value) {
  if (value == null || value === "") return false;
  if (value instanceof Date) return Number.isFinite(value.getTime());
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed);
}

function asTimeValue(value) {
  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isFinite(ts) ? ts : null;
  }
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) ? ts : null;
}

function asCategory(value, index) {
  const text = String(value ?? "").trim();
  return text || `Item ${index + 1}`;
}

function getYKeys(mapping = {}) {
  if (Array.isArray(mapping.y) && mapping.y.length) {
    const list = mapping.y.map((entry) => asKey(entry)).filter(Boolean);
    if (list.length) return list;
  }
  const single = asKey(mapping.y);
  return single ? [single] : ["value"];
}

function seriesLabelForKey(key) {
  const text = String(key || "Value")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Value";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function paletteForRuntime(runtime = {}, theme = readBrandChartTheme()) {
  return resolveChartPalette(runtime?.visual || {}, runtime?.overrides || {}, theme).map((entry) => resolveColor(entry, entry));
}

function formatFactory(format = {}) {
  return createChartValueFormatter(format);
}

function axisBound(raw) {
  if (raw == null || raw === "") return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function aggregate(values, mode) {
  const list = values.filter((value) => Number.isFinite(value));
  if (!list.length) return 0;
  switch (mode) {
    case "avg":
    case "average":
      return list.reduce((sum, value) => sum + value, 0) / list.length;
    case "min":
      return Math.min(...list);
    case "max":
      return Math.max(...list);
    case "count":
      return list.length;
    case "sum":
    default:
      return list.reduce((sum, value) => sum + value, 0);
  }
}

function aggregateRows(rows, mapping, variant, aggregation = "sum") {
  if (["scatter_standard", "scatter_bubble", "histogram", "waterfall"].includes(variant)) {
    return rows.slice();
  }

  const xKey = asKey(mapping?.x);
  const seriesKey = asKey(mapping?.series);
  const yKeys = getYKeys(mapping);
  const numericKeys = unique([
    ...yKeys,
    asKey(mapping?.y2),
    asKey(mapping?.target),
    asKey(mapping?.size),
  ].filter(Boolean));

  if (!numericKeys.length) return rows.slice();

  const groups = new Map();
  rows.forEach((row, index) => {
    const xValue = xKey ? row[xKey] : index;
    const seriesValue = seriesKey ? row[seriesKey] : "";
    const key = `${String(xValue)}__${String(seriesValue)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        first: row,
        xValue,
        seriesValue,
        values: new Map(numericKeys.map((field) => [field, []])),
      };
      groups.set(key, group);
    }
    numericKeys.forEach((field) => {
      group.values.get(field).push(toNumber(row[field], 0));
    });
  });

  return Array.from(groups.values()).map((group) => {
    const next = { ...group.first };
    if (xKey) next[xKey] = group.xValue;
    if (seriesKey) next[seriesKey] = group.seriesValue;
    numericKeys.forEach((field) => {
      next[field] = aggregate(group.values.get(field), aggregation);
    });
    return next;
  });
}

function sortRows(rows, mapping, transforms = {}) {
  const sortBy = asKey(transforms.sortBy || "x").toLowerCase();
  if (!sortBy || sortBy === "none") return rows.slice();
  const sortDir = asKey(transforms.sortDir || "asc").toLowerCase() === "desc" ? -1 : 1;
  const yKey = getYKeys(mapping)[0];
  const key = sortBy === "x"
    ? asKey(mapping?.x)
    : sortBy === "y"
      ? yKey
      : sortBy === "series"
        ? asKey(mapping?.series)
        : sortBy;
  if (!key) return rows.slice();

  const sorted = rows.slice().sort((a, b) => {
    const aRaw = a?.[key];
    const bRaw = b?.[key];

    if (isDateLike(aRaw) && isDateLike(bRaw)) {
      return (asTimeValue(aRaw) - asTimeValue(bRaw)) * sortDir;
    }

    const aNum = Number(aRaw);
    const bNum = Number(bRaw);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
      return (aNum - bNum) * sortDir;
    }

    return String(aRaw ?? "").localeCompare(String(bRaw ?? "")) * sortDir;
  });

  return sorted;
}

function applyTopN(rows, transforms = {}) {
  const topN = Math.round(Number(transforms.topN));
  if (!Number.isFinite(topN) || topN <= 0) return rows;
  return rows.slice(0, topN);
}

function rowsForVariant(runtime, variantId) {
  const rows = safeRows(runtime?.rows);
  const mapping = runtime?.mapping || {};
  const transforms = runtime?.transforms || {};
  const aggregated = aggregateRows(rows, mapping, variantId, transforms.aggregation || "sum");
  const sorted = sortRows(aggregated, mapping, transforms);
  return applyTopN(sorted, transforms);
}

function effectiveStackMode(runtime, variantId) {
  const explicit = asKey(runtime?.transforms?.stackMode || "none").toLowerCase();
  if (["none", "stack", "percent"].includes(explicit)) return explicit;
  if (variantId.endsWith("_100") || variantId === "area_100") return "percent";
  if (variantId.includes("stacked")) return "stack";
  return "none";
}

function buildCategoryMatrix(rows, runtime) {
  const mapping = runtime?.mapping || {};
  const xKey = asKey(mapping.x);
  const seriesKey = asKey(mapping.series);
  const yKeys = getYKeys(mapping);
  const y2Key = asKey(mapping.y2);
  const targetKey = asKey(mapping.target);

  const categories = unique(rows.map((row, index) => asCategory(xKey ? row?.[xKey] : index + 1, index)));
  const categoryIndex = new Map(categories.map((category, index) => [category, index]));
  const seriesMap = new Map();

  const hasSeriesColumn = seriesKey && rows.some((row) => asKey(row?.[seriesKey]));
  const useYColumnsAsSeries = !hasSeriesColumn && yKeys.length > 1;

  function ensureSeries(name) {
    const key = asKey(name) || "Value";
    if (!seriesMap.has(key)) {
      seriesMap.set(key, { name: key, data: new Array(categories.length).fill(0) });
    }
    return seriesMap.get(key);
  }

  const y2Data = new Array(categories.length).fill(0);
  const targetData = new Array(categories.length).fill(0);

  rows.forEach((row, index) => {
    const category = asCategory(xKey ? row?.[xKey] : index + 1, index);
    const categoryPos = categoryIndex.get(category);
    if (categoryPos == null) return;

    if (hasSeriesColumn) {
      const seriesName = asCategory(row?.[seriesKey], 0);
      const entry = ensureSeries(seriesName);
      entry.data[categoryPos] += toNumber(row?.[yKeys[0]], 0);
    } else if (useYColumnsAsSeries) {
      yKeys.forEach((key) => {
        const entry = ensureSeries(seriesLabelForKey(key));
        entry.data[categoryPos] += toNumber(row?.[key], 0);
      });
    } else {
      const entry = ensureSeries(runtime?.overrides?.seriesName || "Value");
      entry.data[categoryPos] += toNumber(row?.[yKeys[0]], 0);
    }

    if (y2Key) y2Data[categoryPos] += toNumber(row?.[y2Key], 0);
    if (targetKey) targetData[categoryPos] += toNumber(row?.[targetKey], 0);
  });

  return {
    categories,
    seriesEntries: Array.from(seriesMap.values()),
    y2Data,
    targetData,
  };
}

function normalizePercentStack(seriesEntries, categoryCount) {
  const totals = new Array(categoryCount).fill(0);
  seriesEntries.forEach((entry) => {
    entry.data.forEach((value, index) => {
      totals[index] += Math.max(0, toNumber(value, 0));
    });
  });

  return seriesEntries.map((entry) => ({
    ...entry,
    data: entry.data.map((value, index) => {
      const total = totals[index];
      if (!total) return 0;
      return (toNumber(value, 0) / total) * 100;
    }),
  }));
}

function detectLineAxisType(runtime, categories) {
  const explicit = asKey(runtime?.axis?.xType || "auto").toLowerCase();
  if (explicit && explicit !== "auto") return explicit;

  const dateMode = asKey(runtime?.axis?.dateMode || "auto").toLowerCase();
  if (dateMode === "time") return "time";
  if (dateMode === "category") return "category";

  if (!categories.length) return "category";
  const dateLike = categories.filter((value) => isDateLike(value)).length;
  return dateLike >= Math.ceil(categories.length * 0.6) ? "time" : "category";
}

function defaultGrid({ horizontal = false, chartTheme = null } = {}) {
  const theme = chartTheme || readBrandChartTheme();
  const themedGrid = horizontal ? theme?.grid?.horizontal : theme?.grid?.vertical;
  if (themedGrid && typeof themedGrid === "object") {
    return { ...themedGrid };
  }
  return horizontal
    ? { top: 16, right: 20, bottom: 18, left: 90, containLabel: true }
    : { top: 16, right: 18, bottom: 28, left: 42, containLabel: true };
}

function defaultTextStyle(theme = null) {
  const chartTheme = theme || readBrandChartTheme();
  return {
    textStyle: {
      fontFamily: chartTheme.typography.fontFamily,
      color: chartTheme.typography.textColor,
    },
  };
}

function labelsEnabled(runtime) {
  return runtime?.visual?.showLabels === true;
}

function legendEnabled(runtime) {
  return runtime?.visual?.showLegend !== false;
}

function resolveRuntimeTheme(runtime = {}, variantId = "") {
  const resolvedVariantId = asKey(variantId) || asKey(runtime?.variant) || "line_single";
  const brandTheme = readBrandChartTheme();
  const variantMeta = chartVariantById(resolvedVariantId);
  const profileKey = asKey(variantMeta?.styleProfile || "normalized");
  const profileTheme = brandTheme?.profiles?.[profileKey] || brandTheme?.profiles?.normalized || {};
  const mergedTheme = deepMerge(brandTheme, profileTheme);
  return {
    ...mergedTheme,
    styleProfile: profileKey,
    palette: paletteForRuntime(runtime, mergedTheme),
    useBrandDefaults: runtime?.visual?.useBrandDefaults !== false,
  };
}

function maybeUppercaseLabel(value, chartTheme) {
  const text = String(value ?? "");
  if (chartTheme?.axis?.xUppercase !== true) return text;
  return text.toUpperCase();
}

function formatMonoTick(value, chartTheme, formatValue) {
  const formatted = typeof formatValue === "function" ? String(formatValue(value)) : String(value ?? "");
  const integerLike = formatted.match(/^(-?)(\d+)(%?)$/);
  if (!integerLike) return formatted;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return formatted;
  const width = Math.max(2, Math.round(toNumber(chartTheme?.axis?.monoTickWidth, 3)));
  const sign = integerLike[1] || (numeric < 0 ? "-" : "");
  const whole = String(Math.round(Math.abs(numeric))).padStart(width, "0");
  return `${sign}${whole}${integerLike[3] || ""}`;
}

function normalizedPointForScatter(point, index, categories, axisType) {
  if (Array.isArray(point)) {
    if (point.length >= 2) return [point[0], toNumber(point[1], 0)];
    return [axisType === "category" ? categories[index] : index, toNumber(point[0], 0)];
  }
  if (point && typeof point === "object") {
    if (Array.isArray(point.value) && point.value.length >= 2) {
      return [point.value[0], toNumber(point.value[1], 0)];
    }
    if (Number.isFinite(Number(point.value))) {
      return [axisType === "category" ? categories[index] : index, toNumber(point.value, 0)];
    }
    return null;
  }
  if (!Number.isFinite(Number(point))) return null;
  return [axisType === "category" ? categories[index] : index, toNumber(point, 0)];
}

function buildLineEndpointEmphasis(seriesEntry, axisType, categories, chartTheme) {
  if (!seriesEntry || !Array.isArray(seriesEntry.data)) return [];
  let point = null;
  for (let i = seriesEntry.data.length - 1; i >= 0; i -= 1) {
    point = normalizedPointForScatter(seriesEntry.data[i], i, categories, axisType);
    if (point) break;
  }
  if (!point) return [];

  const accentColor = chartTheme?.series?.endpointAccentColor || chartTheme?.palette?.[0] || "#3C64FF";
  const haloColor = chartTheme?.series?.endpointHaloColor || "rgba(60,100,255,0.22)";
  const haloSize = toNumber(chartTheme?.series?.endpointHaloSize, 24);
  const dotSize = toNumber(chartTheme?.series?.endpointDotSize, 10);
  const surfaceColor = chartTheme?.surface?.panelSoftColor || "#F5F5F9";

  return [
    {
      name: "",
      type: "scatter",
      data: [point],
      symbolSize: haloSize,
      silent: true,
      tooltip: { show: false },
      emphasis: { disabled: true },
      itemStyle: {
        color: haloColor,
      },
      z: 5,
    },
    {
      name: "",
      type: "scatter",
      data: [point],
      symbolSize: dotSize,
      silent: true,
      tooltip: { show: false },
      emphasis: { disabled: true },
      itemStyle: {
        color: accentColor,
        borderColor: surfaceColor,
        borderWidth: 2,
      },
      z: 6,
    },
  ];
}

function normalizeAxisTheme(axisInput, chartTheme, formatValue) {
  if (!axisInput || typeof axisInput !== "object") return axisInput;
  const next = {
    ...axisInput,
  };
  const numericAxis = ["value", "log"].includes(String(next.type || "").toLowerCase());
  const axisFontFamily = chartTheme.typography.axisFontFamily || chartTheme.typography.fontFamily;
  const axisFontSize = toNumber(next.axisLabel?.fontSize, toNumber(chartTheme.axis?.labelFontSize, 11));
  next.axisLabel = {
    ...(next.axisLabel || {}),
    color: chartTheme.axis.labelColor,
    fontSize: axisFontSize,
    fontFamily: axisFontFamily,
    fontFeatureSettings: next.axisLabel?.fontFeatureSettings || chartTheme.typography.numericFeatureSettings,
  };
  if (numericAxis && typeof next.axisLabel.formatter !== "function") {
    next.axisLabel.formatter = (value) => formatValue(value);
  }
  next.axisLine = {
    ...(next.axisLine || {}),
    lineStyle: {
      ...((next.axisLine || {}).lineStyle || {}),
      color: chartTheme.axis.lineColor,
    },
  };
  next.axisTick = {
    ...(next.axisTick || {}),
    lineStyle: {
      ...((next.axisTick || {}).lineStyle || {}),
      color: chartTheme.axis.tickColor,
    },
  };
  if ((next.splitLine || {}).show !== false) {
    next.splitLine = {
      ...(next.splitLine || {}),
      lineStyle: {
        ...((next.splitLine || {}).lineStyle || {}),
        color: chartTheme.axis.splitLineColor,
        type: ((next.splitLine || {}).lineStyle || {}).type || chartTheme.axis.splitLineType || "dashed",
      },
    };
  }
  return next;
}

function normalizeSeriesTheme(seriesList, chartTheme) {
  if (!Array.isArray(seriesList)) return seriesList;
  const dataLabelFontFamily = chartTheme.typography.dataLabelFontFamily || chartTheme.typography.fontFamily;
  const lineWidth = toNumber(chartTheme.series?.lineWidth, 2.5);
  const symbolSize = toNumber(chartTheme.series?.symbolSize, 6);
  const symbolBorderColor = chartTheme.series?.symbolBorderColor || "#FFFFFF";
  const symbolBorderWidth = toNumber(chartTheme.series?.symbolBorderWidth, 1.25);
  return seriesList.map((series, index) => {
    if (!series || typeof series !== "object") return series;
    const next = { ...series };
    next.label = {
      ...(next.label || {}),
      fontFamily: dataLabelFontFamily,
      fontSize: next.label?.fontSize ?? 10,
      color: chartTheme.typography.valueLabelColor,
      fontFeatureSettings: next.label?.fontFeatureSettings || chartTheme.typography.numericFeatureSettings,
    };
    if (next.type === "line") {
      next.lineStyle = {
        ...(next.lineStyle || {}),
        width: next.lineStyle?.width ?? lineWidth,
        color: chartTheme.palette[index % chartTheme.palette.length],
      };
      next.itemStyle = {
        ...(next.itemStyle || {}),
        color: chartTheme.palette[index % chartTheme.palette.length],
        borderColor: next.itemStyle?.borderColor || symbolBorderColor,
        borderWidth: next.itemStyle?.borderWidth ?? symbolBorderWidth,
      };
      next.symbolSize = next.symbolSize ?? symbolSize;
    } else if (next.type === "bar" || next.type === "scatter") {
      next.itemStyle = {
        ...(next.itemStyle || {}),
        color: next.itemStyle?.color || chartTheme.palette[index % chartTheme.palette.length],
      };
    }
    return next;
  });
}

function applyBrandDefaults(optionInput, runtime, chartTheme, formatValue) {
  if (!optionInput || typeof optionInput !== "object") return optionInput;
  if (chartTheme.useBrandDefaults === false) return optionInput;

  const option = {
    ...optionInput,
    ...defaultTextStyle(chartTheme),
    color: chartTheme.palette,
    backgroundColor: optionInput.backgroundColor || "transparent",
  };

  option.tooltip = {
    ...(option.tooltip || {}),
    backgroundColor: chartTheme.tooltip.backgroundColor,
    borderColor: chartTheme.tooltip.borderColor,
    borderWidth: chartTheme.tooltip.borderWidth,
    textStyle: {
      ...((option.tooltip || {}).textStyle || {}),
      color: chartTheme.tooltip.textColor,
      fontFamily: chartTheme.typography.fontFamily,
      fontSize: 11,
    },
  };
  if (typeof option.tooltip.valueFormatter !== "function") {
    option.tooltip.valueFormatter = (value) => formatValue(value);
  }

  if (option.legend && typeof option.legend === "object") {
    option.legend = {
      ...option.legend,
      ...(chartTheme.legend?.top != null ? { top: chartTheme.legend.top } : {}),
      ...(chartTheme.legend?.itemWidth != null ? { itemWidth: chartTheme.legend.itemWidth } : {}),
      ...(chartTheme.legend?.itemHeight != null ? { itemHeight: chartTheme.legend.itemHeight } : {}),
      textStyle: {
        ...(option.legend.textStyle || {}),
        color: chartTheme.legend.textColor,
        fontFamily: chartTheme.typography.fontFamily,
        fontSize: 11,
      },
    };
  }

  if (Array.isArray(option.xAxis)) {
    option.xAxis = option.xAxis.map((axis) => normalizeAxisTheme(axis, chartTheme, formatValue));
  } else {
    option.xAxis = normalizeAxisTheme(option.xAxis, chartTheme, formatValue);
  }
  if (Array.isArray(option.yAxis)) {
    option.yAxis = option.yAxis.map((axis) => normalizeAxisTheme(axis, chartTheme, formatValue));
  } else {
    option.yAxis = normalizeAxisTheme(option.yAxis, chartTheme, formatValue);
  }
  option.series = normalizeSeriesTheme(option.series, chartTheme);

  const optionOverride = runtime?.overrides?.option;
  if (optionOverride && typeof optionOverride === "object" && !Array.isArray(optionOverride)) {
    return {
      ...option,
      ...optionOverride,
    };
  }
  return option;
}

function buildGaugeOption(config) {
  const max = Math.max(1, toNumber(config.max, 100));
  const min = toNumber(config.min, 0);
  const value = clamp(toNumber(config.value, 0), min, max);

  return {
    animation: false,
    ...defaultTextStyle(),
    series: [
      {
        type: "gauge",
        center: ["50%", "76%"],
        radius: "125%",
        startAngle: 180,
        endAngle: 0,
        min,
        max,
        pointer: { show: false },
        progress: {
          show: true,
          roundCap: true,
          width: 16,
          itemStyle: {
            color: resolveColor(config.color, cssVar("--status-blue", "#5972d6")),
          },
        },
        axisLine: {
          lineStyle: {
            width: 16,
            color: [[1, resolveColor(config.trackColor, cssVar("--brand-silver", "#d7d7e7"))]],
          },
        },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        detail: { show: false },
        title: { show: false },
        data: [{ value }],
      },
    ],
  };
}

function buildLineOption(config) {
  const points = Array.isArray(config.points) ? config.points : [];
  const labels = points.map((row) => String(row.label || ""));
  const values = points.map((row) => toNumber(row.value, 0));
  const max = Math.max(1, toNumber(config.max, Math.max(...values, 100)));
  const min = toNumber(config.min, 0);

  return {
    animation: false,
    tooltip: { show: false },
    ...defaultTextStyle(),
    grid: defaultGrid(),
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: labels,
      axisLabel: {
        fontSize: 10,
        color: "rgba(23,24,28,0.50)",
      },
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: "rgba(23,24,28,0.16)",
        },
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min,
      max,
      splitNumber: 4,
      axisLabel: {
        fontSize: 10,
        color: "rgba(23,24,28,0.45)",
      },
      axisTick: { show: false },
      axisLine: {
        lineStyle: {
          color: "rgba(23,24,28,0.18)",
        },
      },
      splitLine: {
        lineStyle: {
          color: "rgba(23,24,28,0.10)",
          type: "dashed",
        },
      },
    },
    series: [
      {
        type: "line",
        smooth: true,
        data: values,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: {
          width: 3,
          color: resolveColor(config.color, cssVar("--status-blue", "#5972d6")),
        },
        itemStyle: {
          color: "#ffffff",
          borderColor: "rgba(23,24,28,0.45)",
          borderWidth: 1.5,
        },
      },
    ],
  };
}

function buildBarOption(config) {
  const points = Array.isArray(config.points) ? config.points : [];
  const categories = points.map((row) => String(row.label || ""));
  const values = points.map((row) => toNumber(row.value, 0));
  const max = Math.max(1, toNumber(config.max, Math.max(...values, 100)));

  return {
    animation: false,
    tooltip: { show: false },
    ...defaultTextStyle(),
    grid: defaultGrid({ horizontal: true }),
    xAxis: {
      type: "value",
      min: 0,
      max,
      axisLabel: {
        fontSize: 10,
        color: "rgba(23,24,28,0.45)",
      },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: categories,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        fontSize: 10,
        color: "rgba(23,24,28,0.60)",
      },
    },
    series: [
      {
        type: "bar",
        data: values,
        barWidth: 13,
        showBackground: true,
        backgroundStyle: {
          color: "rgba(23,24,28,0.08)",
          borderRadius: 10,
        },
        itemStyle: {
          color: resolveColor(config.color, "rgba(23,24,28,0.72)"),
          borderRadius: 10,
        },
      },
    ],
  };
}

function buildDonutOption(config) {
  const percent = clamp(toNumber(config.percent, 0), 0, 100);
  return {
    animation: false,
    tooltip: { show: false },
    series: [
      {
        type: "pie",
        radius: ["73%", "86%"],
        center: ["50%", "50%"],
        startAngle: 90,
        silent: true,
        label: { show: false },
        data: [
          {
            value: percent,
            itemStyle: {
              color: resolveColor(config.color, cssVar("--status-blue", "#5972d6")),
            },
          },
          {
            value: 100 - percent,
            itemStyle: {
              color: resolveColor(config.trackColor, cssVar("--brand-silver", "#d7d7e7")),
            },
          },
        ],
      },
    ],
  };
}

function buildLollipopOption(config) {
  const min = toNumber(config.min, 0);
  const max = Math.max(min + 1, toNumber(config.max, 10));
  const values = [
    clamp(toNumber(config.you, min), min, max),
    clamp(toNumber(config.benchmark, min), min, max),
  ];
  const labels = [config.leftLabel || "Your Average", config.rightLabel || "Benchmark"];
  const youColor = resolveColor(config.youColor, cssVar("--status-blue", "#3C64FF"));
  const benchmarkColor = resolveColor(config.benchmarkColor, "rgba(23,24,28,0.72)");

  return {
    animation: false,
    tooltip: { show: false },
    ...defaultTextStyle(),
    grid: defaultGrid(),
    xAxis: {
      type: "category",
      data: labels,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        fontSize: 10,
        color: "rgba(23,24,28,0.65)",
      },
    },
    yAxis: {
      type: "value",
      min,
      max,
      splitNumber: 2,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        fontSize: 10,
        color: "rgba(23,24,28,0.45)",
      },
      splitLine: {
        lineStyle: {
          color: "rgba(23,24,28,0.16)",
        },
      },
    },
    series: [
      {
        type: "bar",
        data: [
          { value: values[0], itemStyle: { color: youColor } },
          { value: values[1], itemStyle: { color: benchmarkColor } },
        ],
        barWidth: 2,
        z: 1,
      },
      {
        type: "scatter",
        data: values,
        symbolSize: 20,
        itemStyle: {
          color: (params) => (params.dataIndex === 0 ? youColor : benchmarkColor),
        },
        label: {
          show: true,
          formatter: (params) => String(params.value),
          color: "#ffffff",
          fontSize: 10,
          fontFamily: "Chivo Mono, monospace",
          fontWeight: 600,
        },
        z: 3,
      },
    ],
  };
}

function buildColumnOrBarOption(runtime, variantId, horizontal = false, chartTheme = resolveRuntimeTheme(runtime, variantId)) {
  const formatValue = formatFactory(runtime?.format || {});
  const rows = rowsForVariant(runtime, variantId);
  const matrix = buildCategoryMatrix(rows, runtime);
  const stackMode = effectiveStackMode(runtime, variantId);
  const seriesEntries = stackMode === "percent"
    ? normalizePercentStack(matrix.seriesEntries, matrix.categories.length)
    : matrix.seriesEntries;
  const palette = chartTheme.palette;
  const barRadiusVertical = Array.isArray(chartTheme.series?.barRadiusVertical) ? chartTheme.series.barRadiusVertical : [6, 6, 0, 0];
  const barRadiusHorizontal = Array.isArray(chartTheme.series?.barRadiusHorizontal) ? chartTheme.series.barRadiusHorizontal : [0, 6, 6, 0];
  const barMaxWidth = horizontal
    ? toNumber(chartTheme.series?.barMaxWidthHorizontal, toNumber(chartTheme.series?.barMaxWidth, 34))
    : toNumber(chartTheme.series?.barMaxWidth, 34);
  const useMonochrome = horizontal
    && seriesEntries.length === 1
    && chartTheme.series?.preferMonochromeForSingleSeries === true;
  const monochromeColor = chartTheme.series?.horizontalBarMonochromeColor || chartTheme.semantic.neutral;
  const axisFontSize = toNumber(chartTheme.axis?.labelFontSize, 11);

  const series = seriesEntries.map((entry, index) => ({
    name: entry.name,
    type: "bar",
    data: entry.data,
    stack: stackMode === "none" ? undefined : "total",
    barMaxWidth,
    label: {
      show: labelsEnabled(runtime),
      formatter: ({ value }) => formatValue(value),
      color: chartTheme.series?.labelColor || "rgba(16,22,44,0.85)",
      fontSize: axisFontSize,
    },
    itemStyle: {
      borderRadius: horizontal ? barRadiusHorizontal : barRadiusVertical,
      color: useMonochrome ? monochromeColor : palette[index % palette.length],
    },
  }));

  const valueAxisMin = stackMode === "percent" ? 0 : axisBound(runtime?.axis?.yMin);
  const valueAxisMax = stackMode === "percent" ? 100 : axisBound(runtime?.axis?.yMax);

  const option = {
    animation: false,
    ...defaultTextStyle(),
    color: palette,
    grid: defaultGrid({ horizontal, chartTheme }),
    legend: {
      show: legendEnabled(runtime),
      top: chartTheme.legend?.top ?? 0,
    },
    tooltip: {
      trigger: horizontal ? "axis" : "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value) => formatValue(value),
    },
    series,
  };

  if (horizontal) {
    option.xAxis = {
      type: "value",
      min: valueAxisMin,
      max: valueAxisMax,
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
        formatter: (value) => formatValue(value),
      },
      splitLine: {
        show: chartTheme.axis?.xSplitLineShow === true,
        lineStyle: {
          color: chartTheme.axis.splitLineColor,
          type: chartTheme.axis.splitLineType || "dashed",
        },
      },
      axisLine: {
        show: chartTheme.axis?.xAxisLineShow !== false,
      },
      axisTick: { show: false },
    };
    option.yAxis = {
      type: "category",
      data: matrix.categories,
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.yAxisLineShow === true,
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
      },
    };
  } else {
    option.xAxis = {
      type: "category",
      data: matrix.categories,
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.xAxisLineShow !== false,
        lineStyle: {
          color: chartTheme.axis.lineColor,
        },
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
        rotate: toNumber(chartTheme.axis?.xRotate, 0),
        formatter: (value) => maybeUppercaseLabel(value, chartTheme),
      },
      splitLine: {
        show: chartTheme.axis?.xSplitLineShow === true,
        lineStyle: {
          color: chartTheme.axis.splitLineColor,
          type: chartTheme.axis.splitLineType || "dashed",
        },
      },
    };
    option.yAxis = {
      type: "value",
      min: valueAxisMin,
      max: valueAxisMax,
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
        formatter: (value) => formatValue(value),
      },
      splitLine: {
        show: chartTheme.axis?.ySplitLineShow !== false,
        lineStyle: {
          color: chartTheme.axis.splitLineColor,
          type: chartTheme.axis.splitLineType || "dashed",
        },
      },
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.yAxisLineShow === true,
      },
    };
  }

  return option;
}

function buildTimeLineSeries(rows, runtime) {
  const mapping = runtime?.mapping || {};
  const xKey = asKey(mapping.x);
  const yKeys = getYKeys(mapping);
  const seriesKey = asKey(mapping.series);
  const map = new Map();

  function ensure(name) {
    const key = asKey(name) || "Value";
    if (!map.has(key)) {
      map.set(key, { name: key, data: [] });
    }
    return map.get(key);
  }

  const hasSeriesColumn = seriesKey && rows.some((row) => asKey(row?.[seriesKey]));
  const useYColumnsAsSeries = !hasSeriesColumn && yKeys.length > 1;

  rows.forEach((row) => {
    const ts = asTimeValue(row?.[xKey]);
    if (!Number.isFinite(ts)) return;

    if (hasSeriesColumn) {
      const entry = ensure(asCategory(row?.[seriesKey], 0));
      entry.data.push([ts, toNumber(row?.[yKeys[0]], 0)]);
      return;
    }

    if (useYColumnsAsSeries) {
      yKeys.forEach((key) => {
        const entry = ensure(seriesLabelForKey(key));
        entry.data.push([ts, toNumber(row?.[key], 0)]);
      });
      return;
    }

    const entry = ensure(runtime?.overrides?.seriesName || "Value");
    entry.data.push([ts, toNumber(row?.[yKeys[0]], 0)]);
  });

  return Array.from(map.values()).map((entry) => ({
    ...entry,
    data: entry.data.sort((a, b) => a[0] - b[0]),
  }));
}

function buildLineOrAreaOption(runtime, variantId, isArea = false, chartTheme = resolveRuntimeTheme(runtime, variantId)) {
  const formatValue = formatFactory(runtime?.format || {});
  const rows = rowsForVariant(runtime, variantId);
  const matrix = buildCategoryMatrix(rows, runtime);
  const axisType = detectLineAxisType(runtime, matrix.categories);
  const smooth = variantId === "line_smooth" || runtime?.visual?.smooth === true;
  const step = variantId === "line_step" || runtime?.visual?.step === true;
  const stackMode = effectiveStackMode(runtime, variantId);
  const palette = chartTheme.palette;
  const lineWidth = toNumber(chartTheme.series?.lineWidth, 2.5);
  const symbolSize = toNumber(chartTheme.series?.symbolSize, 6);
  const areaOpacity = toNumber(chartTheme.series?.areaOpacity, 0.22);
  const areaOpacityPercent = toNumber(chartTheme.series?.areaOpacityPercent, 0.85);
  const axisFontSize = toNumber(chartTheme.axis?.labelFontSize, 11);
  const neutralLineColor = chartTheme.series?.neutralLineColor || "rgba(23,24,28,0.52)";

  let seriesEntries = matrix.seriesEntries;
  if (axisType === "time") {
    seriesEntries = buildTimeLineSeries(rows, runtime);
  }
  if (variantId === "line_single" && seriesEntries.length > 1) {
    seriesEntries = [seriesEntries[0]];
  }
  if (stackMode === "percent" && axisType !== "time") {
    seriesEntries = normalizePercentStack(seriesEntries, matrix.categories.length);
  }

  const series = seriesEntries.map((entry, index) => ({
    name: entry.name,
    type: "line",
    data: entry.data,
    smooth,
    step: step ? "end" : false,
    stack: stackMode === "none" ? undefined : "total",
    symbol: "circle",
    symbolSize,
    lineStyle: {
      width: lineWidth,
      color: chartTheme.series?.useNeutralLineForSingleSeries === true && seriesEntries.length === 1
        ? neutralLineColor
        : palette[index % palette.length],
    },
    areaStyle: isArea
      ? {
          opacity: stackMode === "percent" ? areaOpacityPercent : areaOpacity,
        }
      : undefined,
    itemStyle: {
      color: chartTheme.series?.useNeutralLineForSingleSeries === true && seriesEntries.length === 1
        ? neutralLineColor
        : palette[index % palette.length],
    },
    label: {
      show: labelsEnabled(runtime),
      formatter: ({ value }) => {
        if (Array.isArray(value)) return formatValue(value[1]);
        return formatValue(value);
      },
      fontSize: axisFontSize,
      color: chartTheme.series?.labelColor || "rgba(16,22,44,0.85)",
    },
  }));

  if (chartTheme.series?.endpointEmphasis === true && !isArea && series.length === 1) {
    series.push(...buildLineEndpointEmphasis(series[0], axisType, matrix.categories, chartTheme));
  }

  const axisMin = stackMode === "percent" ? 0 : axisBound(runtime?.axis?.yMin);
  const axisMax = stackMode === "percent" ? 100 : axisBound(runtime?.axis?.yMax);

  return {
    animation: false,
    ...defaultTextStyle(),
    color: palette,
    grid: defaultGrid({ chartTheme }),
    legend: {
      show: legendEnabled(runtime),
      top: chartTheme.legend?.top ?? 0,
    },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => formatValue(value),
    },
    xAxis: {
      type: axisType,
      data: axisType === "category" ? matrix.categories : undefined,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.xAxisLineShow !== false,
        lineStyle: {
          color: chartTheme.axis.lineColor,
        },
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
        rotate: axisType === "category" ? toNumber(chartTheme.axis?.xRotate, 0) : 0,
        formatter: axisType === "category"
          ? (value) => maybeUppercaseLabel(value, chartTheme)
          : undefined,
      },
      splitLine: {
        show: chartTheme.axis?.xSplitLineShow === true,
        lineStyle: {
          color: chartTheme.axis.splitLineColor,
          type: chartTheme.axis.splitLineType || "dashed",
        },
      },
    },
    yAxis: {
      type: "value",
      min: axisMin,
      max: axisMax,
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
        formatter: (value) => {
          if (chartTheme.axis?.padMonoPercentTicks === true) {
            return formatMonoTick(value, chartTheme, formatValue);
          }
          return formatValue(value);
        },
      },
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.yAxisLineShow === true,
      },
      splitLine: {
        show: chartTheme.axis?.ySplitLineShow !== false,
        lineStyle: {
          color: chartTheme.axis.splitLineColor,
          type: chartTheme.axis.splitLineType || "dashed",
        },
      },
    },
    series,
  };
}

function buildComboOption(runtime, variantId, chartTheme = resolveRuntimeTheme(runtime, variantId)) {
  const formatValue = formatFactory(runtime?.format || {});
  const rows = rowsForVariant(runtime, variantId);
  const matrix = buildCategoryMatrix(rows, runtime);
  const palette = chartTheme.palette;
  const barRadiusVertical = Array.isArray(chartTheme.series?.barRadiusVertical) ? chartTheme.series.barRadiusVertical : [6, 6, 0, 0];
  const lineWidth = toNumber(chartTheme.series?.lineWidth, 2.5);
  const symbolSize = toNumber(chartTheme.series?.symbolSize, 6);
  const axisFontSize = toNumber(chartTheme.axis?.labelFontSize, 11);
  const comboLabelsEnabled = chartTheme.series?.comboShowLabels === true || labelsEnabled(runtime);
  const comboBarColor = chartTheme.series?.comboBarColor || palette[0];
  const comboLineColor = chartTheme.series?.comboLineColor || palette[1] || palette[0];
  const axisType = detectLineAxisType(runtime, matrix.categories);

  const barSeries = matrix.seriesEntries.map((entry, index) => ({
    name: entry.name,
    type: "bar",
    data: entry.data,
    barMaxWidth: toNumber(chartTheme.series?.barMaxWidth, 30),
    itemStyle: {
      color: index === 0 ? comboBarColor : palette[index % palette.length],
      borderRadius: barRadiusVertical,
    },
    label: {
      show: comboLabelsEnabled,
      formatter: ({ value }) => formatValue(value),
      position: "insideTop",
      color: chartTheme.series?.comboBarLabelColor || "#F2F5FF",
      fontSize: axisFontSize,
    },
  }));

  const lineSource = matrix.y2Data.some((value) => value !== 0)
    ? matrix.y2Data
    : matrix.targetData;
  const lineName = asKey(runtime?.mapping?.y2) || asKey(runtime?.mapping?.target) || "Line";
  const dualAxis = variantId === "combo_dual_axis";

  const lineData = axisType === "time"
    ? matrix.categories.map((category, index) => [asTimeValue(category), lineSource[index]])
    : lineSource;

  const lineSeries = {
    name: seriesLabelForKey(lineName),
    type: "line",
    data: lineData,
    yAxisIndex: dualAxis ? 1 : 0,
    smooth: runtime?.visual?.smooth === true,
    symbolSize,
    lineStyle: {
      width: lineWidth,
      color: comboLineColor,
    },
    itemStyle: {
      color: comboLineColor,
      borderColor: "#ffffff",
      borderWidth: 1,
    },
    label: {
      show: comboLabelsEnabled,
      formatter: ({ value }) => {
        if (Array.isArray(value)) return formatValue(value[1]);
        return formatValue(value);
      },
      position: "top",
      color: chartTheme.series?.comboLineLabelColor || comboLineColor,
      fontSize: axisFontSize,
    },
  };

  return {
    animation: false,
    ...defaultTextStyle(),
    color: palette,
    grid: defaultGrid({ chartTheme }),
    legend: {
      show: legendEnabled(runtime),
      top: chartTheme.legend?.top ?? 0,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      valueFormatter: (value) => formatValue(value),
    },
    xAxis: {
      type: axisType,
      data: axisType === "category" ? matrix.categories : undefined,
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.xAxisLineShow !== false,
        lineStyle: {
          color: chartTheme.axis.lineColor,
        },
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
        rotate: axisType === "category" ? toNumber(chartTheme.axis?.xRotate, 0) : 0,
        formatter: axisType === "category"
          ? (value) => maybeUppercaseLabel(value, chartTheme)
          : undefined,
      },
    },
    yAxis: [
      {
        type: "value",
        min: axisBound(runtime?.axis?.yMin),
        max: axisBound(runtime?.axis?.yMax),
        axisLabel: {
          color: chartTheme.axis.labelColor,
          fontSize: axisFontSize,
          formatter: (value) => formatValue(value),
        },
        splitLine: {
          show: chartTheme.axis?.ySplitLineShow !== false,
          lineStyle: {
            color: chartTheme.axis.splitLineColor,
            type: chartTheme.axis.splitLineType || "dashed",
          },
        },
        axisLine: {
          show: chartTheme.axis?.yAxisLineShow === true,
        },
      },
      {
        type: "value",
        min: axisBound(runtime?.axis?.y2Min),
        max: axisBound(runtime?.axis?.y2Max),
        show: dualAxis,
        axisLabel: {
          color: chartTheme.axis.labelColor,
          fontSize: axisFontSize,
          formatter: (value) => formatValue(value),
        },
        splitLine: { show: false },
        axisLine: {
          show: dualAxis,
        },
      },
    ],
    series: [...barSeries, lineSeries],
  };
}

function buildPieLikeOption(runtime, variantId, chartTheme = resolveRuntimeTheme(runtime, variantId)) {
  const rows = rowsForVariant(runtime, variantId);
  const mapping = runtime?.mapping || {};
  const xKey = asKey(mapping.x) || "category";
  const yKey = getYKeys(mapping)[0];
  const formatValue = formatFactory(runtime?.format || {});
  const totals = new Map();

  rows.forEach((row, index) => {
    const name = asCategory(row?.[xKey], index);
    const value = toNumber(row?.[yKey], 0);
    totals.set(name, (totals.get(name) || 0) + value);
  });

  const data = Array.from(totals.entries()).map(([name, value]) => ({ name, value }));
  const donut = variantId === "pie_donut";
  const pieTheme = chartTheme.pie || {};
  const progressMode = donut && (pieTheme.progressMode === true || data.length <= 1);
  const total = data.reduce((sum, entry) => sum + Math.max(0, toNumber(entry.value, 0)), 0);
  const singleValue = Math.max(0, toNumber(data[0]?.value, 0));
  const progressPercent = clamp(
    total > 0 ? (singleValue / total) * 100 : singleValue,
    0,
    100,
  );
  const accentColor = pieTheme.accentColor || chartTheme.palette[0];
  const trackColor = pieTheme.trackColor || chartTheme.tokens?.silver || "#D7D7E7";
  const gapBorderWidth = toNumber(pieTheme.gapBorderWidth, 0);
  const gapBorderColor = pieTheme.gapBorderColor || chartTheme.surface?.panelSoftColor || "#F5F5F9";

  return {
    animation: false,
    ...defaultTextStyle(),
    color: chartTheme.palette,
    legend: {
      show: legendEnabled(runtime) && chartTheme.legend?.show !== false && !progressMode,
      orient: "vertical",
      right: 0,
      top: "middle",
    },
    tooltip: {
      trigger: "item",
      formatter: (params) => `${params.name}: ${formatValue(params.value)}`,
    },
    series: [
      {
        type: "pie",
        radius: donut
          ? [pieTheme.ringInner || "48%", pieTheme.ringOuter || "72%"]
          : ["0%", pieTheme.ringOuter || "72%"],
        center: progressMode
          ? (pieTheme.center || ["50%", "50%"])
          : [donut ? "42%" : "50%", "50%"],
        startAngle: toNumber(pieTheme.startAngle, 90),
        clockwise: pieTheme.clockwise !== false,
        silent: progressMode,
        label: {
          show: labelsEnabled(runtime) && !progressMode,
          formatter: ({ value }) => formatValue(value),
          fontSize: 10,
        },
        data: progressMode
          ? [
              {
                name: data[0]?.name || "Value",
                value: progressPercent,
                itemStyle: {
                  color: accentColor,
                  borderColor: gapBorderColor,
                  borderWidth: gapBorderWidth,
                },
              },
              {
                name: "Remaining",
                value: 100 - progressPercent,
                itemStyle: {
                  color: trackColor,
                  borderColor: gapBorderColor,
                  borderWidth: gapBorderWidth,
                },
                emphasis: { disabled: true },
              },
            ]
          : data,
      },
    ],
  };
}

function buildScatterOption(runtime, variantId, chartTheme = resolveRuntimeTheme(runtime, variantId)) {
  const rows = applyTopN(sortRows(safeRows(runtime?.rows), runtime?.mapping || {}, runtime?.transforms || {}), runtime?.transforms || {});
  const mapping = runtime?.mapping || {};
  const xKey = asKey(mapping.x);
  const yKey = getYKeys(mapping)[0];
  const sizeKey = asKey(mapping.size);
  const seriesKey = asKey(mapping.series);
  const formatValue = formatFactory(runtime?.format || {});
  const palette = chartTheme.palette;
  const axisFontSize = toNumber(chartTheme.axis?.labelFontSize, 11);

  const xValues = rows.map((row) => row?.[xKey]);
  const xTypeExplicit = asKey(runtime?.axis?.xType || "auto").toLowerCase();
  let xType = xTypeExplicit;
  if (!xType || xType === "auto") {
    if (xValues.every((value) => Number.isFinite(Number(value)))) xType = "value";
    else if (xValues.filter((value) => isDateLike(value)).length >= Math.ceil(Math.max(1, xValues.length) * 0.6)) xType = "time";
    else xType = "category";
  }

  const grouped = new Map();
  function ensureSeries(name) {
    const key = asKey(name) || "Series";
    if (!grouped.has(key)) grouped.set(key, []);
    return grouped.get(key);
  }

  const sizeValues = [];
  rows.forEach((row, index) => {
    const seriesName = seriesKey ? asCategory(row?.[seriesKey], 0) : "Series";
    const points = ensureSeries(seriesName);
    const xRaw = xKey ? row?.[xKey] : index + 1;
    const xValue = xType === "time" ? asTimeValue(xRaw) : xType === "value" ? toNumber(xRaw, index + 1) : asCategory(xRaw, index);
    const yValue = toNumber(row?.[yKey], 0);
    const sizeValue = sizeKey ? toNumber(row?.[sizeKey], 0) : null;
    if (variantId === "scatter_bubble") {
      points.push([xValue, yValue, sizeValue]);
      if (Number.isFinite(sizeValue)) sizeValues.push(sizeValue);
    } else {
      points.push([xValue, yValue]);
    }
  });

  const sizeMin = sizeValues.length ? Math.min(...sizeValues) : 0;
  const sizeMax = sizeValues.length ? Math.max(...sizeValues) : 1;

  return {
    animation: false,
    ...defaultTextStyle(),
    color: palette,
    grid: defaultGrid({ chartTheme }),
    legend: {
      show: legendEnabled(runtime),
      top: chartTheme.legend?.top ?? 0,
    },
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const value = Array.isArray(params.value) ? params.value[1] : params.value;
        return `${params.seriesName}: ${formatValue(value)}`;
      },
    },
    xAxis: {
      type: xType,
      min: axisBound(runtime?.axis?.xMin),
      max: axisBound(runtime?.axis?.xMax),
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.xAxisLineShow !== false,
        lineStyle: {
          color: chartTheme.axis.lineColor,
        },
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
        rotate: xType === "category" ? toNumber(chartTheme.axis?.xRotate, 0) : 0,
        formatter: xType === "category"
          ? (value) => maybeUppercaseLabel(value, chartTheme)
          : undefined,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: chartTheme.axis.splitLineColor,
          type: chartTheme.axis.splitLineType || "dashed",
        },
      },
    },
    yAxis: {
      type: "value",
      min: axisBound(runtime?.axis?.yMin),
      max: axisBound(runtime?.axis?.yMax),
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.yAxisLineShow === true,
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
        formatter: (value) => formatValue(value),
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: chartTheme.axis.splitLineColor,
          type: chartTheme.axis.splitLineType || "dashed",
        },
      },
    },
    series: Array.from(grouped.entries()).map(([name, data], index) => ({
      name,
      type: "scatter",
      data,
      symbolSize: variantId === "scatter_bubble"
        ? (value) => {
            const size = toNumber(value?.[2], sizeMin);
            if (sizeMax <= sizeMin) return 20;
            const ratio = (size - sizeMin) / (sizeMax - sizeMin);
            return clamp(12 + ratio * 28, 10, 42);
          }
        : 9,
      itemStyle: {
        color: palette[index % palette.length],
        opacity: variantId === "scatter_bubble" ? 0.75 : 0.9,
      },
      label: {
        show: labelsEnabled(runtime) && variantId === "scatter_bubble",
        formatter: ({ value }) => (Array.isArray(value) ? formatValue(value[1]) : formatValue(value)),
        fontSize: axisFontSize,
      },
    })),
  };
}

function buildHistogramOption(runtime, chartTheme = resolveRuntimeTheme(runtime, "histogram")) {
  const rows = applyTopN(safeRows(runtime?.rows), runtime?.transforms || {});
  const yKey = getYKeys(runtime?.mapping || {})[0];
  const formatValue = formatFactory(runtime?.format || {});
  const values = rows
    .map((row) => Number(row?.[yKey]))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    values.push(0, 0, 0);
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const barRadiusVertical = Array.isArray(chartTheme.series?.barRadiusVertical) ? chartTheme.series.barRadiusVertical : [6, 6, 0, 0];
  const axisFontSize = toNumber(chartTheme.axis?.labelFontSize, 11);
  const binCount = clamp(Math.round(Math.sqrt(values.length)), 4, 16);
  const span = max - min || 1;
  const width = span / binCount;
  const bins = new Array(binCount).fill(0);

  values.forEach((value) => {
    const offset = value - min;
    const index = clamp(Math.floor(offset / width), 0, binCount - 1);
    bins[index] += 1;
  });

  const labels = bins.map((_, index) => {
    const low = min + index * width;
    const high = low + width;
    return `${Math.round(low)}-${Math.round(high)}`;
  });

  return {
    animation: false,
    ...defaultTextStyle(),
    color: chartTheme.palette,
    grid: defaultGrid({ chartTheme }),
    legend: { show: false },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => formatValue(value),
    },
    xAxis: {
      type: "category",
      data: labels,
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.xAxisLineShow !== false,
        lineStyle: {
          color: chartTheme.axis.lineColor,
        },
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
      },
    },
    yAxis: {
      type: "value",
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.yAxisLineShow === true,
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
        formatter: (value) => formatValue(value),
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: chartTheme.axis.splitLineColor,
          type: chartTheme.axis.splitLineType || "dashed",
        },
      },
    },
    series: [
      {
        type: "bar",
        data: bins,
        barWidth: "72%",
        itemStyle: {
          color: chartTheme.palette[0],
          borderRadius: barRadiusVertical,
        },
      },
    ],
  };
}

function buildWaterfallOption(runtime, chartTheme = resolveRuntimeTheme(runtime, "waterfall")) {
  const mapping = runtime?.mapping || {};
  const rows = applyTopN(safeRows(runtime?.rows), runtime?.transforms || {});
  const xKey = asKey(mapping.x) || "category";
  const yKey = getYKeys(mapping)[0];
  const formatValue = formatFactory(runtime?.format || {});

  const categories = rows.map((row, index) => asCategory(row?.[xKey], index));
  const values = rows.map((row) => toNumber(row?.[yKey], 0));
  const starts = [];
  let running = 0;
  values.forEach((value) => {
    starts.push(running);
    running += value;
  });

  const positiveColor = chartTheme.semantic?.positive || chartTheme.palette[0];
  const negativeColor = chartTheme.semantic?.negative || chartTheme.palette[1];
  const barRadiusVertical = Array.isArray(chartTheme.series?.barRadiusVertical) ? chartTheme.series.barRadiusVertical : [6, 6, 0, 0];
  const axisFontSize = toNumber(chartTheme.axis?.labelFontSize, 11);

  return {
    animation: false,
    ...defaultTextStyle(),
    grid: defaultGrid({ chartTheme }),
    legend: { show: false },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => formatValue(value),
    },
    xAxis: {
      type: "category",
      data: categories,
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.xAxisLineShow !== false,
        lineStyle: {
          color: chartTheme.axis.lineColor,
        },
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
      },
    },
    yAxis: {
      type: "value",
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.yAxisLineShow === true,
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
        formatter: (value) => formatValue(value),
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: chartTheme.axis.splitLineColor,
          type: chartTheme.axis.splitLineType || "dashed",
        },
      },
    },
    series: [
      {
        type: "bar",
        stack: "wf",
        itemStyle: {
          color: "transparent",
          borderColor: "transparent",
        },
        emphasis: { disabled: true },
        data: starts,
      },
      {
        type: "bar",
        stack: "wf",
        data: values.map((value) => ({
          value,
          itemStyle: {
            color: value >= 0 ? positiveColor : negativeColor,
            borderRadius: barRadiusVertical,
          },
        })),
        label: {
          show: labelsEnabled(runtime),
          formatter: ({ value }) => formatValue(value),
          fontSize: axisFontSize,
          color: chartTheme.series?.labelColor || chartTheme.typography.valueLabelColor,
        },
      },
    ],
  };
}

function buildTreemapOption(runtime, chartTheme = resolveRuntimeTheme(runtime, "treemap")) {
  const rows = rowsForVariant(runtime, "treemap");
  const mapping = runtime?.mapping || {};
  const xKey = asKey(mapping.x) || "category";
  const yKey = getYKeys(mapping)[0];
  const formatValue = formatFactory(runtime?.format || {});
  const axisFontSize = toNumber(chartTheme.axis?.labelFontSize, 11);

  const totals = new Map();
  rows.forEach((row, index) => {
    const name = asCategory(row?.[xKey], index);
    const value = toNumber(row?.[yKey], 0);
    totals.set(name, (totals.get(name) || 0) + value);
  });

  return {
    animation: false,
    ...defaultTextStyle(),
    color: chartTheme.palette,
    tooltip: {
      trigger: "item",
      formatter: ({ name, value }) => `${name}: ${formatValue(value)}`,
    },
    series: [
      {
        type: "treemap",
        roam: false,
        breadcrumb: { show: false },
        leafDepth: 1,
        itemStyle: {
          borderColor: chartTheme.surface?.panelColor || "#FFFFFF",
          borderWidth: 2,
          gapWidth: 2,
        },
        label: {
          show: true,
          fontSize: axisFontSize,
          color: chartTheme.typography.textColor,
          fontFamily: chartTheme.typography.dataLabelFontFamily || chartTheme.typography.fontFamily,
        },
        data: Array.from(totals.entries()).map(([name, value]) => ({ name, value })),
      },
    ],
  };
}

function buildHeatmapOption(runtime, chartTheme = resolveRuntimeTheme(runtime, "heatmap")) {
  const rows = rowsForVariant(runtime, "heatmap");
  const mapping = runtime?.mapping || {};
  const xKey = asKey(mapping.x) || "category";
  const yKey = getYKeys(mapping)[0];
  const splitKey = asKey(mapping.series) || asKey(mapping.label) || "series";

  const xCategories = unique(rows.map((row, index) => asCategory(row?.[xKey], index)));
  const yCategories = unique(rows.map((row, index) => asCategory(row?.[splitKey], index)));
  const xIndex = new Map(xCategories.map((name, index) => [name, index]));
  const yIndex = new Map(yCategories.map((name, index) => [name, index]));
  const values = [];

  rows.forEach((row, index) => {
    const xName = asCategory(row?.[xKey], index);
    const yName = asCategory(row?.[splitKey], index);
    const xi = xIndex.get(xName);
    const yi = yIndex.get(yName);
    if (xi == null || yi == null) return;
    values.push([xi, yi, toNumber(row?.[yKey], 0)]);
  });

  const numeric = values.map((entry) => entry[2]);
  const min = numeric.length ? Math.min(...numeric) : 0;
  const max = numeric.length ? Math.max(...numeric) : 100;
  const axisFontSize = toNumber(chartTheme.axis?.labelFontSize, 11);

  return {
    animation: false,
    ...defaultTextStyle(),
    grid: {
      ...defaultGrid({ chartTheme }),
      top: 26,
      right: 22,
      bottom: 20,
      left: 62,
    },
    tooltip: {
      trigger: "item",
      formatter: ({ value }) => `${xCategories[value[0]]} / ${yCategories[value[1]]}: ${value[2]}`,
    },
    xAxis: {
      type: "category",
      data: xCategories,
      splitArea: { show: true },
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.xAxisLineShow !== false,
        lineStyle: {
          color: chartTheme.axis.lineColor,
        },
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
      },
    },
    yAxis: {
      type: "category",
      data: yCategories,
      splitArea: { show: true },
      axisTick: { show: false },
      axisLine: {
        show: chartTheme.axis?.yAxisLineShow === true,
      },
      axisLabel: {
        color: chartTheme.axis.labelColor,
        fontSize: axisFontSize,
      },
    },
    visualMap: {
      min,
      max,
      orient: "horizontal",
      left: "center",
      top: 0,
      inRange: {
        color: [
          chartTheme.surface?.panelSoftColor || "#F5F5F9",
          "rgba(60,100,255,0.45)",
          chartTheme.tokens?.azure || chartTheme.palette[0] || "#3C64FF",
        ],
      },
      textStyle: {
        color: chartTheme.axis.labelColor,
        fontFamily: chartTheme.typography.fontFamily,
        fontSize: axisFontSize,
      },
    },
    series: [
      {
        type: "heatmap",
        data: values,
        label: {
          show: labelsEnabled(runtime),
          formatter: ({ value }) => String(value[2]),
          fontSize: axisFontSize,
          color: chartTheme.typography.valueLabelColor,
        },
      },
    ],
  };
}

function buildRadarOption(runtime, chartTheme = resolveRuntimeTheme(runtime, "radar")) {
  const rows = rowsForVariant(runtime, "radar");
  const mapping = runtime?.mapping || {};
  const xKey = asKey(mapping.x) || "category";
  const yKey = getYKeys(mapping)[0];
  const seriesKey = asKey(mapping.series);
  const palette = chartTheme.palette;

  const indicators = unique(rows.map((row, index) => asCategory(row?.[xKey], index)));
  const indicatorMax = Math.max(10, ...rows.map((row) => toNumber(row?.[yKey], 0)));
  const radarTheme = chartTheme.radar || {};
  const radarLineColor = radarTheme.lineColor || chartTheme.palette[0];
  const radarAreaColor = radarTheme.areaColor || chartTheme.palette[0];
  const radarAreaOpacity = toNumber(radarTheme.areaOpacity, 0.1);
  const radarSymbol = radarTheme.symbol || "circle";
  const radarSymbolSize = toNumber(radarTheme.symbolSize, 4);

  const bySeries = new Map();
  function ensure(name) {
    const key = asKey(name) || "Series";
    if (!bySeries.has(key)) {
      bySeries.set(key, new Map());
    }
    return bySeries.get(key);
  }

  rows.forEach((row, index) => {
    const seriesName = seriesKey ? asCategory(row?.[seriesKey], 0) : "Series";
    const indicator = asCategory(row?.[xKey], index);
    ensure(seriesName).set(indicator, toNumber(row?.[yKey], 0));
  });

  const data = Array.from(bySeries.entries()).map(([name, values], index) => ({
    name,
    value: indicators.map((indicator) => toNumber(values.get(indicator), 0)),
    lineStyle: {
      color: index === 0 ? radarLineColor : palette[index % palette.length],
      width: 2,
    },
    itemStyle: {
      color: index === 0 ? radarLineColor : palette[index % palette.length],
    },
    areaStyle: {
      opacity: radarAreaOpacity,
      color: index === 0 ? radarAreaColor : palette[index % palette.length],
    },
    symbol: radarSymbol,
    symbolSize: radarSymbolSize,
  }));

  return {
    animation: false,
    ...defaultTextStyle(),
    color: palette,
    legend: {
      show: legendEnabled(runtime),
      top: chartTheme.legend?.top ?? 0,
    },
    tooltip: {
      trigger: "item",
    },
    radar: {
      shape: radarTheme.shape || "polygon",
      indicator: indicators.map((name) => ({ name, max: indicatorMax * 1.1 })),
      splitNumber: Math.max(3, Math.round(toNumber(radarTheme.splitNumber, 5))),
      splitArea: {
        areaStyle: {
          color: Array.isArray(radarTheme.splitAreaColor) && radarTheme.splitAreaColor.length
            ? radarTheme.splitAreaColor
            : ["transparent"],
        },
      },
      splitLine: {
        lineStyle: {
          color: radarTheme.splitLineColor || chartTheme.axis.splitLineColor,
          width: toNumber(radarTheme.splitLineWidth, 1),
        },
      },
      axisName: {
        color: radarTheme.axisNameColor || chartTheme.axis.labelColor,
        fontSize: toNumber(radarTheme.axisNameFontSize, chartTheme.axis?.labelFontSize || 11),
      },
    },
    series: [
      {
        type: "radar",
        data,
        label: {
          show: false,
        },
      },
    ],
  };
}

function buildFunnelOption(runtime, chartTheme = resolveRuntimeTheme(runtime, "funnel")) {
  const rows = rowsForVariant(runtime, "funnel");
  const mapping = runtime?.mapping || {};
  const xKey = asKey(mapping.x) || "category";
  const yKey = getYKeys(mapping)[0];
  const formatValue = formatFactory(runtime?.format || {});
  const axisFontSize = toNumber(chartTheme.axis?.labelFontSize, 11);

  const totals = new Map();
  rows.forEach((row, index) => {
    const name = asCategory(row?.[xKey], index);
    const value = toNumber(row?.[yKey], 0);
    totals.set(name, (totals.get(name) || 0) + value);
  });

  const data = Array.from(totals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return {
    animation: false,
    ...defaultTextStyle(),
    color: chartTheme.palette,
    tooltip: {
      trigger: "item",
      formatter: ({ name, value }) => `${name}: ${formatValue(value)}`,
    },
    series: [
      {
        type: "funnel",
        sort: "descending",
        left: "10%",
        width: "80%",
        gap: 4,
        label: {
          show: true,
          position: "inside",
          fontSize: axisFontSize,
          fontFamily: chartTheme.typography.dataLabelFontFamily || chartTheme.typography.fontFamily,
          color: chartTheme.surface?.panelColor || "#FFFFFF",
        },
        data,
      },
    ],
  };
}

function buildUnifiedGaugeOption(runtime, chartTheme = resolveRuntimeTheme(runtime, "gauge")) {
  const rows = safeRows(runtime?.rows);
  const mapping = runtime?.mapping || {};
  const yKey = getYKeys(mapping)[0];
  const targetKey = asKey(mapping.target) || asKey(mapping.y2) || "target";
  const first = rows[0] || {};
  return buildGaugeOption({
    value: toNumber(first[yKey], 0),
    min: axisBound(runtime?.axis?.yMin) ?? 0,
    max: Math.max(1, toNumber(first[targetKey], axisBound(runtime?.axis?.yMax) ?? 100)),
    color: chartTheme.palette[0],
    trackColor: chartTheme.tokens?.silver || chartTheme.surface?.panelSubtleColor || "#d7d7e7",
  });
}

function buildUnifiedLollipopOption(runtime, chartTheme = resolveRuntimeTheme(runtime, "lollipop")) {
  const rows = safeRows(runtime?.rows);
  const mapping = runtime?.mapping || {};
  const yKey = getYKeys(mapping)[0];
  const targetKey = asKey(mapping.target) || asKey(mapping.y2) || "target";
  const first = rows[0] || {};
  const you = toNumber(first[yKey], 0);
  const benchmark = toNumber(first[targetKey], 0);
  return buildLollipopOption({
    min: 0,
    max: Math.max(10, you, benchmark),
    you,
    benchmark,
    leftLabel: "You",
    rightLabel: "Benchmark",
    youColor: chartTheme.palette[0],
    benchmarkColor: chartTheme.palette[1],
  });
}

function buildUnifiedWaffleOption(runtime, chartTheme = resolveRuntimeTheme(runtime, "waffle")) {
  const rows = safeRows(runtime?.rows);
  const mapping = runtime?.mapping || {};
  const yKey = getYKeys(mapping)[0];
  const first = rows[0] || {};
  const percent = clamp(toNumber(first[yKey], 0), 0, 100);
  return buildDonutOption({
    percent,
    color: chartTheme.palette[0],
    trackColor: chartTheme.tokens?.silver || chartTheme.surface?.panelSubtleColor || "#d7d7e7",
  });
}

function buildUnifiedChartOption(runtime = {}) {
  const variantId = chartVariantById(runtime?.variant || "line_single").id;
  const chartTheme = resolveRuntimeTheme(runtime, variantId);
  const formatValue = formatFactory(runtime?.format || {});
  let option;
  switch (variantId) {
    case "column_clustered":
    case "column_stacked":
    case "column_100":
      option = buildColumnOrBarOption(runtime, variantId, false, chartTheme);
      break;
    case "bar_clustered":
    case "bar_stacked":
    case "bar_100":
      option = buildColumnOrBarOption(runtime, variantId, true, chartTheme);
      break;
    case "line_single":
    case "line_multi":
    case "line_smooth":
    case "line_step":
      option = buildLineOrAreaOption(runtime, variantId, false, chartTheme);
      break;
    case "area_standard":
    case "area_stacked":
    case "area_100":
      option = buildLineOrAreaOption(runtime, variantId, true, chartTheme);
      break;
    case "combo_column_line":
    case "combo_dual_axis":
      option = buildComboOption(runtime, variantId, chartTheme);
      break;
    case "pie_standard":
    case "pie_donut":
      option = buildPieLikeOption(runtime, variantId, chartTheme);
      break;
    case "scatter_standard":
    case "scatter_bubble":
      option = buildScatterOption(runtime, variantId, chartTheme);
      break;
    case "histogram":
      option = buildHistogramOption(runtime, chartTheme);
      break;
    case "waterfall":
      option = buildWaterfallOption(runtime, chartTheme);
      break;
    case "treemap":
      option = buildTreemapOption(runtime, chartTheme);
      break;
    case "heatmap":
      option = buildHeatmapOption(runtime, chartTheme);
      break;
    case "radar":
      option = buildRadarOption(runtime, chartTheme);
      break;
    case "funnel":
      option = buildFunnelOption(runtime, chartTheme);
      break;
    case "gauge":
      option = buildUnifiedGaugeOption(runtime, chartTheme);
      break;
    case "lollipop":
      option = buildUnifiedLollipopOption(runtime, chartTheme);
      break;
    case "waffle":
      option = buildUnifiedWaffleOption(runtime, chartTheme);
      break;
    default:
      option = buildLineOrAreaOption(runtime, "line_single", false, chartTheme);
      break;
  }
  return applyBrandDefaults(option, runtime, chartTheme, formatValue);
}

function optionFor(kind, config) {
  switch (kind) {
    case "chart":
      return buildUnifiedChartOption(config);
    case "gauge":
      return buildGaugeOption(config);
    case "line":
      return buildLineOption(config);
    case "bar":
      return buildBarOption(config);
    case "donut":
      return buildDonutOption(config);
    case "lollipop":
      return buildLollipopOption(config);
    default:
      return null;
  }
}

function disposeStale(hosts) {
  const activeHosts = new Set(hosts);
  let disposed = 0;
  for (const [host, chart] of instances.entries()) {
    if (!activeHosts.has(host) || !host.isConnected) {
      try {
        chart.dispose();
      } catch (_error) {
        // noop
      }
      instances.delete(host);
      disposed += 1;
    }
  }
  return disposed;
}

export function mountRuntimeCharts(root = document) {
  const stopChartTimer = startPerfTimer("chart");
  const hosts = Array.from(root.querySelectorAll(".chart-host"));
  const disposed = disposeStale(hosts);

  const metrics = {
    hosts: hosts.length,
    mounted: 0,
    updated: 0,
    skipped: 0,
    disposed,
    echartsReady: false,
  };

  const echarts = window.echarts;
  if (!echarts) {
    for (const host of hosts) {
      host.classList.remove("chart-host--rendered");
    }
    return stopChartTimer(metrics);
  }
  metrics.echartsReady = true;

  if (!resizeBound) {
    resizeBound = true;
    window.addEventListener("resize", () => {
      for (const chart of instances.values()) {
        try {
          chart.resize();
        } catch (_error) {
          // noop
        }
      }
    });
  }

  for (const host of hosts) {
    const kind = host.dataset.chartKind;
    const config = parseConfig(host);

    let option = null;
    try {
      option = optionFor(kind, config);
    } catch (_error) {
      option = null;
    }

    if (!option) {
      metrics.skipped += 1;
      host.classList.remove("chart-host--rendered");
      continue;
    }

    let chart = instances.get(host);
    if (!chart) {
      chart = echarts.init(host, null, { renderer: "svg" });
      instances.set(host, chart);
      metrics.mounted += 1;
    } else {
      metrics.updated += 1;
    }

    chart.setOption(option, {
      notMerge: true,
      lazyUpdate: true,
      silent: true,
    });
    host.classList.add("chart-host--rendered");
  }

  return stopChartTimer(metrics);
}
