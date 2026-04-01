import { deepClone, nowIso, safeJsonParse, uid } from "../utils/helpers.js?v=20260401r";
import {
  DEFAULT_ASPECT_RATIO_ID,
  LINKEDIN_DOCUMENTS_INDEX_KEY,
  LINKEDIN_DOCUMENTS_MIGRATION_KEY,
  LINKEDIN_DOCUMENT_STATE_PREFIX,
  LINKEDIN_LIBRARY_STORAGE_KEY,
  LINKEDIN_STORAGE_KEY,
} from "./constants.js?v=20260401r";

const DOCUMENTS_VERSION = 1;

function readJson(key, fallback = null) {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = safeJsonParse(raw);
    return parsed.ok ? parsed.value : fallback;
  } catch (_error) {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeDocumentMeta(meta = {}) {
  const updatedAt = String(meta.updatedAt || nowIso());
  return {
    id: String(meta.id || uid("linkedin_doc")),
    name: String(meta.name || "Untitled LinkedIn post"),
    updatedAt,
    outputMode: meta.outputMode === "carousel" ? "carousel" : "static",
    aspectRatio: String(meta.aspectRatio || meta.format || DEFAULT_ASPECT_RATIO_ID),
    templateId: String(meta.templateId || ""),
    archetype: String(meta.archetype || ""),
    thumbnail: typeof meta.thumbnail === "string" ? meta.thumbnail : "",
    isSaved: meta.isSaved === true,
  };
}

export function emptyDocumentIndex() {
  return {
    version: DOCUMENTS_VERSION,
    lastOpenedDocumentId: null,
    documents: [],
  };
}

export function sortDocumentsByUpdatedAt(documents = []) {
  return documents
    .slice()
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
}

export function loadDocumentIndex() {
  const raw = readJson(LINKEDIN_DOCUMENTS_INDEX_KEY, null);
  if (!raw || typeof raw !== "object") {
    return emptyDocumentIndex();
  }
  return {
    version: DOCUMENTS_VERSION,
    lastOpenedDocumentId: raw.lastOpenedDocumentId ? String(raw.lastOpenedDocumentId) : null,
    documents: sortDocumentsByUpdatedAt(
      Array.isArray(raw.documents) ? raw.documents.map(normalizeDocumentMeta) : [],
    ),
  };
}

export function saveDocumentIndex(index) {
  const next = {
    version: DOCUMENTS_VERSION,
    lastOpenedDocumentId: index?.lastOpenedDocumentId ? String(index.lastOpenedDocumentId) : null,
    documents: sortDocumentsByUpdatedAt(
      Array.isArray(index?.documents) ? index.documents.map(normalizeDocumentMeta) : [],
    ),
  };
  writeJson(LINKEDIN_DOCUMENTS_INDEX_KEY, next);
  return next;
}

export function documentStateKey(documentId) {
  return `${LINKEDIN_DOCUMENT_STATE_PREFIX}${documentId}`;
}

export function loadDocumentState(documentId, hydrate) {
  const raw = readJson(documentStateKey(documentId), null);
  return hydrate(raw);
}

export function saveDocumentState(documentId, state) {
  writeJson(documentStateKey(documentId), state);
}

export function deleteDocumentState(documentId) {
  try {
    localStorage.removeItem(documentStateKey(documentId));
  } catch (_error) {
    // Ignore localStorage failures in local-first mode.
  }
}

export function createDocumentMetaFromState(state, overrides = {}) {
  return normalizeDocumentMeta({
    id: overrides.id || state?.project?.id,
    name: overrides.name || state?.project?.name,
    updatedAt: overrides.updatedAt || state?.project?.updatedAt || nowIso(),
    outputMode: overrides.outputMode || state?.project?.outputMode,
    aspectRatio: overrides.aspectRatio || state?.project?.aspectRatio || state?.project?.format,
    templateId: overrides.templateId || state?.project?.templateId,
    archetype: overrides.archetype || state?.project?.archetype,
    thumbnail: overrides.thumbnail || "",
    isSaved: overrides.isSaved === true,
  });
}

export function upsertDocumentMeta(index, meta) {
  const normalized = normalizeDocumentMeta(meta);
  const next = emptyDocumentIndex();
  next.lastOpenedDocumentId = index?.lastOpenedDocumentId || null;
  next.documents = Array.isArray(index?.documents) ? index.documents.map(normalizeDocumentMeta) : [];
  const existingIndex = next.documents.findIndex((entry) => entry.id === normalized.id);
  if (existingIndex >= 0) {
    next.documents.splice(existingIndex, 1, {
      ...next.documents[existingIndex],
      ...normalized,
    });
  } else {
    next.documents.unshift(normalized);
  }
  next.documents = sortDocumentsByUpdatedAt(next.documents);
  return next;
}

export function removeDocumentMeta(index, documentId) {
  const next = emptyDocumentIndex();
  next.lastOpenedDocumentId = index?.lastOpenedDocumentId === documentId ? null : (index?.lastOpenedDocumentId || null);
  next.documents = (Array.isArray(index?.documents) ? index.documents : [])
    .map(normalizeDocumentMeta)
    .filter((entry) => entry.id !== documentId);
  return next;
}

export function duplicateDocumentState(state) {
  const cloned = deepClone(state);
  const ts = nowIso();
  cloned.project.id = uid("linkedin_doc");
  cloned.project.createdAt = ts;
  cloned.project.updatedAt = ts;
  cloned.project.name = `${cloned.project.name || "Untitled LinkedIn post"} Copy`;
  return cloned;
}

function markMigrationComplete() {
  try {
    localStorage.setItem(LINKEDIN_DOCUMENTS_MIGRATION_KEY, "1");
  } catch (_error) {
    // Ignore localStorage failures in local-first mode.
  }
}

function migrationComplete() {
  try {
    return localStorage.getItem(LINKEDIN_DOCUMENTS_MIGRATION_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

export function migrateLegacyDraftsToDocuments({ hydrate }) {
  const existing = loadDocumentIndex();
  if (existing.documents.length > 0 || migrationComplete()) {
    return existing;
  }

  let nextIndex = emptyDocumentIndex();

  function migrateState(rawState, overrides = {}) {
    if (!rawState || typeof rawState !== "object") return;
    const state = hydrate(rawState);
    const documentId = String(overrides.id || state?.project?.id || uid("linkedin_doc"));
    state.project.id = documentId;
    const meta = createDocumentMetaFromState(state, {
      ...overrides,
      id: documentId,
    });
    const existingMeta = nextIndex.documents.find((entry) => entry.id === documentId);
    if (!existingMeta) {
      nextIndex = upsertDocumentMeta(nextIndex, meta);
      saveDocumentState(documentId, state);
      if (!nextIndex.lastOpenedDocumentId) {
        nextIndex.lastOpenedDocumentId = documentId;
      }
      return;
    }

    const winningUpdatedAt = String(existingMeta.updatedAt || "") >= String(meta.updatedAt || "")
      ? existingMeta.updatedAt
      : meta.updatedAt;
    nextIndex = upsertDocumentMeta(nextIndex, {
      ...existingMeta,
      ...meta,
      updatedAt: winningUpdatedAt,
      isSaved: existingMeta.isSaved || meta.isSaved,
      thumbnail: existingMeta.thumbnail || meta.thumbnail || "",
    });

    if (String(meta.updatedAt || "") >= String(existingMeta.updatedAt || "")) {
      saveDocumentState(documentId, state);
    }
  }

  const legacyDraft = readJson(LINKEDIN_STORAGE_KEY, null);
  if (legacyDraft && typeof legacyDraft === "object") {
    migrateState(legacyDraft, {
      isSaved: false,
      updatedAt: legacyDraft?.project?.updatedAt || nowIso(),
    });
  }

  const legacyLibrary = readJson(LINKEDIN_LIBRARY_STORAGE_KEY, []);
  if (Array.isArray(legacyLibrary)) {
    for (const entry of legacyLibrary) {
      if (!entry?.state || typeof entry.state !== "object") continue;
      migrateState(entry.state, {
        id: entry.id,
        name: entry.name,
        outputMode: entry.outputMode,
        archetype: entry.archetype,
        templateId: entry.templateId,
        updatedAt: entry.savedAt || entry.state?.project?.updatedAt || nowIso(),
        isSaved: true,
      });
    }
  }

  nextIndex = saveDocumentIndex(nextIndex);
  markMigrationComplete();
  return nextIndex;
}
