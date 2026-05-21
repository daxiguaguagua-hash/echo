#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { articlesDir, commentsDir, workspaceRoot, ensureDir } = require("./lib/infra/workspace");
const v = require("./lib/domain/validation");

ensureDir(articlesDir);
ensureDir(commentsDir);
const errors = [];

function readMD(dir) {
  const files = [];
  function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      if (name.startsWith(".") || name === "node_modules") continue;
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".md")) files.push(full);
    }
  }
  walk(dir);
  return files;
}

const allFiles = [
  ...readMD(articlesDir),
  ...readMD(commentsDir),
].filter((f) => {
  try {
    const raw = fs.readFileSync(f, "utf-8");
    const { data } = matter(raw);
    return !!data.id;
  } catch {
    return false;
  }
});

const articles = {};
const comments = {};
const records = [];
const fileMap = {};

for (const file of allFiles) {
  const raw = fs.readFileSync(file, "utf-8");
  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    errors.push(`${file}: YAML frontmatter parse error — ${e.message}`);
    continue;
  }
  const d = parsed.data;
  const rel = path.relative(workspaceRoot, file);
  fileMap[d.id] = rel;
  records.push({ id: d.id, data: d, file: rel });

  if (!d.id) {
    errors.push(`${rel}: missing "id"`);
    continue;
  }

  if (d.type === "annotation") {
    comments[d.id] = { file: rel, data: d };
    errors.push(...v.validateAnnotation({ id: d.id, data: d, file: rel }));
  } else {
    articles[d.id] = { file: rel, data: d };
    errors.push(...v.validateArticle({ id: d.id, data: d, file: rel }));
  }
}

errors.push(...v.checkDuplicateIds(records));

const ofMap = {};
for (const [id, c] of Object.entries(comments)) {
  ofMap[id] = c.data.evolution?.of || [];
}

const commentData = {};
for (const [id, c] of Object.entries(comments)) {
  commentData[id] = c.data;
}

errors.push(...v.checkEvolutionReferences(commentData, commentData, fileMap));
errors.push(...v.checkArticleReferences(commentData, new Set(Object.keys(articles)), fileMap));
errors.push(...v.checkAllCycles(Object.keys(comments), ofMap, fileMap));

if (errors.length === 0) {
  console.log(`OK — ${Object.keys(articles).length} articles, ${Object.keys(comments).length} comments`);
  process.exit(0);
} else {
  console.log(`FAIL — ${errors.length} error(s):\n`);
  for (const e of errors) console.log(`  ${e}`);
  process.exit(1);
}
