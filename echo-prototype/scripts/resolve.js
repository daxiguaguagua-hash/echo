#!/usr/bin/env node
const { articlesDir, commentsDir, ensureDir } = require("./lib/infra/workspace");
const store = require("./lib/infra/markdown-store");
const { resolveAnchor } = require("./lib/domain/anchor");
const { stripCommentSections } = require("./lib/usecases/strip-comments");

ensureDir(articlesDir);
ensureDir(commentsDir);

const articles = {};
for (const [id, a] of Object.entries(store.indexArticles(store.loadArticles(articlesDir)))) {
  articles[id] = { data: a.data, body: stripCommentSections(a.content), file: a.relPath };
}

const comments = store.loadComments(commentsDir);

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
