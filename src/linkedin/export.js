import { downloadText } from "../utils/helpers.js?v=20260401p";
import { startPerfTimer } from "../utils/perf.js?v=20260401m";

function ensureCaptureRuntime() {
  if (typeof window.html2canvas !== "function") {
    throw new Error("html2canvas is not available.");
  }
  const runtime = window.jspdf?.jsPDF || window.jspdf?.default?.jsPDF;
  if (typeof runtime !== "function") {
    throw new Error("jsPDF is not available.");
  }
  return runtime;
}

async function captureNode(node, size, context = {}) {
  if (typeof window.html2canvas !== "function") {
    throw new Error("html2canvas is not available.");
  }
  const stopCaptureTimer = startPerfTimer("persist", {
    action: "export-capture",
    app: "linkedin-builder",
    surface: "linkedin",
    ...context,
  });
  try {
    const canvas = await window.html2canvas(node, {
      backgroundColor: null,
      logging: false,
      scale: 1,
      useCORS: true,
      width: size.width,
      height: size.height,
    });
    stopCaptureTimer({
      height: canvas.height,
      ok: true,
      width: canvas.width,
    });
    return canvas;
  } catch (error) {
    stopCaptureTimer({ ok: false });
    throw error;
  }
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportProjectJson(state, filename) {
  downloadText(filename, JSON.stringify(state, null, 2));
}

export async function exportFramePng(node, filename, size) {
  const canvas = await captureNode(node, size, {
    exportFormat: "png",
    pageCount: 1,
    pageIndex: 0,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode PNG export."));
        return;
      }
      triggerBlobDownload(blob, filename);
      resolve();
    }, "image/png");
  });
}

export async function exportFramesPdf(nodes, filename, size) {
  const JsPdf = ensureCaptureRuntime();
  const orientation = size.width > size.height ? "landscape" : "portrait";
  const pdf = new JsPdf({
    orientation,
    unit: "px",
    format: [size.width, size.height],
    compress: true,
  });

  for (let index = 0; index < nodes.length; index += 1) {
    const canvas = await captureNode(nodes[index], size, {
      exportFormat: "pdf",
      pageCount: nodes.length,
      pageIndex: index,
    });
    const imageData = canvas.toDataURL("image/png");
    if (index > 0) {
      pdf.addPage([size.width, size.height], orientation);
    }
    pdf.addImage(imageData, "PNG", 0, 0, size.width, size.height, undefined, "FAST");
  }

  pdf.save(filename);
}
