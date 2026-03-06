export const APP_VERSION = "0.2";

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function fmtTwo(value) {
  return String(value).padStart(2, "0");
}

export function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function kebabToTitle(text) {
  return String(text || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function downloadText(filename, content, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function debounce(fn, waitMs) {
  let timeoutId = null;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), waitMs);
  };
}

function pathTokens(path) {
  const text = String(path || "").trim();
  if (!text) return [];

  const tokens = [];
  const tokenRegex = /([^[.\]]+)|\[(\d+)\]/g;
  let match = tokenRegex.exec(text);
  while (match) {
    if (match[1]) {
      tokens.push(match[1]);
    } else if (match[2]) {
      tokens.push(Number(match[2]));
    }
    match = tokenRegex.exec(text);
  }
  return tokens;
}

export function setByPath(target, path, value) {
  if (!target || typeof target !== "object") return;
  const parts = pathTokens(path);
  if (parts.length === 0) return;
  let ref = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const nextKey = parts[i + 1];
    const expectsArray = typeof nextKey === "number";

    if (Array.isArray(ref)) {
      const index = typeof key === "number" ? key : Number.parseInt(String(key), 10);
      if (!Number.isInteger(index) || index < 0) return;
      const current = ref[index];
      if (
        !current ||
        typeof current !== "object" ||
        (expectsArray && !Array.isArray(current)) ||
        (!expectsArray && Array.isArray(current))
      ) {
        ref[index] = expectsArray ? [] : {};
      }
      ref = ref[index];
      continue;
    }

    if (
      typeof ref[key] !== "object" ||
      ref[key] === null ||
      (expectsArray && !Array.isArray(ref[key])) ||
      (!expectsArray && Array.isArray(ref[key]))
    ) {
      ref[key] = expectsArray ? [] : {};
    }
    ref = ref[key];
  }

  const leaf = parts[parts.length - 1];
  if (Array.isArray(ref) && typeof leaf === "number") {
    ref[leaf] = value;
    return;
  }
  if (ref && typeof ref === "object") {
    ref[leaf] = value;
  }
}

export function getByPath(target, path) {
  const parts = pathTokens(path);
  if (parts.length === 0) return undefined;
  return parts.reduce((acc, key) => (acc == null ? undefined : acc[key]), target);
}

export function isNumeric(n) {
  return Number.isFinite(Number(n));
}

export function toNumber(n, fallback = 0) {
  const num = Number(n);
  return Number.isFinite(num) ? num : fallback;
}

export function pairsToCsv(pairs) {
  return (pairs || []).map((row) => `${row.label},${row.value}`).join("\n");
}

export function csvToPairs(csvText) {
  return String(csvText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",");
      return {
        label: (parts.shift() || "").trim(),
        value: toNumber(parts.join(",").trim(), 0),
      };
    })
    .filter((row) => row.label);
}
