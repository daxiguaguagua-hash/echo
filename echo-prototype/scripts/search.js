#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { articlesDir, ensureDir } = require("./lib/infra/workspace");

ensureDir(articlesDir);

const args = process.argv.slice(2);
const opts = { keyword: "", tag: "" };
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--keyword" || args[i] === "-k") opts.keyword = args[++i] || "";
  else if (args[i] === "--tag" || args[i] === "-t") opts.tag = args[++i] || "";
}

if (!opts.keyword && !opts.tag) {
  console.log("Usage: npm run search -- --keyword <text> [--tag <tag>]");
  console.log("  --keyword, -k   Full-text search in article body");
  console.log("  --tag, -t       Filter by tag");
  process.exit(0);
}

const files = fs.readdirSync(articlesDir).filter((f) => f.endsWith(".md"));
const articles = [];
for (const file of files) {
  const raw = fs.readFileSync(path.join(articlesDir, file), "utf-8");
  const { data, content } = matter(raw);
  if (!data.id) continue;
  articles.push({ ...data, _file: file, _content: content });
}

let results = articles;

if (opts.tag) {
  const tag = opts.tag.toLowerCase();
  results = results.filter((a) =>
    (a.tags || []).some((t) => t.toLowerCase() === tag)
  );
}

if (opts.keyword) {
  const kw = opts.keyword.toLowerCase();
  results = results
    .map((a) => {
      const body = a._content.toLowerCase();
      const idx = body.indexOf(kw);
      if (idx === -1) return null;
      const start = Math.max(0, idx - 40);
      const end = Math.min(body.length, idx + kw.length + 40);
      let snippet = a._content.slice(start, end).replace(/\n/g, " ");
      if (start > 0) snippet = "..." + snippet;
      if (end < body.length) snippet = snippet + "...";
      return { ...a, _snippet: snippet };
    })
    .filter(Boolean);
}

if (results.length === 0) {
  const filters = [];
  if (opts.keyword) filters.push(`keyword="${opts.keyword}"`);
  if (opts.tag) filters.push(`tag="${opts.tag}"`);
  console.log(`No results for ${filters.join(", ")}.`);
  process.exit(0);
}

console.log(`${results.length} result(s):\n`);
for (const a of results) {
  const ca = a.created_at;
  const d = ca instanceof Date ? ca.toISOString().slice(0, 10) : String(ca || "").slice(0, 10);
  console.log(`  ${a.title || a.id}`);
  console.log(`  ${a._file}  ·  ${d}`);
  if (a._snippet) console.log(`  > ${a._snippet}`);
  if (a.tags && a.tags.length) console.log(`  tags: ${a.tags.join(", ")}`);
  console.log();
}
