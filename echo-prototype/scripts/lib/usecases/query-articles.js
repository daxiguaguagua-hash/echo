// Echo usecase — article query operations for MCP tools
// Each handler receives (args, deps) where deps = { dirs, store }

const path = require("path");
const { ensureDir } = require("../infra/workspace");
const { NotFoundError } = require("../domain/errors");

let _projectRegistry;
function getProjectRegistry() {
  if (!_projectRegistry) {
    try { _projectRegistry = require("./project-registry"); } catch (_) { _projectRegistry = null; }
  }
  return _projectRegistry;
}

function searchArticles(args, deps) {
  const { dirs, store } = deps;
  ensureDir(dirs.articlesDir);
  const keyword = (args.keyword || "").toLowerCase();
  const tag = (args.tag || "").toLowerCase();
  const projectFilter = args.project;

  // Determine which project directories to search
  const projectDirs = [];
  const currentProjectId = dirs.projectId;

  if (projectFilter && projectFilter !== "all" && projectFilter !== currentProjectId) {
    // Search only the specified external project
    try {
      const reg = getProjectRegistry();
      const { listProjects } = reg || {};
      const projects = listProjects();
      const target = projects.find((p) => p.projectId === projectFilter);
      if (target) {
        projectDirs.push({ articlesDir: path.join(target.dataRoot, "articles"), projectId: target.projectId });
      }
    } catch (_) {}
    // If project not found, fall through with empty projectDirs (returns no results)
  } else if (projectFilter === "all") {
    // Search current project + all registered projects
    projectDirs.push({ articlesDir: dirs.articlesDir, projectId: currentProjectId });
    try {
      const reg = getProjectRegistry();
      const { listProjects } = reg || {};
      const projects = listProjects();
      for (const p of projects) {
        if (p.projectId === currentProjectId) continue;
        projectDirs.push({ articlesDir: path.join(p.dataRoot, "articles"), projectId: p.projectId });
      }
    } catch (_) {}
  } else {
    // Default: current project only
    projectDirs.push({ articlesDir: dirs.articlesDir, projectId: currentProjectId });
  }

  // Load articles from all determined project directories
  const articles = [];
  for (const pd of projectDirs) {
    store.loadArticles(pd.articlesDir).forEach((a) => {
      articles.push({
        ...a.data,
        _file: a.relPath,
        _content: a.content,
        project: a.data.project || pd.projectId || "",
      });
    });
  }

  let results = articles;

  if (projectFilter && projectFilter !== "all") {
    results = results.filter((a) => a.project === projectFilter);
  }

  if (tag) {
    results = results.filter((a) =>
      (a.tags || []).some((t) => t.toLowerCase() === tag)
    );
  }

  if (keyword) {
    results = results
      .map((a) => {
        const body = a._content.toLowerCase();
        const aliasMatch = (a.alias || "").toLowerCase().includes(keyword);
        const idx = body.indexOf(keyword);
        if (idx === -1 && !aliasMatch) return null;
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
    alias: a.alias || "",
    file: a._file,
    created_at: a.created_at,
    tags: a.tags || [],
    summary: a.summary || "",
    snippet: a._snippet || "",
    ai_model: a.ai_model || "",
    project: a.project || "",
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
    alias: article.data.alias || "",
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

function addTags(args, deps) {
  const { dirs, store } = deps;
  ensureDir(dirs.articlesDir);
  const article = store.loadArticleById(dirs.articlesDir, args.id);
  if (!article) throw new NotFoundError(`Article "${args.id}" not found`);

  const newTags = (args.tags || []).map((t) => t.trim()).filter(Boolean);
  if (newTags.length === 0) return { id: article.data.id, tags: article.data.tags || [] };

  const existingTags = article.data.tags || [];
  const merged = [...new Set([...existingTags, ...newTags])];

  article.data.tags = merged;
  store.writeArticleFile(article.absPath, article.data, article.content);

  return { id: article.data.id, tags: merged, added: newTags };
}

function updateSummary(args, deps) {
  const { dirs, store } = deps;
  ensureDir(dirs.articlesDir);
  const article = store.loadArticleById(dirs.articlesDir, args.id);
  if (!article) throw new NotFoundError(`Article "${args.id}" not found`);

  article.data.summary = (args.summary || "").trim() || undefined;
  store.writeArticleFile(article.absPath, article.data, article.content);

  return { id: article.data.id, summary: article.data.summary || "" };
}

function removeTags(args, deps) {
  const { dirs, store } = deps;
  ensureDir(dirs.articlesDir);
  const article = store.loadArticleById(dirs.articlesDir, args.id);
  if (!article) throw new NotFoundError(`Article "${args.id}" not found`);

  const toRemove = new Set((args.tags || []).map((t) => t.trim()).filter(Boolean));
  if (toRemove.size === 0) return { id: article.data.id, tags: article.data.tags || [] };

  const existingTags = article.data.tags || [];
  const kept = existingTags.filter((t) => !toRemove.has(t));

  article.data.tags = kept;
  store.writeArticleFile(article.absPath, article.data, article.content);

  return { id: article.data.id, tags: kept, removed: [...toRemove] };
}

function renameTag(args, deps) {
  const { dirs, store } = deps;
  const oldTag = (args.oldTag || "").trim();
  const newTag = (args.newTag || "").trim();
  if (!oldTag || !newTag) throw new Error("oldTag and newTag are required");
  if (oldTag === newTag) throw new Error("oldTag and newTag must be different");

  ensureDir(dirs.articlesDir);
  const articles = store.loadArticles(dirs.articlesDir);

  let renamed = 0;
  for (const article of articles) {
    const tags = article.data.tags || [];
    if (tags.includes(oldTag)) {
      article.data.tags = tags.map((t) => (t === oldTag ? newTag : t));
      store.writeArticleFile(article.absPath, article.data, article.content);
      renamed++;
    }
  }

  if (renamed === 0) throw new NotFoundError(`Tag "${oldTag}" not found in any article`);

  return { oldTag, newTag, renamed };
}

function purgeTag(args, deps) {
  const { dirs, store } = deps;
  const tag = (args.tag || "").trim();
  if (!tag) throw new Error("tag is required");

  ensureDir(dirs.articlesDir);
  const articles = store.loadArticles(dirs.articlesDir);

  let purged = 0;
  for (const article of articles) {
    const tags = article.data.tags || [];
    if (tags.includes(tag)) {
      article.data.tags = tags.filter((t) => t !== tag);
      store.writeArticleFile(article.absPath, article.data, article.content);
      purged++;
    }
  }

  if (purged === 0) throw new NotFoundError(`Tag "${tag}" not found in any article`);

  return { tag, purged };
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
    alias: a.data.alias || "",
    created_at: a.data.created_at,
    tags: a.data.tags || [],
    summary: a.data.summary || "",
    file: a.relPath,
    ai_model: a.data.ai_model || "",
  }));
}

function listProjects(_args, _deps) {
  const reg = getProjectRegistry();
  const listAll = reg ? reg.listProjects : null;
  if (!listAll) return [];
  return listAll().map((p) => ({
    projectId: p.projectId,
    root: p.root,
    dataRoot: p.dataRoot,
    registeredAt: p.registeredAt,
  }));
}

function getProject(args, _deps) {
  const reg = getProjectRegistry();
  const findProjectById = reg ? reg.findProjectById : null;
  if (!findProjectById) throw new NotFoundError(`Project "${args.id}" not found`);
  const project = findProjectById(args.id);
  if (!project) throw new NotFoundError(`Project "${args.id}" not found`);
  return {
    projectId: project.projectId,
    root: project.projectRoot,
    dataRoot: project.dataRoot,
  };
}

module.exports = {
  searchArticles,
  getArticle,
  getArticleContext,
  listTags,
  listRecent,
  addTags,
  removeTags,
  renameTag,
  purgeTag,
  updateSummary,
  listProjects,
  getProject,
};
