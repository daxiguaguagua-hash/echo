const en = require("./messages/en");
const zh = require("./messages/zh-CN");

function t(key, lang) {
  if (lang === "zh-CN") return zh[key] || en[key] || key;
  return en[key] || key;
}

function bilingual(key) {
  const e = en[key] || key;
  const z = zh[key] || key;
  if (e === z) return e;
  return `${e} / ${z}`;
}

const NEXT_KEY_MAP = { open_docs: "next.openDocs", review_legacy: "next.reviewLegacy" };

function nextLabel(kind, lang) {
  const key = NEXT_KEY_MAP[kind] || kind;
  return lang ? t(key, lang) : bilingual(key);
}

function mcpCountLabel(toolCount, lang) {
  if (lang) return `${toolCount} ${t("value.available", lang)}`;
  return `${toolCount} ${en["value.available"]} / ${toolCount} ${zh["value.available"]}`;
}

function formatStatus(model, opts = {}) {
  const lang = opts.lang;
  const json = opts.json === true;

  if (json) {
    const out = { ...model };
    delete out._meta;
    return JSON.stringify(out, null, 2);
  }

  if (lang === "en" || lang === "zh-CN") {
    return formatSingleLang(model, lang);
  }

  return formatBilingual(model);
}

function kvSection(lang, sectionKey, rows) {
  const lines = [];
  const heading = lang ? t(sectionKey, lang) : bilingual(sectionKey);
  lines.push(heading);
  for (const [fieldKey, value] of rows) {
    const label = lang ? t(fieldKey, lang) : bilingual(fieldKey);
    lines.push(`  ${label.padEnd(22)}  ${value}`);
  }
  lines.push("");
  return lines;
}

function formatSingleLang(model, lang) {
  const lines = [];
  lines.push(t("status.title", lang));
  lines.push("");

  const s = model.serve || {};
  lines.push(...kvSection(lang, "section.serve", [
    ["field.status", s.running ? t("value.running", lang) : t("value.stopped", lang)],
    ...(s.docsUrl ? [["field.docs", s.docsUrl]] : []),
    ...(s.apiUrl ? [["field.api", s.apiUrl]] : []),
    ...(s.pid ? [["field.pid", String(s.pid)]] : []),
    ...(s.logFile ? [["field.log", s.logFile]] : []),
  ]));

  const c = model.capture || {};
  lines.push(...kvSection(lang, "section.capture", [
    ["field.captureStatus", c.enabled ? t("value.on", lang) : t("value.off", lang)],
  ]));

  const h = model.hook || {};
  lines.push(...kvSection(lang, "section.hook", [
    ["field.hookStatus", h.installed ? t("value.installed", lang) : t("value.missing", lang)],
  ]));

  const p = model.project || {};
  lines.push(...kvSection(lang, "section.project", [
    ["field.projectStatus", p.registered ? t("value.registered", lang) : t("value.unregistered", lang)],
    ...(p.projectId ? [["field.project", p.projectId]] : []),
    ...(p.root ? [["field.root", p.root]] : []),
    ...(p.dataRoot ? [["field.dataRoot", p.dataRoot]] : []),
  ]));

  const d = model.data || {};
  const dataRows = [];
  if (d.liveBuffers !== undefined) dataRows.push(["field.liveBuffers", String(d.liveBuffers)]);
  if (d.articles !== undefined) dataRows.push(["field.articles", String(d.articles)]);
  if (d.comments !== undefined) dataRows.push(["field.comments", String(d.comments)]);
  if (dataRows.length > 0) lines.push(...kvSection(lang, "section.data", dataRows));

  const leg = model.legacy || {};
  const legacyRows = [];
  if (leg.buffers !== undefined) legacyRows.push(["field.legacyBuffers", String(leg.buffers)]);
  if (leg.currentProjectCandidates !== undefined) legacyRows.push(["field.legacyCandidates", String(leg.currentProjectCandidates)]);
  if (legacyRows.length > 0) lines.push(...kvSection(lang, "section.legacy", legacyRows));

  const m = model.mcp || {};
  const mcpRows = [];
  if (m.command) mcpRows.push(["field.config", `${m.command} ${(m.args || []).join(" ")}`]);
  if (m.toolCount !== undefined) mcpRows.push(["field.tools", mcpCountLabel(m.toolCount, lang)]);
  if (mcpRows.length > 0) lines.push(...kvSection(lang, "section.mcp", mcpRows));

  const next = model.nextActions || [];
  if (next.length > 0) {
    lines.push(t("section.next", lang));
    for (const a of next) {
      if (a.url) lines.push(`  ${nextLabel(a.kind, lang)}: ${a.url}`);
      else lines.push(`  ${nextLabel(a.kind, lang)}`);
    }
  }

  return lines.join("\n");
}

function formatBilingual(model) {
  const lines = [];
  lines.push(bilingual("status.title"));
  lines.push("");

  const s = model.serve || {};
  lines.push(...kvSection(null, "section.serve", [
    ["field.status", s.running ? bilingual("value.running") : bilingual("value.stopped")],
    ...(s.docsUrl ? [["field.docs", s.docsUrl]] : []),
    ...(s.apiUrl ? [["field.api", s.apiUrl]] : []),
    ...(s.pid ? [["field.pid", String(s.pid)]] : []),
    ...(s.logFile ? [["field.log", s.logFile]] : []),
  ]));

  const c = model.capture || {};
  lines.push(...kvSection(null, "section.capture", [
    ["field.captureStatus", c.enabled ? bilingual("value.on") : bilingual("value.off")],
  ]));

  const h = model.hook || {};
  lines.push(...kvSection(null, "section.hook", [
    ["field.hookStatus", h.installed ? bilingual("value.installed") : bilingual("value.missing")],
  ]));

  const p = model.project || {};
  lines.push(...kvSection(null, "section.project", [
    ["field.projectStatus", p.registered ? bilingual("value.registered") : bilingual("value.unregistered")],
    ...(p.projectId ? [["field.project", p.projectId]] : []),
    ...(p.root ? [["field.root", p.root]] : []),
    ...(p.dataRoot ? [["field.dataRoot", p.dataRoot]] : []),
  ]));

  const d = model.data || {};
  const dataRows = [];
  if (d.liveBuffers !== undefined) dataRows.push(["field.liveBuffers", String(d.liveBuffers)]);
  if (d.articles !== undefined) dataRows.push(["field.articles", String(d.articles)]);
  if (d.comments !== undefined) dataRows.push(["field.comments", String(d.comments)]);
  if (dataRows.length > 0) lines.push(...kvSection(null, "section.data", dataRows));

  const leg = model.legacy || {};
  const legacyRows = [];
  if (leg.buffers !== undefined) legacyRows.push(["field.legacyBuffers", String(leg.buffers)]);
  if (leg.currentProjectCandidates !== undefined) legacyRows.push(["field.legacyCandidates", String(leg.currentProjectCandidates)]);
  if (legacyRows.length > 0) lines.push(...kvSection(null, "section.legacy", legacyRows));

  const m = model.mcp || {};
  const mcpRows = [];
  if (m.command) mcpRows.push(["field.config", `${m.command} ${(m.args || []).join(" ")}`]);
  if (m.toolCount !== undefined) mcpRows.push(["field.tools", mcpCountLabel(m.toolCount, null)]);
  if (mcpRows.length > 0) lines.push(...kvSection(null, "section.mcp", mcpRows));

  const next = model.nextActions || [];
  if (next.length > 0) {
    lines.push(bilingual("section.next"));
    for (const a of next) {
      if (a.url) lines.push(`  ${nextLabel(a.kind, null)}: ${a.url}`);
      else lines.push(`  ${nextLabel(a.kind, null)}`);
    }
  }

  return lines.join("\n");
}

module.exports = { formatStatus, t, bilingual };
