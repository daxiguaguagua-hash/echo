#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { bufferDir, articlesDir, ensureDir } = require("./lib/infra/workspace");
const { parseBuffer, buildArticle } = require("./lib/usecases/convert-buffer");

ensureDir(articlesDir);
ensureDir(bufferDir);

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
  const raw = fs.readFileSync(bufferPath, "utf-8");
  const { turns } = parseBuffer(raw);
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
