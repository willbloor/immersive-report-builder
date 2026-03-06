import { uid } from "../utils/helpers.js";

export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export async function importAssetFile(file) {
  if (!file) return { ok: false, error: "No file selected." };
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Only image files are supported in V1." };
  }

  try {
    const dataUrl = await fileToDataUrl(file);
    return {
      ok: true,
      value: {
        id: uid("asset"),
        type: "image",
        filename: file.name,
        mime: file.type,
        size: file.size,
        dataUrl,
      },
    };
  } catch (error) {
    return { ok: false, error: error.message || "Failed to import image" };
  }
}

export function findAssetById(state, assetId) {
  return (state.assets || []).find((asset) => asset.id === assetId) || null;
}
