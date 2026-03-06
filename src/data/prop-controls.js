import { deepClone } from "../utils/helpers.js";

const HIDDEN_PATHS_BY_TYPE = {
  donut: new Set(["percent"]),
  donut_pair: new Set(["items[].percent"]),
};

const ARRAY_RULES_BY_TYPE = {
  line: {
    points: {
      groupLabel: "Points",
      itemLabel: "Point",
      allowAddRemove: true,
      minItems: 2,
      maxItems: 14,
      itemFactory: (_items, nextIndex) => ({
        label: `Point ${nextIndex}`,
        value: 0,
      }),
    },
  },
  bar: {
    points: {
      groupLabel: "Points",
      itemLabel: "Point",
      allowAddRemove: true,
      minItems: 1,
      maxItems: 8,
      itemFactory: (_items, nextIndex) => ({
        label: `Point ${nextIndex}`,
        value: 0,
      }),
    },
  },
  donut_pair: {
    items: {
      groupLabel: "Items",
      itemLabel: "Item",
      allowAddRemove: false,
      minItems: 2,
      maxItems: 2,
    },
  },
  waffle_group: {
    items: {
      groupLabel: "Items",
      itemLabel: "Item",
      allowAddRemove: false,
      minItems: 3,
      maxItems: 3,
    },
  },
  kpi_columns: {
    items: {
      groupLabel: "Items",
      itemLabel: "Item",
      allowAddRemove: false,
      minItems: 3,
      maxItems: 3,
    },
  },
};

const GROUP_LABEL_OVERRIDES = {
  typography: "Typography",
  "typography.title": "Title Typography",
  "typography.body": "Body Typography",
  surface: "Surface",
  left: "Left",
  right: "Right",
  sectionMenu: "Section Menu",
  primaryNav: "Primary Navigation",
};

function normalizedPath(path) {
  return String(path || "")
    .replace(/\[(\d+)\]/g, "[]")
    .replace(/^\.+/, "")
    .replace(/\.+/g, ".");
}

function pathLeaf(path) {
  const tokens = String(path || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  return tokens[tokens.length - 1] || "";
}

export function propLabel(key) {
  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export function isControlPathVisible(componentType, path) {
  const hidden = HIDDEN_PATHS_BY_TYPE[componentType];
  if (!hidden || hidden.size === 0) return true;
  return !hidden.has(normalizedPath(path));
}

export function arrayControlSpecFor(componentType, path) {
  const typeRules = ARRAY_RULES_BY_TYPE[componentType] || {};
  const key = normalizedPath(path);
  const rule = typeRules[key] || null;
  const leaf = pathLeaf(path);
  const defaults = {
    groupLabel: propLabel(leaf || "Items"),
    itemLabel: "Item",
    allowAddRemove: false,
    minItems: 0,
    maxItems: Number.POSITIVE_INFINITY,
    itemFactory: null,
  };
  if (!rule) return defaults;
  return {
    ...defaults,
    ...rule,
  };
}

export function groupLabelForPath(componentType, path, fallbackKey = "") {
  const key = normalizedPath(path);
  const typeRules = ARRAY_RULES_BY_TYPE[componentType] || {};
  if (typeRules[key]?.groupLabel) return typeRules[key].groupLabel;
  if (GROUP_LABEL_OVERRIDES[key]) return GROUP_LABEL_OVERRIDES[key];
  const leaf = pathLeaf(path) || fallbackKey;
  return propLabel(leaf || "Group");
}

function resetTemplateValue(value, nextLabel) {
  if (Array.isArray(value)) return [];
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  if (typeof value === "string") {
    if (/^var\(/.test(value.trim())) return value;
    return "";
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([key, child]) => {
      if (key === "label") {
        out[key] = nextLabel;
      } else {
        out[key] = resetTemplateValue(child, nextLabel);
      }
    });
    return out;
  }
  return null;
}

export function createArrayItemForPath(componentType, path, items = []) {
  const current = Array.isArray(items) ? items : [];
  const spec = arrayControlSpecFor(componentType, path);
  const nextIndex = current.length + 1;
  if (typeof spec.itemFactory === "function") {
    return spec.itemFactory(current, nextIndex);
  }

  if (current.length > 0) {
    const seed = deepClone(current[current.length - 1]);
    const nextLabel = `${spec.itemLabel} ${nextIndex}`;
    return resetTemplateValue(seed, nextLabel);
  }

  return {
    label: `${spec.itemLabel} ${nextIndex}`,
    value: 0,
  };
}
