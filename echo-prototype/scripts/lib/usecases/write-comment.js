const fs = require("fs");
const path = require("path");

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
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "+08:00");
  const newId = store.nextAnnotationId(commentsDir);

  if (scope === "article") {
    // Article-level comment: no quote/anchor resolution needed
    const yaml = [
      `id: ${newId}`,
      `type: annotation`,
      `target:`,
      `  article_id: ${articleId}`,
      `  path: ${loaded.relPath}`,
      `anchor:`,
      `  kind: article`,
      `author: ${authorName}`,
      `created_at: ${now}`,
      `updated_at: ${now}`,
      `status: ${finalStatus}`,
      `tags: []`,
      `evolution:`,
      `  of: [${evOf.map((id) => JSON.stringify(id)).join(", ")}]`,
      `  kind: ${evKind}`,
    ].join("\n");

    const fileContent = `---\n${yaml}\n---\n\n${comment.trim()}\n`;

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

  const yaml = [
    `id: ${newId}`,
    `type: annotation`,
    `target:`,
    `  article_id: ${articleId}`,
    `  path: ${loaded.relPath}`,
    `anchor:`,
    `  quote: ${JSON.stringify(quote)}`,
    `  prefix: ${JSON.stringify(prefixRaw)}`,
    `  suffix: ${JSON.stringify(suffixRaw)}`,
    `  occurrence: ${occurrenceIdx + 1}`,
    `  line_hint: ${chosen.line}`,
    `author: ${authorName}`,
    `created_at: ${now}`,
    `updated_at: ${now}`,
    `status: ${finalStatus}`,
    `tags: []`,
    `evolution:`,
    `  of: [${evOf.map((id) => JSON.stringify(id)).join(", ")}]`,
    `  kind: ${evKind}`,
  ].join("\n");

  const fileContent = `---\n${yaml}\n---\n\n${comment.trim()}\n`;

  if (!fs.existsSync(commentsDir)) fs.mkdirSync(commentsDir, { recursive: true });
  const outPath = path.join(commentsDir, `${newId}.md`);

  if (fs.existsSync(outPath)) {
    throw new Error(`${newId}.md already exists in comments directory.`);
  }

  fs.writeFileSync(outPath, fileContent);
  return { id: newId, articleId, scope: "inline" };
}

module.exports = { writeComment };
