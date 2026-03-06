import { migrateAnyProject } from "../state/migrations.js";

export function buildProjectBundle(state) {
  return {
    schemaVersion: "0.2",
    project: state.project,
    footer: state.footer,
    theme: state.theme,
    datasets: state.datasets,
    pages: state.pages,
    assets: state.assets,
  };
}

export function hydrateBundle(bundle) {
  if (!bundle || typeof bundle !== "object") {
    return { ok: false, error: "JSON must be an object." };
  }

  try {
    const migrated = migrateAnyProject(bundle);
    return { ok: true, value: migrated };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}
