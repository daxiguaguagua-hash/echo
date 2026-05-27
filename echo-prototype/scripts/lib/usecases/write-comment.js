const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const { stripCommentSections } = require("./strip-comments");
const anchor = require("../domain/anchor");

function writeComment(opts) {
  const { articleId, quote, comment, author, scope, dirs, store } = opts;
  const evKind = opts.evolutionKind || "null";
  const evOf = opts.evolutionOf || [];
  const finalStatus = opts.status || "open";

  const { articlesDir, commentsDir } = dirs;
  const authorName = author || "vincent";

  // Load article
  const loaded = store.loadArticleById(articlesDir, articleId);
  if (!loaded) {
    const err = new Error(`Article "${articleId}" not found.`);
    err.availableArticles = store.loadArticles(articlesDir).map((a) => ({ id: a.id, relPath: a.relPath }));
    throw err;
  }

  const body = stripCommentSections(loaded.content);
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const pad = (n) => String(Math.abs(n)).padStart(2, "0");
  const now = d.getFullYear() + "-" +
    pad(d.getMonth() + 1) + "-" +
    pad(d.getDate()) + "T" +
    pad(d.getHours()) + ":" +
    pad(d.getMinutes()) + ":" +
    pad(d.getSeconds()) +
    sign + pad(Math.floor(Math.abs(off) / 60)) + ":" + pad(Math.abs(off) % 60);
  const newId = store.nextAnnotationId(commentsDir);

  if (scope === "article") {
    const frontmatter = {
      id: newId,
      type: "annotation",
      target: { article_id: articleId, path: loaded.relPath },
      anchor: { kind: "article" },
      author: authorName,
      created_at: now,
      updated_at: now,
      status: finalStatus,
      tags: [],
      evolution: { of: evOf, kind: evKind },
    };
    const fileContent = matter.stringify(comment.trim(), frontmatter);

    if (!fs.existsSync(commentsDir)) fs.mkdirSync(commentsDir, { recursive: true });
    const outPath = path.join(commentsDir, `${newId}.md`);
    fs.writeFileSync(outPath, fileContent);
    return { id: newId, articleId, scope: "article" };
  }

  // Inline comment: quote required, resolve anchor
  if (!quote) {
    throw new Error("quote is required for inline comments (or set scope: 'article')");
  }

  // Resolve anchor position
  let positions;
  if (opts.prefix && opts.suffix && opts.occurrence) {
    // Use caller-provided anchor data, validate it
    const resolved = anchor.resolveAnchor(
      { anchor: { quote: opts.quote, prefix: opts.prefix, suffix: opts.suffix, line_hint: opts.lineHint } },
      body
    );
    if (resolved.status === "broken") {
      throw new Error(`Anchor invalid: ${resolved.reason}`);
    }
    positions = [resolved.position];
  } else {
    // Auto-discover
    const searchBody = anchor.stripInlineFormatting(body);
    const searchQuote = anchor.stripInlineFormatting(quote);
    positions = anchor.findAllPositions(searchBody, searchQuote);

    if (positions.length === 0) {
      throw new Error(`Quote not found in article "${articleId}".`);
    }
  }

  const chosen = positions[(opts.occurrence || 1) - 1] || positions[0];
  const occurrenceIdx = positions.indexOf(chosen);

  // Compute anchor metadata
  const searchBody = anchor.stripInlineFormatting(body);
  const searchQuote = anchor.stripInlineFormatting(quote);
  const prefixRaw = searchBody.slice(Math.max(0, chosen.index - 100), chosen.index).trim();
  const suffixRaw = searchBody.slice(chosen.index + searchQuote.length, chosen.index + searchQuote.length + 100).trim();

  const frontmatter = {
    id: newId,
    type: "annotation",
    target: { article_id: articleId, path: loaded.relPath },
    anchor: { quote, prefix: prefixRaw, suffix: suffixRaw, occurrence: occurrenceIdx + 1, line_hint: chosen.line },
    author: authorName,
    created_at: now,
    updated_at: now,
    status: finalStatus,
    tags: [],
    evolution: { of: evOf, kind: evKind },
  };
  const fileContent = matter.stringify(comment.trim(), frontmatter);

  if (!fs.existsSync(commentsDir)) fs.mkdirSync(commentsDir, { recursive: true });
  const outPath = path.join(commentsDir, `${newId}.md`);

  if (fs.existsSync(outPath)) {
    throw new Error(`${newId}.md already exists in comments directory.`);
  }

  fs.writeFileSync(outPath, fileContent);
  return { id: newId, articleId, scope: "inline" };
}

module.exports = { writeComment };
