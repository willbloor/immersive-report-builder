export const LINKEDIN_SCHEMA_VERSION = "linkedin_builder.v1";
export const LINKEDIN_STORAGE_KEY = "linkedin-builder.state.v1";
export const LINKEDIN_LIBRARY_STORAGE_KEY = "linkedin-builder.library.v1";
export const LINKEDIN_DOCUMENTS_INDEX_KEY = "linkedin-builder.documents.index.v1";
export const LINKEDIN_DOCUMENT_STATE_PREFIX = "linkedin-builder.document.state.v1.";
export const LINKEDIN_DOCUMENTS_MIGRATION_KEY = "linkedin-builder.documents.migrated.v1";
export const LINKEDIN_SHARED_ASSETS_KEY = "linkedin-builder.assets.shared.v1";

export const DEFAULT_ASPECT_RATIO_ID = "square_1_1";

export const ASPECT_RATIO_PRESETS = [
  {
    id: "square_1_1",
    label: "Square",
    width: 1080,
    height: 1080,
  },
  {
    id: "portrait_4_5",
    label: "LinkedIn Portrait",
    width: 1080,
    height: 1350,
  },
];

export function getAspectRatioPreset(aspectRatioId) {
  return ASPECT_RATIO_PRESETS.find((preset) => preset.id === aspectRatioId) || ASPECT_RATIO_PRESETS[0];
}

export const OUTPUT_MODE_OPTIONS = [
  { id: "static", label: "Static Post", description: "Single exported PNG." },
  { id: "carousel", label: "Carousel", description: "Multi-page PDF document post." },
];

export const BACKGROUND_PRESETS = [
  {
    id: "clean-light",
    label: "Clean Light",
    description: "Bright, crisp, and flexible for most posts.",
    colors: {
      background: "#F5F8FE",
      accent: "#0A66C2",
      text: "#122033",
      muted: "#5E6C82",
      panel: "#FFFFFF",
      border: "#D6E1F1",
    },
  },
  {
    id: "soft-slate",
    label: "Soft Slate",
    description: "Muted blue-grey for proof and product stories.",
    colors: {
      background: "#F2F4F8",
      accent: "#1348B8",
      text: "#131A2A",
      muted: "#5E6778",
      panel: "#FFFFFF",
      border: "#DCE2EC",
    },
  },
  {
    id: "warm-cream",
    label: "Warm Cream",
    description: "Warm editorial tones for people and event posts.",
    colors: {
      background: "#FFF7F0",
      accent: "#CC5A17",
      text: "#23170F",
      muted: "#6D5A4D",
      panel: "#FFFDF9",
      border: "#F0DCC8",
    },
  },
  {
    id: "bold-navy",
    label: "Bold Navy",
    description: "High-contrast and opinionated for POV-led posts.",
    colors: {
      background: "#0E1E42",
      accent: "#79B3FF",
      text: "#F7FAFF",
      muted: "#D2DFF7",
      panel: "#142955",
      border: "#27406D",
    },
  },
];

export const ARCHETYPE_OPTIONS = [
  {
    id: "people_spotlight",
    label: "People Spotlight",
    description: "Team, leadership, or employee-story posts with portrait-led layouts.",
  },
  {
    id: "case_study",
    label: "Case Study",
    description: "Narrative proof points, outcomes, and customer wins.",
  },
  {
    id: "insight_pov",
    label: "Insight POV",
    description: "Opinion-led thought leadership and data-backed point of view.",
  },
  {
    id: "event_recap",
    label: "Event Recap",
    description: "Talks, conferences, launches, or recap storytelling.",
  },
  {
    id: "product_update",
    label: "Product Update",
    description: "Feature release, launch, or product education posts.",
  },
  {
    id: "social_proof",
    label: "Social Proof",
    description: "Testimonials, praise, customer quotes, and validation.",
  },
];

export const SLOT_FIELDS = [
  { key: "eyebrow", label: "Eyebrow", multiline: false, maxLength: 80 },
  { key: "headline", label: "Headline", multiline: true, maxLength: 180 },
  { key: "supporting_copy", label: "Supporting Copy", multiline: true, maxLength: 420 },
  { key: "speaker_name", label: "Speaker Name", multiline: false, maxLength: 120 },
  { key: "proof_stat", label: "Proof Stat", multiline: false, maxLength: 40 },
  { key: "cta", label: "CTA", multiline: false, maxLength: 120 },
  { key: "author_or_source", label: "Author / Source", multiline: false, maxLength: 120 },
];

export const RESOURCE_SOURCE_OPTIONS = [
  { id: "figma_link", label: "Figma Link" },
  { id: "reference_post", label: "Reference Post" },
  { id: "upload", label: "Uploaded Reference" },
];

export const CTA_PRESETS = [
  "Read the full story",
  "See how it works",
  "See the results",
  "Swipe for the takeaways",
  "Learn more",
  "Explore the rollout",
  "Get the guide",
  "What would you add?",
];

export const TEXT_STYLE_PRESETS = [
  {
    id: "editorial-sans",
    label: "Editorial",
    defaults: {
      heading: { fontRole: "heading", fontWeight: 700, lineHeight: 0.94, letterSpacing: -2.2 },
      body: { fontRole: "body", fontWeight: 500, lineHeight: 1.24, letterSpacing: 0 },
      mono: { fontRole: "mono", fontWeight: 700, lineHeight: 0.92, letterSpacing: -1 },
    },
    slots: {
      eyebrow: { fontRole: "body", fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", colorRole: "accent" },
      cta: { fontRole: "body", fontWeight: 700, letterSpacing: 0 },
      author_or_source: { fontRole: "body", fontWeight: 600, lineHeight: 1.1 },
    },
  },
  {
    id: "bold-signal",
    label: "Bold",
    defaults: {
      heading: { fontRole: "heading", fontWeight: 800, lineHeight: 0.9, letterSpacing: -3 },
      body: { fontRole: "body", fontWeight: 600, lineHeight: 1.16, letterSpacing: -0.2 },
      mono: { fontRole: "mono", fontWeight: 700, lineHeight: 0.9, letterSpacing: -1.4 },
    },
    slots: {
      eyebrow: { fontRole: "body", fontWeight: 800, letterSpacing: 3.2, textTransform: "uppercase", colorRole: "accent" },
      supporting_copy: { fontRole: "body", fontWeight: 600, lineHeight: 1.14, colorRole: "text" },
      cta: { fontRole: "body", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, colorRole: "accent" },
      author_or_source: { fontRole: "body", fontWeight: 700, lineHeight: 1.05 },
    },
  },
  {
    id: "mono-headline",
    label: "Mono",
    defaults: {
      heading: { fontRole: "mono", fontWeight: 600, lineHeight: 0.92, letterSpacing: -1.8 },
      body: { fontRole: "body", fontWeight: 500, lineHeight: 1.2, letterSpacing: 0 },
      mono: { fontRole: "mono", fontWeight: 700, lineHeight: 0.9, letterSpacing: -1.2 },
    },
    slots: {
      eyebrow: { fontRole: "mono", fontWeight: 600, letterSpacing: 3.6, textTransform: "uppercase", colorRole: "accent" },
      proof_stat: { fontRole: "mono", fontWeight: 700, colorRole: "accent" },
      cta: { fontRole: "mono", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, colorRole: "accent" },
      author_or_source: { fontRole: "body", fontWeight: 600, lineHeight: 1.08 },
    },
  },
  {
    id: "media-coverage",
    label: "Coverage",
    defaults: {
      heading: { fontRole: "ui", fontWeight: 500, lineHeight: 1.08, letterSpacing: -0.9 },
      body: { fontRole: "ui", fontWeight: 400, lineHeight: 1.15, letterSpacing: -0.3 },
      mono: { fontRole: "mono", fontWeight: 700, lineHeight: 0.92, letterSpacing: -1.2 },
    },
    slots: {
      headline: { fontRole: "ui", fontWeight: 500, colorRole: "text" },
      supporting_copy: { fontRole: "ui", fontWeight: 400, colorRole: "text", lineHeight: 1.15, letterSpacing: -0.3 },
      speaker_name: { fontRole: "ui", fontWeight: 500, colorRole: "text", lineHeight: 1.08, letterSpacing: -0.36 },
      author_or_source: { fontRole: "ui", fontWeight: 400, colorRole: "muted", lineHeight: 1.2, letterSpacing: -0.28 },
    },
  },
];

export const FONT_ROLE_OPTIONS = [
  { id: "heading", label: "Heading" },
  { id: "body", label: "Body" },
  { id: "ui", label: "Geologica" },
  { id: "mono", label: "Mono" },
];

export const COLOR_ROLE_OPTIONS = [
  { id: "text", label: "Text" },
  { id: "muted", label: "Muted" },
  { id: "accent", label: "Accent" },
  { id: "panel", label: "Panel" },
  { id: "background", label: "Background" },
  { id: "custom", label: "Custom" },
];

export const ELEMENT_TYPE_OPTIONS = [
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "shape", label: "Shape" },
  { id: "button", label: "Button" },
];

export const LAYER_ROLE_OPTIONS = [
  { id: "background", label: "Background" },
  { id: "foreground", label: "Foreground" },
  { id: "text", label: "Text" },
  { id: "cta", label: "CTA" },
];
