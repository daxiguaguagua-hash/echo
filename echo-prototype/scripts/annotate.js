#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const { articlesDir, commentsDir, ensureDir } = require("./lib/infra/workspace");
const store = require("./lib/infra/markdown-store");
const anchor = require("./lib/domain/anchor");
const { stripCommentSections } = require("./lib/usecases/strip-comments");

ensureDir(articlesDir);

// --- arg parsing ---
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

const articleId = flag("article");
const quote = flag("quote");
const commentText = flag("comment");
const author = flag("author") || "vincent";
const evolutionKind = flag("evolution-kind") || "null";
const evolutionOf = flag("evolution-of"); // comma-separated
const status = flag("status") || "open";

if (!articleId || !quote || !commentText) {
  console.log("Usage: node scripts/annotate.js --article <id> --quote \"<text>\" --comment \"<text>\" [--author <name>] [--evolution-of <id>] [--evolution-kind <kind>]");
  console.log("");
  console.log("  --article        Article ID (from frontmatter)");
  console.log("  --quote          Exact text to annotate");
  console.log("  --comment        Your comment text");
  console.log("  --author         Default: vincent");
  console.log("  --evolution-of   Comma-separated annotation IDs this replies to");
  console.log("  --evolution-kind refines | contradicts | expands | supersedes | null");
  console.log("  --status         Default: open");
  process.exit(1);
}

// --- load article ---
const loaded = store.loadArticleById(articlesDir, articleId);
if (!loaded) {
  console.log(`Error: article "${articleId}" not found.`);
  console.log("Available articles:");
  for (const a of store.loadArticles(articlesDir)) {
    console.log(`  ${a.id}  (${a.relPath})`);
  }
  process.exit(1);
}

const body = stripCommentSections(loaded.content);

// --- find quote ---
const searchBody = anchor.stripInlineFormatting(body);
const searchQuote = anchor.stripInlineFormatting(quote);
const positions = anchor.findAllPositions(searchBody, searchQuote);

if (positions.length === 0) {
  console.log(`Error: quote not found in article "${articleId}".`);
  process.exit(1);
}

let chosen;
if (positions.length === 1) {
  chosen = positions[0];
} else {
  chosen = positions[0];
  console.log(`Warning: quote appears ${positions.length} times. Using occurrence 1 (line ${chosen.line}).`);
  console.log("  To target a different occurrence, provide a longer or more specific quote.");
}

// --- compute anchor metadata ---
const prefixRaw = searchBody.slice(Math.max(0, chosen.index - 100), chosen.index).trim();
const suffixRaw = searchBody.slice(chosen.index + searchQuote.length, chosen.index + searchQuote.length + 100).trim();

// --- generate ID ---
const newId = store.nextAnnotationId(commentsDir);
const now = new Date().toISOString().replace(/\.\d{3}Z$/, "+08:00");

// --- build evolution ---
const evOf = evolutionOf ? evolutionOf.split(",").map((s) => s.trim()).filter(Boolean) : [];
const evKind = ["refines", "contradicts", "expands", "supersedes", "null"].includes(evolutionKind)
  ? evolutionKind
  : "null";

// --- build file ---
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
  `  occurrence: ${positions.indexOf(chosen) + 1}`,
  `  line_hint: ${chosen.line}`,
  `author: ${author}`,
  `created_at: ${now}`,
  `updated_at: ${now}`,
  `status: ${status}`,
  `tags: []`,
  `evolution:`,
  `  of: [${evOf.map((id) => JSON.stringify(id)).join(", ")}]`,
  `  kind: ${evKind}`,
].join("\n");

const fileContent = `---\n${yaml}\n---\n\n${commentText.trim()}\n`;

if (!fs.existsSync(commentsDir)) fs.mkdirSync(commentsDir, { recursive: true });
const outPath = path.join(commentsDir, `${newId}.md`);

if (fs.existsSync(outPath)) {
  console.log(`Error: ${newId}.md already exists.`);
  process.exit(1);
}

fs.writeFileSync(outPath, fileContent);
console.log(`Created: comments/${newId}.md`);
console.log(`  article: ${articleId} (${loaded.relPath})`);
console.log(`  quote:   ${quote.slice(0, 60)}${quote.length > 60 ? "..." : ""}`);
console.log(`  anchor:  line ${chosen.line}, occurrence ${positions.indexOf(chosen) + 1}`);
if (evOf.length > 0) console.log(`  replies: ${evOf.join(", ")}`);
