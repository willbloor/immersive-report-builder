import { clamp, toNumber } from "../utils/helpers.js";

function normalizeUnit(unit) {
  return String(unit || "").trim().toLowerCase();
}

function isPercentLikeUnit(unit) {
  const text = normalizeUnit(unit);
  if (!text) return false;
  return text.includes("%") || text.includes("percent") || text === "/100" || text === "pct";
}

function roundPercent(value) {
  return Math.round(value * 100) / 100;
}

export function deriveDonutPercentFromValue(value, unit, fallbackPercent = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return roundPercent(clamp(toNumber(fallbackPercent, 0), 0, 100));
  }

  if (normalizeUnit(unit) === "x") {
    return roundPercent(clamp(Math.abs((numericValue - 1) * 100), 0, 100));
  }

  if (isPercentLikeUnit(unit)) {
    return roundPercent(clamp(numericValue, 0, 100));
  }

  return roundPercent(clamp(toNumber(fallbackPercent, 0), 0, 100));
}

export function resolveDonutPercent(props = {}) {
  return deriveDonutPercentFromValue(props.value, props.unit, props.percent);
}

export function resolveDonutItemPercent(item = {}) {
  return deriveDonutPercentFromValue(item.value, item.unit, item.percent);
}
