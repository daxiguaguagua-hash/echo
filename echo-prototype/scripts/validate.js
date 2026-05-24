#!/usr/bin/env node
const { ensureDir } = require("./lib/infra/workspace");
const { resolveDataDirs } = require("./lib/infra/echo-paths");
const store = require("./lib/infra/markdown-store");
const v = require("./lib/domain/validation");

function runValidate(opts = {}) {
  const dirs = opts.dirs || resolveDataDirs();
  const { articlesDir, commentsDir } = dirs;

  ensureDir(articlesDir);
  ensureDir(commentsDir);
  const errors = [];

  const loadedArticles = store.loadArticles(articlesDir, { strict: true });
  const loadedComments = store.loadComments(commentsDir);

  const articles = {};
  const comments = {};
  const records = [];
  const fileMap = {};

  for (const a of loadedArticles) {
    const rel = `articles/${a.relPath}`;
    if (fileMap[a.id]) {
      errors.push(`${rel}: duplicate id "${a.id}" (also at ${fileMap[a.id]})`);
    } else {
      fileMap[a.id] = rel;
      articles[a.id] = { file: rel, data: a.data };
    }
    records.push({ id: a.id, data: a.data, file: rel });
    errors.push(...v.validateArticle({ id: a.id, data: a.data, file: rel }));
  }

  for (const c of loadedComments) {
    const rel = c._file;
    fileMap[c.id] = rel;
    records.push({ id: c.id, data: c, file: rel });
    comments[c.id] = { file: rel, data: c };
    errors.push(...v.validateAnnotation({ id: c.id, data: c, file: rel }));
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

  return {
    success: errors.length === 0,
    errors,
    articleCount: Object.keys(articles).length,
    commentCount: Object.keys(comments).length,
  };
}

if (require.main === module) {
  const result = runValidate();
  if (result.success) {
    console.log(`OK — ${result.articleCount} articles, ${result.commentCount} comments`);
    process.exit(0);
  } else {
    console.log(`FAIL — ${result.errors.length} error(s):\n`);
    for (const e of result.errors) console.log(`  ${e}`);
    process.exit(1);
  }
}

module.exports = { runValidate };
