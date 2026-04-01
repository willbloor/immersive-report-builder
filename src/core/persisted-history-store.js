import { deepClone, debounce, safeJsonParse } from "../utils/helpers.js";

const HISTORY_LIMIT = 120;

function readLocalStorage(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    return parsed.ok ? parsed.value : null;
  } catch (_error) {
    return null;
  }
}

export function loadPersistedState({ storageKey, legacyKeys = [], hydrate }) {
  const keys = [storageKey, ...legacyKeys].filter(Boolean);
  for (const key of keys) {
    const value = readLocalStorage(key);
    if (value) {
      return hydrate(value);
    }
  }
  return hydrate(null);
}

export function createPersistedHistoryStore({
  initialState,
  storageKey,
  touchUpdatedAt = null,
}) {
  let state = deepClone(initialState);
  let lastSerialized = null;
  const listeners = new Set();
  const history = {
    past: [],
    future: [],
  };

  function persist(nextState) {
    if (!storageKey) return;
    try {
      const serialized = JSON.stringify(nextState);
      if (serialized === lastSerialized) return;
      localStorage.setItem(storageKey, serialized);
      lastSerialized = serialized;
    } catch (_error) {
      // Ignore localStorage failures in local-first mode.
    }
  }

  const persistDebounced = debounce(() => persist(state), 160);

  function emit(meta = {}) {
    for (const listener of listeners) {
      listener(state, meta);
    }
    persistDebounced();
  }

  function commit(mutator, { historyLabel = "change", skipHistory = false } = {}) {
    const previous = skipHistory ? null : deepClone(state);
    const next = deepClone(state);
    mutator(next);
    if (typeof touchUpdatedAt === "function") {
      touchUpdatedAt(next);
    }

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

    replace(nextState, { skipHistory = true, historyLabel = "replace" } = {}) {
      commit((draft) => {
        Object.keys(draft).forEach((key) => delete draft[key]);
        Object.assign(draft, deepClone(nextState));
      }, { historyLabel, skipHistory });
    },

    canUndo() {
      return history.past.length > 0;
    },

    canRedo() {
      return history.future.length > 0;
    },

    undo() {
      if (!history.past.length) return;
      const current = deepClone(state);
      const previous = history.past.pop();
      history.future.push({ label: previous.label, snapshot: current });
      state = previous.snapshot;
      emit({
        kind: "undo",
        action: "undo",
        skipHistory: true,
      });
    },

    redo() {
      if (!history.future.length) return;
      const current = deepClone(state);
      const next = history.future.pop();
      history.past.push({ label: next.label, snapshot: current });
      state = next.snapshot;
      emit({
        kind: "redo",
        action: "redo",
        skipHistory: true,
      });
    },

    clearHistory() {
      history.past = [];
      history.future = [];
    },

    clearPersistence() {
      if (!storageKey) return;
      try {
        localStorage.removeItem(storageKey);
      } catch (_error) {
        // Ignore storage failures.
      }
      lastSerialized = null;
    },

    flush() {
      if (!storageKey) return;
      persist(state);
    },
  };
}
