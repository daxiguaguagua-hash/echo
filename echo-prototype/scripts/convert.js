#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { ensureDir } = require("./lib/infra/workspace");
const { resolveDataDirs } = require("./lib/infra/echo-paths");
const { parseBuffer, buildArticle } = require("./lib/usecases/convert-buffer");

function runConvert(opts = {}) {
  const dirs = opts.dirs || resolveDataDirs();
  const { bufferDir, articlesDir } = dirs;

  ensureDir(articlesDir);
  ensureDir(bufferDir);

  const bufferFiles = fs.readdirSync(bufferDir)
    .filter((f) => f.startsWith("session-") && f.endsWith(".md"))
    .sort();

  const files = [];

  if (bufferFiles.length === 0) {
    if (!opts.silent) console.log("No buffer files to convert.");
    return { files, bufferDir, articlesDir };
  }

  for (const bf of bufferFiles) {
    const bufferPath = path.join(bufferDir, bf);
    const raw = fs.readFileSync(bufferPath, "utf-8");
    const { turns } = parseBuffer(raw);
    if (turns.length === 0) { console.log(`${bf}: empty — skipped`); continue; }

    const { id, article, title, turnCount } = buildArticle(bf, turns, { project: dirs.projectId });
    const articlePath = path.join(articlesDir, `${id}.md`);

    if (fs.existsSync(articlePath)) {
      const existingTurns = (fs.readFileSync(articlePath, "utf-8").match(/<!-- turn:/g) || []).length;
      if (existingTurns === turnCount) {
        if (!opts.silent) console.log(`${id}.md: unchanged (${turnCount} turns) — skipped`);
        continue;
      }
    }

    fs.writeFileSync(articlePath, article);
    console.log(`${id}.md: created (${turnCount} turns) — "${title}"`);
    files.push({ id, title, turnCount });
  }

  return { files, bufferDir, articlesDir };
}

if (require.main === module) {
  runConvert();
}

module.exports = { runConvert };
