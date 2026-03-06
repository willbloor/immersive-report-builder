function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const LEGACY_FALLBACK_PALETTE = [
  "#3C64FF",
  "#F23F55",
  "#12DD7E",
  "#FFBF00",
  "#22A9D5",
  "#6A5ACD",
  "#8F9BB3",
];

export function readCssVar(name, fallback = "") {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (!root) return fallback;
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  return value || fallback;
}

export function resolveThemeColor(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const trimmed = value.trim();
  const cssVarMatch = trimmed.match(/^var\((--[^,\)\s]+)\)$/);
  if (cssVarMatch) {
    return readCssVar(cssVarMatch[1], fallback);
  }
  return trimmed;
}

export function parsePaletteInput(input) {
  if (Array.isArray(input)) {
    return input.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

export function readBrandChartTheme() {
  // Canonical Figma chart references (global default style contract):
  // - 9741:6171  horizontal/stacked bar baseline
  // - 9659:28602 line baseline
  // - 9659:28399 offset donut percentage baseline
  // - 8979:7526  column + line combo baseline
  // - 8979:6187  spider/radar baseline
  const onyx = readCssVar("--ink", "#17181C");
  const silver = readCssVar("--brand-silver", "#D7D7E7");
  const alternate025 = readCssVar("--panel-soft", "#F5F5F9");
  const statusBlue = readCssVar("--status-blue", "#3C64FF");
  const statusLow = readCssVar("--status-low", "#F23F55");
  const statusHigh = readCssVar("--status-high", "#12DD7E");
  const statusMedium = readCssVar("--status-medium", "#FFBF00");
  const inkSoft = readCssVar("--ink-soft", "rgba(23, 24, 28, 0.72)");
  const inkMuted = readCssVar("--ink-muted", "rgba(23, 24, 28, 0.52)");
  const panel = readCssVar("--panel", "#FFFFFF");
  const panelSoft = alternate025;
  const panelSoft2 = readCssVar("--panel-soft-2", "#EDEEF6");
  const surfaceDark = readCssVar("--surface-dark", "#0D1228");
  const fontSans = readCssVar("--font-sans", "Geologica, sans-serif");
  const fontMono = readCssVar("--font-mono", "Chivo Mono, monospace");

  return {
    tokens: {
      onyx,
      silver,
      alternate025,
      azure: statusBlue,
      coral: statusLow,
      moss: statusHigh,
    },
    palette: [
      statusBlue,
      statusLow,
      statusHigh,
      statusMedium,
      "#22A9D5",
      "#6A5ACD",
      "#8F9BB3",
    ],
    semantic: {
      positive: statusHigh,
      negative: statusLow,
      warn: statusMedium,
      info: statusBlue,
      neutral: inkSoft,
    },
    typography: {
      fontFamily: fontSans,
      numberFontFamily: fontMono,
      axisFontFamily: fontSans,
      dataLabelFontFamily: fontSans,
      textColor: onyx,
      mutedTextColor: inkMuted,
      valueLabelColor: "rgba(16, 22, 44, 0.86)",
      titleUppercase: true,
      numericFeatureSettings: "'zero' 1, 'tnum' 1",
    },
    grid: {
      vertical: { top: 16, right: 18, bottom: 28, left: 42, containLabel: true },
      horizontal: { top: 16, right: 20, bottom: 18, left: 90, containLabel: true },
    },
    axis: {
      labelColor: "rgba(23, 24, 28, 0.62)",
      lineColor: "rgba(23, 24, 28, 0.22)",
      tickColor: "rgba(23, 24, 28, 0.22)",
      splitLineColor: "rgba(23, 24, 28, 0.12)",
      splitLineType: "dashed",
      labelFontSize: 11,
      xRotate: 0,
      xUppercase: false,
      xSplitLineShow: false,
      ySplitLineShow: true,
      xAxisLineShow: true,
      yAxisLineShow: false,
      padMonoPercentTicks: false,
      monoTickWidth: 3,
    },
    legend: {
      textColor: "rgba(23, 24, 28, 0.78)",
      top: 0,
      itemWidth: 10,
      itemHeight: 4,
    },
    tooltip: {
      backgroundColor: surfaceDark,
      borderColor: silver,
      borderWidth: 1,
      textColor: "#F2F5FF",
    },
    surface: {
      panelColor: panel,
      panelSoftColor: panelSoft,
      panelSubtleColor: panelSoft2,
      borderColor: "rgba(23, 24, 28, 0.10)",
    },
    series: {
      lineWidth: 2.5,
      symbolSize: 6,
      symbolBorderColor: panel,
      symbolBorderWidth: 1.25,
      areaOpacity: 0.22,
      areaOpacityPercent: 0.85,
      barRadiusVertical: [6, 6, 0, 0],
      barRadiusHorizontal: [0, 6, 6, 0],
      barMaxWidth: 34,
      barMaxWidthHorizontal: 34,
      labelColor: "rgba(16,22,44,0.85)",
      comboShowLabels: false,
    },
    pie: {
      progressMode: false,
      ringInner: "48%",
      ringOuter: "72%",
      center: ["42%", "50%"],
      startAngle: 90,
      clockwise: true,
      trackColor: silver,
      accentColor: statusHigh,
      gapBorderColor: panelSoft,
      gapBorderWidth: 0,
    },
    radar: {
      shape: "polygon",
      splitNumber: 5,
      splitLineColor: "rgba(23,24,28,0.14)",
      splitLineWidth: 1,
      splitAreaColor: ["transparent"],
      axisNameColor: "rgba(23,24,28,0.7)",
      axisNameFontSize: 10,
      lineColor: statusBlue,
      areaColor: "rgba(60,100,255,0.1)",
      areaOpacity: 0.1,
      symbol: "circle",
      symbolSize: 4,
    },
    profiles: {
      normalized: {
        grid: {
          vertical: { top: 16, right: 18, bottom: 28, left: 42, containLabel: true },
          horizontal: { top: 16, right: 20, bottom: 18, left: 90, containLabel: true },
        },
      },
      figma_bar: {
        grid: {
          horizontal: { top: 18, right: 20, bottom: 34, left: 112, containLabel: true },
        },
        axis: {
          lineColor: "rgba(23,24,28,0.2)",
          splitLineColor: "rgba(23,24,28,0.1)",
          splitLineType: "solid",
          xSplitLineShow: false,
          ySplitLineShow: false,
          xAxisLineShow: true,
          yAxisLineShow: false,
          xRotate: 0,
          xUppercase: false,
        },
        series: {
          barMaxWidthHorizontal: 18,
          barRadiusHorizontal: [2, 2, 2, 2],
          preferMonochromeForSingleSeries: true,
          horizontalBarMonochromeColor: "rgba(23,24,28,0.8)",
        },
      },
      figma_line: {
        grid: {
          vertical: { top: 20, right: 22, bottom: 44, left: 44, containLabel: true },
        },
        axis: {
          lineColor: "rgba(23,24,28,0.36)",
          splitLineColor: "rgba(23,24,28,0.16)",
          splitLineType: "dotted",
          xSplitLineShow: true,
          ySplitLineShow: true,
          xRotate: -30,
          xUppercase: true,
          padMonoPercentTicks: false,
          monoTickWidth: 3,
          labelColor: "rgba(23,24,28,0.4)",
        },
        series: {
          lineWidth: 2.2,
          symbolSize: 8,
          symbolBorderColor: panelSoft,
          symbolBorderWidth: 2,
          useNeutralLineForSingleSeries: true,
          neutralLineColor: "rgba(23,24,28,0.52)",
          endpointEmphasis: true,
          endpointAccentColor: statusBlue,
          endpointHaloColor: "rgba(60,100,255,0.22)",
          endpointDotSize: 11,
          endpointHaloSize: 26,
          areaOpacity: 0.18,
        },
      },
      figma_donut_offset: {
        pie: {
          progressMode: true,
          ringInner: "70%",
          ringOuter: "84%",
          center: ["50%", "50%"],
          startAngle: 90,
          clockwise: true,
          trackColor: silver,
          accentColor: statusHigh,
          gapBorderColor: panelSoft,
          gapBorderWidth: 2,
        },
        legend: {
          show: false,
        },
      },
      figma_combo: {
        palette: [
          statusBlue,
          statusLow,
          statusHigh,
          statusMedium,
          "#22A9D5",
          "#6A5ACD",
          "#8F9BB3",
        ],
        grid: {
          vertical: { top: 24, right: 48, bottom: 64, left: 58, containLabel: true },
        },
        axis: {
          lineColor: "rgba(23,24,28,0.3)",
          splitLineColor: "rgba(23,24,28,0.1)",
          splitLineType: "solid",
          ySplitLineShow: true,
          xRotate: 0,
          xUppercase: false,
        },
        series: {
          comboBarColor: statusBlue,
          comboLineColor: statusLow,
          comboBarLabelColor: "#F2F5FF",
          comboLineLabelColor: statusLow,
          comboShowLabels: true,
          barMaxWidth: 56,
          lineWidth: 3,
          symbolSize: 7,
        },
        legend: {
          top: "bottom",
          textColor: "rgba(23,24,28,0.9)",
          itemWidth: 11,
          itemHeight: 5,
        },
      },
      figma_radar: {
        radar: {
          shape: "polygon",
          splitNumber: 5,
          splitLineColor: "rgba(215,215,231,0.9)",
          splitLineWidth: 2,
          splitAreaColor: ["transparent"],
          axisNameColor: "rgba(23,24,28,0.82)",
          axisNameFontSize: 14,
          lineColor: statusBlue,
          areaColor: "rgba(60,100,255,0.22)",
          areaOpacity: 0.22,
          symbol: "none",
          symbolSize: 0,
        },
      },
    },
  };
}

export function resolveChartPalette(visual = {}, overrides = {}, chartTheme = readBrandChartTheme()) {
  const useBrandDefaults = visual?.useBrandDefaults !== false;
  const paletteOverride = [
    ...parsePaletteInput(visual?.paletteOverride),
    ...parsePaletteInput(visual?.palette),
    ...parsePaletteInput(overrides?.palette),
  ];
  const paletteSource = paletteOverride.length
    ? paletteOverride
    : (useBrandDefaults ? chartTheme.palette : LEGACY_FALLBACK_PALETTE);

  return paletteSource.map((entry, index) => {
    const fallback = chartTheme.palette[index % chartTheme.palette.length] || LEGACY_FALLBACK_PALETTE[index % LEGACY_FALLBACK_PALETTE.length];
    return resolveThemeColor(entry, fallback);
  });
}

function safeLocale() {
  if (typeof navigator !== "undefined" && navigator?.language) {
    return navigator.language;
  }
  return "en-GB";
}

export function createChartValueFormatter(format = {}, options = {}) {
  const locale = String(options.locale || safeLocale());
  const decimalsRaw = Number(format?.decimals);
  const decimals = Number.isFinite(decimalsRaw) ? clamp(Math.round(decimalsRaw), 0, 8) : null;
  const prefix = typeof format?.prefix === "string" ? format.prefix : "";
  const suffix = typeof format?.suffix === "string" ? format.suffix : "";
  const compactThresholdRaw = Number(format?.compactThreshold);
  const compactThreshold = Number.isFinite(compactThresholdRaw)
    ? Math.max(1000, compactThresholdRaw)
    : 10000;

  return (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return `${prefix}${String(value ?? "")}${suffix}`;
    }

    const suffixTrimmed = suffix.trim();
    const useCompact = decimals == null && suffixTrimmed !== "%" && Math.abs(numeric) >= compactThreshold;
    let rendered;
    if (useCompact) {
      rendered = new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(numeric);
    } else {
      const maxFractionDigits = decimals == null
        ? (suffixTrimmed === "%" ? 0 : (Math.abs(numeric) >= 100 ? 0 : 2))
        : decimals;
      rendered = new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals == null ? 0 : decimals,
        maximumFractionDigits: maxFractionDigits,
      }).format(numeric);
    }

    return `${prefix}${rendered}${suffix}`;
  };
}
