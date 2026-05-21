#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { articlesDir, commentsDir, ensureDir } = require("./lib/infra/workspace");
const { resolveAnchor } = require("./lib/domain/anchor");

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
