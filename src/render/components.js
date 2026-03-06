import { escapeHtml, fmtTwo, toNumber } from "../utils/helpers.js";
import { chartVariantById } from "../data/chart-registry.js";
import {
  normalizeTypographyProps,
  normalizeTypographySurfaceProps,
  textSurfaceToInlineCss,
  typographyStyleToInlineCss,
} from "../utils/typography.js";
import {
  renderBarSvg,
  renderDonutSvg,
  renderGaugeSvg,
  renderLineSvg,
  renderLollipopSvg,
  renderWaffleGrid,
} from "./charts.js";
import { resolveDonutItemPercent, resolveDonutPercent } from "./value-sync.js";

const COVER_LOGO_DARK_DEFAULT_URL = "https://cdn.prod.website-files.com/6735fba9a631272fb4513263/6911c98c1ee4440094a2ea32_Group.svg";
const COVER_LOGO_LIGHT_ALT_URL = "https://cdn.prod.website-files.com/6735fba9a631272fb4513263/6762d3c19105162149b9f1dc_Immersive%20Logo.svg";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function statusChip(status) {
  if (!status) return "";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="status-chip status-chip--${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function toolbarHtml(component) {
  const locked = Boolean(component?.layoutConstraints?.locked);
  const pendingDelete = Boolean(component?.__pendingDeleteConfirm);
  return `
    <div class="component-toolbar no-print">
      <button class="mini-btn" type="button" data-action="edit-component" title="Select component text">Edit</button>
      <button class="mini-btn" type="button" data-action="reset-component" title="Reset component to defaults">Reset</button>
      <button class="mini-btn" type="button" data-action="autofit-component" title="Auto-fit height to content">Fit</button>
      <button class="mini-btn" type="button" data-action="open-inspector" title="Toggle inspector">INS</button>
      <button class="mini-btn mini-btn--icon" type="button" data-action="duplicate-component" title="Duplicate component" aria-label="Duplicate component">
        <span class="icon-duplicate" aria-hidden="true"></span>
      </button>
      <button
        class="mini-btn mini-btn--icon mini-btn--danger ${pendingDelete ? "is-confirm" : ""}"
        type="button"
        data-action="delete-component"
        data-confirm="${pendingDelete ? "true" : "false"}"
        title="${pendingDelete ? "Click again to confirm delete" : "Delete component"}"
        aria-label="${pendingDelete ? "Confirm delete component" : "Delete component"}"
      >
        <span class="icon-trash" aria-hidden="true"></span>
      </button>
      <button class="mini-btn mini-btn--icon ${locked ? "is-locked" : ""}" type="button" data-action="toggle-lock" title="${locked ? "Unlock component" : "Lock component"}" aria-label="${locked ? "Unlock component" : "Lock component"}">
        <span class="icon-lock" aria-hidden="true">${locked ? "🔒" : "🔓"}</span>
      </button>
    </div>
  `;
}

function footerMeta(component) {
  return component.status ? `<div class="component-meta">${statusChip(component.status)}</div>` : "";
}

function chartHost(kind, config, fallbackHtml = "") {
  const payload = encodeURIComponent(JSON.stringify(config || {}));
  return `
    <div class="chart-host" data-chart-kind="${escapeHtml(kind)}" data-chart-config="${payload}">
      ${fallbackHtml ? `<div class="chart-host__fallback">${fallbackHtml}</div>` : ""}
    </div>
  `;
}

function multiline(text) {
  return escapeHtml(String(text || "")).replace(/\n/g, "<br>");
}

function readScale(props, fallback = 1) {
  const value = toNumber(props?.scale, fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0.4, Math.min(3, value));
}

function componentStyleModel(component, props) {
  const source = props && typeof props === "object" ? props : {};
  const hasTypography = source.typography && typeof source.typography === "object";
  const hasSurface = source.surface && typeof source.surface === "object";
  if (!hasTypography && !hasSurface) return null;

  const normalized = normalizeTypographySurfaceProps(component.type || "text", {
    typography: source.typography,
    surface: source.surface,
  });
  return {
    titleStyle: escapeHtml(typographyStyleToInlineCss(normalized.typography.title)),
    bodyStyle: escapeHtml(typographyStyleToInlineCss(normalized.typography.body)),
    surfaceStyle: escapeHtml(textSurfaceToInlineCss(normalized.surface, component.type)),
  };
}

function styleAttr(styleValue) {
  return styleValue ? ` style="${styleValue}"` : "";
}

function editTargetWrap(target, content, mode = "inline", editableField = null) {
  const cls = mode === "block" ? "edit-target-block" : "edit-target-inline";
  const editableAttr = typeof editableField === "string" && editableField.trim()
    ? ` data-editable-field="${escapeHtml(editableField.trim())}"`
    : "";
  return `<span class="${cls}" data-edit-target="${escapeHtml(target)}"${editableAttr}>${content}</span>`;
}

function renderCoverHero(component, props) {
  const normalized = normalizeTypographyProps(component.type, props || component.props || {});
  const imageUrl = normalized.imageUrl || "";
  const overlay = normalized.overlay || "rgba(6,10,26,0.65)";
  const darkLogoUrl = normalized.coverLogoDarkUrl || COVER_LOGO_DARK_DEFAULT_URL;
  const lightLogoUrl = normalized.coverLogoLightUrl || COVER_LOGO_LIGHT_ALT_URL;
  const org = normalized.org || "";
  const period = normalized.period || "";
  const titleRaw = normalized.typography?.title || {};
  const titleChars = String(component.title || "").replace(/\s+/g, "").length;
  const titleScale = titleChars > 20 ? Math.max(0.58, 1 - (titleChars - 20) * 0.014) : 1;
  const titleModel = {
    ...titleRaw,
    fontSize: clamp(Math.round(toNumber(titleRaw.fontSize, 96) * titleScale), 36, 116),
    lineHeight: clamp(toNumber(titleRaw.lineHeight, 0.95), 0.88, 1.2),
  };
  const titleStyle = escapeHtml(typographyStyleToInlineCss(titleModel));
  const bodyStyle = escapeHtml(typographyStyleToInlineCss(normalized.typography.body));
  const contentOffsetY = clamp(toNumber(normalized.contentOffsetY, 0), -260, 260);
  const surface = normalized.surface || {};
  const keylineWidth = surface.keyline === "thick" ? 3 : surface.keyline === "thin" ? 1 : 0;
  const frameStyle = [
    imageUrl ? `background-image:linear-gradient(${overlay},${overlay}),url('${escapeHtml(imageUrl)}')` : "",
    `background-color:${escapeHtml(surface.backgroundColor || "#121A36")}`,
    keylineWidth ? `border:${keylineWidth}px solid ${escapeHtml(surface.keylineColor || "#D7D7E7")}` : "border:0",
    "border-radius:0",
  ]
    .filter(Boolean)
    .join(";");

  return `
    <article class="component component--cover-hero">
      ${toolbarHtml(component)}
      <div class="cover-hero" style="${frameStyle}">
        <div class="cover-hero-content" style="transform:translateY(${escapeHtml(String(contentOffsetY))}px)">
          <div class="cover-brand">
            <img class="cover-brand-logo cover-brand-logo--dark" src="${escapeHtml(darkLogoUrl)}" alt="Immersive logo" loading="eager" decoding="async">
            <img class="cover-brand-logo cover-brand-logo--light" src="${escapeHtml(lightLogoUrl)}" alt="Immersive logo" loading="eager" decoding="async">
          </div>
          <div class="cover-org">${editTargetWrap("body", escapeHtml(org), "inline", "props.org")}</div>
          <h2 style="${titleStyle}">${editTargetWrap("title", escapeHtml(component.title || "Executive Readiness Pack"), "inline", "title")}</h2>
          <p class="cover-period">${editTargetWrap("body", escapeHtml(period), "inline", "props.period")}</p>
          <p class="cover-copy" style="${bodyStyle}">${editTargetWrap("body", escapeHtml(component.body || "Immersive - All Rights Reserved 2025"), "inline", "body")}</p>
        </div>
      </div>
    </article>
  `;
}

function renderSectionIntro(component, props) {
  const normalized = normalizeTypographyProps(component.type, props || component.props || {});
  const menu = Array.isArray(normalized.sectionMenu) ? normalized.sectionMenu : [];
  const primaryNav = Array.isArray(normalized.primaryNav) ? normalized.primaryNav : [];
  const activeSection = normalized.activeSection || component.title || "";
  const railBrand = normalized.railBrand || "immersive";
  const railLabel = normalized.railLabel || "Executive Readiness Pack";
  const titleStyle = escapeHtml(typographyStyleToInlineCss(normalized.typography.title));
  const bodyStyle = escapeHtml(typographyStyleToInlineCss(normalized.typography.body));
  const surfaceStyle = escapeHtml(textSurfaceToInlineCss(normalized.surface, component.type));
  return `
    <article class="component component--section-intro">
      ${toolbarHtml(component)}
      <div class="section-intro" style="${surfaceStyle}">
        <aside class="section-intro__rail">
          <div class="section-intro__menu">
            <div class="section-intro__primary-nav">
              ${primaryNav
                .map(
                  (entry, index) =>
                    `<div class="${entry === activeSection ? "is-active" : ""}">${editTargetWrap("body", escapeHtml(entry), "inline", `props.primaryNav[${index}]`)}</div>`,
                )
                .join("")}
            </div>
            <div class="section-intro__menu-active">${editTargetWrap("title", escapeHtml(component.title || "Section"), "inline", "title")}
              <div>
                ${menu
                  .map((entry, index) => `<div>- ${editTargetWrap("body", escapeHtml(entry), "inline", `props.sectionMenu[${index}]`)}</div>`)
                  .join("")}
              </div>
            </div>
          </div>
          <div class="section-intro__rail-footer">${editTargetWrap("body", escapeHtml(railBrand), "inline", "props.railBrand")}<br><span>${editTargetWrap("body", escapeHtml(railLabel), "inline", "props.railLabel")}</span></div>
        </aside>
        <div class="section-intro__body">
          <div class="section-index">${editTargetWrap("body", escapeHtml(normalized.sectionIndex || "01"), "inline", "props.sectionIndex")}</div>
          <h2 style="${titleStyle}">${editTargetWrap("title", escapeHtml(component.title || "Section"), "inline", "title")}</h2>
          <p style="${bodyStyle}">${editTargetWrap("body", escapeHtml(component.body || ""), "block", "body")}</p>
        </div>
      </div>
    </article>
  `;
}

function renderDeltaCard(component, props) {
  const styles = componentStyleModel(component, props);
  const delta = toNumber(props.delta, 0);
  const symbol = delta > 0 ? "↑" : "↓";
  const tone = delta > 0 ? "high" : delta < 0 ? "low" : component.status || "medium";
  return `
    <article class="component component--delta-card">
      ${toolbarHtml(component)}
      <div class="delta-card delta-card--${escapeHtml(tone)}"${styleAttr(styles?.surfaceStyle)}>
        <div class="delta-value" data-open-inspector="settings" data-inspect-target="value">${symbol} ${escapeHtml(String(Math.abs(delta)))}${escapeHtml(props.unit || "%")}</div>
        <h4${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || "Delta"), "inline", "title")}</h4>
        <p${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(component.body || ""), "block", "body")}</p>
      </div>
    </article>
  `;
}

function renderWaffleGroup(component, props) {
  const styles = componentStyleModel(component, props);
  const items = Array.isArray(props.items) ? props.items.slice(0, 3) : [];
  return `
    <article class="component component--waffle-group">
      ${toolbarHtml(component)}
      <div class="panel-card panel-card--soft"${styleAttr(styles?.surfaceStyle)}>
        <h4${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || "Metrics"), "inline", "title")}</h4>
        <div class="waffle-group">
          ${items
            .map(
              (item, index) => `
              <div class="waffle-item">
                ${renderWaffleGrid(item.percent || 0, item.accent || "var(--status-high)")}
                <div class="waffle-percent" data-open-inspector="settings" data-inspect-target="value">${escapeHtml(String(item.percent || 0))}%</div>
                <p${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(item.label || ""), "block", `props.items[${index}].label`)}</p>
              </div>
            `,
            )
            .join("")}
        </div>
      </div>
    </article>
  `;
}

function renderDonutPair(component, props) {
  const styles = componentStyleModel(component, props);
  const items = Array.isArray(props.items) ? props.items.slice(0, 2) : [];
  return `
    <article class="component component--donut-pair">
      ${toolbarHtml(component)}
      <div class="panel-card panel-card--soft"${styleAttr(styles?.surfaceStyle)}>
        <h4${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || "Multipliers"), "inline", "title")}</h4>
        <div class="donut-pair">
          ${items
            .map(
              (item, index) => {
                const percent = resolveDonutItemPercent(item || {});
                return `
              <div class="donut-item">
                ${chartHost(
                  "donut",
                  {
                    percent,
                    color: item.accent || "var(--status-blue)",
                    trackColor: item.trackColor || "var(--brand-silver)",
                  },
                  renderDonutSvg({ percent }),
                )}
                <div class="donut-value" data-open-inspector="settings" data-inspect-target="value">${escapeHtml(String(item.value || "0"))}${escapeHtml(item.unit || "")}</div>
                <p${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(item.label || ""), "block", `props.items[${index}].label`)}</p>
              </div>
            `;
              },
            )
            .join("")}
        </div>
      </div>
    </article>
  `;
}

function renderResponseTimePair(component, props) {
  const styles = componentStyleModel(component, props);
  const left = props.left || {};
  const right = props.right || {};

  function card(item, labelPath) {
    return `
      <div class="response-card" style="--accent:${escapeHtml(item.accent || "var(--status-blue)")}">
        <label${styleAttr(styles?.titleStyle)}>${editTargetWrap("body", escapeHtml(item.label || ""), "inline", labelPath)}</label>
        <div class="response-value" data-open-inspector="settings" data-inspect-target="value">${escapeHtml(String(item.value || "0"))}<span>${escapeHtml(item.unit || "")}</span></div>
      </div>
    `;
  }

  return `
    <article class="component component--response-pair">
      ${toolbarHtml(component)}
      <div class="response-pair"${styleAttr(styles?.surfaceStyle)}>
        ${card(left, "props.left.label")}
        ${card(right, "props.right.label")}
      </div>
    </article>
  `;
}

function renderKpiColumns(component, props) {
  const styles = componentStyleModel(component, props);
  const items = Array.isArray(props.items) ? props.items.slice(0, 3) : [];
  return `
    <article class="component component--kpi-columns">
      ${toolbarHtml(component)}
      <div class="kpi-columns"${styleAttr(styles?.surfaceStyle)}>
        ${items
          .map(
            (item, index) => `
            <section>
              ${statusChip(item.status || "")}
              <div class="kpi-columns__value" data-open-inspector="settings" data-inspect-target="value">${escapeHtml(String(item.value || "0"))}${escapeHtml(item.unit || "")}</div>
              <p${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(item.label || ""), "block", `props.items[${index}].label`)}</p>
            </section>
          `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderRecommendationCard(component, props) {
  const styles = componentStyleModel(component, props);
  return `
    <article class="component component--recommendation">
      ${toolbarHtml(component)}
      <div class="recommendation-card"${styleAttr(styles?.surfaceStyle)}>
        <div class="recommendation-badge"${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(props.badge || "Recommendation"), "inline", "props.badge")}</div>
        <h4${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || "Recommendation"), "inline", "title")}</h4>
        <p${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(component.body || ""), "block", "body")}</p>
      </div>
    </article>
  `;
}

function renderText(component) {
  const props = normalizeTypographyProps(component.type, component.props || {});
  const titleStyle = escapeHtml(typographyStyleToInlineCss(props.typography.title));
  const bodyStyle = escapeHtml(typographyStyleToInlineCss(props.typography.body));
  const surfaceStyle = escapeHtml(textSurfaceToInlineCss(props.surface));
  return `
    <article class="component component--text">
      ${toolbarHtml(component)}
      <div class="panel-card panel-card--plain text-surface" style="${surfaceStyle}">
        ${footerMeta(component)}
        <h4 style="${titleStyle}">${editTargetWrap("title", escapeHtml(component.title || "Text"), "inline", "title")}</h4>
        <p style="${bodyStyle}">${editTargetWrap("body", escapeHtml(component.body || ""), "block", "body")}</p>
      </div>
    </article>
  `;
}

function renderAllCapsTitle(component, props) {
  const normalized = normalizeTypographyProps(component.type, props || component.props || {});
  const scale = readScale(normalized, 1);
  const titleStyle = escapeHtml(typographyStyleToInlineCss(normalized.typography.title, { scale }));
  const surfaceStyle = escapeHtml(textSurfaceToInlineCss(normalized.surface));
  return `
    <article class="component component--all-caps-title">
      ${toolbarHtml(component)}
      <div class="design-text design-text--all-caps text-surface" style="--type-scale:${escapeHtml(String(scale))};${surfaceStyle}">
        <h3 style="${titleStyle}">${editTargetWrap("title", multiline(component.title || "HEADER 1"), "block", "title")}</h3>
      </div>
    </article>
  `;
}

function renderHeader3(component, props) {
  const normalized = normalizeTypographyProps(component.type, props || component.props || {});
  const scale = readScale(normalized, 1);
  const titleStyle = escapeHtml(typographyStyleToInlineCss(normalized.typography.title, { scale }));
  const surfaceStyle = escapeHtml(textSurfaceToInlineCss(normalized.surface));
  return `
    <article class="component component--header-3">
      ${toolbarHtml(component)}
      <div class="design-text design-text--header-3 text-surface" style="--type-scale:${escapeHtml(String(scale))};${surfaceStyle}">
        <h3 style="${titleStyle}">${editTargetWrap("title", multiline(component.title || "Header 3"), "block", "title")}</h3>
      </div>
    </article>
  `;
}

function renderCopyBlock(component, props) {
  const normalized = normalizeTypographyProps(component.type, props || component.props || {});
  const scale = readScale(normalized, 1);
  const titleStyle = escapeHtml(typographyStyleToInlineCss(normalized.typography.title, { scale }));
  const bodyStyle = escapeHtml(typographyStyleToInlineCss(normalized.typography.body, { scale }));
  const surfaceStyle = escapeHtml(textSurfaceToInlineCss(normalized.surface));
  return `
    <article class="component component--copy-block">
      ${toolbarHtml(component)}
      <div class="design-text design-text--copy-block text-surface" style="--type-scale:${escapeHtml(String(scale))};${surfaceStyle}">
        ${component.title ? `<h4 style="${titleStyle}">${editTargetWrap("title", multiline(component.title), "block", "title")}</h4>` : ""}
        <p style="${bodyStyle}">${editTargetWrap("body", escapeHtml(component.body || ""), "block", "body")}</p>
      </div>
    </article>
  `;
}

function renderKpi(component, props) {
  const styles = componentStyleModel(component, props);
  return `
    <article class="component component--kpi">
      ${toolbarHtml(component)}
      <div class="panel-card panel-card--plain"${styleAttr(styles?.surfaceStyle)}>
        ${footerMeta(component)}
        <label${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || "KPI"), "inline", "title")}</label>
        <div class="kpi-main-value" data-open-inspector="settings" data-inspect-target="value">${escapeHtml(String(props.value ?? 0))}<span>${escapeHtml(props.unit || "")}</span></div>
        ${props.delta != null ? `<div class="kpi-delta" data-open-inspector="settings" data-inspect-target="value">${toNumber(props.delta, 0) > 0 ? "↑" : "↓"} ${escapeHtml(String(Math.abs(toNumber(props.delta, 0))))}%</div>` : ""}
        ${component.body ? `<p${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(component.body), "block", "body")}</p>` : ""}
        ${props.updated ? `<div class="kpi-updated"${styleAttr(styles?.bodyStyle)}>Last Updated: ${editTargetWrap("body", escapeHtml(String(props.updated)), "inline", "props.updated")}</div>` : ""}
      </div>
    </article>
  `;
}

function renderGauge(component, props) {
  const styles = componentStyleModel(component, props);
  const chartConfig = {
    value: props.value ?? 0,
    max: props.max ?? 100,
    min: props.min ?? 0,
    color: props.accent || "var(--status-blue)",
    trackColor: "var(--brand-silver)",
  };
  return `
    <article class="component component--gauge">
      ${toolbarHtml(component)}
      <div class="panel-card panel-card--plain"${styleAttr(styles?.surfaceStyle)}>
        ${footerMeta(component)}
        <h4${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || "Gauge"), "inline", "title")}</h4>
        ${chartHost("gauge", chartConfig, renderGaugeSvg({ value: props.value ?? 0, max: props.max ?? 100, accent: props.accent || "var(--status-blue)" }))}
        <div class="kpi-main-value" data-open-inspector="settings" data-inspect-target="value">${escapeHtml(String(props.value ?? 0))}<span>${escapeHtml(props.unit || "")}</span></div>
        ${component.body ? `<p${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(component.body), "block", "body")}</p>` : ""}
      </div>
    </article>
  `;
}

function renderLine(component, props) {
  const styles = componentStyleModel(component, props);
  const chartConfig = {
    points: props.points || [],
    max: props.max ?? 100,
    min: props.min ?? 0,
    color: props.accent || "var(--status-blue)",
  };
  return `
    <article class="component component--line">
      ${toolbarHtml(component)}
      <div class="panel-card panel-card--soft"${styleAttr(styles?.surfaceStyle)}>
        <h4${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || "Line chart"), "inline", "title")}</h4>
        ${chartHost("line", chartConfig, renderLineSvg({ points: props.points || [], max: props.max ?? 100, min: props.min ?? 0 }))}
      </div>
    </article>
  `;
}

function renderBar(component, props) {
  const styles = componentStyleModel(component, props);
  const chartConfig = {
    points: props.points || [],
    max: props.max ?? 100,
    min: props.min ?? 0,
    color: props.accent || "rgba(23,24,28,.72)",
  };
  return `
    <article class="component component--bar">
      ${toolbarHtml(component)}
      <div class="panel-card panel-card--soft"${styleAttr(styles?.surfaceStyle)}>
        <h4${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || "Bar chart"), "inline", "title")}</h4>
        ${chartHost("bar", chartConfig, renderBarSvg({ points: props.points || [], max: props.max ?? 100 }))}
      </div>
    </article>
  `;
}

function renderWaffle(component, props) {
  const styles = componentStyleModel(component, props);
  return `
    <article class="component component--waffle">
      ${toolbarHtml(component)}
      <div class="panel-card panel-card--plain"${styleAttr(styles?.surfaceStyle)}>
        <h4${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || "Waffle"), "inline", "title")}</h4>
        <div class="waffle-percent" data-open-inspector="settings" data-inspect-target="value">${escapeHtml(String(props.percent || 0))}%</div>
        ${renderWaffleGrid(props.percent || 0, props.accent || "var(--status-high)")}
        ${props.label ? `<p${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(props.label), "block", "props.label")}</p>` : ""}
      </div>
    </article>
  `;
}

function renderDonut(component, props) {
  const styles = componentStyleModel(component, props);
  const percent = resolveDonutPercent(props || {});
  const chartConfig = {
    percent,
    color: props.accent || "var(--status-blue)",
    trackColor: "var(--brand-silver)",
  };
  return `
    <article class="component component--donut">
      ${toolbarHtml(component)}
      <div class="panel-card panel-card--plain"${styleAttr(styles?.surfaceStyle)}>
        <h4${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || "Donut"), "inline", "title")}</h4>
        ${chartHost("donut", chartConfig, renderDonutSvg({ percent }))}
        <div class="kpi-main-value" data-open-inspector="settings" data-inspect-target="value">${escapeHtml(String(props.value ?? props.percent ?? 0))}<span>${escapeHtml(props.unit || "%")}</span></div>
        ${props.label ? `<p${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(props.label), "block", "props.label")}</p>` : ""}
      </div>
    </article>
  `;
}

function renderLollipop(component, props) {
  const styles = componentStyleModel(component, props);
  const chartConfig = {
    min: props.min ?? 0,
    max: props.max ?? 10,
    you: props.you ?? 0,
    benchmark: props.benchmark ?? 0,
    leftLabel: props.leftLabel || "Your Average",
    rightLabel: props.rightLabel || "Benchmark",
    youColor: props.youColor || "var(--status-blue)",
    benchmarkColor: props.benchmarkColor || "rgba(23,24,28,0.72)",
  };
  return `
    <article class="component component--lollipop">
      ${toolbarHtml(component)}
      <div class="panel-card panel-card--soft"${styleAttr(styles?.surfaceStyle)}>
        <h4${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || "Comparison"), "inline", "title")}</h4>
        ${chartHost("lollipop", chartConfig, renderLollipopSvg(props))}
        ${component.body ? `<p${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(component.body), "block", "body")}</p>` : ""}
      </div>
    </article>
  `;
}

function firstChartValue(rows, key, fallback = 0) {
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row || typeof row !== "object") return fallback;
  return toNumber(row[key], fallback);
}

function fallbackForUnifiedChart(chartRuntime = {}) {
  const variant = chartVariantById(chartRuntime.variant || "line_single").id;
  const rows = Array.isArray(chartRuntime.rows) ? chartRuntime.rows : [];
  const mapping = chartRuntime.mapping || {};
  const xKey = mapping.x || "category";
  const yKey = Array.isArray(mapping.y) && mapping.y[0] ? mapping.y[0] : "value";
  const points = rows.slice(0, 8).map((row, index) => ({
    label: String(row?.[xKey] ?? row?.category ?? index + 1),
    value: toNumber(row?.[yKey], 0),
  }));
  const max = Math.max(1, ...points.map((point) => point.value));

  if (variant === "gauge") {
    const value = firstChartValue(rows, yKey, 0);
    const targetKey = mapping.target || mapping.y2 || "target";
    const target = Math.max(1, firstChartValue(rows, targetKey, 100));
    return renderGaugeSvg({ value, max: target, accent: "var(--status-blue)" });
  }
  if (variant === "lollipop") {
    const you = firstChartValue(rows, yKey, 0);
    const benchmark = firstChartValue(rows, mapping.target || "target", 0);
    return renderLollipopSvg({ min: 0, max: Math.max(10, you, benchmark), you, benchmark });
  }
  if (variant === "waffle") {
    return renderWaffleGrid(clamp(firstChartValue(rows, yKey, 0), 0, 100), "var(--status-high)");
  }
  if (variant === "pie_standard" || variant === "pie_donut" || variant === "treemap" || variant === "funnel") {
    const total = points.reduce((sum, point) => sum + Math.max(0, point.value), 0);
    const percent = total > 0 ? Math.round((Math.max(0, points[0]?.value || 0) / total) * 100) : 0;
    return renderDonutSvg({ percent });
  }
  if (variant.startsWith("bar_") || variant === "histogram" || variant === "waterfall") {
    return renderBarSvg({ points, max });
  }
  return renderLineSvg({ points, max, min: 0 });
}

function renderUnifiedChart(component, props) {
  const styles = componentStyleModel(component, props);
  const runtime = props?.chartRuntime && typeof props.chartRuntime === "object"
    ? props.chartRuntime
    : {
        variant: props?.chart?.variant || "line_single",
        family: props?.chart?.family || chartVariantById(props?.chart?.variant || "line_single").family,
        rows: Array.isArray(props?.chart?.seedRows) ? props.chart.seedRows : [],
        mapping: props?.dataBindings?.[0]?.mapping || {},
        transforms: props?.dataBindings?.[0]?.transforms || {},
        visual: props?.chart?.visual || {},
        axis: props?.chart?.axis || {},
        format: props?.chart?.format || {},
        overrides: props?.chart?.overrides || {},
        datasetId: "",
      };
  const variantMeta = chartVariantById(runtime.variant || "line_single");

  return `
    <article class="component component--chart">
      ${toolbarHtml(component)}
      <div class="panel-card panel-card--soft"${styleAttr(styles?.surfaceStyle)}>
        ${footerMeta(component)}
        <h4${styleAttr(styles?.titleStyle)}>${editTargetWrap("title", escapeHtml(component.title || variantMeta.label || "Chart"), "inline", "title")}</h4>
        ${chartHost("chart", runtime, fallbackForUnifiedChart(runtime))}
        ${component.body ? `<p${styleAttr(styles?.bodyStyle)}>${editTargetWrap("body", escapeHtml(component.body), "block", "body")}</p>` : ""}
      </div>
    </article>
  `;
}

export function renderComponentHtml(component, resolvedProps) {
  switch (component.type) {
    case "cover_hero":
      return renderCoverHero(component, resolvedProps);
    case "section_intro":
      return renderSectionIntro(component, resolvedProps);
    case "delta_card":
      return renderDeltaCard(component, resolvedProps);
    case "waffle_group":
      return renderWaffleGroup(component, resolvedProps);
    case "donut_pair":
      return renderDonutPair(component, resolvedProps);
    case "response_time_pair":
      return renderResponseTimePair(component, resolvedProps);
    case "kpi_columns":
      return renderKpiColumns(component, resolvedProps);
    case "recommendation_card":
      return renderRecommendationCard(component, resolvedProps);
    case "all_caps_title":
      return renderAllCapsTitle(component, resolvedProps);
    case "header_3":
      return renderHeader3(component, resolvedProps);
    case "copy_block":
      return renderCopyBlock(component, resolvedProps);
    case "kpi":
      return renderKpi(component, resolvedProps);
    case "chart":
      return renderUnifiedChart(component, resolvedProps);
    case "gauge":
      return renderGauge(component, resolvedProps);
    case "line":
      return renderLine(component, resolvedProps);
    case "bar":
      return renderBar(component, resolvedProps);
    case "waffle":
      return renderWaffle(component, resolvedProps);
    case "donut":
      return renderDonut(component, resolvedProps);
    case "lollipop":
      return renderLollipop(component, resolvedProps);
    case "text":
    default:
      return renderText(component);
  }
}

export function renderPageFooter(state, pageIndex, pageCount) {
  if (!state.footer?.enabled) return "";
  const pageNumber = state.footer.pageNumberStyle === "zeroPad2" ? fmtTwo(pageIndex + 1) : String(pageIndex + 1);
  const total = state.footer.pageNumberStyle === "zeroPad2" ? fmtTwo(pageCount) : String(pageCount);

  return `
    <footer class="page-footer">
      <span>${escapeHtml(state.footer.reportLabel || state.project.name || "Report")}</span>
      <span>|</span>
      <span>${pageNumber}/${total}</span>
      ${state.footer.confidentiality ? `<span>|</span><span>${escapeHtml(state.footer.confidentiality)}</span>` : ""}
    </footer>
  `;
}
