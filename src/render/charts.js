import { clamp, escapeHtml, toNumber } from "../utils/helpers.js";

function polar(cx, cy, radius, degrees) {
  const radians = (Math.PI / 180) * degrees;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function arcPath(cx, cy, radius, start, end) {
  const p0 = polar(cx, cy, radius, start);
  const p1 = polar(cx, cy, radius, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;
}

export function renderGaugeSvg({ value = 50, max = 100, accent = "var(--status-blue)" }) {
  const safeValue = toNumber(value, 0);
  const safeMax = Math.max(1, toNumber(max, 100));
  const ratio = clamp(safeValue / safeMax, 0, 1);
  const angle = -180 + 180 * ratio;

  return `
    <svg class="chart-svg" viewBox="0 0 280 160" role="img" aria-label="Gauge chart">
      <path d="${arcPath(140, 130, 105, -180, 0)}" stroke="rgba(20, 29, 56, 0.15)" stroke-width="22" fill="none" stroke-linecap="round"></path>
      <path d="${arcPath(140, 130, 105, -180, angle)}" stroke="${accent}" stroke-width="22" fill="none" stroke-linecap="round"></path>
      <line x1="20" y1="130" x2="260" y2="130" stroke="rgba(20,29,56,0.16)"></line>
    </svg>
  `;
}

export function renderLineSvg({ points = [], max = 100, min = 0 }) {
  const clean = (points || []).slice(0, 14);
  if (clean.length < 2) {
    return '<div class="chart-empty">Add at least two points.</div>';
  }

  const width = 620;
  const height = 220;
  const pad = { left: 48, right: 24, top: 24, bottom: 36 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const safeMax = toNumber(max, 100);
  const safeMin = toNumber(min, 0);

  const coords = clean.map((point, idx) => {
    const x = pad.left + (chartW * idx) / (clean.length - 1);
    const safeValue = clamp(toNumber(point.value, 0), safeMin, safeMax);
    const y = pad.top + chartH * (1 - (safeValue - safeMin) / (safeMax - safeMin || 1));
    return { x, y, label: String(point.label || "") };
  });

  const path = coords.map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  const labels = coords
    .map(
      (point, idx) =>
        `<text x="${point.x}" y="${height - 10}" text-anchor="middle" class="axis-label">${escapeHtml(
          clean.length > 8 && idx % 2 === 1 ? "" : point.label,
        )}</text>`,
    )
    .join("");

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Line chart">
      <path d="${path}" fill="none" stroke="var(--status-blue)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      ${coords
        .map(
          (point, index) =>
            `<circle cx="${point.x}" cy="${point.y}" r="${index === coords.length - 1 ? 9 : 5}" fill="${
              index === coords.length - 1 ? "rgba(89,114,214,0.32)" : "#fff"
            }"></circle><circle cx="${point.x}" cy="${point.y}" r="4" fill="var(--status-blue)"></circle>`,
        )
        .join("")}
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="rgba(16,22,44,0.2)"></line>
      ${labels}
    </svg>
  `;
}

export function renderBarSvg({ points = [], max = 100 }) {
  const clean = (points || []).slice(0, 8);
  if (clean.length === 0) {
    return '<div class="chart-empty">Add rows to render bars.</div>';
  }

  const width = 620;
  const height = 220;
  const pad = { left: 96, right: 24, top: 20, bottom: 18 };
  const chartW = width - pad.left - pad.right;
  const safeMax = Math.max(1, toNumber(max, 100));
  const rowHeight = 20;
  const rowGap = 8;

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">
      ${clean
        .map((point, idx) => {
          const y = pad.top + idx * (rowHeight + rowGap);
          const ratio = clamp(toNumber(point.value, 0) / safeMax, 0, 1);
          const fill = Math.round(ratio * chartW);
          return `
            <text x="${pad.left - 10}" y="${y + 14}" text-anchor="end" class="axis-label">${escapeHtml(
            String(point.label || ""),
          )}</text>
            <rect x="${pad.left}" y="${y}" rx="10" ry="10" width="${chartW}" height="${rowHeight}" fill="rgba(20,29,56,0.07)"></rect>
            <rect x="${pad.left}" y="${y}" rx="10" ry="10" width="${fill}" height="${rowHeight}" fill="var(--status-blue)"></rect>
          `;
        })
        .join("")}
    </svg>
  `;
}

export function renderWaffleGrid(percent = 0, accent = "var(--status-high)") {
  const onCount = clamp(Math.round(toNumber(percent, 0)), 0, 100);
  const cells = [];
  for (let i = 0; i < 100; i += 1) {
    const on = i < onCount;
    cells.push(`<span style="background:${on ? accent : "rgba(15,21,36,0.12)"}"></span>`);
  }
  return `<div class="waffle-grid">${cells.join("")}</div>`;
}

export function renderDonutSvg({ percent = 12 }) {
  const value = clamp(toNumber(percent, 0), 0, 100);
  const angle = (value / 100) * 360;
  return `
    <svg class="donut-svg" viewBox="0 0 120 120" role="img" aria-label="Donut chart">
      <circle cx="60" cy="60" r="42" stroke="rgba(89,114,214,0.20)" stroke-width="10" fill="none"></circle>
      <circle cx="60" cy="60" r="42" stroke="var(--status-blue)" stroke-width="10" fill="none" stroke-linecap="round"
        transform="rotate(-90 60 60)"
        stroke-dasharray="${(angle / 360) * 264} 264"></circle>
    </svg>
  `;
}

export function renderLollipopSvg({ min = 1, max = 10, you = 6, benchmark = 7, leftLabel = "You", rightLabel = "Benchmark" }) {
  const safeMin = toNumber(min, 1);
  const safeMax = Math.max(safeMin + 1, toNumber(max, 10));
  const youValue = clamp(toNumber(you, safeMin), safeMin, safeMax);
  const benchmarkValue = clamp(toNumber(benchmark, safeMin), safeMin, safeMax);

  function y(value) {
    const top = 26;
    const bottom = 180;
    const h = bottom - top;
    return bottom - ((value - safeMin) / (safeMax - safeMin)) * h;
  }

  return `
    <svg class="chart-svg" viewBox="0 0 620 220" role="img" aria-label="Lollipop comparison chart">
      <line x1="88" y1="26" x2="580" y2="26" stroke="rgba(16,22,44,0.18)"></line>
      <line x1="88" y1="103" x2="580" y2="103" stroke="rgba(16,22,44,0.12)"></line>
      <line x1="88" y1="180" x2="580" y2="180" stroke="rgba(16,22,44,0.18)"></line>
      <text x="88" y="48" class="axis-label">Lvl ${escapeHtml(String(safeMax))}</text>
      <text x="88" y="124" class="axis-label">Lvl ${escapeHtml(String(Math.round((safeMax + safeMin) / 2)))}</text>
      <line x1="390" y1="${y(youValue)}" x2="390" y2="180" stroke="var(--status-low)" stroke-width="2"></line>
      <rect x="374" y="${y(youValue) - 12}" width="32" height="24" rx="10" ry="10" fill="var(--status-low)"></rect>
      <text x="390" y="${y(youValue) + 5}" text-anchor="middle" class="marker-label">${escapeHtml(String(youValue))}</text>
      <line x1="502" y1="${y(benchmarkValue)}" x2="502" y2="180" stroke="rgba(16,22,44,0.72)" stroke-width="2"></line>
      <rect x="486" y="${y(benchmarkValue) - 12}" width="32" height="24" rx="10" ry="10" fill="rgba(16,22,44,0.72)"></rect>
      <text x="502" y="${y(benchmarkValue) + 5}" text-anchor="middle" class="marker-label">${escapeHtml(
    String(benchmarkValue),
  )}</text>
      <text x="390" y="206" text-anchor="middle" class="axis-label">${escapeHtml(leftLabel)}</text>
      <text x="502" y="206" text-anchor="middle" class="axis-label">${escapeHtml(rightLabel)}</text>
    </svg>
  `;
}
