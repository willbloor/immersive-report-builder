import { resolveDonutPercent } from "../render/value-sync.js";
import { deepClone, getByPath, setByPath, toNumber } from "../utils/helpers.js";
import {
  buildChartRuntimeConfig,
  inferColumnsFromRows,
  normalizeChartBinding,
  normalizeChartModel,
} from "./chart-transform.js";

const BINDING_PRESETS = {
  chart: {
    mode: "chart_roles_v1",
    targetPath: "chart",
    help: "Map chart roles and transforms to build chart series from a dataset.",
  },
  kpi: {
    mode: "single",
    targetPath: "value",
    help: "Bind one numeric value to the KPI value.",
  },
  gauge: {
    mode: "single",
    targetPath: "value",
    help: "Bind one numeric value to the gauge value.",
  },
  waffle: {
    mode: "single",
    targetPath: "percent",
    help: "Bind one numeric value to waffle percent.",
  },
  donut: {
    mode: "single",
    targetPath: "value",
    help: "Bind one numeric value to donut value.",
  },
  line: {
    mode: "series",
    targetPath: "points",
    help: "Bind label/value columns for a time series.",
  },
  bar: {
    mode: "series",
    targetPath: "points",
    help: "Bind label/value columns for bars.",
  },
  lollipop: {
    mode: "single",
    targetPath: "you",
    help: "Bind numeric values for your score and benchmark.",
  },
};

export function bindingPresetForType(type) {
  return BINDING_PRESETS[type] || null;
}

function resolveUnifiedChartProps(component, datasets) {
  const props = deepClone(component?.props || {});
  props.chart = normalizeChartModel(props.chart || {}, "line_single");
  props.chartRuntime = buildChartRuntimeConfig(
    {
      ...component,
      props,
    },
    datasets,
  );
  return props;
}

export function resolveComponentProps(component, datasets) {
  if (component?.type === "chart") {
    return resolveUnifiedChartProps(component, datasets);
  }

  const props = deepClone(component.props || {});
  const bindings = Array.isArray(component.dataBindings) ? component.dataBindings : [];
  if (bindings.length === 0) return props;

  const binding = bindings[0];
  const dataset = (datasets || []).find((rowset) => rowset.id === binding.datasetId);
  if (!dataset) return props;

  if (binding.mode === "single") {
    const rowIndex = Math.max(0, Number(binding.mapping?.rowIndex || 0));
    const row = dataset.rows?.[rowIndex] || dataset.rows?.[0];
    if (!row) return props;

    if (component.type === "lollipop") {
      const youColumn = binding.mapping?.youColumn;
      const benchmarkColumn = binding.mapping?.benchmarkColumn;
      if (youColumn && row[youColumn] != null) {
        setByPath(props, "you", toNumber(row[youColumn], props.you || 0));
      }
      if (benchmarkColumn && row[benchmarkColumn] != null) {
        setByPath(props, "benchmark", toNumber(row[benchmarkColumn], props.benchmark || 0));
      }
      return props;
    }

    const valueColumn = binding.mapping?.valueColumn;
    if (!valueColumn || row[valueColumn] == null) return props;
    const boundValue = toNumber(row[valueColumn], 0);
    const targetPath = binding.targetPath || "value";
    setByPath(props, targetPath, boundValue);

    if (component.type === "donut") {
      const normalizedTargetPath = String(targetPath).toLowerCase().trim();
      if (normalizedTargetPath.endsWith("percent")) {
        return props;
      }
      const effectiveValue = toNumber(getByPath(props, targetPath), boundValue);
      setByPath(props, "value", effectiveValue);
      setByPath(props, "percent", resolveDonutPercent(props));
    }
    return props;
  }

  if (binding.mode === "series") {
    const labelColumn = binding.mapping?.labelColumn;
    const valueColumn = binding.mapping?.valueColumn;
    if (!labelColumn || !valueColumn) return props;
    const points = (dataset.rows || []).map((row) => ({
      label: String(row[labelColumn] ?? ""),
      value: toNumber(row[valueColumn], 0),
    }));
    setByPath(props, binding.targetPath || "points", points.filter((p) => p.label));
    return props;
  }

  return props;
}

export function buildBinding(type, draft = {}) {
  const preset = bindingPresetForType(type);
  if (!preset) return null;
  if (type === "chart") {
    const variantId = draft.variantId || draft.chartVariant || draft.variant || "line_single";
    const binding = normalizeChartBinding(
      {
        ...(draft || {}),
        mode: "chart_roles_v1",
      },
      variantId,
      draft.columns || [],
    );
    return binding;
  }
  return {
    mode: draft.mode || preset.mode,
    targetPath: draft.targetPath || preset.targetPath,
    datasetId: draft.datasetId || "",
    mapping: draft.mapping || {},
  };
}

export function buildChartBindingDraft(component, datasets = [], nextDatasetId = null) {
  const variantId = component?.props?.chart?.variant || "line_single";
  const existing = Array.isArray(component?.dataBindings)
    ? component.dataBindings.find((binding) => String(binding?.mode || "").startsWith("chart_roles"))
    : null;
  const datasetId = nextDatasetId == null
    ? (existing?.datasetId || "")
    : String(nextDatasetId || "");
  const dataset = datasetId
    ? (datasets || []).find((entry) => entry.id === datasetId)
    : null;
  const columns = Array.isArray(dataset?.columns) && dataset.columns.length > 0
    ? dataset.columns
    : inferColumnsFromRows(component?.props?.chart?.seedRows || []);
  return normalizeChartBinding(
    {
      ...(existing || {}),
      datasetId,
    },
    variantId,
    columns,
  );
}
