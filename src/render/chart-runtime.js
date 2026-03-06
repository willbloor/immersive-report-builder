import { startPerfTimer } from "../utils/perf.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function resolveColor(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const trimmed = value.trim();
  const match = trimmed.match(/^var\((--[^,\)\s]+)\)$/);
  if (match) {
    return cssVar(match[1], fallback);
  }
  return trimmed;
}

function buildGaugeOption(config) {
  const max = Math.max(1, toNumber(config.max, 100));
  const min = toNumber(config.min, 0);
  const value = clamp(toNumber(config.value, 0), min, max);

  return {
    animation: false,
    textStyle: {
      fontFamily: "Geologica, sans-serif",
    },
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

  const highlightSeries = values.map((value, index) => (index >= values.length - 2 ? value : null));
  const lastIndex = values.length - 1;

  return {
    animation: false,
    tooltip: { show: false },
    textStyle: {
      fontFamily: "Geologica, sans-serif",
    },
    grid: {
      top: 18,
      right: 16,
      bottom: 28,
      left: 34,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: labels,
      axisLabel: {
        fontSize: 10,
        color: "rgba(23,24,28,0.50)",
        rotate: -28,
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
          color: "rgba(89,114,214,0.25)",
        },
        itemStyle: {
          color: "#ffffff",
          borderColor: "rgba(23,24,28,0.45)",
          borderWidth: 1.5,
        },
        z: 1,
      },
      {
        type: "line",
        smooth: true,
        data: highlightSeries,
        symbol: "circle",
        symbolSize: (value, params) => (params.dataIndex === lastIndex ? 12 : 7),
        lineStyle: {
          width: 3,
          color: resolveColor(config.color, cssVar("--status-blue", "#5972d6")),
        },
        itemStyle: {
          color: resolveColor(config.color, cssVar("--status-blue", "#5972d6")),
          borderColor: "#ffffff",
          borderWidth: 1,
        },
        z: 2,
      },
      {
        type: "scatter",
        data: lastIndex >= 0 ? [[labels[lastIndex], values[lastIndex]]] : [],
        symbolSize: 24,
        itemStyle: {
          color: "rgba(89,114,214,0.25)",
        },
        silent: true,
        z: 0,
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
    textStyle: {
      fontFamily: "Geologica, sans-serif",
    },
    grid: {
      top: 10,
      right: 12,
      bottom: 18,
      left: 84,
      containLabel: true,
    },
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
    textStyle: {
      fontFamily: "Geologica, sans-serif",
    },
    grid: {
      top: 8,
      right: 10,
      bottom: 26,
      left: 36,
      containLabel: true,
    },
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

function optionFor(kind, config) {
  switch (kind) {
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
    const option = optionFor(kind, config);
    if (!option) {
      metrics.skipped += 1;
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

    chart.setOption(option, true);
    chart.resize();
    host.classList.add("chart-host--rendered");
  }

  return stopChartTimer(metrics);
}
