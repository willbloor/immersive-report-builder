import { uid, deepClone } from "../utils/helpers.js?v=20260401r";
import { ARCHETYPE_OPTIONS, DEFAULT_ASPECT_RATIO_ID, getAspectRatioPreset } from "./constants.js?v=20260401ac";

const BASE_TEMPLATE_ASPECT_RATIO_ID = "portrait_4_5";

function roundGeometry(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function textElement({
  label,
  slotKey,
  x,
  y,
  w,
  h,
  fontSize,
  fontWeight = 500,
  lineHeight = 1.1,
  letterSpacing = 0,
  colorRole = "text",
  fontRole = "body",
  align = "left",
  textTransform = "none",
  layerRole = "text",
  text = "",
  locked = false,
  visible = true,
  allowOverflow = false,
  preserveOnTemplateSwap = true,
  templateKey = "",
}) {
  return {
    id: uid("elt"),
    type: "text",
    label,
    slotKey,
    text,
    templateKey,
    locked,
    visible,
    allowOverflow,
    preserveOnTemplateSwap,
    layerRole,
    x,
    y,
    w,
    h,
    minW: Math.min(220, w),
    minH: 48,
    style: {
      fontSize,
      fontWeight,
      lineHeight,
      letterSpacing,
      colorRole,
      fontRole,
      align,
      textTransform,
    },
  };
}

function imageElement({
  label,
  x,
  y,
  w,
  h,
  radius = 32,
  strokeColor = "rgba(15, 23, 42, 0.08)",
  strokeWidth = 2,
  backgroundColor = "rgba(255,255,255,0.82)",
  objectFit = "cover",
  objectPositionX = 50,
  objectPositionY = 50,
  scale = 1,
  imageUrl = "",
  templateAssetId = null,
  layerRole = "foreground",
  locked = false,
  visible = true,
  allowOverflow = false,
  preserveOnTemplateSwap = true,
  templateKey = "",
  opacity = 1,
  rotation = 0,
}) {
  return {
    id: uid("elt"),
    type: "image",
    label,
    templateKey,
    locked,
    visible,
    allowOverflow,
    preserveOnTemplateSwap,
    layerRole,
    x,
    y,
    w,
    h,
    minW: 180,
    minH: 180,
    style: {
      radius,
      strokeColor,
      strokeWidth,
      backgroundColor,
      opacity,
      rotation,
    },
    media: {
      assetId: null,
      imageUrl,
      objectFit,
      objectPositionX,
      objectPositionY,
      scale,
      templateAssetId,
    },
  };
}

function shapeElement({
  label,
  x,
  y,
  w,
  h,
  radius = 24,
  fillRole = "panel",
  fillColor = "",
  opacity = 1,
  strokeColor = "",
  strokeWidth = 0,
  layerRole = "background",
  locked = false,
  visible = true,
  allowOverflow = false,
  preserveOnTemplateSwap = true,
  templateKey = "",
  rotation = 0,
}) {
  return {
    id: uid("elt"),
    type: "shape",
    label,
    templateKey,
    locked,
    visible,
    allowOverflow,
    preserveOnTemplateSwap,
    layerRole,
    x,
    y,
    w,
    h,
    minW: 80,
    minH: 40,
    style: {
      radius,
      fillRole,
      fillColor,
      opacity,
      strokeColor,
      strokeWidth,
      rotation,
    },
  };
}

function buttonElement({
  label,
  slotKey = "",
  text = "Call to action",
  x,
  y,
  w,
  h,
  radius = 0,
  fillRole = "accent",
  fillColor = "",
  textColorRole = "panel",
  textColor = "",
  strokeColor = "",
  strokeWidth = 0,
  opacity = 1,
  fontRole = "body",
  fontSize = 24,
  fontWeight = 700,
  lineHeight = 1,
  letterSpacing = 0,
  align = "center",
  textTransform = "none",
  layerRole = "cta",
  locked = false,
  visible = true,
  allowOverflow = false,
  preserveOnTemplateSwap = true,
  templateKey = "",
}) {
  return {
    id: uid("elt"),
    type: "button",
    label,
    slotKey,
    text,
    templateKey,
    locked,
    visible,
    allowOverflow,
    preserveOnTemplateSwap,
    layerRole,
    x,
    y,
    w,
    h,
    minW: 140,
    minH: 44,
    style: {
      radius,
      fillRole,
      fillColor,
      textColorRole,
      textColor,
      strokeColor,
      strokeWidth,
      opacity,
      fontRole,
      fontSize,
      fontWeight,
      lineHeight,
      letterSpacing,
      align,
      textTransform,
    },
  };
}

function scaleElementGeometry(element, fromAspectRatioId, toAspectRatioId) {
  const from = getAspectRatioPreset(fromAspectRatioId);
  const to = getAspectRatioPreset(toAspectRatioId);
  const scaleX = to.width / from.width;
  const scaleY = to.height / from.height;
  const isLockedBackgroundImage = element?.type === "image"
    && element?.locked === true
    && ((element?.layerRole || "") === "background" || element?.templateKey === "bg-media-coverage");
  if (isLockedBackgroundImage) {
    return {
      ...deepClone(element),
      x: 0,
      y: 0,
      w: to.width,
      h: to.height,
      minW: to.width,
      minH: to.height,
      style: {
        ...(element.style || {}),
        radius: 0,
      },
    };
  }
  return {
    ...deepClone(element),
    x: roundGeometry(Number(element.x || 0) * scaleX),
    y: roundGeometry(Number(element.y || 0) * scaleY),
    w: roundGeometry(Number(element.w || 0) * scaleX),
    h: roundGeometry(Number(element.h || 0) * scaleY),
    minW: roundGeometry(Number(element.minW || 0) * scaleX),
    minH: roundGeometry(Number(element.minH || 0) * scaleY),
    style: {
      ...(element.style || {}),
      fontSize: element.style?.fontSize != null ? roundGeometry(Number(element.style.fontSize) * scaleY) : element.style?.fontSize,
      radius: element.style?.radius != null ? roundGeometry(Number(element.style.radius) * Math.min(scaleX, scaleY)) : element.style?.radius,
    },
  };
}

export function mapElementsToAspectRatio(elements = [], fromAspectRatioId, toAspectRatioId) {
  if (fromAspectRatioId === toAspectRatioId) {
    return elements.map((element) => deepClone(element));
  }
  return elements.map((element) => scaleElementGeometry(element, fromAspectRatioId, toAspectRatioId));
}

const TEMPLATE_BLUE = {
  background: "#ECF2FF",
  accent: "#0A66C2",
  text: "#122033",
  muted: "#536277",
  panel: "#FFFFFF",
  border: "#D2DCEC",
};

const TEMPLATE_SLATE = {
  background: "#F2F4F8",
  accent: "#1348B8",
  text: "#131A2A",
  muted: "#5E6778",
  panel: "#FFFFFF",
  border: "#DCE2EC",
};

const TEMPLATE_WARM = {
  background: "#FFF7F0",
  accent: "#CC5A17",
  text: "#23170F",
  muted: "#6D5A4D",
  panel: "#FFFDF9",
  border: "#F0DCC8",
};

const MEDIA_COVERAGE_DESIGN_FAMILY = "media_coverage_portrait";

const LINKEDIN_TEMPLATE_ASSETS = {
  "mc-dan-glow-left": {
    id: "mc-dan-glow-left",
    filename: "media-coverage-dan-glow-left.png",
    url: "https://www.figma.com/api/mcp/asset/e6647eda-894d-4a91-9e2e-b8833243f3b3",
  },
  "mc-dan-glow-right": {
    id: "mc-dan-glow-right",
    filename: "media-coverage-dan-glow-right.png",
    url: "https://www.figma.com/api/mcp/asset/d16fc0fc-c6b0-4aef-9240-9ef0e0da09ac",
  },
  "mc-dan-speaker": {
    id: "mc-dan-speaker",
    filename: "dan-potter-001.png",
    url: "./assets/linkedin/media-coverage/dan-potter-001.png",
  },
  "mc-kev-background": {
    id: "mc-kev-background",
    filename: "media-coverage-kev-background.png",
    url: "https://www.figma.com/api/mcp/asset/98c716be-f1af-4f36-8678-9ddd633da0c2",
  },
  "mc-kev-speaker": {
    id: "mc-kev-speaker",
    filename: "kev-breen-001.png",
    url: "./assets/linkedin/media-coverage/kev-breen-001.png",
  },
  "mc-jenny-glow": {
    id: "mc-jenny-glow",
    filename: "media-coverage-jenny-glow.png",
    url: "https://www.figma.com/api/mcp/asset/45e582a3-9f85-4403-93ed-8bc9edfb9932",
  },
  "mc-jenny-speaker": {
    id: "mc-jenny-speaker",
    filename: "media-coverage-jenny-speaker.png",
    url: "https://www.figma.com/api/mcp/asset/7025435c-eef9-4f9d-baf3-c27feba97992",
  },
  "mc-aniket-background": {
    id: "mc-aniket-background",
    filename: "media-coverage-aniket-background.png",
    url: "https://www.figma.com/api/mcp/asset/02add94a-4dfe-401d-91aa-1314edfb11d1",
  },
  "mc-aniket-speaker": {
    id: "mc-aniket-speaker",
    filename: "media-coverage-aniket-speaker.png",
    url: "https://www.figma.com/api/mcp/asset/7337c1cf-2803-41ce-bb8a-d1b26b889a42",
  },
  "mc-bg-blue-glass-1": {
    id: "mc-bg-blue-glass-1",
    filename: "blue-glass-1.png",
    url: "./assets/linkedin/backgrounds/blue-glass-1.png",
  },
  "mc-bg-blue-glass-2": {
    id: "mc-bg-blue-glass-2",
    filename: "blue-glass-2.png",
    url: "./assets/linkedin/backgrounds/blue-glass-2.png",
  },
  "mc-bg-blue-glass-3": {
    id: "mc-bg-blue-glass-3",
    filename: "blue-glass-3.png",
    url: "./assets/linkedin/backgrounds/blue-glass-3.png",
  },
  "mc-bg-blue-glass-4": {
    id: "mc-bg-blue-glass-4",
    filename: "blue-glass-4.png",
    url: "./assets/linkedin/backgrounds/blue-glass-4.png",
  },
  "mc-bg-blue-glass-5": {
    id: "mc-bg-blue-glass-5",
    filename: "blue-glass-5.png",
    url: "./assets/linkedin/backgrounds/blue-glass-5.png",
  },
  "mc-bg-aurora-purple-1": {
    id: "mc-bg-aurora-purple-1",
    filename: "aurora-purple-1.png",
    url: "./assets/linkedin/backgrounds/aurora-purple-1.png",
  },
  "mc-bg-aurora-purple-2": {
    id: "mc-bg-aurora-purple-2",
    filename: "aurora-purple-2.png",
    url: "./assets/linkedin/backgrounds/aurora-purple-2.png",
  },
  "mc-bg-aurora-purple-3": {
    id: "mc-bg-aurora-purple-3",
    filename: "aurora-purple-3.png",
    url: "./assets/linkedin/backgrounds/aurora-purple-3.png",
  },
  "mc-bg-aurora-glass-purple-1": {
    id: "mc-bg-aurora-glass-purple-1",
    filename: "aurora-glass-purple-1.png",
    url: "./assets/linkedin/backgrounds/aurora-glass-purple-1.png",
  },
  "mc-bg-aurora-glass-purple-2": {
    id: "mc-bg-aurora-glass-purple-2",
    filename: "aurora-glass-purple-2.png",
    url: "./assets/linkedin/backgrounds/aurora-glass-purple-2.png",
  },
  "mc-bg-aurora-glass-purple-3": {
    id: "mc-bg-aurora-glass-purple-3",
    filename: "aurora-glass-purple-3.png",
    url: "./assets/linkedin/backgrounds/aurora-glass-purple-3.png",
  },
  "mc-bg-aurora-glass-purple-4": {
    id: "mc-bg-aurora-glass-purple-4",
    filename: "aurora-glass-purple-4.png",
    url: "./assets/linkedin/backgrounds/aurora-glass-purple-4.png",
  },
  "mc-bg-hot-glass-1": {
    id: "mc-bg-hot-glass-1",
    filename: "hot-glass-1.png",
    url: "./assets/linkedin/backgrounds/hot-glass-1.png",
  },
  "mc-bg-hot-glass-2": {
    id: "mc-bg-hot-glass-2",
    filename: "hot-glass-2.png",
    url: "./assets/linkedin/backgrounds/hot-glass-2.png",
  },
  "mc-bg-cwb-1": {
    id: "mc-bg-cwb-1",
    filename: "cwb-1.png",
    url: "./assets/linkedin/backgrounds/cwb-1.png",
  },
};

const MEDIA_COVERAGE_TEXT_LAYOUT_OPTIONS = [
  { id: "headline_deck_identity", label: "Headline + deck" },
  { id: "headline_identity", label: "Headline only" },
  { id: "headline_byline_identity", label: "Headline + byline" },
];

function mediaCoveragePalette(background = "#17181C", accent = "#8FA8FF") {
  return {
    background,
    accent,
    text: "#FFFFFF",
    muted: "rgba(255,255,255,0.82)",
    panel: "rgba(255,255,255,0)",
    border: "rgba(255,255,255,0)",
  };
}

function mediaCoverageTextElement(config) {
  return textElement({
    colorRole: "text",
    fontRole: "ui",
    ...config,
  });
}

function mediaCoverageBackgroundImage({
  label,
  templateKey,
  templateAssetId,
  x,
  y,
  w,
  h,
  rotation = 0,
  opacity = 1,
}) {
  const asset = LINKEDIN_TEMPLATE_ASSETS[templateAssetId];
  return imageElement({
    label,
    templateKey,
    templateAssetId,
    imageUrl: asset?.url || "",
    x,
    y,
    w,
    h,
    rotation,
    opacity,
    radius: 0,
    strokeColor: "transparent",
    strokeWidth: 0,
    backgroundColor: "transparent",
    objectFit: "cover",
    objectPositionX: 50,
    objectPositionY: 50,
    layerRole: "background",
    locked: true,
    allowOverflow: true,
    preserveOnTemplateSwap: false,
  });
}

const MEDIA_COVERAGE_BACKGROUND_OPTIONS = [
  { id: "mc-bg-blue-glass-1", label: "Blue Glass 1", swatch: "#355eea" },
  { id: "mc-bg-blue-glass-2", label: "Blue Glass 2", swatch: "#2e56e0" },
  { id: "mc-bg-blue-glass-3", label: "Blue Glass 3", swatch: "#2b4ee6" },
  { id: "mc-bg-blue-glass-4", label: "Blue Glass 4", swatch: "#2d47e9" },
  { id: "mc-bg-blue-glass-5", label: "Blue Glass 5", swatch: "#3a4dde" },
  { id: "mc-bg-aurora-purple-1", label: "Aurora Purple 1", swatch: "#ff5d81" },
  { id: "mc-bg-aurora-purple-2", label: "Aurora Purple 2", swatch: "#ff5d87" },
  { id: "mc-bg-aurora-purple-3", label: "Aurora Purple 3", swatch: "#b457dd" },
  { id: "mc-bg-aurora-glass-purple-1", label: "Aurora Glass Purple 1", swatch: "#b05cdf" },
  { id: "mc-bg-aurora-glass-purple-2", label: "Aurora Glass Purple 2", swatch: "#9759d9" },
  { id: "mc-bg-aurora-glass-purple-3", label: "Aurora Glass Purple 3", swatch: "#b74dcf" },
  { id: "mc-bg-aurora-glass-purple-4", label: "Aurora Glass Purple 4", swatch: "#c24ee1" },
  { id: "mc-bg-hot-glass-1", label: "Hot Glass 1", swatch: "#ff4b1f" },
  { id: "mc-bg-hot-glass-2", label: "Hot Glass 2", swatch: "#ff7a1a" },
  { id: "mc-bg-cwb-1", label: "CWB 1", swatch: "#26a2e1" },
];

function mediaCoverageBackgroundById(backgroundId) {
  if (!backgroundId) return null;
  return MEDIA_COVERAGE_BACKGROUND_OPTIONS.find((entry) => entry.id === backgroundId) || null;
}

function mediaCoverageBackgroundElements(backgroundId) {
  const background = mediaCoverageBackgroundById(backgroundId);
  if (!background) return [];
  return [
    mediaCoverageBackgroundImage({
      label: background.label,
      templateKey: "bg-media-coverage",
      templateAssetId: background.id,
      x: 0,
      y: 0,
      w: 1080,
      h: 1350,
      opacity: 1,
    }),
  ];
}

const MEDIA_COVERAGE_LAYOUT_PRESETS = {
  headline_deck_identity: {
    headline: { x: 100, y: 100, w: 830, h: 270, fontSize: 90, fontWeight: 500, lineHeight: 1, letterSpacing: -0.9 },
    supporting_copy: { x: 100, y: 399, w: 830, h: 144, fontSize: 42, fontWeight: 400, lineHeight: 1.15, letterSpacing: -0.42, visible: true },
    speaker_name: { x: 100, y: 1055, w: 471, h: 58, fontSize: 42, fontWeight: 500, lineHeight: 1, letterSpacing: -0.42, visible: true },
    author_or_source: { x: 100, y: 1129, w: 471, h: 129, fontSize: 36, fontWeight: 400, lineHeight: 1.2, letterSpacing: -0.36, visible: true },
  },
  headline_identity: {
    headline: { x: 100, y: 100, w: 603, h: 440, fontSize: 80, fontWeight: 500, lineHeight: 1.1, letterSpacing: -0.8 },
    supporting_copy: { x: 100, y: 552, w: 520, h: 56, fontSize: 34, fontWeight: 400, lineHeight: 1.15, letterSpacing: -0.34, visible: false },
    speaker_name: { x: 100, y: 1092, w: 471, h: 58, fontSize: 48, fontWeight: 500, lineHeight: 1.2, letterSpacing: -0.48, visible: true },
    author_or_source: { x: 100, y: 1166, w: 360, h: 84, fontSize: 32, fontWeight: 400, lineHeight: 1.3, letterSpacing: -0.32, visible: true },
  },
  headline_byline_identity: {
    headline: { x: 100, y: 91, w: 898, h: 404, fontSize: 92, fontWeight: 500, lineHeight: 1.1, letterSpacing: -0.92 },
    supporting_copy: { x: 100, y: 529, w: 636, h: 58, fontSize: 50.45, fontWeight: 400, lineHeight: 1.15, letterSpacing: -0.5, visible: true },
    speaker_name: { x: 100, y: 1112, w: 308, h: 36, fontSize: 36, fontWeight: 500, lineHeight: 1, letterSpacing: 0.36, visible: true },
    author_or_source: { x: 100, y: 1164, w: 362, h: 68, fontSize: 28, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0.28, visible: true },
  },
};

const MEDIA_COVERAGE_VARIANTS = [
  {
    id: "dan-potter",
    templateId: "media-coverage-dan-potter",
    label: "Speaker",
    uiLabel: "Speaker",
    previewThumbnail: "media-coverage-dan-potter",
    swatch: "#3860FF",
    colors: mediaCoveragePalette("#17181C", "#5A7BFF"),
    textLayoutMode: "headline_deck_identity",
    backgroundAssetId: "mc-bg-blue-glass-1",
    defaultImageAssetId: "mc-dan-speaker",
    content: {
      headline: "Editorial headline goes here",
      supporting_copy: "Use this space for the supporting line or summary beneath the headline.",
      speaker_name: "Name",
      author_or_source: "Job Title · Company",
    },
    backgroundLabel: "Blue Glass 1",
    backgroundElements: mediaCoverageBackgroundElements("mc-bg-blue-glass-1"),
    speakerImage: imageElement({
      label: "Speaker image",
      templateKey: "speaker-image",
      templateAssetId: "mc-dan-speaker",
      imageUrl: LINKEDIN_TEMPLATE_ASSETS["mc-dan-speaker"].url,
      x: 388,
      y: 275,
      w: 728,
      h: 1242,
      radius: 0,
      strokeColor: "transparent",
      strokeWidth: 0,
      backgroundColor: "transparent",
      objectFit: "contain",
      objectPositionX: 50,
      objectPositionY: 50,
      layerRole: "foreground",
      allowOverflow: true,
      preserveOnTemplateSwap: true,
    }),
  },
  {
    id: "kev-breen",
    templateId: "media-coverage-kev-breen",
    label: "Speaker Alt",
    uiLabel: "Speaker Alt",
    previewThumbnail: "media-coverage-kev-breen",
    swatch: "#5472FF",
    colors: mediaCoveragePalette("#00092D", "#7AA2FF"),
    textLayoutMode: "headline_deck_identity",
    backgroundAssetId: "mc-bg-blue-glass-5",
    defaultImageAssetId: "mc-kev-speaker",
    content: {
      headline: "Use this for a sharper editorial headline",
      supporting_copy: "This variant gives you a slightly different portrait treatment with the same overall story structure.",
      speaker_name: "Name",
      author_or_source: "Job Title · Company",
    },
    backgroundLabel: "Blue Glass 5",
    backgroundElements: mediaCoverageBackgroundElements("mc-bg-blue-glass-5"),
    speakerImage: imageElement({
      label: "Speaker image",
      templateKey: "speaker-image",
      templateAssetId: "mc-kev-speaker",
      imageUrl: LINKEDIN_TEMPLATE_ASSETS["mc-kev-speaker"].url,
      x: 378,
      y: 430,
      w: 700,
      h: 930,
      radius: 0,
      strokeColor: "transparent",
      strokeWidth: 0,
      backgroundColor: "transparent",
      objectFit: "contain",
      objectPositionX: 50,
      objectPositionY: 50,
      layerRole: "foreground",
      allowOverflow: true,
      preserveOnTemplateSwap: true,
    }),
  },
  {
    id: "jenny-lam",
    templateId: "media-coverage-jenny-lam",
    label: "Speaker Minimal",
    uiLabel: "Speaker Minimal",
    previewThumbnail: "media-coverage-jenny-lam",
    swatch: "#7F73FF",
    colors: mediaCoveragePalette("#17181C", "#64F7D1"),
    textLayoutMode: "headline_identity",
    backgroundAssetId: "mc-bg-aurora-glass-purple-1",
    defaultImageAssetId: "mc-jenny-speaker",
    content: {
      headline: "Use this for a strong headline-led speaker post",
      supporting_copy: "",
      speaker_name: "Name",
      author_or_source: "Job Title · Company",
    },
    backgroundLabel: "Aurora Glass Purple 1",
    backgroundElements: mediaCoverageBackgroundElements("mc-bg-aurora-glass-purple-1"),
    speakerImage: imageElement({
      label: "Speaker image",
      templateKey: "speaker-image",
      templateAssetId: "mc-jenny-speaker",
      imageUrl: LINKEDIN_TEMPLATE_ASSETS["mc-jenny-speaker"].url,
      x: 405,
      y: 545,
      w: 805,
      h: 805,
      radius: 0,
      strokeColor: "transparent",
      strokeWidth: 0,
      backgroundColor: "transparent",
      objectFit: "contain",
      objectPositionX: 50,
      objectPositionY: 50,
      layerRole: "foreground",
      allowOverflow: true,
      preserveOnTemplateSwap: true,
    }),
  },
  {
    id: "aniket-menon",
    templateId: "media-coverage-aniket-menon",
    label: "Author",
    uiLabel: "Author",
    previewThumbnail: "media-coverage-aniket-menon",
    swatch: "#5247FF",
    colors: mediaCoveragePalette("#00092D", "#6A5EFF"),
    textLayoutMode: "headline_byline_identity",
    backgroundAssetId: "mc-bg-cwb-1",
    defaultImageAssetId: "mc-aniket-speaker",
    content: {
      headline: "Use this for an author-led point of view",
      supporting_copy: "By Name",
      speaker_name: "Name",
      author_or_source: "Job Title · Company",
    },
    backgroundLabel: "CWB 1",
    backgroundElements: mediaCoverageBackgroundElements("mc-bg-cwb-1"),
    speakerImage: imageElement({
      label: "Speaker image",
      templateKey: "speaker-image",
      templateAssetId: "mc-aniket-speaker",
      imageUrl: LINKEDIN_TEMPLATE_ASSETS["mc-aniket-speaker"].url,
      x: 254,
      y: 295,
      w: 870,
      h: 1228,
      radius: 0,
      strokeColor: "transparent",
      strokeWidth: 0,
      backgroundColor: "transparent",
      objectFit: "contain",
      objectPositionX: 50,
      objectPositionY: 50,
      layerRole: "foreground",
      allowOverflow: true,
      preserveOnTemplateSwap: true,
    }),
  },
];

function createMediaCoverageTextElements(layoutMode) {
  const layout = MEDIA_COVERAGE_LAYOUT_PRESETS[layoutMode] || MEDIA_COVERAGE_LAYOUT_PRESETS.headline_deck_identity;
  return [
    mediaCoverageTextElement({
      label: "Headline",
      templateKey: "headline",
      slotKey: "headline",
      ...layout.headline,
    }),
    mediaCoverageTextElement({
      label: layoutMode === "headline_byline_identity" ? "Byline" : "Deck",
      templateKey: "supporting_copy",
      slotKey: "supporting_copy",
      ...layout.supporting_copy,
    }),
    mediaCoverageTextElement({
      label: "Speaker Name",
      templateKey: "speaker_name",
      slotKey: "speaker_name",
      ...layout.speaker_name,
    }),
    mediaCoverageTextElement({
      label: "Speaker Role",
      templateKey: "author_or_source",
      slotKey: "author_or_source",
      colorRole: "muted",
      ...layout.author_or_source,
    }),
  ];
}

function createMediaCoverageTemplate(variant) {
  const visibleLabel = variant.uiLabel || variant.label;
  return {
    id: variant.templateId,
    label: visibleLabel,
    archetype: "people_spotlight",
    description: "Editorial portrait-led media coverage post with Figma-driven background art and speaker cutout.",
    swatch: variant.swatch,
    designFamily: MEDIA_COVERAGE_DESIGN_FAMILY,
    variantId: variant.id,
    variantLabel: visibleLabel,
    previewThumbnail: variant.previewThumbnail,
    backgroundAssetId: variant.backgroundAssetId,
    backgroundVariantId: variant.backgroundAssetId,
    defaultImageAssetId: variant.defaultImageAssetId,
    textLayoutMode: variant.textLayoutMode,
    defaultTextStylePresetId: "media-coverage",
    defaultAspectRatio: "portrait_4_5",
    colors: variant.colors,
    content: {
      eyebrow: "",
      headline: variant.content.headline,
      supporting_copy: variant.content.supporting_copy,
      speaker_name: variant.content.speaker_name,
      proof_stat: "",
      cta: "",
      author_or_source: variant.content.author_or_source,
    },
    elements: [
      ...variant.backgroundElements,
      variant.speakerImage,
      ...createMediaCoverageTextElements(variant.textLayoutMode),
    ],
  };
}

export const TEMPLATE_LIBRARY = [
  ...MEDIA_COVERAGE_VARIANTS.map((variant) => createMediaCoverageTemplate(variant)),
  {
    id: "people-editorial-spotlight",
    label: "Editorial Spotlight",
    archetype: "people_spotlight",
    description: "Portrait-led people post with stat support and generous editorial space.",
    swatch: "#0A66C2",
    colors: TEMPLATE_BLUE,
    content: {
      eyebrow: "TEAM SPOTLIGHT",
      headline: "Meet the operator behind this quarter's biggest launch.",
      supporting_copy:
        "Use this frame for a human story, a short lesson learned, or a perspective that benefits from a face and a strong editorial headline.",
      proof_stat: "12 yrs",
      cta: "Read the full story",
      author_or_source: "Name · Role · Company",
    },
    elements: [
      shapeElement({ label: "Base panel", x: 56, y: 56, w: 624, h: 1238, radius: 40 }),
      shapeElement({
        label: "Stat panel",
        x: 686,
        y: 480,
        w: 338,
        h: 240,
        radius: 36,
        fillRole: "panel",
      }),
      imageElement({ label: "Portrait image", x: 700, y: 76, w: 312, h: 380, radius: 38 }),
      textElement({
        label: "Eyebrow",
        slotKey: "eyebrow",
        x: 96,
        y: 112,
        w: 350,
        h: 40,
        fontSize: 24,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: 4,
        colorRole: "accent",
        fontRole: "body",
        textTransform: "uppercase",
      }),
      textElement({
        label: "Headline",
        slotKey: "headline",
        x: 96,
        y: 172,
        w: 500,
        h: 330,
        fontSize: 88,
        fontWeight: 700,
        lineHeight: 0.92,
        letterSpacing: -2.5,
        colorRole: "text",
        fontRole: "heading",
      }),
      textElement({
        label: "Supporting Copy",
        slotKey: "supporting_copy",
        x: 96,
        y: 552,
        w: 492,
        h: 260,
        fontSize: 27,
        fontWeight: 500,
        lineHeight: 1.28,
        colorRole: "muted",
        fontRole: "body",
      }),
      textElement({
        label: "Proof Stat",
        slotKey: "proof_stat",
        x: 734,
        y: 540,
        w: 250,
        h: 110,
        fontSize: 110,
        fontWeight: 700,
        lineHeight: 0.9,
        colorRole: "text",
        fontRole: "mono",
      }),
      textElement({
        label: "CTA",
        slotKey: "cta",
        x: 96,
        y: 1142,
        w: 320,
        h: 42,
        fontSize: 24,
        fontWeight: 700,
        lineHeight: 1.05,
        colorRole: "accent",
        fontRole: "body",
      }),
      textElement({
        label: "Author / Source",
        slotKey: "author_or_source",
        x: 96,
        y: 1202,
        w: 400,
        h: 44,
        fontSize: 22,
        fontWeight: 600,
        lineHeight: 1.1,
        colorRole: "muted",
        fontRole: "body",
      }),
    ],
  },
  {
    id: "case-study-outcome-stack",
    label: "Outcome Stack",
    archetype: "case_study",
    description: "Outcome-led case study with bold proof, quote, and image lockup.",
    swatch: "#1348B8",
    colors: TEMPLATE_SLATE,
    content: {
      eyebrow: "CASE STUDY",
      headline: "How the team turned a messy rollout into a repeatable launch system.",
      supporting_copy:
        "Lead with the challenge, then show the turning point and the result. This format works well for customer outcomes, internal ops wins, or transformation stories.",
      proof_stat: "+38%",
      cta: "See the before / after",
      author_or_source: "Customer name · Segment",
    },
    elements: [
      shapeElement({ label: "Top plate", x: 52, y: 60, w: 976, h: 524, radius: 42 }),
      shapeElement({
        label: "Accent strip",
        x: 52,
        y: 610,
        w: 976,
        h: 48,
        radius: 24,
        fillRole: "accent",
        opacity: 0.14,
      }),
      shapeElement({
        label: "Quote plate",
        x: 52,
        y: 684,
        w: 536,
        h: 560,
        radius: 42,
        fillRole: "panel",
      }),
      imageElement({ label: "Case image", x: 624, y: 684, w: 404, h: 560, radius: 42 }),
      textElement({
        label: "Eyebrow",
        slotKey: "eyebrow",
        x: 92,
        y: 108,
        w: 300,
        h: 40,
        fontSize: 24,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: 4,
        colorRole: "accent",
        fontRole: "body",
        textTransform: "uppercase",
      }),
      textElement({
        label: "Headline",
        slotKey: "headline",
        x: 92,
        y: 162,
        w: 640,
        h: 220,
        fontSize: 74,
        fontWeight: 700,
        lineHeight: 0.96,
        letterSpacing: -2.1,
        colorRole: "text",
        fontRole: "heading",
      }),
      textElement({
        label: "Proof Stat",
        slotKey: "proof_stat",
        x: 780,
        y: 154,
        w: 180,
        h: 100,
        fontSize: 96,
        fontWeight: 700,
        lineHeight: 0.92,
        colorRole: "accent",
        fontRole: "mono",
        align: "right",
      }),
      textElement({
        label: "Supporting Copy",
        slotKey: "supporting_copy",
        x: 92,
        y: 748,
        w: 456,
        h: 304,
        fontSize: 28,
        fontWeight: 500,
        lineHeight: 1.26,
        colorRole: "muted",
        fontRole: "body",
      }),
      textElement({
        label: "CTA",
        slotKey: "cta",
        x: 92,
        y: 1112,
        w: 300,
        h: 42,
        fontSize: 24,
        fontWeight: 700,
        colorRole: "accent",
        fontRole: "body",
      }),
      textElement({
        label: "Author / Source",
        slotKey: "author_or_source",
        x: 92,
        y: 1170,
        w: 350,
        h: 44,
        fontSize: 22,
        fontWeight: 600,
        colorRole: "muted",
        fontRole: "body",
      }),
    ],
  },
  {
    id: "insight-point-of-view",
    label: "Point of View",
    archetype: "insight_pov",
    description: "A clean idea-led post for a sharp perspective, argument, or takeaway.",
    swatch: "#0A66C2",
    colors: {
      background: "#0E1E42",
      accent: "#79B3FF",
      text: "#F7FAFF",
      muted: "#D2DFF7",
      panel: "#142955",
      border: "#27406D",
    },
    content: {
      eyebrow: "POV",
      headline: "The strongest LinkedIn posts do one job well instead of trying to say everything.",
      supporting_copy:
        "Use this layout for a conviction, a lesson, or a short argument. Keep the headline sharp and use the supporting copy to add enough context to make the idea feel earned.",
      proof_stat: "1 idea",
      cta: "What would you add?",
      author_or_source: "Operator's note",
    },
    elements: [
      shapeElement({
        label: "Outer panel",
        x: 48,
        y: 48,
        w: 984,
        h: 1254,
        radius: 42,
        fillRole: "panel",
        opacity: 0.92,
      }),
      shapeElement({
        label: "Accent orb",
        x: 796,
        y: 128,
        w: 168,
        h: 168,
        radius: 84,
        fillRole: "accent",
        opacity: 0.26,
      }),
      imageElement({ label: "Support image", x: 702, y: 334, w: 256, h: 304, radius: 30 }),
      textElement({
        label: "Eyebrow",
        slotKey: "eyebrow",
        x: 92,
        y: 112,
        w: 220,
        h: 36,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: 4,
        colorRole: "accent",
        fontRole: "body",
        textTransform: "uppercase",
      }),
      textElement({
        label: "Headline",
        slotKey: "headline",
        x: 92,
        y: 168,
        w: 622,
        h: 390,
        fontSize: 86,
        fontWeight: 700,
        lineHeight: 0.94,
        letterSpacing: -2.2,
        colorRole: "text",
        fontRole: "heading",
      }),
      textElement({
        label: "Supporting Copy",
        slotKey: "supporting_copy",
        x: 92,
        y: 670,
        w: 590,
        h: 250,
        fontSize: 28,
        fontWeight: 500,
        lineHeight: 1.28,
        colorRole: "muted",
        fontRole: "body",
      }),
      textElement({
        label: "Proof Stat",
        slotKey: "proof_stat",
        x: 92,
        y: 980,
        w: 260,
        h: 86,
        fontSize: 88,
        fontWeight: 700,
        colorRole: "accent",
        fontRole: "mono",
      }),
      textElement({
        label: "CTA",
        slotKey: "cta",
        x: 92,
        y: 1144,
        w: 280,
        h: 40,
        fontSize: 24,
        fontWeight: 700,
        colorRole: "accent",
        fontRole: "body",
      }),
      textElement({
        label: "Author / Source",
        slotKey: "author_or_source",
        x: 92,
        y: 1200,
        w: 360,
        h: 40,
        fontSize: 22,
        fontWeight: 600,
        colorRole: "muted",
        fontRole: "body",
      }),
    ],
  },
  {
    id: "event-recap-grid",
    label: "Recap Grid",
    archetype: "event_recap",
    description: "Conference or event recap with image-first hero and clear takeaways.",
    swatch: "#CC5A17",
    colors: TEMPLATE_WARM,
    content: {
      eyebrow: "EVENT RECAP",
      headline: "Three ideas we brought back from this week's stage conversations.",
      supporting_copy:
        "This frame works best when you turn a live event into practical takeaways. Pair a warm image with a clear list-style narrative and one strong next step.",
      proof_stat: "3",
      cta: "Swipe for the takeaways",
      author_or_source: "Event name · Location",
    },
    elements: [
      imageElement({ label: "Event image", x: 52, y: 52, w: 976, h: 468, radius: 44 }),
      shapeElement({ label: "Copy plate", x: 52, y: 560, w: 976, h: 690, radius: 44 }),
      shapeElement({
        label: "Stat circle",
        x: 814,
        y: 626,
        w: 150,
        h: 150,
        radius: 75,
        fillRole: "accent",
        opacity: 0.12,
      }),
      textElement({
        label: "Eyebrow",
        slotKey: "eyebrow",
        x: 96,
        y: 614,
        w: 250,
        h: 34,
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: 4,
        colorRole: "accent",
        fontRole: "body",
        textTransform: "uppercase",
      }),
      textElement({
        label: "Headline",
        slotKey: "headline",
        x: 96,
        y: 664,
        w: 628,
        h: 214,
        fontSize: 72,
        fontWeight: 700,
        lineHeight: 0.98,
        letterSpacing: -1.8,
        colorRole: "text",
        fontRole: "heading",
      }),
      textElement({
        label: "Proof Stat",
        slotKey: "proof_stat",
        x: 846,
        y: 652,
        w: 86,
        h: 86,
        fontSize: 82,
        fontWeight: 700,
        lineHeight: 0.92,
        colorRole: "accent",
        fontRole: "mono",
        align: "center",
      }),
      textElement({
        label: "Supporting Copy",
        slotKey: "supporting_copy",
        x: 96,
        y: 924,
        w: 620,
        h: 196,
        fontSize: 27,
        fontWeight: 500,
        lineHeight: 1.28,
        colorRole: "muted",
        fontRole: "body",
      }),
      textElement({
        label: "CTA",
        slotKey: "cta",
        x: 96,
        y: 1144,
        w: 350,
        h: 40,
        fontSize: 24,
        fontWeight: 700,
        colorRole: "accent",
        fontRole: "body",
      }),
      textElement({
        label: "Author / Source",
        slotKey: "author_or_source",
        x: 96,
        y: 1200,
        w: 360,
        h: 40,
        fontSize: 22,
        fontWeight: 600,
        colorRole: "muted",
        fontRole: "body",
      }),
    ],
  },
  {
    id: "product-launch-split",
    label: "Launch Split",
    archetype: "product_update",
    description: "Feature or launch storytelling with a product visual and announcement slab.",
    swatch: "#1348B8",
    colors: {
      background: "#F3F7FF",
      accent: "#1957E0",
      text: "#10192A",
      muted: "#526079",
      panel: "#FFFFFF",
      border: "#D5DDF0",
    },
    content: {
      eyebrow: "PRODUCT UPDATE",
      headline: "A launch frame built for one clear product change and one clear reason it matters.",
      supporting_copy:
        "Use this for releases, improvements, or packaging updates. Keep the message benefit-led and use the image area to show the product or UI clearly.",
      proof_stat: "NEW",
      cta: "See what's changed",
      author_or_source: "Release note · Date",
    },
    elements: [
      shapeElement({ label: "Left slab", x: 52, y: 52, w: 520, h: 1246, radius: 40 }),
      imageElement({ label: "Product image", x: 604, y: 120, w: 424, h: 644, radius: 38 }),
      shapeElement({
        label: "Bottom product panel",
        x: 604,
        y: 804,
        w: 424,
        h: 442,
        radius: 38,
        fillRole: "panel",
      }),
      textElement({
        label: "Eyebrow",
        slotKey: "eyebrow",
        x: 96,
        y: 112,
        w: 320,
        h: 40,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: 4,
        colorRole: "accent",
        fontRole: "body",
        textTransform: "uppercase",
      }),
      textElement({
        label: "Headline",
        slotKey: "headline",
        x: 96,
        y: 172,
        w: 410,
        h: 360,
        fontSize: 76,
        fontWeight: 700,
        lineHeight: 0.96,
        letterSpacing: -2,
        colorRole: "text",
        fontRole: "heading",
      }),
      textElement({
        label: "Supporting Copy",
        slotKey: "supporting_copy",
        x: 96,
        y: 618,
        w: 404,
        h: 250,
        fontSize: 27,
        fontWeight: 500,
        lineHeight: 1.28,
        colorRole: "muted",
        fontRole: "body",
      }),
      textElement({
        label: "Proof Stat",
        slotKey: "proof_stat",
        x: 652,
        y: 852,
        w: 240,
        h: 70,
        fontSize: 72,
        fontWeight: 700,
        colorRole: "accent",
        fontRole: "mono",
      }),
      textElement({
        label: "CTA",
        slotKey: "cta",
        x: 96,
        y: 1140,
        w: 300,
        h: 42,
        fontSize: 24,
        fontWeight: 700,
        colorRole: "accent",
        fontRole: "body",
      }),
      textElement({
        label: "Author / Source",
        slotKey: "author_or_source",
        x: 96,
        y: 1198,
        w: 320,
        h: 42,
        fontSize: 22,
        fontWeight: 600,
        colorRole: "muted",
        fontRole: "body",
      }),
    ],
  },
  {
    id: "social-proof-quote-card",
    label: "Quote Card",
    archetype: "social_proof",
    description: "Customer validation, testimonial, or community praise with a quote-led layout.",
    swatch: "#0A66C2",
    colors: {
      background: "#EDF5FF",
      accent: "#0A66C2",
      text: "#122033",
      muted: "#536277",
      panel: "#FFFFFF",
      border: "#D6E1F1",
    },
    content: {
      eyebrow: "SOCIAL PROOF",
      headline: "Turn one sharp testimonial into a post that feels designed, not dropped in.",
      supporting_copy:
        "This format is perfect for reviews, DMs, endorsements, or customer comments. Use the quote area for the praise and keep the rest of the frame supporting, not shouting.",
      proof_stat: "5★",
      cta: "Build trust with proof",
      author_or_source: "Customer name · Company",
    },
    elements: [
      shapeElement({ label: "Quote shell", x: 76, y: 88, w: 928, h: 1174, radius: 46 }),
      shapeElement({
        label: "Accent tab",
        x: 112,
        y: 126,
        w: 152,
        h: 44,
        radius: 22,
        fillRole: "accent",
        opacity: 0.14,
      }),
      imageElement({ label: "Proof image", x: 744, y: 184, w: 212, h: 212, radius: 106 }),
      textElement({
        label: "Eyebrow",
        slotKey: "eyebrow",
        x: 132,
        y: 136,
        w: 260,
        h: 32,
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: 4,
        colorRole: "accent",
        fontRole: "body",
        textTransform: "uppercase",
      }),
      textElement({
        label: "Headline",
        slotKey: "headline",
        x: 132,
        y: 224,
        w: 560,
        h: 314,
        fontSize: 82,
        fontWeight: 700,
        lineHeight: 0.94,
        letterSpacing: -2.3,
        colorRole: "text",
        fontRole: "heading",
      }),
      textElement({
        label: "Supporting Copy",
        slotKey: "supporting_copy",
        x: 132,
        y: 640,
        w: 696,
        h: 274,
        fontSize: 30,
        fontWeight: 500,
        lineHeight: 1.3,
        colorRole: "muted",
        fontRole: "body",
      }),
      textElement({
        label: "Proof Stat",
        slotKey: "proof_stat",
        x: 132,
        y: 978,
        w: 160,
        h: 70,
        fontSize: 76,
        fontWeight: 700,
        colorRole: "accent",
        fontRole: "mono",
      }),
      textElement({
        label: "CTA",
        slotKey: "cta",
        x: 132,
        y: 1136,
        w: 340,
        h: 40,
        fontSize: 24,
        fontWeight: 700,
        colorRole: "accent",
        fontRole: "body",
      }),
      textElement({
        label: "Author / Source",
        slotKey: "author_or_source",
        x: 132,
        y: 1192,
        w: 420,
        h: 40,
        fontSize: 22,
        fontWeight: 600,
        colorRole: "muted",
        fontRole: "body",
      }),
    ],
  },
];

export function getTemplate(templateId) {
  return TEMPLATE_LIBRARY.find((entry) => entry.id === templateId) || null;
}

export function templatesForArchetype(archetype) {
  return TEMPLATE_LIBRARY.filter((entry) => entry.archetype === archetype);
}

export function defaultTemplateIdForArchetype(archetype) {
  return templatesForArchetype(archetype)[0]?.id || TEMPLATE_LIBRARY[0].id;
}

function mediaCoverageVariantById(variantId) {
  return MEDIA_COVERAGE_VARIANTS.find((variant) => variant.id === variantId) || null;
}

function cloneMediaCoverageBackgroundElements(variantId, aspectRatio = BASE_TEMPLATE_ASPECT_RATIO_ID) {
  const backgroundOption = mediaCoverageBackgroundById(variantId);
  if (backgroundOption) {
    return cloneElements(mapElementsToAspectRatio(mediaCoverageBackgroundElements(backgroundOption.id), BASE_TEMPLATE_ASPECT_RATIO_ID, aspectRatio));
  }
  const variant = mediaCoverageVariantById(variantId);
  if (!variant) return [];
  return cloneElements(mapElementsToAspectRatio(mediaCoverageBackgroundElements(variant.backgroundAssetId), BASE_TEMPLATE_ASPECT_RATIO_ID, aspectRatio));
}

function cloneMediaCoverageTextElements(layoutMode, aspectRatio = BASE_TEMPLATE_ASPECT_RATIO_ID) {
  return cloneElements(mapElementsToAspectRatio(createMediaCoverageTextElements(layoutMode), BASE_TEMPLATE_ASPECT_RATIO_ID, aspectRatio));
}

function cloneElements(elements = []) {
  return elements.map((element) => ({
    ...deepClone(element),
    id: uid("elt"),
  }));
}

export function createFrameFromTemplate(templateId, options = {}) {
  const template = getTemplate(templateId) || TEMPLATE_LIBRARY[0];
  const position = Number.isFinite(Number(options.index)) ? Number(options.index) + 1 : 1;
  const aspectRatio = options.aspectRatio || template.defaultAspectRatio || DEFAULT_ASPECT_RATIO_ID;
  return {
    id: uid("frm"),
    title: options.title || `${template.label} ${position}`,
    templateId: template.id,
    archetype: template.archetype,
    aspectRatio,
    designFamily: template.designFamily || "",
    variantId: template.variantId || "",
    variantLabel: template.variantLabel || "",
    previewThumbnail: template.previewThumbnail || "",
    backgroundAssetId: template.backgroundAssetId || null,
    backgroundVariantId: template.backgroundVariantId || template.backgroundAssetId || template.variantId || "",
    defaultImageAssetId: template.defaultImageAssetId || null,
    textLayoutMode: template.textLayoutMode || "",
    layoutLocked: options.layoutLocked === true,
    layoutTouched: options.layoutTouched === true,
    altText: options.altText || "",
    textStylePresetId: options.textStylePresetId || template.defaultTextStylePresetId || null,
    resourceIds: Array.isArray(options.resourceIds) ? [...options.resourceIds] : [],
    colors: deepClone(template.colors),
    media: {
      assetId: null,
      imageUrl: "",
      objectFit: "cover",
      objectPositionX: 50,
      objectPositionY: 50,
      scale: 1,
    },
    content: {
      ...deepClone(template.content),
      ...(options.content || {}),
    },
    elements: cloneElements(mapElementsToAspectRatio(template.elements, BASE_TEMPLATE_ASPECT_RATIO_ID, aspectRatio)),
  };
}

export function cloneFrame(frame) {
  const copy = deepClone(frame);
  copy.id = uid("frm");
  copy.elements = cloneElements(copy.elements || []);
  return copy;
}

export function archetypeLabel(archetype) {
  return ARCHETYPE_OPTIONS.find((entry) => entry.id === archetype)?.label || archetype;
}

export function getLinkedInTemplateAsset(assetId) {
  if (!assetId) return null;
  return LINKEDIN_TEMPLATE_ASSETS[assetId] || null;
}

export function isMediaCoverageTemplate(templateOrTemplateId) {
  const template = typeof templateOrTemplateId === "string"
    ? getTemplate(templateOrTemplateId)
    : templateOrTemplateId;
  return template?.designFamily === MEDIA_COVERAGE_DESIGN_FAMILY;
}

export function mediaCoverageVariantOptions() {
  return MEDIA_COVERAGE_VARIANTS.map((variant) => ({
    id: variant.id,
    label: variant.uiLabel || variant.label,
    templateId: variant.templateId,
    swatch: variant.swatch,
    textLayoutMode: variant.textLayoutMode,
    previewThumbnail: variant.previewThumbnail,
  }));
}

export function mediaCoverageBackgroundOptions() {
  return MEDIA_COVERAGE_BACKGROUND_OPTIONS.map((background) => ({
    id: background.id,
    label: background.label,
    swatch: background.swatch,
    backgroundAssetId: background.id,
  }));
}

export function mediaCoverageTextLayoutOptions() {
  return MEDIA_COVERAGE_TEXT_LAYOUT_OPTIONS.map((option) => ({ ...option }));
}

export function mediaCoverageTemplateIdForVariant(variantId) {
  return mediaCoverageVariantById(variantId)?.templateId || null;
}

export function applyMediaCoverageBackground(frame, variantId) {
  if (!frame || frame.designFamily !== MEDIA_COVERAGE_DESIGN_FAMILY) return frame;
  const backgroundId = mediaCoverageBackgroundById(variantId)?.id || mediaCoverageVariantById(variantId)?.backgroundAssetId;
  if (!backgroundId) return frame;
  const nextBackgroundElements = cloneMediaCoverageBackgroundElements(backgroundId, frame.aspectRatio || BASE_TEMPLATE_ASPECT_RATIO_ID);
  const otherElements = (frame.elements || []).filter((element) => !(element.locked === true && element.layerRole === "background"));
  frame.elements = [...nextBackgroundElements, ...otherElements];
  frame.backgroundAssetId = backgroundId;
  frame.backgroundVariantId = backgroundId;
  return frame;
}

export function applyMediaCoverageTextLayout(frame, layoutMode) {
  if (!frame || frame.designFamily !== MEDIA_COVERAGE_DESIGN_FAMILY) return frame;
  const nextTextElements = cloneMediaCoverageTextElements(layoutMode, frame.aspectRatio || BASE_TEMPLATE_ASPECT_RATIO_ID);
  const sourceTextElements = (frame.elements || []).filter((element) => element.type === "text");
  const usedKeys = new Set();
  const mergedTextElements = nextTextElements.map((element) => {
    const match = sourceTextElements.find((candidate) => {
      const key = candidate.templateKey || candidate.slotKey || `${candidate.type}:${candidate.label}`;
      if (usedKeys.has(key)) return false;
      if (element.templateKey && candidate.templateKey === element.templateKey) return true;
      if (element.slotKey && candidate.slotKey === element.slotKey) return true;
      return false;
    });
    if (!match) return element;
    usedKeys.add(match.templateKey || match.slotKey || `${match.type}:${match.label}`);
    return {
      ...element,
      text: match.text || element.text,
      style: {
        ...(element.style || {}),
        ...(match.style || {}),
      },
    };
  });
  const nonTextElements = (frame.elements || []).filter((element) => element.type !== "text");
  frame.elements = [...nonTextElements, ...mergedTextElements];
  frame.textLayoutMode = layoutMode;
  return frame;
}

export function createLooseElement(type, aspectRatio = DEFAULT_ASPECT_RATIO_ID) {
  const next = (() => {
    if (type === "image") {
      return imageElement({
        label: "Image",
        x: 120,
        y: 120,
        w: 320,
        h: 320,
      });
    }
    if (type === "shape") {
      return shapeElement({
        label: "Shape",
        x: 120,
        y: 120,
        w: 340,
        h: 220,
        fillRole: "panel",
        strokeColor: "rgba(15, 23, 42, 0.08)",
        strokeWidth: 1,
        layerRole: "foreground",
      });
    }
    if (type === "button") {
      return buttonElement({
        label: "Button",
        slotKey: "",
        text: "Read more",
        x: 120,
        y: 120,
        w: 260,
        h: 68,
      });
    }
    return textElement({
      label: "Text",
      slotKey: "",
      text: "Add text",
      x: 120,
      y: 120,
      w: 420,
      h: 74,
      fontSize: 40,
      fontWeight: 700,
      lineHeight: 1.02,
      colorRole: "text",
      fontRole: "heading",
    });
  })();

  return scaleElementGeometry(next, BASE_TEMPLATE_ASPECT_RATIO_ID, aspectRatio || DEFAULT_ASPECT_RATIO_ID);
}
