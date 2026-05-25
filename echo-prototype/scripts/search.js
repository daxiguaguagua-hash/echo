#!/usr/bin/env node
const { ensureDir } = require("./lib/infra/workspace");
const { resolveDataDirs } = require("./lib/infra/echo-paths");
const store = require("./lib/infra/markdown-store");

function runSearch(opts = {}) {
  const dirs = opts.dirs || resolveDataDirs();
  const { articlesDir } = dirs;

  ensureDir(articlesDir);

  const keyword = opts.keyword || "";
  const tag = opts.tag || "";

  if (!keyword && !tag) {
    if (!opts.silent) {
      console.log("Usage: npm run search -- --keyword <text> [--tag <tag>]");
      console.log("  --keyword, -k   Full-text search in article body");
      console.log("  --tag, -t       Filter by tag");
    }
    return { results: [], count: 0 };
  }

  const articles = store.loadArticles(articlesDir).map((a) => ({
    ...a.data,
    _file: a.relPath,
    _content: a.content,
  }));

  let results = articles;

  if (tag) {
    const tagLower = tag.toLowerCase();
    results = results.filter((a) =>
      (a.tags || []).some((t) => t.toLowerCase() === tagLower)
    );
  }

  if (keyword) {
    const kw = keyword.toLowerCase();
    results = results
      .map((a) => {
        const body = a._content.toLowerCase();
        const aliasMatch = (a.alias || "").toLowerCase().includes(kw);
        const idx = body.indexOf(kw);
        if (idx === -1 && !aliasMatch) return null;
        const start = Math.max(0, idx - 40);
        const end = Math.min(body.length, idx + kw.length + 40);
        let snippet = a._content.slice(start, end).replace(/\n/g, " ");
        if (start > 0) snippet = "..." + snippet;
        if (end < body.length) snippet = snippet + "...";
        return { ...a, alias: a.alias || "", _snippet: snippet };
      })
      .filter(Boolean);
  }

  if (!keyword) {
    results = results.map((a) => ({ ...a, alias: a.alias || "" }));
  }

  return { results, count: results.length };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = { keyword: "", tag: "" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--keyword" || args[i] === "-k") opts.keyword = args[++i] || "";
    else if (args[i] === "--tag" || args[i] === "-t") opts.tag = args[++i] || "";
  }

  const result = runSearch(opts);

  if (!opts.keyword && !opts.tag) {
    process.exit(0);
  }

  if (result.count === 0) {
    const filters = [];
    if (opts.keyword) filters.push(`keyword="${opts.keyword}"`);
    if (opts.tag) filters.push(`tag="${opts.tag}"`);
    console.log(`No results for ${filters.join(", ")}.`);
    process.exit(0);
  }

  console.log(`${result.count} result(s):\n`);
  for (const a of result.results) {
    const ca = a.created_at;
    const d = ca instanceof Date ? ca.toISOString().slice(0, 10) : String(ca || "").slice(0, 10);
    console.log(`  ${a.title || a.id}`);
    console.log(`  ${a._file}  ·  ${d}`);
    if (a._snippet) console.log(`  > ${a._snippet}`);
    if (a.tags && a.tags.length) console.log(`  tags: ${a.tags.join(", ")}`);
    console.log();
  }
}

module.exports = { runSearch };
