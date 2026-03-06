import { clamp, toNumber } from "./helpers.js";

export const TEXT_COMPONENT_TYPES = new Set([
  "text",
  "all_caps_title",
  "header_3",
  "copy_block",
  "cover_hero",
  "section_intro",
]);

export const TYPOGRAPHY_FONT_OPTIONS = [
  { value: "geologica", label: "Geologica" },
  { value: "chivo_mono", label: "Chivo Mono" },
];

export const DOCUMENT_COLOR_PRESETS = [
  "#FFFFFF",
  "#F5F5F9",
  "#ECEEF5",
  "#D7D7E7",
  "#17181C",
  "#3C64FF",
  "#F23F55",
  "#FFBF00",
  "#12DD7E",
];

const FONT_STACKS = {
  geologica: '"Geologica", sans-serif',
  chivo_mono: '"Chivo Mono", monospace',
};

const FONT_WEIGHTS = new Set([300, 400, 500, 600, 700]);
const TEXT_ALIGNS = new Set(["left", "center", "right"]);
const KEYLINE_TYPES = new Set(["none", "thin", "thick"]);
const TRANSPARENT_SURFACE_VALUES = new Set(["transparent", "none"]);

function normalizeColor(value, fallback = "#17181C") {
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

function normalizeSurfaceColor(value, fallback = "#FFFFFF") {
  const raw = String(value || "").trim().toLowerCase();
  if (TRANSPARENT_SURFACE_VALUES.has(raw)) {
    return "transparent";
  }
  return normalizeColor(value, fallback);
}

function normalizeStyle(style, fallback) {
  const candidate = style && typeof style === "object" ? style : {};
  const resolvedWeight = Number.parseInt(String(candidate.fontWeight ?? fallback.fontWeight), 10);
  const resolvedFamily = String(candidate.fontFamily || fallback.fontFamily);

  return {
    fontFamily: Object.hasOwn(FONT_STACKS, resolvedFamily) ? resolvedFamily : fallback.fontFamily,
    fontSize: clamp(Math.round(toNumber(candidate.fontSize, fallback.fontSize)), 8, 220),
    fontWeight: FONT_WEIGHTS.has(resolvedWeight) ? resolvedWeight : fallback.fontWeight,
    fontStyle: candidate.fontStyle === "italic" ? "italic" : "normal",
    textDecoration: candidate.textDecoration === "underline" ? "underline" : "none",
    lineHeight: clamp(toNumber(candidate.lineHeight, fallback.lineHeight), 0.8, 3),
    letterSpacing: clamp(toNumber(candidate.letterSpacing, fallback.letterSpacing), -8, 20),
    textTransform: candidate.textTransform === "uppercase" ? "uppercase" : "none",
    textAlign: TEXT_ALIGNS.has(candidate.textAlign) ? candidate.textAlign : fallback.textAlign,
    color: normalizeColor(candidate.color, fallback.color),
  };
}

function defaultStylesForType(type) {
  if (type === "all_caps_title") {
    return {
      title: {
        fontFamily: "geologica",
        fontSize: 30,
        fontWeight: 500,
        fontStyle: "normal",
        textDecoration: "none",
        lineHeight: 1.1,
        letterSpacing: -0.3,
        textTransform: "uppercase",
        textAlign: "left",
        color: "#17181C",
      },
      body: {
        fontFamily: "geologica",
        fontSize: 14,
        fontWeight: 400,
        fontStyle: "normal",
        textDecoration: "none",
        lineHeight: 1.45,
        letterSpacing: 0,
        textTransform: "none",
        textAlign: "left",
        color: "#646A79",
      },
    };
  }

  if (type === "header_3") {
    return {
      title: {
        fontFamily: "geologica",
        fontSize: 25,
        fontWeight: 500,
        fontStyle: "normal",
        textDecoration: "none",
        lineHeight: 1.1,
        letterSpacing: -0.38,
        textTransform: "none",
        textAlign: "left",
        color: "#17181C",
      },
      body: {
        fontFamily: "geologica",
        fontSize: 14,
        fontWeight: 400,
        fontStyle: "normal",
        textDecoration: "none",
        lineHeight: 1.45,
        letterSpacing: 0,
        textTransform: "none",
        textAlign: "left",
        color: "#646A79",
      },
    };
  }

  if (type === "copy_block") {
    return {
      title: {
        fontFamily: "geologica",
        fontSize: 18,
        fontWeight: 500,
        fontStyle: "normal",
        textDecoration: "none",
        lineHeight: 1.2,
        letterSpacing: -0.27,
        textTransform: "none",
        textAlign: "left",
        color: "#17181C",
      },
      body: {
        fontFamily: "geologica",
        fontSize: 16,
        fontWeight: 400,
        fontStyle: "normal",
        textDecoration: "none",
        lineHeight: 1.35,
        letterSpacing: -0.16,
        textTransform: "none",
        textAlign: "left",
        color: "#646A79",
      },
    };
  }

  if (type === "cover_hero") {
    return {
      title: {
        fontFamily: "geologica",
        fontSize: 96,
        fontWeight: 600,
        fontStyle: "normal",
        textDecoration: "none",
        lineHeight: 0.95,
        letterSpacing: -0.6,
        textTransform: "none",
        textAlign: "left",
        color: "#F8FAFF",
      },
      body: {
        fontFamily: "geologica",
        fontSize: 18,
        fontWeight: 500,
        fontStyle: "normal",
        textDecoration: "none",
        lineHeight: 1.4,
        letterSpacing: 0,
        textTransform: "none",
        textAlign: "left",
        color: "#F2F5FF",
      },
    };
  }

  if (type === "section_intro") {
    return {
      title: {
        fontFamily: "geologica",
        fontSize: 82,
        fontWeight: 600,
        fontStyle: "normal",
        textDecoration: "none",
        lineHeight: 0.95,
        letterSpacing: -0.5,
        textTransform: "none",
        textAlign: "left",
        color: "#F8FAFF",
      },
      body: {
        fontFamily: "geologica",
        fontSize: 21,
        fontWeight: 500,
        fontStyle: "normal",
        textDecoration: "none",
        lineHeight: 1.5,
        letterSpacing: 0,
        textTransform: "none",
        textAlign: "left",
        color: "#F2F5FF",
      },
    };
  }

  return {
    title: {
      fontFamily: "geologica",
      fontSize: 14,
      fontWeight: 600,
      fontStyle: "normal",
      textDecoration: "none",
      lineHeight: 1.2,
      letterSpacing: -0.28,
      textTransform: "none",
      textAlign: "left",
      color: "#17181C",
    },
    body: {
      fontFamily: "geologica",
      fontSize: 12,
      fontWeight: 400,
      fontStyle: "normal",
      textDecoration: "none",
      lineHeight: 1.45,
      letterSpacing: 0,
      textTransform: "none",
      textAlign: "left",
      color: "#646A79",
    },
  };
}

function defaultSurfaceForType(type) {
  if (type === "cover_hero" || type === "section_intro") {
    return {
      backgroundColor: "#121A36",
      keyline: "none",
      keylineColor: "#D7D7E7",
    };
  }

  if (type === "all_caps_title") {
    return {
      backgroundColor: "transparent",
      keyline: "none",
      keylineColor: "#D7D7E7",
    };
  }

  if (type === "text") {
    return {
      backgroundColor: "#FFFFFF",
      keyline: "thin",
      keylineColor: "#D7D7E7",
    };
  }
  return {
    backgroundColor: "#ECEEF5",
    keyline: "thin",
    keylineColor: "#D7D7E7",
  };
}

function normalizeSurface(type, surface) {
  const fallback = defaultSurfaceForType(type);
  const candidate = surface && typeof surface === "object" ? surface : {};
  return {
    backgroundColor: normalizeSurfaceColor(candidate.backgroundColor, fallback.backgroundColor),
    keyline: KEYLINE_TYPES.has(candidate.keyline) ? candidate.keyline : fallback.keyline,
    keylineColor: normalizeColor(candidate.keylineColor, fallback.keylineColor),
  };
}

function fmtNumber(value, digits = 3) {
  return Number(value)
    .toFixed(digits)
    .replace(/\.?0+$/, "");
}

export function isTextComponentType(type) {
  return TEXT_COMPONENT_TYPES.has(type);
}

export function normalizeTypography(type, typography) {
  const defaults = defaultStylesForType(type);
  const source = typography && typeof typography === "object" ? typography : {};
  return {
    title: normalizeStyle(source.title, defaults.title),
    body: normalizeStyle(source.body, defaults.body),
  };
}

export function normalizeTypographySurfaceProps(type, props = {}) {
  const base = props && typeof props === "object" ? { ...props } : {};
  base.typography = normalizeTypography(type, base.typography);
  base.surface = normalizeSurface(type, base.surface);
  return base;
}

export function normalizeTypographyProps(type, props = {}) {
  if (!isTextComponentType(type)) {
    return props && typeof props === "object" ? props : {};
  }
  return normalizeTypographySurfaceProps(type, props);
}

export function textSurfaceToInlineCss(surface, type = "text") {
  const normalized = normalizeSurface(type, surface);
  const keylineWidth = normalized.keyline === "none" ? 0 : normalized.keyline === "thick" ? 3 : 1;
  return [
    `background-color:${normalized.backgroundColor}`,
    `--surface-keyline-color:${normalized.keylineColor}`,
    `--surface-keyline-width:${keylineWidth}px`,
    keylineWidth > 0 ? `border:${keylineWidth}px solid ${normalized.keylineColor}` : "border:0",
    "border-radius:0",
  ].join(";");
}

export function typographyStyleToInlineCss(style, { scale = 1 } = {}) {
  const fallback = defaultStylesForType("text").body;
  const normalized = normalizeStyle(style, fallback);
  const resolvedScale = clamp(toNumber(scale, 1), 0.4, 3);

  const fontSize = normalized.fontSize * resolvedScale;
  const letterSpacing = normalized.letterSpacing * resolvedScale;

  return [
    `font-family:${FONT_STACKS[normalized.fontFamily]}`,
    `font-size:${fmtNumber(fontSize)}px`,
    `font-weight:${normalized.fontWeight}`,
    `font-style:${normalized.fontStyle}`,
    `text-decoration:${normalized.textDecoration}`,
    `line-height:${fmtNumber(normalized.lineHeight)}`,
    `letter-spacing:${fmtNumber(letterSpacing)}px`,
    `text-transform:${normalized.textTransform}`,
    `text-align:${normalized.textAlign}`,
    `color:${normalized.color}`,
  ].join(";");
}
