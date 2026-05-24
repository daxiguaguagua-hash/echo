#!/usr/bin/env node
const fs = require("fs");
const { ensureDir } = require("./lib/infra/workspace");
const { resolveDataDirs } = require("./lib/infra/echo-paths");
const store = require("./lib/infra/markdown-store");

function runIndex(opts = {}) {
  const dirs = opts.dirs || resolveDataDirs();
  const { articlesDir, commentsDir } = dirs;

  ensureDir(articlesDir);
  ensureDir(commentsDir);

  const comments = store.loadComments(commentsDir).sort(
    (a, b) => String(a.created_at).localeCompare(String(b.created_at))
  );

  const articles = store.indexArticles(store.loadArticles(articlesDir));

  function buildCommentList(articleId) {
    const articleComments = comments.filter(
      (c) => c.target?.article_id === articleId
    );
    if (articleComments.length === 0) return "<!-- ECHO_COMMENTS_START -->\n\n<!-- ECHO_COMMENTS_END -->";

    const lines = ["<!-- ECHO_COMMENTS_START -->", "", "## 评论区", ""];
    for (const c of articleComments) {
      const quote = c.anchor?.quote || c.id;
      const author = c.author;
      const d = new Date(c.created_at);
      const date = isNaN(d.getTime()) ? String(c.created_at || "").slice(0, 10)
        : d.toISOString().slice(0, 10);
      let line = `- [${quote}](${c._file}) — ${author} · ${date}`;

      const ofList = c.evolution?.of || [];
      if (ofList.length > 0) {
        const targets = ofList.map((tid) => {
          const t = comments.find((x) => x.id === tid);
          const tQuote = t?.anchor?.quote || tid;
          const tFile = t?._file || "";
          return `["${tQuote}"](${tFile})`;
        });
        line += " → " + targets.join(", ");
      }
      lines.push(line);
    }
    lines.push("", "<!-- ECHO_COMMENTS_END -->");
    return lines.join("\n");
  }

  const updated = [];

  for (const [id, article] of Object.entries(articles)) {
    const commentSection = buildCommentList(id);
    const filePath = article.absPath;
    const raw = fs.readFileSync(filePath, "utf-8");

    let newRaw;
    const startMarker = "<!-- ECHO_COMMENTS_START -->";
    const endMarker = "<!-- ECHO_COMMENTS_END -->";
    const legacyMarker = "<!-- ECHO:COMMENT_LIST -->";

    if (raw.includes(startMarker) && raw.includes(endMarker)) {
      newRaw = raw.replace(
        new RegExp(startMarker + "[\\s\\S]*" + endMarker, "g"),
        commentSection
      );
      console.log(`${article.relPath}: re-indexed (${comments.filter((c) => c.target?.article_id === id).length} comments)`);
    } else if (raw.includes(legacyMarker)) {
      newRaw = raw.replace(legacyMarker, commentSection);
      console.log(`${article.relPath}: first index (${comments.filter((c) => c.target?.article_id === id).length} comments)`);
    } else {
      newRaw = raw.trimEnd() + "\n\n" + commentSection + "\n";
      console.log(`${article.relPath}: appended (${comments.filter((c) => c.target?.article_id === id).length} comments)`);
    }

    if (newRaw === raw) {
      console.log(`${article.relPath}: unchanged — skipped`);
    } else {
      fs.writeFileSync(filePath, newRaw);
      updated.push(article.relPath);
    }
  }

  return { updated, articleCount: Object.keys(articles).length, commentCount: comments.length };
}

if (require.main === module) {
  runIndex();
}

module.exports = { runIndex };
