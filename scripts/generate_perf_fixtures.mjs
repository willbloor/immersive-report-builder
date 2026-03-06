#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bindingPresetForType, buildBinding } from "../src/data/bindings.js";
import { buildProjectBundle } from "../src/import/project-json.js";
import { makeEmptyState } from "../src/state/schema.js";
import { buildComponentFromType, clonePage, createInitialPages } from "../src/templates/catalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, "../fixtures/perf");

const COMPONENT_ROTATION = [
  "kpi",
  "gauge",
  "line",
  "bar",
  "waffle",
  "donut",
  "lollipop",
  "text",
  "copy_block",
  "delta_card",
  "recommendation_card",
];

const SCENARIOS = [
  {
    key: "small",
    label: "Small",
    pageCount: 8,
    extraComponentsPerPage: 3,
    datasetRows: 24,
    assetCount: 1,
    assetPayloadBytes: 2048,
  },
  {
    key: "medium",
    label: "Medium",
    pageCount: 20,
    extraComponentsPerPage: 7,
    datasetRows: 120,
    assetCount: 3,
    assetPayloadBytes: 8192,
  },
  {
    key: "large",
    label: "Large",
    pageCount: 45,
    extraComponentsPerPage: 12,
    datasetRows: 420,
    assetCount: 6,
    assetPayloadBytes: 24576,
  },
];

function countComponents(pages = []) {
  return pages.reduce((total, page) => total + (Array.isArray(page.components) ? page.components.length : 0), 0);
}

function normalizeCloneTitle(text) {
  const base = String(text || "Page")
    .replace(/\s*\(copy\)\s*/gi, " ")
    .trim();
  return base || "Page";
}

function expandPages(pages, targetCount) {
  if (!Array.isArray(pages)) return;
  let cursor = 0;
  while (pages.length < targetCount) {
    const source = pages[cursor % pages.length];
    const nextPage = clonePage(source);
    const baseTitle = normalizeCloneTitle(source?.title);
    nextPage.title = `${baseTitle} Clone ${pages.length - 6}`;
    pages.push(nextPage);
    cursor += 1;
  }
}

function placeComponentOnGrid(component, slotIndex) {
  if (!component || typeof component !== "object") return;

  const base = slotIndex + 1;
  const landscapeLane = base % 4;
  const landscapeStack = Math.floor(base / 4);
  const portraitLane = base % 2;
  const portraitStack = Math.floor(base / 2);

  const nextLayouts = {
    LETTER_landscape: {
      colStart: landscapeLane * 6 + 1,
      colSpan: 6,
      rowStart: landscapeStack * 8 + 2,
      rowSpan: 7,
    },
    A4_landscape: {
      colStart: landscapeLane * 6 + 1,
      colSpan: 6,
      rowStart: landscapeStack * 8 + 2,
      rowSpan: 7,
    },
    LETTER_portrait: {
      colStart: portraitLane * 12 + 1,
      colSpan: 12,
      rowStart: portraitStack * 8 + 2,
      rowSpan: 7,
    },
    A4_portrait: {
      colStart: portraitLane * 12 + 1,
      colSpan: 12,
      rowStart: portraitStack * 8 + 2,
      rowSpan: 7,
    },
  };

  component.layouts = {
    ...(component.layouts || {}),
    ...nextLayouts,
  };
  component.defaultLayouts = {
    ...(component.defaultLayouts || {}),
    ...nextLayouts,
  };
  if (component.defaultState && typeof component.defaultState === "object") {
    component.defaultState.layouts = {
      ...(component.defaultState.layouts || {}),
      ...nextLayouts,
    };
  }
}

function enrichPagesWithComponents(pages, extraComponentsPerPage) {
  let rotationCursor = 0;
  for (const page of pages) {
    if (!Array.isArray(page.components)) page.components = [];
    for (let i = 0; i < extraComponentsPerPage; i += 1) {
      const componentType = COMPONENT_ROTATION[rotationCursor % COMPONENT_ROTATION.length];
      const component = buildComponentFromType(componentType);
      const slotIndex = page.components.length + i;
      placeComponentOnGrid(component, slotIndex);
      page.components.push(component);
      rotationCursor += 1;
    }
  }
}

function buildDataset(name, rowCount) {
  const rows = [];
  for (let i = 0; i < rowCount; i += 1) {
    rows.push({
      period: `P${String(i + 1).padStart(3, "0")}`,
      score: 35 + ((i * 7) % 60),
      benchmark: 45 + ((i * 5) % 45),
      you: 30 + ((i * 9) % 65),
      percent: (i * 13) % 100,
      delta: (i % 21) - 10,
    });
  }

  return {
    id: `ds_perf_${rowCount}`,
    name,
    columns: [
      { key: "period", type: "string" },
      { key: "score", type: "number" },
      { key: "benchmark", type: "number" },
      { key: "you", type: "number" },
      { key: "percent", type: "number" },
      { key: "delta", type: "number" },
    ],
    rows,
  };
}

function bindComponentToDataset(component, datasetId, rowCount, rowCursor) {
  const preset = bindingPresetForType(component.type);
  if (!preset) return rowCursor;

  const binding = buildBinding(component.type, {
    datasetId,
    mode: preset.mode,
    targetPath: preset.targetPath,
    mapping: {},
  });
  if (!binding) return rowCursor;

  if (binding.mode === "series") {
    binding.mapping.labelColumn = "period";
    binding.mapping.valueColumn = "score";
  } else if (component.type === "lollipop") {
    binding.mapping.youColumn = "you";
    binding.mapping.benchmarkColumn = "benchmark";
    binding.mapping.rowIndex = rowCursor % rowCount;
    rowCursor += 1;
  } else {
    binding.mapping.valueColumn = component.type === "waffle" ? "percent" : "score";
    binding.mapping.rowIndex = rowCursor % rowCount;
    rowCursor += 1;
  }

  component.dataBindings = [binding];
  return rowCursor;
}

function applyBindings(pages, dataset) {
  if (!dataset) return;
  const rowCount = Array.isArray(dataset.rows) ? dataset.rows.length : 0;
  if (rowCount < 1) return;

  let rowCursor = 0;
  for (const page of pages) {
    for (const component of page.components || []) {
      rowCursor = bindComponentToDataset(component, dataset.id, rowCount, rowCursor);
    }
  }
}

function makeSvgAsset(index, payloadBytes) {
  const payload = "x".repeat(Math.max(0, payloadBytes));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900"><defs><linearGradient id="grad${index}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f1f36"/><stop offset="100%" stop-color="#2a4f86"/></linearGradient></defs><rect width="1400" height="900" fill="url(#grad${index})"/><text x="64" y="120" fill="#ffffff" font-family="Geologica, sans-serif" font-size="52">Perf Asset ${index}</text><desc>${payload}</desc></svg>`;
  const buffer = Buffer.from(svg, "utf8");
  return {
    id: `asset_perf_${index}`,
    type: "image",
    filename: `perf-asset-${index}.svg`,
    mime: "image/svg+xml",
    size: buffer.byteLength,
    dataUrl: `data:image/svg+xml;base64,${buffer.toString("base64")}`,
  };
}

function attachCoverAsset(pages, asset) {
  if (!asset) return;
  for (const page of pages) {
    for (const component of page.components || []) {
      if (component.type !== "cover_hero") continue;
      component.props = {
        ...(component.props || {}),
        imageAssetId: asset.id,
        imageUrl: asset.dataUrl,
      };
      return;
    }
  }
}

function buildFixture(scenario) {
  const state = makeEmptyState();
  state.project.name = `Perf Fixture - ${scenario.label}`;
  state.project.org = "Perf Lab";
  state.project.period = scenario.label;
  state.pages = createInitialPages();

  expandPages(state.pages, scenario.pageCount);
  enrichPagesWithComponents(state.pages, scenario.extraComponentsPerPage);

  const dataset = buildDataset(`Perf Dataset - ${scenario.label}`, scenario.datasetRows);
  state.datasets = [dataset];
  applyBindings(state.pages, dataset);

  state.assets = Array.from({ length: scenario.assetCount }, (_, index) =>
    makeSvgAsset(index + 1, scenario.assetPayloadBytes),
  );
  attachCoverAsset(state.pages, state.assets[0]);

  state.ui.activePageId = state.pages[0]?.id || null;
  state.ui.selectedPageId = state.pages[0]?.id || null;
  state.ui.selectedComponentId = null;
  state.ui.paletteOpen = true;
  state.ui.inspectorOpen = true;

  return state;
}

async function writeFixture(scenario) {
  const state = buildFixture(scenario);
  const bundle = buildProjectBundle(state);
  const serialized = JSON.stringify(bundle, null, 2);
  const filePath = path.join(fixturesDir, `${scenario.key}.project.json`);
  await writeFile(filePath, serialized, "utf8");

  return {
    filePath,
    bytes: Buffer.byteLength(serialized, "utf8"),
    pages: state.pages.length,
    components: countComponents(state.pages),
    datasets: state.datasets.length,
    datasetRows: state.datasets.reduce((total, dataset) => total + (dataset.rows?.length || 0), 0),
    assets: state.assets.length,
  };
}

async function run() {
  await mkdir(fixturesDir, { recursive: true });
  const summaries = [];

  for (const scenario of SCENARIOS) {
    const summary = await writeFixture(scenario);
    summaries.push({ scenario: scenario.key, ...summary });
  }

  console.log("Generated perf fixtures:");
  for (const summary of summaries) {
    console.log(
      `- ${summary.scenario}: pages=${summary.pages}, components=${summary.components}, datasets=${summary.datasets}, rows=${summary.datasetRows}, assets=${summary.assets}, bytes=${summary.bytes}, file=${summary.filePath}`,
    );
  }
}

run().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
