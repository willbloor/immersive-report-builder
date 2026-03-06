import { getProfile } from "./profiles.js";

const DYNAMIC_PRINT_STYLE_ID = "dynamic-print-style";
const MARGIN_MIN_MM = 0;
const MARGIN_MAX_MM = 25;

function normalizeMarginValue(value, fallback = 0) {
  const numeric = Number.isFinite(value) ? value : Number.parseFloat(String(value ?? ""));
  const rounded = Number.isFinite(numeric) ? Math.round(numeric) : fallback;
  return Math.max(MARGIN_MIN_MM, Math.min(MARGIN_MAX_MM, rounded));
}

export function normalizeMargins(marginsMm = {}) {
  return {
    top: normalizeMarginValue(marginsMm.top, 8),
    right: normalizeMarginValue(marginsMm.right, 8),
    bottom: normalizeMarginValue(marginsMm.bottom, 10),
    left: normalizeMarginValue(marginsMm.left, 8),
  };
}

export function applyRuntimeProfile(state) {
  const profile = getProfile(state.project.printProfile);
  const margin = normalizeMargins(state.project.marginsMm);
  const root = document.documentElement;
  root.style.setProperty("--page-width", profile.width);
  root.style.setProperty("--page-height", profile.height);
  root.style.setProperty("--print-size", profile.cssSize);
  root.style.setProperty("--margin-top-mm", `${margin.top}mm`);
  root.style.setProperty("--margin-right-mm", `${margin.right}mm`);
  root.style.setProperty("--margin-bottom-mm", `${margin.bottom}mm`);
  root.style.setProperty("--margin-left-mm", `${margin.left}mm`);
}

function ensurePrintStyleElement() {
  let styleEl = document.getElementById(DYNAMIC_PRINT_STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = DYNAMIC_PRINT_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  return styleEl;
}

export function updatePrintCss(state) {
  const profile = getProfile(state.project.printProfile);
  const margin = normalizeMargins(state.project.marginsMm);
  const styleEl = ensurePrintStyleElement();
  styleEl.textContent = `
    @media print {
      :root {
        --margin-top-mm: ${margin.top}mm;
        --margin-right-mm: ${margin.right}mm;
        --margin-bottom-mm: ${margin.bottom}mm;
        --margin-left-mm: ${margin.left}mm;
      }
      @page {
        size: ${profile.cssSize};
        margin: 0;
      }
    }
  `;
}

export function printProject(state) {
  applyRuntimeProfile(state);
  updatePrintCss(state);
  window.print();
}
