#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const { articlesDir, ensureDir } = require("./lib/workspace");

ensureDir(articlesDir);

// ---- config ----
const PROJECT = process.argv[2] || "-Users-vincenthuang-myNote";
const SESSIONS_DIR = path.join(os.homedir(), ".claude", "projects", PROJECT);
const MIN_REAL_TURNS = 2;

// ---- helpers ----

function isSystemNoise(text) {
  // Returns true if this user message is NOT a real human message
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
  if (t.length > 3000) return true; // skill/content dumps
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
  // Merge consecutive text blocks
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

function inferTitle(text) {
  if (!text) return "未命名对话";
  const cleaned = text.replace(/[""]/g, "").slice(0, 60).replace(/\n/g, " ");
  return cleaned.length < text.length ? cleaned + "..." : cleaned;
}

function formatDate(isoStr) {
  return isoStr.slice(0, 10);
}

// ---- main logic ----

function parseSession(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.trim().split("\n");

  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch (_) {}
  }

  const turns = [];
  let pendingUser = null;           // current user message text
  let pendingAssistantBlocks = [];  // accumulated assistant content blocks
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
        // Real user message: flush previous assistant, then previous user, then store new user
        flushAssistant();
        flushUser();
        pendingUser = text;
      }
      // System noise user events (tool results, skill echoes, local commands):
      // just skip them — they're part of the assistant's tool execution
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

  // Flush remaining
  flushAssistant();
  flushUser();

  return { turns, models: [...models], firstTs, lastTs };
}

function buildArticle(sessionId, turns, models, firstTs) {
  const date = firstTs ? formatDate(firstTs) : "unknown-date";
  const id = `session-${sessionId.slice(0, 8)}`;

  const firstUser = turns.find((t) => t.speaker === "vincent");
  const title = inferTitle(firstUser?.content || "");

  const userTurns = turns.filter((t) => t.speaker === "vincent").length;
  const aiTurns = turns.filter((t) => t.speaker === "ai").length;

  const bodyLines = [];
  for (const t of turns) {
    bodyLines.push(`<!-- turn: ${t.speaker} -->`, t.content.trimEnd());
  }

  const dateStr = `${date}T00:00:00+08:00`;

  const article = [
    "---",
    `id: ${id}`,
    `title: "${title}"`,
    `created_at: ${dateStr}`,
    `updated_at: ${new Date().toISOString().replace(/\.\d{3}Z$/, "+08:00")}`,
    `source_session: ${sessionId}`,
    "tags: []",
    `summary: "${date} 对话记录 (${userTurns} 条发言, ${aiTurns} 条回复)"`,
    ...(models.length > 0 ? [`ai_models: [${models.join(", ")}]`] : []),
    "---",
    "",
    bodyLines.join("\n\n"),
    "",
    "<!-- ECHO:COMMENT_LIST -->",
    "",
  ].join("\n");

  return { id, article, title, turnCount: turns.length };
}

// ---- main ----

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

    const { id, article, title, turnCount } = buildArticle(sessionId, turns, models, firstTs);
    const articlePath = path.join(articlesDir, `${id}.md`);

    fs.writeFileSync(articlePath, article);
    console.log(`${id}.md ← ${sessionId} (${turnCount} turns, ${models.length} models) — "${title}"`);
    imported++;
  } catch (err) {
    console.error(`${sessionId}: ERROR — ${err.message}`);
  }
}

console.log(`\nDone: ${imported} imported, ${skipped} skipped.`);
