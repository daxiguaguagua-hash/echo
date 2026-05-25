#!/usr/bin/env node

const { resolveDataDirs } = require("./lib/infra/echo-paths");
const store = require("./lib/infra/markdown-store");
const { writeComment } = require("./lib/usecases/write-comment");

function runAnnotate(opts = {}) {
  const dirs = opts.dirs || resolveDataDirs();
  const evOf = opts.evolutionOf ? opts.evolutionOf.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const result = writeComment({
    articleId: opts.articleId,
    quote: opts.quote,
    comment: opts.commentText,
    author: opts.author,
    evolutionKind: opts.evolutionKind || "null",
    evolutionOf: evOf,
    status: opts.status || "open",
    dirs,
    store,
  });

  console.log(`Created: comments/${result.id}.md`);
  console.log(`  article: ${opts.articleId}`);
  if (opts.quote) console.log(`  quote:   ${opts.quote.slice(0, 60)}${opts.quote.length > 60 ? "..." : ""}`);
  if (evOf.length > 0) console.log(`  replies: ${evOf.join(", ")}`);

  return result;
}

if (require.main === module) {
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
  const evolutionOf = flag("evolution-of");
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

  try {
    runAnnotate({ articleId, quote, commentText, author, evolutionKind, evolutionOf, status });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (err.availableArticles) {
      console.log("Available articles:");
      for (const a of err.availableArticles) {
        console.log(`  ${a.id}  (${a.relPath})`);
      }
    }
    process.exit(1);
  }
}

module.exports = { runAnnotate };
