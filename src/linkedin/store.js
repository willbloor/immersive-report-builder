import { createPersistedHistoryStore, loadPersistedState } from "../core/persisted-history-store.js?v=20260401r";
import { LINKEDIN_STORAGE_KEY } from "./constants.js?v=20260401r";
import { hydrateLinkedInState, makeEmptyLinkedInState, touchLinkedInState } from "./schema.js?v=20260401al";

export function loadLinkedInState() {
  return loadPersistedState({
    storageKey: LINKEDIN_STORAGE_KEY,
    hydrate: hydrateLinkedInState,
  });
}

export function createLinkedInStore(initialState = makeEmptyLinkedInState(), { storageKey = null } = {}) {
  return createPersistedHistoryStore({
    initialState,
    storageKey,
    touchUpdatedAt: touchLinkedInState,
  });
}
