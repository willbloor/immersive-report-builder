import { uid } from "../utils/helpers.js?v=20260401r";

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for processing."));
    image.src = dataUrl;
  });
}

async function trimTransparentPadding(dataUrl, mime = "image/png") {
  try {
    const image = await loadImage(dataUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      return {
        dataUrl,
        trimProcessed: true,
        trimApplied: false,
        width,
        height,
        subjectBounds: { x: 0, y: 0, w: 1, h: 1 },
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return {
        dataUrl,
        trimProcessed: true,
        trimApplied: false,
        width,
        height,
        subjectBounds: { x: 0, y: 0, w: 1, h: 1 },
      };
    }
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = pixels[((y * width) + x) * 4 + 3];
        if (alpha <= 0) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < 0 || maxY < 0) {
      return {
        dataUrl,
        trimProcessed: true,
        trimApplied: false,
        width,
        height,
        subjectBounds: { x: 0, y: 0, w: 1, h: 1 },
      };
    }

    const subjectBounds = {
      x: minX / width,
      y: minY / height,
      w: Math.max(1, maxX - minX + 1) / width,
      h: Math.max(1, maxY - minY + 1) / height,
    };

    const padding = 2;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width - 1, maxX + padding);
    maxY = Math.min(height - 1, maxY + padding);

    const trimmedWidth = Math.max(1, maxX - minX + 1);
    const trimmedHeight = Math.max(1, maxY - minY + 1);
    if (trimmedWidth >= width && trimmedHeight >= height) {
      return {
        dataUrl,
        trimProcessed: true,
        trimApplied: false,
        width,
        height,
        subjectBounds,
      };
    }

    const trimmedCanvas = document.createElement("canvas");
    trimmedCanvas.width = trimmedWidth;
    trimmedCanvas.height = trimmedHeight;
    const trimmedContext = trimmedCanvas.getContext("2d");
    if (!trimmedContext) {
      return {
        dataUrl,
        trimProcessed: true,
        trimApplied: false,
        width,
        height,
        subjectBounds,
      };
    }
    trimmedContext.drawImage(canvas, minX, minY, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);
    return {
      dataUrl: trimmedCanvas.toDataURL(mime || "image/png"),
      trimProcessed: true,
      trimApplied: true,
      width: trimmedWidth,
      height: trimmedHeight,
      subjectBounds: { x: 0, y: 0, w: 1, h: 1 },
    };
  } catch (_error) {
    return {
      dataUrl,
      trimProcessed: true,
      trimApplied: false,
      width: 0,
      height: 0,
      subjectBounds: { x: 0, y: 0, w: 1, h: 1 },
    };
  }
}

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
    const processed = await trimTransparentPadding(dataUrl, file.type || "image/png");
    return {
      ok: true,
      value: {
        id: uid("asset"),
        type: "image",
        filename: file.name,
        mime: file.type,
        size: file.size,
        dataUrl: processed.dataUrl,
        trimProcessed: processed.trimProcessed === true,
        trimApplied: processed.trimApplied === true,
        width: Number(processed.width) || 0,
        height: Number(processed.height) || 0,
        subjectBounds: processed.subjectBounds || { x: 0, y: 0, w: 1, h: 1 },
      },
    };
  } catch (error) {
    return { ok: false, error: error.message || "Failed to import image" };
  }
}

export async function importAssetUrl(url, filename = "remote-image.png") {
  if (!url) return { ok: false, error: "No asset URL provided." };
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      return { ok: false, error: `Failed to fetch remote asset (${response.status})` };
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
      return { ok: false, error: "Remote asset is not an image." };
    }
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    return importAssetFile(file);
  } catch (error) {
    return { ok: false, error: error.message || "Failed to import remote asset." };
  }
}

export function findAssetById(state, assetId) {
  return (state.assets || []).find((asset) => asset.id === assetId) || null;
}
