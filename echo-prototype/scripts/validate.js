#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { articlesDir, commentsDir, workspaceRoot, ensureDir } = require("./lib/infra/workspace");

ensureDir(articlesDir);
ensureDir(commentsDir);
const VALID_EVOLUTION_KINDS = new Set([
  null, "refines", "contradicts", "expands", "supersedes",
]);
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

// Only collect .md files that have an id in frontmatter
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
const ids = new Set();

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

  if (!d.id) {
    errors.push(`${rel}: missing "id"`);
    continue;
  }
  if (ids.has(d.id)) {
    errors.push(`${rel}: duplicate id "${d.id}"`);
  }
  ids.add(d.id);

  if (d.type === "annotation") {
    comments[d.id] = { file: rel, data: d };

    if (!d.target?.article_id) errors.push(`${rel}: missing "target.article_id"`);
    if (!d.anchor?.quote) errors.push(`${rel}: missing "anchor.quote"`);
    if (d.anchor?.prefix === undefined) errors.push(`${rel}: missing "anchor.prefix"`);
    if (d.anchor?.suffix === undefined) errors.push(`${rel}: missing "anchor.suffix"`);
    if (d.anchor?.occurrence === undefined) errors.push(`${rel}: missing "anchor.occurrence"`);
    if (d.anchor?.line_hint === undefined) errors.push(`${rel}: missing "anchor.line_hint"`);
    if (!d.author) errors.push(`${rel}: missing "author"`);
    if (!d.created_at) errors.push(`${rel}: missing "created_at"`);
    if (!d.status) errors.push(`${rel}: missing "status"`);
    if (!d.evolution) {
      errors.push(`${rel}: missing "evolution"`);
    } else if (!VALID_EVOLUTION_KINDS.has(d.evolution.kind)) {
      errors.push(`${rel}: invalid evolution.kind "${d.evolution.kind}" (allowed: refines, contradicts, expands, supersedes, null)`);
    }

    const expectedName = `${d.id}.md`;
    if (path.basename(file) !== expectedName) {
      errors.push(`${rel}: file name should be "${expectedName}" (id is "${d.id}")`);
    }
  } else {
    articles[d.id] = { file: rel, data: d };
    if (!d.title) errors.push(`${rel}: missing "title"`);
    if (!d.created_at) errors.push(`${rel}: missing "created_at"`);
  }
}

// Check: evolution.of references exist
for (const c of Object.values(comments)) {
  const ofList = c.data.evolution?.of || [];
  for (const targetId of ofList) {
    if (!comments[targetId]) {
      errors.push(`${c.file}: evolution.of references unknown comment "${targetId}"`);
    }
  }
}

// Check: target.article_id references exist
for (const c of Object.values(comments)) {
  const aid = c.data.target?.article_id;
  if (aid && !articles[aid]) {
    errors.push(`${c.file}: target.article_id "${aid}" not found`);
  }
}

// Cycle detection in evolution chains
function detectCycle(startId, ofMap, visited = new Set()) {
  if (visited.has(startId)) return [...visited, startId];
  visited.add(startId);
  for (const next of (ofMap[startId] || [])) {
    const cycle = detectCycle(next, ofMap, new Set(visited));
    if (cycle) return cycle;
  }
  return null;
}

const ofMap = {};
for (const [id, c] of Object.entries(comments)) {
  ofMap[id] = c.data.evolution?.of || [];
}
for (const id of Object.keys(comments)) {
  const cycle = detectCycle(id, ofMap);
  if (cycle) {
    errors.push(`${comments[id].file}: evolution cycle detected: ${cycle.join(" → ")}`);
  }
}

if (errors.length === 0) {
  console.log(`OK — ${Object.keys(articles).length} articles, ${Object.keys(comments).length} comments`);
  process.exit(0);
} else {
  console.log(`FAIL — ${errors.length} error(s):\n`);
  for (const e of errors) console.log(`  ${e}`);
  process.exit(1);
}
