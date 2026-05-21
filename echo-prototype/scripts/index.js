#!/usr/bin/env node
const fs = require("fs");
const { articlesDir, commentsDir, ensureDir } = require("./lib/infra/workspace");
const store = require("./lib/infra/markdown-store");

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

for (const [id, article] of Object.entries(articles)) {
  const commentSection = buildCommentList(id);
  const filePath = article.absPath;
  const raw = fs.readFileSync(filePath, "utf-8");

  let updated;
  const startMarker = "<!-- ECHO_COMMENTS_START -->";
  const endMarker = "<!-- ECHO_COMMENTS_END -->";
  const legacyMarker = "<!-- ECHO:COMMENT_LIST -->";

  if (raw.includes(startMarker) && raw.includes(endMarker)) {
    updated = raw.replace(
      new RegExp(startMarker + "[\\s\\S]*" + endMarker, "g"),
      commentSection
    );
    console.log(`${article.relPath}: re-indexed (${comments.filter((c) => c.target?.article_id === id).length} comments)`);
  } else if (raw.includes(legacyMarker)) {
    updated = raw.replace(legacyMarker, commentSection);
    console.log(`${article.relPath}: first index (${comments.filter((c) => c.target?.article_id === id).length} comments)`);
  } else {
    updated = raw.trimEnd() + "\n\n" + commentSection + "\n";
    console.log(`${article.relPath}: appended (${comments.filter((c) => c.target?.article_id === id).length} comments)`);
  }

  if (updated === raw) {
    console.log(`${article.relPath}: unchanged — skipped`);
  } else {
    fs.writeFileSync(filePath, updated);
  }
}
