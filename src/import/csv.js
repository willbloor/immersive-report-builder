import { uid } from "../utils/helpers.js";

function parseLine(line) {
  const out = [];
  let token = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        token += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (ch === "," && !insideQuotes) {
      out.push(token.trim());
      token = "";
      continue;
    }

    token += ch;
  }

  out.push(token.trim());
  return out;
}

export function parseCsvText(csvText) {
  const lines = String(csvText || "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { ok: false, error: "CSV needs a header and at least one row." };
  }

  const headers = parseLine(lines[0]).map((header, index) => header || `col_${index + 1}`);
  const rows = lines.slice(1).map((line) => {
    const fields = parseLine(line);
    const row = {};
    headers.forEach((header, index) => {
      const raw = fields[index] ?? "";
      const num = Number(raw);
      row[header] = Number.isFinite(num) && raw !== "" ? num : raw;
    });
    return row;
  });

  const columns = headers.map((header) => {
    const numericCount = rows.reduce((acc, row) => acc + (typeof row[header] === "number" ? 1 : 0), 0);
    return {
      key: header,
      type: numericCount >= Math.ceil(rows.length / 2) ? "number" : "string",
    };
  });

  return {
    ok: true,
    value: {
      id: uid("ds"),
      name: "Imported CSV Dataset",
      columns,
      rows,
    },
  };
}
