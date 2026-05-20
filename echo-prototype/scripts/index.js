#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { articlesDir, commentsDir, ensureDir } = require("./lib/workspace");

ensureDir(articlesDir);
ensureDir(commentsDir);

function loadComments() {
  const comments = [];
  for (const name of fs.readdirSync(commentsDir)) {
    if (!name.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(commentsDir, name), "utf-8");
    const { data } = matter(raw);
    if (data.type === "annotation") comments.push({ ...data, _file: `comments/${name}` });
  }
  return comments.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function loadArticles() {
  const articles = {};
  for (const name of fs.readdirSync(articlesDir)) {
    if (!name.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(articlesDir, name), "utf-8");
    const { data, content } = matter(raw);
    if (!data.id) continue;  // skip non-Echo files
    articles[data.id] = { data, content, file: name };
  }
  return articles;
}

function buildCommentList(comments, articleId) {
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

const comments = loadComments();
const articles = loadArticles();

for (const [id, article] of Object.entries(articles)) {
  const commentSection = buildCommentList(comments, id);
  const filePath = path.join(articlesDir, article.file);
  const raw = fs.readFileSync(filePath, "utf-8");

  let updated;
  const startMarker = "<!-- ECHO_COMMENTS_START -->";
  const endMarker = "<!-- ECHO_COMMENTS_END -->";
  const legacyMarker = "<!-- ECHO:COMMENT_LIST -->";

  if (raw.includes(startMarker) && raw.includes(endMarker)) {
    // Replace between existing markers (re-runnable)
    updated = raw.replace(
      new RegExp(startMarker + "[\\s\\S]*" + endMarker, "g"),
      commentSection
    );
    console.log(`${article.file}: re-indexed (${comments.filter((c) => c.target?.article_id === id).length} comments)`);
  } else if (raw.includes(legacyMarker)) {
    // First run: replace legacy marker
    updated = raw.replace(legacyMarker, commentSection);
    console.log(`${article.file}: first index (${comments.filter((c) => c.target?.article_id === id).length} comments)`);
  } else {
    // Append at end
    updated = raw.trimEnd() + "\n\n" + commentSection + "\n";
    console.log(`${article.file}: appended (${comments.filter((c) => c.target?.article_id === id).length} comments)`);
  }

  if (updated === raw) {
    console.log(`${article.file}: unchanged — skipped`);
  } else {
    fs.writeFileSync(filePath, updated);
  }
}
