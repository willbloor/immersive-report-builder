export const PRINT_PROFILES = {
  LETTER_portrait: {
    id: "LETTER_portrait",
    label: "US Letter Portrait",
    width: "8.5in",
    height: "11in",
    widthMm: 215.9,
    heightMm: 279.4,
    cssSize: "8.5in 11in",
  },
  LETTER_landscape: {
    id: "LETTER_landscape",
    label: "US Letter Landscape",
    width: "11in",
    height: "8.5in",
    widthMm: 279.4,
    heightMm: 215.9,
    cssSize: "11in 8.5in",
  },
  A4_portrait: {
    id: "A4_portrait",
    label: "A4 Portrait",
    width: "210mm",
    height: "297mm",
    widthMm: 210,
    heightMm: 297,
    cssSize: "210mm 297mm",
  },
  A4_landscape: {
    id: "A4_landscape",
    label: "A4 Landscape",
    width: "297mm",
    height: "210mm",
    widthMm: 297,
    heightMm: 210,
    cssSize: "297mm 210mm",
  },
};

export const DEFAULT_PRINT_PROFILE = "LETTER_landscape";

export function profileKeys() {
  return Object.keys(PRINT_PROFILES);
}

export function getProfile(profileId) {
  return PRINT_PROFILES[profileId] || PRINT_PROFILES[DEFAULT_PRINT_PROFILE];
}
