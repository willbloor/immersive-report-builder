import { clamp, nowIso } from "../utils/helpers.js?v=20260401r";
import {
  ARCHETYPE_OPTIONS,
  DEFAULT_ASPECT_RATIO_ID,
  ELEMENT_TYPE_OPTIONS,
  LAYER_ROLE_OPTIONS,
  LINKEDIN_SCHEMA_VERSION,
  OUTPUT_MODE_OPTIONS,
  SLOT_FIELDS,
  TEXT_STYLE_PRESETS,
  getAspectRatioPreset,
} from "./constants.js?v=20260401ac";
import { createFrameFromTemplate, defaultTemplateIdForArchetype, getTemplate } from "./templates.js?v=20260401ah";

function defaultArchetype() {
  return ARCHETYPE_OPTIONS[0].id;
}

function defaultOutputMode() {
  return OUTPUT_MODE_OPTIONS[0].id;
}

function defaultLayerRoleForType(type) {
  if (type === "image") return "foreground";
  if (type === "button") return "cta";
  if (type === "text") return "text";
  return "background";
}

function normalizeAspectRatio(aspectRatioId) {
  return getAspectRatioPreset(aspectRatioId || DEFAULT_ASPECT_RATIO_ID).id;
}

function canvasBounds(aspectRatioId) {
  const preset = getAspectRatioPreset(aspectRatioId);
  return {
    width: preset.width,
    height: preset.height,
  };
}

export function makeDefaultProject() {
  const archetype = defaultArchetype();
  const templateId = defaultTemplateIdForArchetype(archetype);
  const ts = nowIso();
  return {
    id: `linkedin_${Date.now().toString(16)}`,
    kind: "linkedin_builder",
    name: "LinkedIn Builder Draft",
    outputMode: defaultOutputMode(),
    aspectRatio: DEFAULT_ASPECT_RATIO_ID,
    format: DEFAULT_ASPECT_RATIO_ID,
    archetype,
    templateId,
    createdAt: ts,
    updatedAt: ts,
  };
}

function makeDefaultUi() {
  return {
    activePanel: "build",
    activeInspectorTab: "style",
    advancedOpen: false,
    selectedFrameId: null,
    selectedElementId: null,
    templateSearch: "",
    assetSearch: "",
    assetFilter: "all",
    assetSort: "newest",
    resourceSearch: "",
    resourceSourceFilter: "all",
    resourceArchetypeFilter: "all",
  };
}

function normalizeColors(colors, fallback) {
  return {
    background: String(colors?.background || fallback.background),
    accent: String(colors?.accent || fallback.accent),
    text: String(colors?.text || fallback.text),
    muted: String(colors?.muted || fallback.muted),
    panel: String(colors?.panel || fallback.panel),
    border: String(colors?.border || fallback.border),
  };
}

function normalizeContent(content, fallback) {
  const out = {};
  for (const field of SLOT_FIELDS) {
    out[field.key] = String(content?.[field.key] || fallback?.[field.key] || "");
  }
  return out;
}

function normalizeImageMedia(media, fallback = null) {
  const base = fallback || {};
  const posX = Number(media?.objectPositionX ?? base.objectPositionX);
  const posY = Number(media?.objectPositionY ?? base.objectPositionY);
  const scale = Number(media?.scale ?? base.scale ?? 1);
  const explicitFit = media?.objectFit === "contain" || media?.objectFit === "cover"
    ? media.objectFit
    : null;
  return {
    assetId: media?.assetId || base.assetId || null,
    imageUrl: String(media?.imageUrl || base.imageUrl || ""),
    objectFit: explicitFit || (base.objectFit === "contain" ? "contain" : "cover"),
    objectPositionX: clamp(Number.isFinite(posX) ? posX : 50, 0, 100),
    objectPositionY: clamp(Number.isFinite(posY) ? posY : 50, 0, 100),
    scale: clamp(Number.isFinite(scale) ? scale : 1, 0.5, 4),
  };
}

function mediaKey(element) {
  return String(element?.media?.assetId || element?.media?.templateAssetId || element?.media?.imageUrl || "").trim();
}

function overlapRatioBetweenElements(a, b) {
  const left = Math.max(Number(a?.x || 0), Number(b?.x || 0));
  const top = Math.max(Number(a?.y || 0), Number(b?.y || 0));
  const right = Math.min(Number(a?.x || 0) + Number(a?.w || 0), Number(b?.x || 0) + Number(b?.w || 0));
  const bottom = Math.min(Number(a?.y || 0) + Number(a?.h || 0), Number(b?.y || 0) + Number(b?.h || 0));
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const overlapArea = width * height;
  const aArea = Math.max(1, Number(a?.w || 0) * Number(a?.h || 0));
  const bArea = Math.max(1, Number(b?.w || 0) * Number(b?.h || 0));
  return overlapArea / Math.max(1, Math.min(aArea, bArea));
}

function dedupeMediaCoverageSpeakerImages(elements = []) {
  const candidates = elements.filter((element) => element?.type === "image" && element?.locked !== true);
  if (candidates.length <= 1) return elements;
  const templateSpeaker = candidates.find((element) => element?.templateKey === "speaker-image") || null;
  const canonical = templateSpeaker
    || [...candidates].sort((a, b) => (Number(b?.w || 0) * Number(b?.h || 0)) - (Number(a?.w || 0) * Number(a?.h || 0)))[0]
    || candidates[0];
  const canonicalKey = mediaKey(canonical);

  return elements.filter((element) => {
    if (element?.type !== "image" || element?.locked === true) {
      return true;
    }
    if (element.id === canonical.id) return true;
    if (element?.templateKey === "speaker-image") return false;
    if (canonicalKey && mediaKey(element) === canonicalKey) return false;
    if (overlapRatioBetweenElements(canonical, element) >= 0.18) return false;
    return true;
  });
}

function normalizeElement(element, fallbackElement, aspectRatioId) {
  const base = fallbackElement || {};
  const type = ELEMENT_TYPE_OPTIONS.some((option) => option.id === element?.type)
    ? element.type
    : (ELEMENT_TYPE_OPTIONS.some((option) => option.id === base.type) ? base.type : "text");
  const layerRole = LAYER_ROLE_OPTIONS.some((option) => option.id === element?.layerRole)
    ? element.layerRole
    : (LAYER_ROLE_OPTIONS.some((option) => option.id === base.layerRole) ? base.layerRole : defaultLayerRoleForType(type));
  const bounds = canvasBounds(aspectRatioId);
  const minW = Number(element?.minW ?? base.minW ?? 60);
  const minH = Number(element?.minH ?? base.minH ?? 40);
  const rawX = Number(element?.x ?? base.x ?? 0);
  const rawY = Number(element?.y ?? base.y ?? 0);
  const rawW = Number(element?.w ?? base.w ?? 120);
  const rawH = Number(element?.h ?? base.h ?? 120);
  const allowOverflow = element?.allowOverflow === true || base.allowOverflow === true;
  const next = {
    ...base,
    ...element,
    id: String(element?.id || base.id || `elt_${Math.random().toString(16).slice(2)}`),
    label: String(element?.label || base.label || "Element"),
    type,
    layerRole,
    slotKey: String(element?.slotKey ?? base.slotKey ?? ""),
    text: String(element?.text ?? base.text ?? ""),
    x: Number.isFinite(rawX) ? rawX : 0,
    y: Number.isFinite(rawY) ? rawY : 0,
    w: Number.isFinite(rawW) ? rawW : 120,
    h: Number.isFinite(rawH) ? rawH : 120,
    minW,
    minH,
    style: {
      ...(base.style || {}),
      ...(element?.style || {}),
    },
  };

  if (type === "image") {
    next.media = normalizeImageMedia(element?.media, base.media);
  }

  if (allowOverflow) {
    const maxW = bounds.width * 4;
    const maxH = bounds.height * 4;
    next.x = clamp(next.x, -maxW, bounds.width * 2);
    next.y = clamp(next.y, -maxH, bounds.height * 2);
    next.w = clamp(next.w, minW, maxW);
    next.h = clamp(next.h, minH, maxH);
  } else {
    next.x = clamp(next.x, 0, bounds.width);
    next.y = clamp(next.y, 0, bounds.height);
    next.w = clamp(next.w, minW, bounds.width - next.x);
    next.h = clamp(next.h, minH, bounds.height - next.y);
  }

  return next;
}

function normalizeFrame(frame, index, project) {
  const fallbackTemplateId = defaultTemplateIdForArchetype(frame?.archetype || project.archetype || defaultArchetype());
  const template = getTemplate(frame?.templateId) || getTemplate(fallbackTemplateId);
  const fallback = createFrameFromTemplate(template.id, {
    index,
    aspectRatio: project.aspectRatio,
  });
  const textStylePresetId = TEXT_STYLE_PRESETS.some((preset) => preset.id === frame?.textStylePresetId)
    ? frame.textStylePresetId
    : TEXT_STYLE_PRESETS[0]?.id || null;
  const normalized = {
    ...fallback,
    ...frame,
    id: String(frame?.id || fallback.id),
    title: String(frame?.title || fallback.title),
    templateId: template.id,
    archetype: template.archetype,
    aspectRatio: project.aspectRatio,
    layoutLocked: frame?.layoutLocked === true,
    layoutTouched: frame?.layoutTouched === true,
    altText: String(frame?.altText || ""),
    textStylePresetId,
    resourceIds: Array.isArray(frame?.resourceIds) ? frame.resourceIds.filter(Boolean) : [],
  };
  normalized.colors = normalizeColors(frame?.colors, fallback.colors);
  normalized.content = normalizeContent(frame?.content, fallback.content);
  normalized.media = normalizeImageMedia(frame?.media);
  normalized.elements = Array.isArray(frame?.elements) && frame.elements.length
    ? frame.elements.map((element, elementIndex) => normalizeElement(element, fallback.elements[elementIndex], project.aspectRatio))
    : fallback.elements;

  const firstEditableImageElement = normalized.elements.find((element) => element.type === "image" && element.locked !== true)
    || normalized.elements.find((element) => element.type === "image");
  if (
    firstEditableImageElement
    && !firstEditableImageElement.media?.assetId
    && (normalized.media.assetId || normalized.media.imageUrl)
  ) {
    firstEditableImageElement.media = normalizeImageMedia(normalized.media, firstEditableImageElement.media);
  }

  const shouldRefreshMediaCoverageBackground = normalized.designFamily === "media_coverage_portrait"
    && (
      !String(normalized.backgroundAssetId || "").startsWith("mc-bg-")
      || !(normalized.elements || []).some((element) =>
        element.locked === true
        && element.layerRole === "background"
        && element.templateKey === "bg-media-coverage")
    );

  if (shouldRefreshMediaCoverageBackground) {
    const backgroundElements = (fallback.elements || []).filter((element) =>
      element.locked === true
      && element.layerRole === "background");
    const otherElements = (normalized.elements || []).filter((element) =>
      !(element.locked === true && element.layerRole === "background"));
    normalized.elements = [...backgroundElements, ...otherElements];
    normalized.backgroundAssetId = fallback.backgroundAssetId || normalized.backgroundAssetId || null;
    normalized.backgroundVariantId = fallback.backgroundVariantId || normalized.backgroundAssetId || normalized.backgroundVariantId || "";
  }

  if (normalized.designFamily === "media_coverage_portrait") {
    const metrics = getAspectRatioPreset(project.aspectRatio);
    normalized.elements = (normalized.elements || []).map((element) => {
      if (
        element?.type === "image"
        && element?.locked === true
        && element?.templateKey === "bg-media-coverage"
      ) {
        return {
          ...element,
          x: 0,
          y: 0,
          w: metrics.width,
          h: metrics.height,
          minW: metrics.width,
          minH: metrics.height,
          style: {
            ...(element.style || {}),
            radius: 0,
          },
          media: {
            ...(element.media || {}),
            objectFit: "cover",
            objectPositionX: 50,
            objectPositionY: 50,
            scale: 1,
          },
        };
      }
      return element;
    });
    normalized.elements = dedupeMediaCoverageSpeakerImages(normalized.elements || []);
  }

  return normalized;
}

function normalizeResource(resource) {
  return {
    id: String(resource?.id || `res_${Math.random().toString(16).slice(2)}`),
    title: String(resource?.title || "Untitled reference"),
    sourceType: ["figma_link", "reference_post", "upload"].includes(resource?.sourceType)
      ? resource.sourceType
      : "figma_link",
    url: String(resource?.url || ""),
    tags: Array.isArray(resource?.tags)
      ? resource.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [],
    notes: String(resource?.notes || ""),
    archetypes: Array.isArray(resource?.archetypes)
      ? resource.archetypes.filter((value) => ARCHETYPE_OPTIONS.some((option) => option.id === value))
      : [],
    previewAssetId: resource?.previewAssetId || null,
  };
}

export function makeEmptyLinkedInState() {
  const project = makeDefaultProject();
  const frame = createFrameFromTemplate(project.templateId, {
    aspectRatio: project.aspectRatio,
  });
  frame.textStylePresetId = TEXT_STYLE_PRESETS[0]?.id || null;
  const ui = makeDefaultUi();
  ui.selectedFrameId = frame.id;
  ui.selectedElementId = null;
  return {
    schemaVersion: LINKEDIN_SCHEMA_VERSION,
    project,
    assets: [],
    resources: [],
    frames: [frame],
    ui,
  };
}

export function touchLinkedInState(state) {
  if (state?.project) {
    state.project.updatedAt = nowIso();
  }
}

export function hydrateLinkedInState(raw) {
  if (!raw || typeof raw !== "object") {
    return makeEmptyLinkedInState();
  }

  const fallback = makeEmptyLinkedInState();
  const aspectRatio = normalizeAspectRatio(raw.project?.aspectRatio || raw.project?.format || fallback.project.aspectRatio);
  const next = {
    schemaVersion: LINKEDIN_SCHEMA_VERSION,
    project: {
      ...fallback.project,
      ...(raw.project || {}),
      kind: "linkedin_builder",
      aspectRatio,
      format: aspectRatio,
    },
    assets: Array.isArray(raw.assets) ? raw.assets : [],
    resources: Array.isArray(raw.resources) ? raw.resources.map(normalizeResource) : [],
    frames: [],
    ui: {
      ...fallback.ui,
      ...(raw.ui || {}),
    },
  };

  if (!ARCHETYPE_OPTIONS.some((entry) => entry.id === next.project.archetype)) {
    next.project.archetype = fallback.project.archetype;
  }
  if (!OUTPUT_MODE_OPTIONS.some((entry) => entry.id === next.project.outputMode)) {
    next.project.outputMode = fallback.project.outputMode;
  }

  const normalizedFrames = Array.isArray(raw.frames)
    ? raw.frames.map((frame, index) => normalizeFrame(frame, index, next.project))
    : [];
  next.frames = normalizedFrames.length ? normalizedFrames : fallback.frames;

  if (next.project.outputMode === "static" && next.frames.length > 1) {
    next.frames = [next.frames[0]];
  }

  if (!next.frames.length) {
    next.frames = [createFrameFromTemplate(defaultTemplateIdForArchetype(next.project.archetype), {
      aspectRatio: next.project.aspectRatio,
    })];
  }

  const templateId = String(next.project.templateId || "").trim();
  if (!getTemplate(templateId)) {
    next.project.templateId = next.frames[0].templateId || defaultTemplateIdForArchetype(next.project.archetype);
  }

  if (!next.frames.some((frame) => frame.id === next.ui.selectedFrameId)) {
    next.ui.selectedFrameId = next.frames[0].id;
  }
  next.ui.selectedElementId = null;
  touchLinkedInState(next);
  return next;
}
