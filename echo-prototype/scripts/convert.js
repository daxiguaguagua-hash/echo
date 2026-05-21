#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { bufferDir, articlesDir, ensureDir } = require("./lib/workspace");
const ef = require("./lib/echo-format");

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

function buildArticle(bufferFile, turns) {
  const sessionName = path.basename(bufferFile, ".md");
  const dateStr = ef.extractSessionDate(sessionName);
  const id = `session-${dateStr}`;

  const article = ef.createArticle({
    id,
    created_at: `${dateStr}T00:00:00+08:00`,
    turns,
  });

  return { id, article: ef.toMarkdown(article), title: article.title, turnCount: article.turns.length };
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
