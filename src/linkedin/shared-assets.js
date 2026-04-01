import { safeJsonParse, uid } from "../utils/helpers.js?v=20260401r";
import { LINKEDIN_SHARED_ASSETS_KEY } from "./constants.js?v=20260401r";

function readJson(key, fallback = null) {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = safeJsonParse(raw);
    return parsed.ok ? parsed.value : fallback;
  } catch (_error) {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeSubjectBounds(bounds) {
  const x = Number(bounds?.x);
  const y = Number(bounds?.y);
  const w = Number(bounds?.w);
  const h = Number(bounds?.h);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    w: Math.max(0, Math.min(1, w)),
    h: Math.max(0, Math.min(1, h)),
  };
}

function normalizeAsset(asset = {}) {
  return {
    id: String(asset.id || uid("asset")),
    type: asset.type === "image" ? "image" : "image",
    filename: String(asset.filename || "asset.png"),
    mime: String(asset.mime || "image/png"),
    size: Math.max(0, Number(asset.size) || 0),
    dataUrl: String(asset.dataUrl || ""),
    trimProcessed: asset.trimProcessed === true,
    trimApplied: asset.trimApplied === true,
    width: Math.max(0, Number(asset.width) || 0),
    height: Math.max(0, Number(asset.height) || 0),
    subjectBounds: normalizeSubjectBounds(asset.subjectBounds),
    templateAssetId: asset.templateAssetId ? String(asset.templateAssetId) : null,
    sourceUrl: asset.sourceUrl ? String(asset.sourceUrl) : "",
    addedAt: asset.addedAt ? String(asset.addedAt) : "",
  };
}

function assetKey(asset = {}) {
  if (asset.templateAssetId) return `template:${asset.templateAssetId}`;
  if (asset.sourceUrl) return `source:${asset.sourceUrl}`;
  return `id:${asset.id || ""}`;
}

export function mergeAssetLibraries(existingAssets = [], incomingAssets = []) {
  const order = [];
  const map = new Map();

  function upsert(asset) {
    if (!asset || typeof asset !== "object") return;
    const normalized = normalizeAsset(asset);
    const key = assetKey(normalized);
    const existing = map.get(key);
    if (!existing) {
      order.push(key);
      map.set(key, normalized);
      return;
    }
    map.set(key, {
      ...existing,
      ...normalized,
      id: existing.id || normalized.id,
      addedAt: existing.addedAt || normalized.addedAt || "",
    });
  }

  for (const asset of existingAssets) upsert(asset);
  for (const asset of incomingAssets) upsert(asset);

  return order.map((key) => map.get(key)).filter(Boolean);
}

export function loadSharedAssetLibrary() {
  const raw = readJson(LINKEDIN_SHARED_ASSETS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return mergeAssetLibraries([], raw);
}

export function saveSharedAssetLibrary(assets = []) {
  const next = mergeAssetLibraries([], assets);
  writeJson(LINKEDIN_SHARED_ASSETS_KEY, next);
  return next;
}
