import { uid } from "../utils/helpers.js";

function inferColumns(rows) {
  const keys = new Set();
  rows.forEach((row) => {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      Object.keys(row).forEach((key) => keys.add(key));
    }
  });

  return Array.from(keys).map((key) => {
    const numeric = rows.reduce((count, row) => count + (Number.isFinite(Number(row?.[key])) ? 1 : 0), 0);
    return {
      key,
      type: numeric >= Math.ceil(rows.length / 2) ? "number" : "string",
    };
  });
}

export function parseDatasetJson(candidate, fallbackName = "Imported JSON Dataset") {
  if (Array.isArray(candidate)) {
    const rows = candidate.filter((row) => row && typeof row === "object" && !Array.isArray(row));
    if (rows.length === 0) {
      return { ok: false, error: "JSON array must contain row objects." };
    }
    return {
      ok: true,
      value: {
        id: uid("ds"),
        name: fallbackName,
        columns: inferColumns(rows),
        rows,
      },
    };
  }

  if (candidate && typeof candidate === "object") {
    if (Array.isArray(candidate.rows)) {
      const rows = candidate.rows;
      const columns = Array.isArray(candidate.columns) && candidate.columns.length > 0 ? candidate.columns : inferColumns(rows);
      return {
        ok: true,
        value: {
          id: candidate.id || uid("ds"),
          name: candidate.name || fallbackName,
          columns,
          rows,
        },
      };
    }

    if (Array.isArray(candidate.datasets) && candidate.datasets.length > 0) {
      const first = candidate.datasets[0];
      return parseDatasetJson(first, first.name || fallbackName);
    }
  }

  return { ok: false, error: "Unsupported dataset JSON shape." };
}
