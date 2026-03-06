import { migrateAnyProject } from "./migrations.js";
import { STORAGE_KEY_V1, STORAGE_KEY_V2, touchUpdatedAt } from "./schema.js";
import { deepClone, debounce, safeJsonParse } from "../utils/helpers.js";
import { startPerfTimer } from "../utils/perf.js";

const HISTORY_LIMIT = 120;

function readLocalStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    return parsed.ok ? parsed.value : null;
  } catch (_error) {
    return null;
  }
}

export function loadPersistedState() {
  const v2 = readLocalStorage(STORAGE_KEY_V2);
  if (v2) {
    return migrateAnyProject(v2);
  }
  const legacy = readLocalStorage(STORAGE_KEY_V1);
  if (legacy) {
    return migrateAnyProject(legacy);
  }
  return migrateAnyProject(null);
}

export function persistState(state, { lastSerialized = null } = {}) {
  const stopPersistTimer = startPerfTimer("persist", {
    source: "localStorage",
  });
  let payloadBytes = 0;
  let serialized = "";
  let ok = false;
  let wrote = false;
  let skipped = false;
  try {
    serialized = JSON.stringify(state);
    payloadBytes = serialized.length;
    if (lastSerialized !== null && serialized === lastSerialized) {
      ok = true;
      skipped = true;
      return {
        sample: stopPersistTimer({ payloadBytes, ok, wrote, skipped }),
        serialized,
      };
    }
    localStorage.setItem(STORAGE_KEY_V2, serialized);
    ok = true;
    wrote = true;
  } catch (_error) {
    // Ignore storage failures in local-only mode.
  }
  return {
    sample: stopPersistTimer({ payloadBytes, ok, wrote, skipped }),
    serialized: wrote ? serialized : lastSerialized,
  };
}

export function createStore(initialState) {
  let state = deepClone(initialState);
  let lastPersistedSerialized = null;
  const listeners = new Set();
  const history = {
    past: [],
    future: [],
  };

  const saveDebounced = debounce(() => {
    const persistResult = persistState(state, { lastSerialized: lastPersistedSerialized });
    if (persistResult?.sample?.ok && persistResult?.sample?.wrote) {
      lastPersistedSerialized = persistResult.serialized;
    }
  }, 180);

  function emit(meta = {}) {
    for (const listener of listeners) {
      listener(state, meta);
    }
    saveDebounced();
  }

  function commit(mutator, { historyLabel = "change", skipHistory = false } = {}) {
    const stopCommitTimer = startPerfTimer("commit", {
      action: historyLabel,
      skipHistory: Boolean(skipHistory),
    });
    const previous = skipHistory ? null : deepClone(state);
    const next = deepClone(state);
    mutator(next);
    touchUpdatedAt(next);

    if (!skipHistory) {
      history.past.push({ label: historyLabel, snapshot: previous });
      if (history.past.length > HISTORY_LIMIT) {
        history.past.shift();
      }
      history.future = [];
    }

    state = next;
    emit({
      kind: "commit",
      action: historyLabel,
      skipHistory: Boolean(skipHistory),
    });

    return stopCommitTimer({
      pageCount: Array.isArray(next.pages) ? next.pages.length : 0,
      historyPast: history.past.length,
      historyFuture: history.future.length,
    });
  }

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    commit,

    replace(newState, { skipHistory = true } = {}) {
      commit((draft) => {
        Object.keys(draft).forEach((key) => {
          delete draft[key];
        });
        Object.assign(draft, deepClone(newState));
      }, { historyLabel: "replace", skipHistory });
    },

    canUndo() {
      return history.past.length > 0;
    },

    canRedo() {
      return history.future.length > 0;
    },

    undo() {
      if (history.past.length === 0) return;
      const stopCommitTimer = startPerfTimer("commit", {
        action: "undo",
        skipHistory: true,
      });
      const current = deepClone(state);
      const previous = history.past.pop();
      history.future.push({ label: previous.label, snapshot: current });
      state = previous.snapshot;
      emit({
        kind: "undo",
        action: "undo",
        skipHistory: true,
      });
      return stopCommitTimer({
        pageCount: Array.isArray(state.pages) ? state.pages.length : 0,
        historyPast: history.past.length,
        historyFuture: history.future.length,
      });
    },

    redo() {
      if (history.future.length === 0) return;
      const stopCommitTimer = startPerfTimer("commit", {
        action: "redo",
        skipHistory: true,
      });
      const current = deepClone(state);
      const next = history.future.pop();
      history.past.push({ label: next.label, snapshot: current });
      state = next.snapshot;
      emit({
        kind: "redo",
        action: "redo",
        skipHistory: true,
      });
      return stopCommitTimer({
        pageCount: Array.isArray(state.pages) ? state.pages.length : 0,
        historyPast: history.past.length,
        historyFuture: history.future.length,
      });
    },

    clearHistory() {
      history.past = [];
      history.future = [];
    },
  };
}
