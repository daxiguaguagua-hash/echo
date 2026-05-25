#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const { ensureDir } = require("./lib/infra/workspace");
const { resolveDataDirs } = require("./lib/infra/echo-paths");
const ef = require("./lib/domain/echo-format");

// ---- helpers ----

function isSystemNoise(text) {
  if (!text || !text.trim()) return true;
  const t = text.trim();
  if (t.startsWith("Base directory for this skill:")) return true;
  if (t.startsWith("<!-- AUTO-GENERATED")) return true;
  if (/^```bash\n_UPD=/.test(t)) return true;
  if (t.startsWith("<local-command-caveat>")) return true;
  if (t.startsWith("<command-name>")) return true;
  if (t.startsWith("<command-message>")) return true;
  if (t.startsWith("<command-args>")) return true;
  if (t.startsWith("<local-command-stdout>")) return true;
  if (t.length > 3000) return true;
  return false;
}

function cleanUserMessage(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join(" ")
      .trim();
  }
  return "";
}

function cleanAssistantBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const out = [];
  for (const b of blocks) {
    if (b.type === "text" && b.text) {
      out.push({ type: "text", content: b.text.trim() });
    } else if (b.type === "tool_use") {
      out.push({ type: "tool", content: `[调用工具: ${b.name}]` });
    }
  }
  const merged = [];
  for (const item of out) {
    if (item.type === "text" && merged.length > 0 && merged[merged.length - 1].type === "text") {
      merged[merged.length - 1].content += "\n\n" + item.content;
    } else {
      merged.push(item);
    }
  }
  return merged;
}

function formatDate(isoStr) {
  return isoStr.slice(0, 10);
}

function parseSession(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.trim().split("\n");

  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch (_) {}
  }

  const turns = [];
  let pendingUser = null;
  let pendingAssistantBlocks = [];
  let models = new Set();
  let firstTs = null;
  let lastTs = null;

  function flushAssistant() {
    if (pendingAssistantBlocks.length === 0) return;
    const cleaned = cleanAssistantBlocks(pendingAssistantBlocks);
    const text = cleaned.map((c) => c.content).join("\n\n").trim();
    if (text) turns.push({ speaker: "ai", content: text });
    pendingAssistantBlocks = [];
  }

  function flushUser() {
    if (pendingUser !== null) {
      turns.push({ speaker: "vincent", content: pendingUser });
      pendingUser = null;
    }
  }

  for (const ev of events) {
    if (ev.timestamp) {
      if (!firstTs) firstTs = ev.timestamp;
      lastTs = ev.timestamp;
    }

    if (ev.type === "user") {
      const text = cleanUserMessage(ev.message?.content || "");
      if (text && !isSystemNoise(text)) {
        flushAssistant();
        flushUser();
        pendingUser = text;
      }
    } else if (ev.type === "assistant") {
      const msg = ev.message || {};
      const blocks = msg.content || [];
      const model = msg.model || "";
      if (model && model !== "<synthetic>") models.add(model);
      for (const b of blocks) {
        pendingAssistantBlocks.push(b);
      }
    }
  }

  flushAssistant();
  flushUser();

  return { turns, models: [...models], firstTs, lastTs };
}

function buildArticle(sessionId, turns, models, firstTs, opts = {}) {
  const date = firstTs ? formatDate(firstTs) : "unknown-date";
  const id = `session-${sessionId.slice(0, 8)}`;
  const dateStr = `${date}T00:00:00+08:00`;

  const speakers = {
    human: { id: "vincent", role: "human" },
    ai: { id: "ai", role: "ai", model: models[0] || "unknown" },
  };

  const article = ef.createArticle({
    id,
    created_at: dateStr,
    alias: ef.inferTitle(turns),
    source_session: sessionId,
    turns,
    speakers,
    project: opts.project,
  });

  return { id, article: ef.toMarkdown(article), title: article.title, alias: article.alias, turnCount: article.turns.length };
}

function runImportSessions(opts = {}) {
  const dirs = opts.dirs || resolveDataDirs();
  const { articlesDir } = dirs;

  const PROJECT = opts.project || process.argv[2] || "-Users-vincenthuang-myNote";
  const SESSIONS_DIR = path.join(os.homedir(), ".claude", "projects", PROJECT);
  const MIN_REAL_TURNS = opts.minTurns || 2;

  // Resolve project ID from cwd
  let importProject = dirs.projectId;
  if (!importProject) {
    try {
      const { findProjectForPath } = require("./lib/usecases/project-registry");
      const project = findProjectForPath(opts.cwd || process.cwd());
      if (project) importProject = project.projectId;
    } catch (_) {}
  }

  ensureDir(articlesDir);

  if (!fs.existsSync(SESSIONS_DIR)) {
    console.error(`Sessions directory not found: ${SESSIONS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();

  console.log(`Scanning ${files.length} session files in ${SESSIONS_DIR}...\n`);

  let imported = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(SESSIONS_DIR, file);
    const sessionId = path.basename(file, ".jsonl");

    try {
      const { turns, models, firstTs } = parseSession(filePath);
      const realTurns = turns.filter((t) => t.speaker === "vincent").length;

      if (realTurns < MIN_REAL_TURNS) {
        skipped++;
        continue;
      }

      const { id, article, title, turnCount } = buildArticle(sessionId, turns, models, firstTs, { project: importProject });
      const articlePath = path.join(articlesDir, `${id}.md`);

      fs.writeFileSync(articlePath, article);
      console.log(`${id}.md ← ${sessionId} (${turnCount} turns, ${models.length} models) — "${title}"`);
      imported++;
    } catch (err) {
      console.error(`${sessionId}: ERROR — ${err.message}`);
    }
  }

  console.log(`\nDone: ${imported} imported, ${skipped} skipped.`);
  return { imported, skipped };
}

if (require.main === module) {
  runImportSessions();
}

module.exports = { runImportSessions };
