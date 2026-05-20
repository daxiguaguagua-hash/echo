#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { bufferDir, articlesDir, ensureDir } = require("./lib/workspace");

ensureDir(articlesDir);
ensureDir(bufferDir);

function parseBuffer(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const turns = [];
  let currentTurn = null;

  for (const line of raw.split("\n")) {
    const turnMatch = line.match(/^<!-- turn: (\S+) speaker=(\S+)(?: reply_to=(\S+))? -->/);
    if (turnMatch) {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = {
        id: turnMatch[1],
        speaker: turnMatch[2],
        reply_to: turnMatch[3] || null,
        content: "",
      };
      continue;
    }
    if (currentTurn) currentTurn.content += line + "\n";
  }
  if (currentTurn) turns.push(currentTurn);
  for (const t of turns) t.content = t.content.trimEnd();
  return { raw, turns };
}

function extractParticipants(turns) {
  const speakers = new Map();
  for (const t of turns) {
    if (!speakers.has(t.speaker)) {
      speakers.set(t.speaker, {
        id: t.speaker,
        role: t.speaker === "vincent" ? "human" : "ai",
      });
    }
    // Infer model from AI heading (e.g. "## ai 的回复（Claude）" or "## codex 的审阅")
    const p = speakers.get(t.speaker);
    if (t.speaker !== "vincent" && !p.model) {
      const m = t.content.match(/^## (?:ai|codex|claude) 的(?:回复|审阅|验收)(?:（(\w[\w.-]*?)）)?/m);
      if (m && m[1]) p.model = m[1];
      else if (t.speaker === "claude") p.model = "claude-opus-4-7";
      else if (t.speaker === "codex") p.model = "gpt-5.1-codex-max";
    }
  }
  return [...speakers.values()];
}

function inferTitle(turns) {
  const firstUser = turns.find((t) => t.speaker === "vincent");
  if (!firstUser) return "未命名对话";
  const text = firstUser.content.replace(/^我：/, "").trim();
  const cleaned = text.replace(/[""]/g, "").slice(0, 40);
  return cleaned.length < text.length ? cleaned + "..." : cleaned;
}

function buildArticle(bufferFile, turns) {
  const date = path.basename(bufferFile, ".md");
  const dateStr = date.replace("session-", "");
  const id = `session-${dateStr}`;

  const bodyLines = [];
  for (const t of turns) {
    const meta = [`<!-- turn: ${t.id} speaker=${t.speaker}`];
    if (t.reply_to) meta.push(`reply_to=${t.reply_to}`);
    meta.push("-->");
    bodyLines.push(meta.join(" "), t.content.trimEnd());
  }

  const article = [
    "---",
    `id: ${id}`,
    `title: "${inferTitle(turns)}"`,
    `created_at: ${dateStr}T00:00:00+08:00`,
    `updated_at: ${new Date().toISOString().replace(/\.\d{3}Z$/, "+08:00")}`,
    "tags: []",
    `summary: "${dateStr} 对话记录"`,
    "participants:",
    ...extractParticipants(turns).map(
      (p) => `  - id: ${p.id}\n    role: ${p.role}${p.model ? `\n    model: ${p.model}` : ""}`
    ),
    "---",
    "",
    bodyLines.join("\n\n"),
    "",
    "<!-- ECHO:COMMENT_LIST -->",
    "",
  ].join("\n");

  return { id, article, title: inferTitle(turns), turnCount: turns.length };
}

// Main
const bufferFiles = fs.readdirSync(bufferDir)
  .filter((f) => f.startsWith("session-") && f.endsWith(".md"))
  .sort();

if (bufferFiles.length === 0) {
  console.log("No buffer files to convert.");
  process.exit(0);
}

for (const bf of bufferFiles) {
  const bufferPath = path.join(bufferDir, bf);
  const { turns } = parseBuffer(bufferPath);
  if (turns.length === 0) { console.log(`${bf}: empty — skipped`); continue; }

  const { id, article, title, turnCount } = buildArticle(bf, turns);
  const articlePath = path.join(articlesDir, `${id}.md`);

  if (fs.existsSync(articlePath)) {
    const existingTurns = (fs.readFileSync(articlePath, "utf-8").match(/<!-- turn:/g) || []).length;
    if (existingTurns === turnCount) {
      console.log(`${id}.md: unchanged (${turnCount} turns) — skipped`);
      continue;
    }
  }

  fs.writeFileSync(articlePath, article);
  console.log(`${id}.md: created (${turnCount} turns) — "${title}"`);
}
