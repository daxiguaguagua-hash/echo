#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { articlesDir, commentsDir, ensureDir } = require("./lib/workspace");

ensureDir(articlesDir);
ensureDir(commentsDir);

function loadArticles() {
  const articles = {};
  for (const name of fs.readdirSync(articlesDir)) {
    if (!name.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(articlesDir, name), "utf-8");
    const { data } = matter(raw);
    if (!data.id) continue;  // skip non-Echo files
    let body = raw.replace(/^---[\s\S]*?---\n*/, "");
    body = body.replace(/<!-- ECHO_COMMENTS_START -->[\s\S]*<!-- ECHO_COMMENTS_END -->\n*/g, "");
    body = body.replace(/<!-- ECHO:COMMENT_LIST -->\n*/g, "");
    articles[data.id] = { data, body, file: name };
  }
  return articles;
}

function loadComments() {
  const comments = [];
  for (const name of fs.readdirSync(commentsDir)) {
    if (!name.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(commentsDir, name), "utf-8");
    const { data } = matter(raw);
    if (data.type === "annotation") comments.push({ ...data, _file: `comments/${name}` });
  }
  return comments;
}

function stripInlineFormatting(text) {
  // Remove bold, italic, strikethrough — keep the inner text
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1");
}

function findAllPositions(text, quote) {
  const positions = [];
  let idx = 0;
  while (true) {
    idx = text.indexOf(quote, idx);
    if (idx === -1) break;
    const line = text.slice(0, idx).split("\n").length;
    positions.push({ index: idx, line });
    idx += quote.length;
  }
  return positions;
}

function resolveAnchor(comment, articleBody) {
  const { quote, prefix, suffix, occurrence, line_hint } = comment.anchor || {};
  if (!quote) return { status: "broken", reason: "no quote" };

  // Search in stripped body (remove inline formatting for matching)
  const searchBody = stripInlineFormatting(articleBody);
  const positions = findAllPositions(searchBody, quote);

  if (positions.length === 0) {
    return { status: "broken", reason: `quote not found: "${quote.slice(0, 50)}"` };
  }

  if (positions.length === 1) {
    return { status: "ok", position: positions[0] };
  }

  const candidates = positions.filter((p) => {
    const before = searchBody.slice(Math.max(0, p.index - 200), p.index);
    const after = searchBody.slice(p.index + quote.length, p.index + quote.length + 200);
    const prefixMatch = !prefix || stripInlineFormatting(before).includes(prefix);
    const suffixMatch = !suffix || stripInlineFormatting(after).includes(suffix);
    return prefixMatch && suffixMatch;
  });

  if (candidates.length === 1) {
    return { status: "ok", position: candidates[0], note: "disambiguated via prefix+suffix" };
  }

  if (candidates.length > 1 && line_hint) {
    candidates.sort((a, b) => Math.abs(a.line - line_hint) - Math.abs(b.line - line_hint));
    return {
      status: "needs_review",
      position: candidates[0],
      reason: `${candidates.length} candidates after prefix+suffix; line_hint=${line_hint}`,
    };
  }

  return {
    status: "ambiguous",
    reason: `${candidates.length} occurrences, can't disambiguate`,
    candidates,
  };
}

const articles = loadArticles();
const comments = loadComments();

let ok = 0;
let broken = 0;
let needsReview = 0;
let ambiguous = 0;

for (const c of comments) {
  const articleId = c.target?.article_id;
  if (!articleId || !articles[articleId]) {
    console.log(`${c._file}: SKIP — article "${articleId}" not found`);
    continue;
  }

  const result = resolveAnchor(c, articles[articleId].body);

  switch (result.status) {
    case "ok":
      ok++;
      break;
    case "broken":
      broken++;
      console.log(`${c._file}: BROKEN — ${result.reason}`);
      break;
    case "needs_review":
      needsReview++;
      console.log(`${c._file}: NEEDS_REVIEW — ${result.reason} (guessed line ${result.position?.line})`);
      break;
    case "ambiguous":
      ambiguous++;
      console.log(`${c._file}: AMBIGUOUS — ${result.reason}`);
      break;
  }
}

console.log(`\n${ok} ok, ${broken} broken, ${needsReview} needs_review, ${ambiguous} ambiguous`);
process.exit(broken > 0 ? 1 : 0);
