// Echo usecase — article query operations for MCP tools
// Each handler receives (args, deps) where deps = { dirs, store }

const { ensureDir } = require("../infra/workspace");
const { NotFoundError } = require("../domain/errors");

function searchArticles(args, deps) {
  const { dirs, store } = deps;
  ensureDir(dirs.articlesDir);
  const keyword = (args.keyword || "").toLowerCase();
  const tag = (args.tag || "").toLowerCase();

  const articles = store.loadArticles(dirs.articlesDir).map((a) => ({
    ...a.data,
    _file: a.relPath,
    _content: a.content,
  }));

  let results = articles;

  if (tag) {
    results = results.filter((a) =>
      (a.tags || []).some((t) => t.toLowerCase() === tag)
    );
  }

  if (keyword) {
    results = results
      .map((a) => {
        const body = a._content.toLowerCase();
        const idx = body.indexOf(keyword);
        if (idx === -1) return null;
        const start = Math.max(0, idx - 80);
        const end = Math.min(body.length, idx + keyword.length + 80);
        let snippet = a._content.slice(start, end).replace(/\n/g, " ");
        if (start > 0) snippet = "..." + snippet;
        if (end < body.length) snippet = snippet + "...";
        return { ...a, _snippet: snippet };
      })
      .filter(Boolean);
  }

  return results.map((a) => ({
    id: a.id,
    title: a.title || a.id,
    file: a._file,
    created_at: a.created_at,
    tags: a.tags || [],
    summary: a.summary || "",
    snippet: a._snippet || "",
    ai_model: a.ai_model || "",
  }));
}

function getArticle(args, deps) {
  const { dirs, store } = deps;
  ensureDir(dirs.articlesDir);
  const article = store.loadArticleById(dirs.articlesDir, args.id);
  if (!article) throw new NotFoundError(`Article "${args.id}" not found`);

  return {
    id: article.data.id,
    title: article.data.title || article.data.id,
    created_at: article.data.created_at,
    updated_at: article.data.updated_at,
    tags: article.data.tags || [],
    summary: article.data.summary || "",
    content: article.content.trim(),
    file: article.relPath,
    ai_model: article.data.ai_model || "",
    evolution: article.data.evolution || null,
  };
}

function getArticleContext(args, deps) {
  const { dirs, store } = deps;
  ensureDir(dirs.articlesDir);
  const article = store.loadArticleById(dirs.articlesDir, args.id);
  if (!article) throw new NotFoundError(`Article "${args.id}" not found`);

  ensureDir(dirs.commentsDir);
  const comments = store.loadComments(dirs.commentsDir).filter(
    (c) => c.target && c.target.article_id === args.id
  );

  let evolutionChain = [];
  const evo = article.data.evolution;

  if (evo) {
    const visited = new Set();
    let cursor = evo;
    while (cursor && cursor.of) {
      if (visited.has(cursor.of)) break;
      visited.add(cursor.of);
      const prev = store.loadArticleById(dirs.articlesDir, cursor.of);
      if (prev) {
        evolutionChain.unshift({
          id: prev.data.id,
          title: prev.data.title || prev.data.id,
          direction: cursor.direction || "expands",
        });
        cursor = prev.data.evolution;
      } else {
        break;
      }
    }
  }

  evolutionChain.push({
    id: article.data.id,
    title: article.data.title || article.data.id,
    direction: null,
  });

  const allArticles = store.loadArticles(dirs.articlesDir);
  const forward = allArticles.filter(
    (a) => a.data.evolution && a.data.evolution.of === args.id
  );
  for (const f of forward) {
    evolutionChain.push({
      id: f.data.id,
      title: f.data.title || f.data.id,
      direction: f.data.evolution.direction || "expands",
    });
  }

  return {
    id: article.data.id,
    title: article.data.title || article.data.id,
    created_at: article.data.created_at,
    tags: article.data.tags || [],
    summary: article.data.summary || "",
    content_preview: article.content.trim().slice(0, 500),
    evolution_chain: evolutionChain,
    comments: comments.map((c) => ({
      id: c.id,
      author: c.author || "anonymous",
      created_at: c.created_at,
      target_article_id: c.target?.article_id || "",
      anchor_quote: c.anchor?.quote || "",
      comment: (c.content || "").trim(),
    })),
  };
}

function listTags(_args, deps) {
  const { dirs, store } = deps;
  ensureDir(dirs.articlesDir);
  const articles = store.loadArticles(dirs.articlesDir);
  const tagCounts = {};

  for (const a of articles) {
    for (const tag of a.data.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

function listRecent(args, deps) {
  const { dirs, store } = deps;
  ensureDir(dirs.articlesDir);
  const raw = args.limit != null ? parseInt(args.limit, 10) : 20;
  const limit = Math.max(1, Math.min(isNaN(raw) ? 20 : raw, 100));

  const articles = store.loadArticles(dirs.articlesDir);
  articles.sort((a, b) => {
    const da = a.data.created_at ? new Date(a.data.created_at) : new Date(0);
    const db = b.data.created_at ? new Date(b.data.created_at) : new Date(0);
    return db - da;
  });

  return articles.slice(0, limit).map((a) => ({
    id: a.data.id,
    title: a.data.title || a.data.id,
    created_at: a.data.created_at,
    tags: a.data.tags || [],
    summary: a.data.summary || "",
    file: a.relPath,
    ai_model: a.data.ai_model || "",
  }));
}

module.exports = {
  searchArticles,
  getArticle,
  getArticleContext,
  listTags,
  listRecent,
};
