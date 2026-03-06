import { COMPONENT_LIBRARY, PAGE_KINDS, TEMPLATE_LIBRARY, buildComponentFromType } from "./catalog.js";

function pushIssue(issues, code, detail) {
  issues.push({ code, detail });
}

function validateTemplateLibrary(issues) {
  const seenTemplateIds = new Set();
  const validPageKinds = new Set(Object.values(PAGE_KINDS));

  for (const template of TEMPLATE_LIBRARY) {
    if (!template || typeof template !== "object") {
      pushIssue(issues, "template.invalid_entry", "Template entry must be an object.");
      continue;
    }

    const templateId = String(template.id || "").trim();
    if (!templateId) {
      pushIssue(issues, "template.missing_id", "Template is missing an id.");
      continue;
    }
    if (seenTemplateIds.has(templateId)) {
      pushIssue(issues, "template.duplicate_id", `Template id "${templateId}" is duplicated.`);
    }
    seenTemplateIds.add(templateId);

    if (typeof template.label !== "string" || !template.label.trim()) {
      pushIssue(issues, "template.missing_label", `Template "${templateId}" has no label.`);
    }
    if (!validPageKinds.has(String(template.pageKind || "").trim())) {
      pushIssue(issues, "template.missing_page_kind", `Template "${templateId}" has invalid or missing pageKind.`);
    }

    if (typeof template.make !== "function") {
      pushIssue(issues, "template.missing_factory", `Template "${templateId}" is missing a make() factory.`);
      continue;
    }

    try {
      const page = template.make();
      if (!page || typeof page !== "object") {
        pushIssue(issues, "template.invalid_factory_output", `Template "${templateId}" did not return a page object.`);
        continue;
      }
      if (!Array.isArray(page.components)) {
        pushIssue(issues, "template.missing_components", `Template "${templateId}" page has no components array.`);
      }
    } catch (error) {
      pushIssue(
        issues,
        "template.factory_throw",
        `Template "${templateId}" make() threw: ${error?.message || String(error)}`,
      );
    }
  }
}

function validateComponentLibrary(issues) {
  const seenTypes = new Set();

  for (const component of COMPONENT_LIBRARY) {
    if (!component || typeof component !== "object") {
      pushIssue(issues, "component.invalid_entry", "Component entry must be an object.");
      continue;
    }

    const type = String(component.type || "").trim();
    if (!type) {
      pushIssue(issues, "component.missing_type", "Component is missing a type.");
      continue;
    }
    if (seenTypes.has(type)) {
      pushIssue(issues, "component.duplicate_type", `Component type "${type}" is duplicated.`);
    }
    seenTypes.add(type);

    if (typeof component.label !== "string" || !component.label.trim()) {
      pushIssue(issues, "component.missing_label", `Component "${type}" has no label.`);
    }

    try {
      const instance = buildComponentFromType(type);
      if (!instance || typeof instance !== "object") {
        pushIssue(issues, "component.invalid_factory_output", `Component "${type}" factory did not return an object.`);
        continue;
      }
      if (instance.type !== type) {
        pushIssue(issues, "component.type_mismatch", `Component "${type}" factory returned type "${instance.type}".`);
      }
    } catch (error) {
      pushIssue(
        issues,
        "component.factory_throw",
        `Component "${type}" factory threw: ${error?.message || String(error)}`,
      );
    }
  }
}

export function validateCatalogIntegrity() {
  const issues = [];
  validateTemplateLibrary(issues);
  validateComponentLibrary(issues);

  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    issues,
  };
}

export function reportCatalogIntegrity({ throwOnError = false } = {}) {
  const result = validateCatalogIntegrity();
  if (result.ok) {
    return result;
  }

  console.error("[Doc Builder] Catalog validation failed", result.issues);
  if (throwOnError) {
    throw new Error(`Catalog validation failed with ${result.issueCount} issue(s).`);
  }
  return result;
}
