import { resolveComponentProps } from "../data/bindings.js";
import { getProfile } from "../print/profiles.js";
import { getComponentLayout } from "../templates/catalog.js";
import { escapeHtml } from "../utils/helpers.js";
import { renderComponentHtml, renderPageFooter } from "./components.js";

export const DND_MIME = "application/x-immersive-reportbuilder";
const TEXT_SURFACE_TYPES = new Set(["text", "all_caps_title", "header_3", "copy_block"]);

export function setDragData(ev, payload) {
  ev.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
  ev.dataTransfer.effectAllowed = "copyMove";
}

export function getDragData(ev) {
  const raw = ev.dataTransfer.getData(DND_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

export function calculateDropPosition(ev, pageBodyEl) {
  const metrics = readGridMetrics(pageBodyEl);
  const x = ev.clientX - metrics.rect.left;
  const y = ev.clientY - metrics.rect.top;

  return {
    colStart: Math.max(1, Math.min(metrics.cols, Math.floor(x / metrics.cellW) + 1)),
    rowStart: Math.max(1, Math.min(metrics.rowsAvailable, Math.floor(y / metrics.cellH) + 1)),
  };
}

function pxNumber(value, fallback) {
  const n = Number.parseFloat(String(value || "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function readGridMetrics(pageBodyEl) {
  const styles = getComputedStyle(pageBodyEl);
  const rect = pageBodyEl.getBoundingClientRect();
  const cols = Math.max(1, Number.parseInt(styles.getPropertyValue("--grid-cols"), 10) || 24);
  const gap = Math.max(0, pxNumber(styles.getPropertyValue("--grid-gap"), 6));
  const row = Math.max(1, pxNumber(styles.getPropertyValue("--grid-row"), 10));
  const colW = (rect.width - gap * (cols - 1)) / cols;
  const cellW = colW + gap;
  const cellH = row + gap;
  const bodyHeight = pageBodyEl.clientHeight || rect.height;
  const rowsAvailable = Math.max(1, Math.floor((bodyHeight + gap) / cellH));
  return {
    rect,
    cols,
    gap,
    row,
    colW,
    cellW,
    cellH,
    rowsAvailable,
  };
}

function clampMoveToGrid(rawColStart, rawRowStart, colSpan, rowSpan, metrics) {
  const maxColStart = Math.max(1, metrics.cols - colSpan + 1);
  const maxRowStart = Math.max(1, metrics.rowsAvailable - rowSpan + 1);
  return {
    colStart: Math.max(1, Math.min(maxColStart, rawColStart)),
    rowStart: Math.max(1, Math.min(maxRowStart, rawRowStart)),
  };
}

function bindInteractHandlers({
  node,
  page,
  component,
  layout,
  handlers,
}) {
  if (node.dataset.interactionBound === "1") return true;

  const pageBody = node.closest(".page-body");
  if (!pageBody) return false;

  node.dataset.interactionBound = "1";
  let activeState = null;

  function createGhost(startLayout) {
    const ghost = document.createElement("div");
    ghost.className = "component-drop-ghost no-print";
    ghost.style.gridColumn = `${startLayout.colStart} / span ${startLayout.colSpan}`;
    ghost.style.gridRow = `${startLayout.rowStart} / span ${startLayout.rowSpan}`;
    pageBody.appendChild(ghost);
    return ghost;
  }

  function createLiveBadge(text) {
    const liveBadge = document.createElement("div");
    liveBadge.className = "component-live-badge no-print";
    liveBadge.textContent = text;
    node.appendChild(liveBadge);
    return liveBadge;
  }

  function clearActiveState() {
    if (!activeState) return;
    activeState.ghost.remove();
    activeState.liveBadge.remove();
    node.classList.remove("is-resizing");
    document.body.classList.remove("is-resizing-component");
    activeState = null;
  }

  function onMouseMove(event) {
    if (!activeState) return;
    event.preventDefault();

    const metrics = readGridMetrics(pageBody);
    const dx = event.clientX - activeState.startX;
    const dy = event.clientY - activeState.startY;
    activeState.metrics = metrics;

    const start = activeState.startLayout;
    const dir = activeState.resizeDir;
    const dColsRaw = dx / Math.max(1, metrics.cellW);
    const dRowsRaw = dy / Math.max(1, metrics.cellH);
    const dCols =
      Math.abs(dColsRaw) < 0.2 ? 0 : dColsRaw > 0 ? Math.ceil(dColsRaw) : Math.floor(dColsRaw);
    const dRows =
      Math.abs(dRowsRaw) < 0.2 ? 0 : dRowsRaw > 0 ? Math.ceil(dRowsRaw) : Math.floor(dRowsRaw);

    let nextColStart = start.colStart;
    let nextRowStart = start.rowStart;
    let nextColSpan = start.colSpan;
    let nextRowSpan = start.rowSpan;

    if (dir.includes("e")) {
      const maxColSpan = Math.max(1, metrics.cols - start.colStart + 1);
      nextColSpan = Math.max(1, Math.min(maxColSpan, start.colSpan + dCols));
    }
    if (dir.includes("s")) {
      const maxRowSpan = Math.max(1, metrics.rowsAvailable - start.rowStart + 1);
      nextRowSpan = Math.max(1, Math.min(maxRowSpan, start.rowSpan + dRows));
    }
    if (dir.includes("w")) {
      const maxColStart = start.colStart + start.colSpan - 1;
      nextColStart = Math.max(1, Math.min(maxColStart, start.colStart + dCols));
      nextColSpan = start.colSpan + (start.colStart - nextColStart);
    }
    if (dir.includes("n")) {
      const maxRowStart = start.rowStart + start.rowSpan - 1;
      nextRowStart = Math.max(1, Math.min(maxRowStart, start.rowStart + dRows));
      nextRowSpan = start.rowSpan + (start.rowStart - nextRowStart);
    }

    const maxColSpanForStart = Math.max(1, metrics.cols - nextColStart + 1);
    const maxRowSpanForStart = Math.max(1, metrics.rowsAvailable - nextRowStart + 1);
    nextColSpan = Math.max(1, Math.min(maxColSpanForStart, nextColSpan));
    nextRowSpan = Math.max(1, Math.min(maxRowSpanForStart, nextRowSpan));
    nextColStart = Math.max(1, Math.min(metrics.cols - nextColSpan + 1, nextColStart));
    nextRowStart = Math.max(1, Math.min(metrics.rowsAvailable - nextRowSpan + 1, nextRowStart));

    activeState.nextLayout.colStart = nextColStart;
    activeState.nextLayout.rowStart = nextRowStart;
    activeState.nextLayout.colSpan = nextColSpan;
    activeState.nextLayout.rowSpan = nextRowSpan;

    activeState.ghost.style.gridColumn = `${nextColStart} / span ${nextColSpan}`;
    activeState.ghost.style.gridRow = `${nextRowStart} / span ${nextRowSpan}`;
    activeState.liveBadge.textContent = `${nextColStart},${nextRowStart} · ${nextColSpan}×${nextRowSpan}`;
    node.style.gridColumn = `${nextColStart} / span ${nextColSpan}`;
    node.style.gridRow = `${nextRowStart} / span ${nextRowSpan}`;
  }

  function onMouseUp() {
    if (!activeState) return;
    const startLayout = activeState.startLayout;
    const nextLayout = activeState.nextLayout;

    node.style.gridColumn = activeState.originalGridColumn;
    node.style.gridRow = activeState.originalGridRow;

    clearActiveState();
    window.removeEventListener("mousemove", onMouseMove, true);
    window.removeEventListener("mouseup", onMouseUp, true);
    window.removeEventListener("blur", onMouseUp, true);

    handlers.select(page.id, component.id);
    const patch = {};
    if (nextLayout.colStart !== startLayout.colStart) patch.colStart = nextLayout.colStart;
    if (nextLayout.rowStart !== startLayout.rowStart) patch.rowStart = nextLayout.rowStart;
    if (nextLayout.colSpan !== startLayout.colSpan) patch.colSpan = nextLayout.colSpan;
    if (nextLayout.rowSpan !== startLayout.rowSpan) patch.rowSpan = nextLayout.rowSpan;
    if (Object.keys(patch).length === 0) return;
    if (component.layoutConstraints?.locked) {
      handlers.toggleComponentLock(page.id, component.id);
    }
    handlers.resizeComponent(page.id, component.id, patch);
  }

  function beginResize(startX, startY, resizeDir) {
    const startLayout = { ...layout };
    const ghost = createGhost(startLayout);
    const liveBadge = createLiveBadge(
      `${startLayout.colStart},${startLayout.rowStart} · ${startLayout.colSpan}×${startLayout.rowSpan}`,
    );

    activeState = {
      mode: "resize",
      resizeDir,
      startX,
      startY,
      metrics: readGridMetrics(pageBody),
      startLayout,
      nextLayout: { ...startLayout },
      ghost,
      liveBadge,
      originalGridColumn: node.style.gridColumn,
      originalGridRow: node.style.gridRow,
    };

    node.classList.add("is-resizing");
    document.body.classList.add("is-resizing-component");

    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("blur", onMouseUp, true);
  }

  node.querySelectorAll("[data-resize-dir]").forEach((resizeHandle) => {
    resizeHandle.addEventListener("mousedown", (event) => {
      if (activeState) return;
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      beginResize(event.clientX, event.clientY, resizeHandle.dataset.resizeDir || "se");
    });
  });

  return true;
}

function createComponentNode({
  state,
  page,
  component,
  profileId,
  selected,
  handlers,
  datasets,
}) {
  const layout = getComponentLayout(component, profileId);
  const node = document.createElement("article");
  node.className = "canvas-component";
  node.dataset.componentId = component.id;
  node.dataset.pageId = page.id;
  node.style.gridColumn = `${layout.colStart} / span ${layout.colSpan}`;
  node.style.gridRow = `${layout.rowStart} / span ${layout.rowSpan}`;
  node.draggable = false;
  if (TEXT_SURFACE_TYPES.has(component.type)) node.classList.add("canvas-component--textual");
  if (layout.rowStart <= 2) node.classList.add("toolbar-inline");
  if (selected) {
    node.classList.add("is-selected");
    node.dataset.editTargetActive = state.ui?.topbarTextTarget === "body" ? "body" : "title";
  }
  if (component.layoutConstraints?.locked) node.classList.add("is-locked");

  const resolvedProps = resolveComponentProps(component, datasets);
  const renderModel = {
    ...component,
    __pendingDeleteConfirm: state.ui.pendingDeleteComponentId === component.id,
  };
  node.innerHTML = renderComponentHtml(renderModel, resolvedProps);

  let activeInlineEdit = null;

  function normalizeInlineTextValue(rawValue, isBlock) {
    const normalized = String(rawValue ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/\n$/, "");
    if (isBlock) return normalized;
    return normalized.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  }

  function readInlineTextValue(targetNode) {
    const isBlock = targetNode.classList.contains("edit-target-block");
    const rawValue = isBlock ? targetNode.innerText : targetNode.textContent;
    return normalizeInlineTextValue(rawValue, isBlock);
  }

  function writeInlineTextValue(targetNode, value) {
    const isBlock = targetNode.classList.contains("edit-target-block");
    targetNode.textContent = normalizeInlineTextValue(value, isBlock);
  }

  function focusInlineEditTarget(targetNode) {
    targetNode.focus();
    const selection = window.getSelection?.();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(targetNode);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function beginInlineEdit(targetNode, target) {
    if (activeInlineEdit?.node === targetNode) return;
    if (activeInlineEdit) return;
    const baseline = readInlineTextValue(targetNode);
    activeInlineEdit = { node: targetNode, target, baseline };
    node.classList.add("is-inline-editing");
    targetNode.classList.add("is-inline-editing");
    targetNode.setAttribute("contenteditable", "true");
    targetNode.setAttribute("data-inline-editing", "true");
    targetNode.setAttribute("role", "textbox");
    targetNode.setAttribute(
      "aria-multiline",
      targetNode.classList.contains("edit-target-block") ? "true" : "false",
    );
    targetNode.spellcheck = true;
    focusInlineEditTarget(targetNode);
  }

  function endInlineEdit({ commit = true } = {}) {
    const inlineEdit = activeInlineEdit;
    if (!inlineEdit) return;
    const targetNode = inlineEdit.node;
    const nextValue = readInlineTextValue(targetNode);
    targetNode.removeAttribute("contenteditable");
    targetNode.removeAttribute("data-inline-editing");
    targetNode.removeAttribute("role");
    targetNode.removeAttribute("aria-multiline");
    targetNode.classList.remove("is-inline-editing");
    node.classList.remove("is-inline-editing");
    activeInlineEdit = null;

    if (!commit) {
      writeInlineTextValue(targetNode, inlineEdit.baseline);
      return;
    }
    if (nextValue === inlineEdit.baseline) return;
    if (typeof handlers.commitInlineTextEdit === "function") {
      handlers.commitInlineTextEdit(page.id, component.id, inlineEdit.target, nextValue);
    }
  }

  node.querySelectorAll("[data-edit-target]").forEach((targetNode) => {
    const target = targetNode.dataset.editTarget === "body" ? "body" : "title";
    const editableFieldRaw = String(targetNode.dataset.editableField || "").trim();
    const editableField = editableFieldRaw || null;

    targetNode.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (activeInlineEdit?.node === targetNode) return;
      const activeTarget = node.dataset.editTargetActive === "body" ? "body" : "title";
      if (
        selected &&
        editableField &&
        activeTarget === target
      ) {
        beginInlineEdit(targetNode, editableField);
        return;
      }
      if (typeof handlers.setTextTarget === "function") {
        handlers.setTextTarget(page.id, component.id, target);
      } else {
        handlers.select(page.id, component.id);
      }
    });

    targetNode.addEventListener("keydown", (event) => {
      if (activeInlineEdit?.node !== targetNode) return;
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        endInlineEdit({ commit: false });
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !targetNode.classList.contains("edit-target-block")) {
        event.preventDefault();
        targetNode.blur();
      }
    });

    targetNode.addEventListener("blur", () => {
      if (activeInlineEdit?.node !== targetNode) return;
      endInlineEdit({ commit: true });
    });
  });

  if (selected) {
    const bounds = document.createElement("div");
    bounds.className = "component-bbox no-print";
    bounds.innerHTML = `
      <button class="component-bbox-handle component-bbox-handle--n" type="button" data-resize-dir="n" aria-label="Resize north"></button>
      <button class="component-bbox-handle component-bbox-handle--ne" type="button" data-resize-dir="ne" aria-label="Resize north-east"></button>
      <button class="component-bbox-handle component-bbox-handle--e" type="button" data-resize-dir="e" aria-label="Resize east"></button>
      <button class="component-bbox-handle component-bbox-handle--se" type="button" data-resize-dir="se" aria-label="Resize south-east"></button>
      <button class="component-bbox-handle component-bbox-handle--s" type="button" data-resize-dir="s" aria-label="Resize south"></button>
      <button class="component-bbox-handle component-bbox-handle--sw" type="button" data-resize-dir="sw" aria-label="Resize south-west"></button>
      <button class="component-bbox-handle component-bbox-handle--w" type="button" data-resize-dir="w" aria-label="Resize west"></button>
      <button class="component-bbox-handle component-bbox-handle--nw" type="button" data-resize-dir="nw" aria-label="Resize north-west"></button>
    `;
    node.appendChild(bounds);
  }

  node.addEventListener("click", (event) => {
    event.stopPropagation();
    if (activeInlineEdit) return;
    handlers.select(page.id, component.id);
  });

  node.querySelectorAll("[data-open-inspector]").forEach((targetNode) => {
    targetNode.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (activeInlineEdit) return;
      const tab = targetNode.dataset.openInspector === "data" ? "data" : "settings";
      handlers.openComponentEditor(page.id, component.id, tab);
    });
  });

  node.querySelectorAll("[data-action]").forEach((button) => {
    const action = button.dataset.action;
    if (component.layoutConstraints?.locked && (action === "autofit-component" || action === "delete-component")) {
      button.disabled = true;
    }

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      switch (action) {
        case "edit-component":
          if (typeof handlers.setTextTarget === "function") {
            handlers.setTextTarget(page.id, component.id, "title");
          } else {
            handlers.select(page.id, component.id);
          }
          break;
        case "open-inspector":
          if (typeof handlers.toggleComponentEditor === "function") {
            handlers.toggleComponentEditor(page.id, component.id, "settings");
          } else {
            handlers.openComponentEditor(page.id, component.id, "settings");
          }
          break;
        case "reset-component":
          if (component.layoutConstraints?.locked) return;
          handlers.resetComponentToDefault(page.id, component.id);
          break;
        case "duplicate-component":
          handlers.duplicateComponent(page.id, component.id);
          break;
        case "toggle-lock":
          handlers.toggleComponentLock(page.id, component.id);
          break;
        case "autofit-component": {
          if (component.layoutConstraints?.locked) return;
          const content =
            node.querySelector(
              ".panel-card, .design-text, .delta-card, .cover-hero, .section-intro, .recommendation-card, .response-pair, .kpi-columns",
            ) || node;
          handlers.autoFitComponentHeight(page.id, component.id, content);
          break;
        }
        case "delete-component":
          if (component.layoutConstraints?.locked) return;
          handlers.requestOrConfirmDeleteComponent(page.id, component.id, button.dataset.confirm === "true");
          break;
        default:
          break;
      }
    });
  });

  // Drag is handled by Moveable (main.js), resize by local bounding-box handles.

  return node;
}

export function renderPageNode({
  state,
  page,
  pageIndex,
  pageCount,
  handlers,
}) {
  const profile = getProfile(state.project.printProfile);
  const selectedPageId = state.ui.selectedPageId;
  const selectedComponentId = state.ui.selectedComponentId;
  const isFullBleed = page.fullBleed === true;

  const section = document.createElement("section");
  section.className = `page theme-${page.theme || "light_data"}${isFullBleed ? " page--full-bleed" : ""}`;
  section.dataset.pageId = page.id;
  section.dataset.profile = state.project.printProfile;
  section.dataset.fullBleed = isFullBleed ? "true" : "false";
  section.dataset.pageKind = String(page.pageKind || "content");

  const sheet = document.createElement("div");
  sheet.className = "page-sheet";
  sheet.style.width = profile.width;
  sheet.style.height = profile.height;

  const safeArea = document.createElement("div");
  safeArea.className = "page-safe";

  const pageHeader = document.createElement("header");
  pageHeader.className = "page-head no-print";
  pageHeader.innerHTML = `
    <div>
      <h3>${escapeHtml(page.title || `Page ${pageIndex + 1}`)}</h3>
    </div>
  `;

  const body = document.createElement("div");
  body.className = "page-body";
  body.dataset.pageBody = "true";
  body.dataset.pageId = page.id;
  let dropGhost = null;

  function clearDropGhost() {
    if (dropGhost) {
      dropGhost.remove();
      dropGhost = null;
    }
  }

  function ensureDropGhost() {
    if (dropGhost) return dropGhost;
    dropGhost = document.createElement("div");
    dropGhost.className = "component-drop-ghost no-print";
    body.appendChild(dropGhost);
    return dropGhost;
  }

  function draggedSpan(data) {
    if (!data || data.kind !== "move-component") return { colSpan: 1, rowSpan: 1 };
    const sourcePage = state.pages.find((entry) => entry.id === data.pageId);
    const sourceComponent = sourcePage?.components?.find((entry) => entry.id === data.componentId);
    if (!sourceComponent) return { colSpan: 1, rowSpan: 1 };
    const sourceLayout = getComponentLayout(sourceComponent, state.project.printProfile);
    return {
      colSpan: sourceLayout.colSpan,
      rowSpan: sourceLayout.rowSpan,
    };
  }

  const overlay = document.createElement("div");
  overlay.className = "grid-overlay";
  overlay.hidden = !(state.ui.showGridAll || page.showGrid);
  body.appendChild(overlay);

  body.addEventListener("click", (event) => {
    if (event.target === body || event.target === overlay) {
      handlers.select(page.id, null);
    }
  });

  body.addEventListener("dragover", (event) => {
    const data = getDragData(event);
    if (!data) return;
    if (data.kind === "new-component" || data.kind === "move-component") {
      event.preventDefault();
      event.dataTransfer.dropEffect = data.kind === "new-component" ? "copy" : "move";

      const metrics = readGridMetrics(body);
      const span = draggedSpan(data);
      const raw = calculateDropPosition(event, body);
      const colStart = Math.max(1, Math.min(metrics.cols - span.colSpan + 1, raw.colStart));
      const rowStart = Math.max(1, Math.min(metrics.rowsAvailable - span.rowSpan + 1, raw.rowStart));

      const ghost = ensureDropGhost();
      ghost.style.gridColumn = `${colStart} / span ${span.colSpan}`;
      ghost.style.gridRow = `${rowStart} / span ${span.rowSpan}`;
    }
  });

  body.addEventListener("dragleave", (event) => {
    const related = event.relatedTarget;
    if (related && body.contains(related)) return;
    clearDropGhost();
  });

  body.addEventListener("drop", (event) => {
    const data = getDragData(event);
    if (!data) return;
    const metrics = readGridMetrics(body);
    const raw = calculateDropPosition(event, body);
    clearDropGhost();

    if (data.kind === "new-component") {
      event.preventDefault();
      handlers.addComponent(page.id, data.componentType, raw, data.componentOptions || {});
      return;
    }

    if (data.kind === "move-component") {
      event.preventDefault();
      const span = draggedSpan(data);
      const position = {
        colStart: Math.max(1, Math.min(metrics.cols - span.colSpan + 1, raw.colStart)),
        rowStart: Math.max(1, Math.min(metrics.rowsAvailable - span.rowSpan + 1, raw.rowStart)),
      };
      handlers.moveComponent(data.pageId, page.id, data.componentId, position);
    }
  });

  for (const component of page.components || []) {
    const selected = selectedPageId === page.id && selectedComponentId === component.id;
    const node = createComponentNode({
      state,
      page,
      component,
      profileId: state.project.printProfile,
      selected,
      handlers,
      datasets: state.datasets,
    });
    body.appendChild(node);
    if (selected) {
      bindInteractHandlers({ node, page, component, layout: getComponentLayout(component, state.project.printProfile), handlers });
    }
  }

  const footer = document.createElement("div");
  footer.className = "page-footer-wrap";
  footer.innerHTML = renderPageFooter(state, pageIndex, pageCount);

  section.appendChild(pageHeader);
  safeArea.appendChild(body);
  safeArea.appendChild(footer);
  sheet.appendChild(safeArea);
  section.appendChild(sheet);

  return section;
}

export function collectOverflowWarnings(pageRoot, state) {
  const warnings = {};
  for (const page of state.pages || []) {
    const pageNode = pageRoot.querySelector(`[data-page-id="${page.id}"]`);
    const list = [];
    const components = pageNode?.querySelectorAll(".canvas-component") || [];
    components.forEach((node) => {
      const componentId = node.dataset.componentId;
      const content = node.querySelector(".panel-card, .delta-card, .cover-hero, .section-intro, .recommendation-card, .response-pair, .kpi-columns");
      const target = content || node;
      const overflowing = target.scrollHeight - target.clientHeight > 4 || target.scrollWidth - target.clientWidth > 4;
      const component = (page.components || []).find((entry) => entry.id === componentId);
      const impossibleFit = Boolean(component?.layoutDiagnostics?.impossibleFit);
      if (overflowing || impossibleFit) {
        node.classList.add("has-overflow");
        if (componentId) list.push(componentId);
      } else {
        node.classList.remove("has-overflow");
      }
    });

    if (list.length > 0) {
      warnings[page.id] = list;
    }
  }
  return warnings;
}
