const fs = require("fs");
const path = require("path");

const { resolveDataDirs } = require("./lib/infra/echo-paths");
const { resolveEchoHomePath } = require("./lib/infra/workspace");
const store = require("./lib/infra/markdown-store");
const { stripCommentSections } = require("./lib/usecases/strip-comments");
const { TURN_MARKER_REGEX } = require("./lib/domain/echo-format");

const PACKAGE_DOCS_ROOT = path.resolve(__dirname, "../../docs");
const PACKAGE_ROOT = path.resolve(__dirname, "..");

function defaultDocsRoot() {
  return path.join(resolveEchoHomePath(), ".site");
}

function sitePaths(docsRoot) {
  return {
    docsRoot,
    generatedArticlesDir: path.join(docsRoot, "articles", "generated"),
    generatedLiveDir: path.join(docsRoot, "live", "generated"),
    sidebarFile: path.join(docsRoot, ".vitepress", "echo-sidebar.mts"),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

function ensureRuntimeDependencies(docsRoot) {
  if (path.resolve(docsRoot) === path.resolve(PACKAGE_DOCS_ROOT)) return;

  const siteModules = path.join(docsRoot, "node_modules");
  ensureDir(siteModules);

  for (const name of ["vitepress", "vue"]) {
    const target = path.join(PACKAGE_ROOT, "node_modules", name);
    const link = path.join(siteModules, name);
    if (!fs.existsSync(target) || fs.existsSync(link)) continue;
    try {
      fs.symlinkSync(target, link, "dir");
    } catch (_) {}
  }
}

function ensureSiteScaffold(docsRoot) {
  ensureDir(docsRoot);
  ensureDir(path.join(docsRoot, "articles"));
  ensureDir(path.join(docsRoot, "tags"));
  ensureDir(path.join(docsRoot, "live"));

  if (path.resolve(docsRoot) !== path.resolve(PACKAGE_DOCS_ROOT)) {
    copyDir(path.join(PACKAGE_DOCS_ROOT, ".vitepress"), path.join(docsRoot, ".vitepress"));
  }

  ensureRuntimeDependencies(docsRoot);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeFrontmatterString(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function articleSlug(article) {
  const base = String(article.id || path.basename(article.relPath, ".md"));
  const slug = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const articleIdSlug = slug || encodeURIComponent(base).replace(/%/g, "").toLowerCase();
  const project = articleProject(article);
  if (!project) return articleIdSlug;
  return `${slugText(project)}--${articleIdSlug}`;
}

function slugText(value) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "tag";
}

function tagAnchor(tag, count) {
  return `tag-${slugText(tag)}-${count}`;
}

function displayTitle(article) {
  return article.data.alias || article.data.title || article.id;
}

function displayProjectName(projectId) {
  return projectId || "未归类";
}

function articleProject(article) {
  return article.data.project || article._project || null;
}

function articleDisplayTags(article) {
  const projectTag = displayProjectName(articleProject(article));
  const tags = Array.isArray(article.data.tags) ? article.data.tags : [];
  return [projectTag, ...tags.filter((tag) => tag !== projectTag)];
}

function normalizeDate(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function sortByUpdatedDesc(a, b) {
  const av = new Date(a.data.updated_at || a.data.created_at || 0).getTime();
  const bv = new Date(b.data.updated_at || b.data.created_at || 0).getTime();
  return bv - av || String(a.data.title || a.id).localeCompare(String(b.data.title || b.id));
}

function stripFirstHeading(content) {
  const titleLine = content.match(/^\s*# .*(?:\r?\n|$)/);
  if (!titleLine) return content.trim();
  return content.slice(titleLine[0].length).trim();
}

function renderTurnMarker(raw) {
  const m = raw.match(TURN_MARKER_REGEX);
  const id = m?.[1] || "";
  const speaker = m?.[2] || "unknown";
  const replyTo = m?.[3];
  const replyAttr = replyTo ? ` data-reply-to="${escapeHtml(replyTo)}"` : "";
  return `\n\n<span class="echo-turn-marker" hidden aria-hidden="true" data-turn-id="${escapeHtml(id)}" data-speaker="${escapeHtml(speaker)}"${replyAttr}></span>\n\n`;
}

function escapeHtmlTagsOutsideCode(content) {
  let inFence = false;
  return content.split(/\r?\n/).map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return line.replace(/<\/?[A-Za-z][^>\n]*>/g, (tag) => escapeHtml(tag));
  }).join("\n");
}

function renderBody(article) {
  const withoutComments = stripCommentSections(article.content);
  const withoutTitle = stripFirstHeading(withoutComments);
  return escapeHtmlTagsOutsideCode(withoutTitle)
    .replace(/<!--\s*turn:[\s\S]*?-->/g, renderTurnMarker)
    .trim();
}

function commentsForArticle(article, comments) {
  const project = articleProject(article) || null;
  return comments
    .filter((comment) => comment.target?.article_id === article.id && (comment._project || null) === project)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function renderComments(article, comments) {
  const related = commentsForArticle(article, comments);
  if (related.length === 0) {
    return "## 评论区\n\n暂无评论。";
  }

  const rows = related.map((comment) => {
    const quote = comment.anchor?.quote || comment.id;
    const author = comment.author || "unknown";
    const date = normalizeDate(comment.created_at);
    const replyTo = (comment.evolution?.of || []).join(", ");
    const reply = replyTo ? `<span>回复 ${escapeHtml(replyTo)}</span>` : "";
    const content = escapeHtmlTagsOutsideCode(String(comment.content || "")).trim();
    return [
      `<section class="echo-comment" data-comment-id="${escapeHtml(comment.id)}">`,
      `<div class="echo-comment-head"><strong>${escapeHtml(author)}</strong><span>${escapeHtml(date)}</span>${reply}</div>`,
      `<blockquote>${escapeHtml(quote)}</blockquote>`,
      content || "_无正文_",
      `</section>`,
    ].join("\n\n");
  });

  return `## 评论区\n\n<div class="echo-comment-list">\n\n${rows.join("\n\n")}\n\n</div>`;
}

function renderCommentsJson(article, comments) {
  const related = commentsForArticle(article, comments);
  const items = related.map((comment) => ({
    id: comment.id,
    author: comment.author || "unknown",
    date: normalizeDate(comment.created_at),
    content: (String(comment.content || "")).trim(),
    quote: comment.anchor?.quote || null,
    evolutionOf: comment.evolution?.of || [],
    evolutionKind: comment.evolution?.kind || "null",
  }));
  return `<script id="echo-comments-data" type="application/json">${JSON.stringify(items)}</script>`;
}

function highlightAnnotations(body, article, comments) {
  const inlineAnnotations = comments.filter(
    (c) => c.target?.article_id === article.id && c.anchor?.quote && c.anchor?.kind !== "article"
  );
  if (inlineAnnotations.length === 0) return body;

  let result = body;
  for (const ann of inlineAnnotations) {
    const q = ann.anchor.quote;
    const occ = ann.anchor.occurrence || 1;
    const escaped = escapeHtml(q);

    let idx = -1;
    for (let i = 0; i < occ; i++) {
      idx = result.indexOf(escaped, idx + 1);
      if (idx === -1) break;
    }
    if (idx === -1) continue;

    const before = result.slice(0, idx);
    const after = result.slice(idx + escaped.length);
    result = `${before}<mark class="echo-highlight" data-ann="${ann.id}">${escaped}</mark>${after}`;
  }
  return result;
}

function renderArticlePage(article, comments) {
  const title = displayTitle(article);
  const tags = articleDisplayTags(article);
  const participants = Array.isArray(article.data.participants)
    ? article.data.participants.map((p) => p.id || p.role).filter(Boolean).join(", ")
    : "";
  const created = normalizeDate(article.data.created_at);
  const updated = normalizeDate(article.data.updated_at);
  const summary = article.data.summary || "";
  const project = articleProject(article) || "";
  const tagHtml = tags.length
    ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")
    : "<span>未标记</span>";

  const projectMeta = project ? `<div><strong>项目</strong><span>${escapeHtml(project)}</span></div>` : "";

  const bodyHtml = highlightAnnotations(renderBody(article), article, comments);

  return `---
title: "${escapeFrontmatterString(title)}"
echo:
  articleId: ${article.id}
  projectId: ${project ? `"${escapeFrontmatterString(project)}"` : 'null'}
  interactive: ${project && project.startsWith('echo-') ? 'false' : 'true'}
---

# ${title}

<div class="echo-meta-grid">
  <div><strong>创建</strong><span>${escapeHtml(created || "-")}</span></div>
  <div><strong>更新</strong><span>${escapeHtml(updated || "-")}</span></div>
  <div><strong>参与者</strong><span>${escapeHtml(participants || "-")}</span></div>
  <div><strong>ID</strong><span>${escapeHtml(article.id)}</span></div>
  ${projectMeta}
</div>

<div class="echo-tags">${tagHtml}</div>

${summary ? `<p class="echo-summary">${escapeHtml(summary)}</p>` : ""}

${bodyHtml}

---

${renderComments(article, comments)}

${renderCommentsJson(article, comments)}

`;
}

function collectProjects(articles) {
  const projects = new Map();
  for (const article of articles) {
    const p = article._project;
    if (p && !projects.has(p)) {
      projects.set(p, { projectId: p, count: 0 });
    }
    if (p) projects.get(p).count++;
    else {
      if (!projects.has("__other__")) projects.set("__other__", { projectId: null, count: 0 });
      projects.get("__other__").count++;
    }
  }
  return [...projects.values()];
}

function groupArticlesByProject(articles) {
  const groups = new Map();
  for (const article of articles) {
    const projectId = article._project || null;
    const key = projectId || "__unassigned__";
    if (!groups.has(key)) {
      groups.set(key, {
        projectId,
        text: displayProjectName(projectId),
        articles: [],
      });
    }
    groups.get(key).articles.push(article);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.projectId === b.projectId) return 0;
    if (a.projectId === null) return 1;
    if (b.projectId === null) return -1;
    return a.text.localeCompare(b.text);
  });
}

function renderArticleIndex(articles) {
  const projectPayload = groupArticlesByProject(articles).map((group) => ({
    anchor: `project-${slugText(group.text)}`,
    key: group.projectId || "__unassigned__",
    label: group.text,
    articles: group.articles.map((article) => ({
      href: `./generated/${articleSlug(article)}`,
      summary: article.data.summary || "无摘要",
      tags: articleDisplayTags(article),
      title: displayTitle(article),
      updated: normalizeDate(article.data.updated_at || article.data.created_at),
    })),
  }));
  const payload = encodeURIComponent(JSON.stringify(projectPayload));

  return `# 文章

共 ${articles.length} 篇 Echo 文章。

<EchoProjectTabs payload="${payload}" />

<EchoClaudeImportBanner />
`;
}

function collectTags(articles) {
  const map = new Map();
  for (const article of articles) {
    const tags = articleDisplayTags(article);
    for (const tag of tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(article);
    }
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function renderTagsIndex(articles) {
  const groups = collectTags(articles);
  const tagPayload = groups.map(([tag, taggedArticles]) => {
    const anchor = tagAnchor(tag, taggedArticles.length);
    return {
      anchor,
      tag,
      articles: taggedArticles.map((article) => ({
        title: displayTitle(article),
        summary: article.data.summary || "",
        href: `/articles/generated/${articleSlug(article)}`,
      })),
    };
  });
  const payload = encodeURIComponent(JSON.stringify(tagPayload));

  return `# 标签

共 ${groups.length} 个标签，来自 ${articles.length} 篇文章。

<EchoTagsPage payload="${payload}" />
`;
}

function renderHomeArticles(articles) {
  return articles.slice(0, 6).map((article) => {
    const title = displayTitle(article);
    const date = normalizeDate(article.data.updated_at || article.data.created_at);
    return `- [${title}](/articles/generated/${articleSlug(article)}) · ${date}`;
  }).join("\n");
}

function updateHome(articles, docsRoot) {
  const home = `---
layout: home

hero:
  name: "Echo 知识库"
  text: "本地优先的 AI 对话知识论坛"
  tagline: 将 AI 对话转化为结构化、可检索、可标注的知识资产
  actions:
    - theme: brand
      text: 浏览文章
      link: /articles/
    - theme: alt
      text: 按标签检索
      link: /tags/

features:
  - icon: "📝"
    title: 自动捕获
    details: Hook 实时捕获 Claude Code 对话，零手动操作
  - icon: "🔍"
    title: 全文搜索
    details: 本地搜索索引，关键词 + 标签过滤
  - icon: "💬"
    title: 批注链
    details: 对文章任意片段追加评论，支持回复链和引用追踪
  - icon: "🔗"
    title: 进化追踪
    details: 文章间的 evolution 引用，追踪知识演进路径
---

## 最近文章

${renderHomeArticles(articles)}
`;
  fs.writeFileSync(path.join(docsRoot, "index.md"), home, "utf-8");
}

function writeSidebar(articles, liveSessions, sidebarFile) {
  const renderItem = (article, indent = "            ") => {
    const title = displayTitle(article);
    return `${indent}{ text: ${JSON.stringify(title)}, link: '/articles/generated/${articleSlug(article)}' }`;
  };

  const projectGroupsData = groupArticlesByProject(articles);
  const groupedSlugs = new Set();
  for (const g of projectGroupsData) {
    for (const a of g.articles) {
      groupedSlugs.add(articleSlug(a));
    }
  }
  const recentItems = articles
    .filter((a) => !groupedSlugs.has(articleSlug(a)))
    .slice(0, 10)
    .map((article) => renderItem(article))
    .join(",\n");
  const projectGroups = projectGroupsData.map((group) => {
    const items = group.articles.slice(0, 30).map((article) => renderItem(article, "                ")).join(",\n");
    return `          {
            text: ${JSON.stringify(`${group.text} (${group.articles.length})`)},
            collapsed: false,
            items: [
${items}
            ],
          }`;
  }).join(",\n");

  // [LIVE_SESSION_DISABLED] 后期恢复时取消注释
  // const liveItems = (liveSessions || []).map((s) => {
  //   const label = s.publishedSlug ? `${s.sessionId} (已发布)` : `${s.sessionId} (LIVE)`;
  //   return `            { text: ${JSON.stringify(label)}, link: '/live/generated/${liveSessionSlug(s)}' }`;
  // }).join(",\n");
  const liveItems = "";

  const liveSection = (liveSessions || []).length > 0 ? `      {
        text: 'Live Sessions',
        collapsed: false,
        items: [
${liveItems}
        ],
      },
` : "";

  const sidebar = `export const articleSidebar = [
  {
    text: '文章列表',
    items: [
      { text: '全部文章', link: '/articles/' },
      {
        text: '最近文章',
        collapsed: true,
        items: [
${recentItems}
        ],
      },
      {
        text: '项目',
        collapsed: false,
        items: [
${projectGroups}
        ],
      },
${liveSection}    ],
  },
]
`;
  fs.writeFileSync(sidebarFile, sidebar, "utf-8");
}

function loadLiveSessions() {
  const sessions = [];
  const seenRoots = new Set();
  let registeredProjects = [];

  function addSource(source) {
    const root = path.resolve(source.root);
    if (seenRoots.has(root)) return;
    seenRoots.add(root);
    sources.push({ ...source, root });
  }

  const sources = [];

  try {
    const { listProjects } = require("./lib/usecases/project-registry");
    registeredProjects = listProjects();
  } catch (_) {}

  if (registeredProjects.length > 0) {
    for (const p of registeredProjects) {
      addSource({
        projectId: p.projectId,
        root: p.dataRoot,
        bufferDir: path.join(p.dataRoot, "session-buffer"),
        articlesDir: path.join(p.dataRoot, "articles"),
      });
    }
  } else {
    const dirs = resolveDataDirs();
    addSource({
      projectId: dirs.projectId || null,
      root: dirs.projectRoot,
      bufferDir: dirs.bufferDir,
      articlesDir: dirs.articlesDir,
    });
  }

  for (const source of sources) {
    if (!fs.existsSync(source.bufferDir)) continue;
    const bufferFiles = fs.readdirSync(source.bufferDir)
      .filter((f) => f.startsWith("session-") && f.endsWith(".md"))
      .sort();

    for (const bf of bufferFiles) {
      const bufferPath = path.join(source.bufferDir, bf);
      const sessionId = path.basename(bf, ".md");
      let raw;
      try { raw = fs.readFileSync(bufferPath, "utf-8"); } catch (_) { continue; }
      const turnCount = (raw.match(/<!-- turn:/g) || []).length;
      if (turnCount === 0) continue;

      let publishedSlug = null;
      const articlePath = path.join(source.articlesDir, `${sessionId}.md`);
      if (fs.existsSync(articlePath)) {
        try {
          const article = store.readMarkdownFile(articlePath);
          publishedSlug = articleSlug({ id: sessionId, data: article.data, _project: source.projectId });
        } catch (_) {}
      }

      sessions.push({
        projectId: source.projectId,
        sessionId,
        bufferPath,
        content: raw,
        turnCount,
        publishedSlug,
      });
    }
  }

  return sessions;
}

function liveSessionSlug(session) {
  const base = String(session.sessionId)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const project = session.projectId;
  if (!project) return base;
  return `${slugText(project)}--${base}`;
}

function renderLiveSessionPage(session) {
  const title = `Live: ${session.sessionId}`;
  const project = session.projectId || "";
  const bodyHtml = escapeHtmlTagsOutsideCode(session.content)
    .replace(/<!--\s*turn:[\s\S]*?-->/g, renderTurnMarker)
    .trim();

  const publishedLink = session.publishedSlug
    ? `<a href="/articles/generated/${session.publishedSlug}">查看已发布文章</a>`
    : "";

  return `---
title: "${escapeFrontmatterString(title)}"
echo:
  sessionId: ${session.sessionId}
  projectId: ${project ? `"${escapeFrontmatterString(project)}"` : "null"}
  live: true
  published: ${session.publishedSlug ? "true" : "false"}
  turnCount: ${session.turnCount}
---

# ${title}

<div class="echo-live-badge">
  <span class="echo-live-dot"></span>
  LIVE · ${session.turnCount} turns · 有更新时自动刷新
  ${publishedLink}
</div>

<EchoLiveSession
  project-id="${escapeHtml(project)}"
  session-id="${escapeHtml(session.sessionId)}"
  published="${session.publishedSlug ? "true" : "false"}"
  published-slug="${escapeHtml(session.publishedSlug || "")}"
/>

${bodyHtml}
`;
}

function renderLiveSessionsIndex(sessions) {
  if (sessions.length === 0) {
    return `# Live Sessions

暂无正在进行的 AI 会话。开始一个新的 AI 对话后，实时会话将自动出现在这里。
`;
  }

  const items = sessions.map((s) => {
    const project = s.projectId || "未归类";
    const badge = s.publishedSlug ? "已发布" : "LIVE";
    const badgeClass = s.publishedSlug ? "echo-ls-published" : "echo-ls-live";
    return `- <span class="echo-ls-badge ${badgeClass}">${badge}</span> [${s.sessionId}](./generated/${liveSessionSlug(s)}) · ${project} · ${s.turnCount} turns`;
  }).join("\n");

  return `# Live Sessions

正在进行或最近结束的 AI 会话。页面每 30 秒自动刷新。

共 ${sessions.length} 个会话。

${items}
`;
}

function loadAllArticlesAndComments() {
  const dirs = resolveDataDirs();
  const allArticles = [];
  const allComments = [];
  const sources = [];
  const seenRoots = new Set();
  let registeredProjects = [];

  function addSource(source) {
    const root = path.resolve(source.root);
    if (seenRoots.has(root)) return;
    seenRoots.add(root);
    sources.push({ ...source, root });
  }

  try {
    const { listProjects } = require("./lib/usecases/project-registry");
    registeredProjects = listProjects();
  } catch (_) {}

  if (registeredProjects.length > 0) {
    for (const p of registeredProjects) {
      addSource({
        projectId: p.projectId,
        root: p.dataRoot,
        articlesDir: path.join(p.dataRoot, "articles"),
        commentsDir: path.join(p.dataRoot, "comments"),
      });
    }
  } else {
    addSource({
      projectId: dirs.projectId || null,
      root: dirs.projectRoot,
      articlesDir: dirs.articlesDir,
      commentsDir: dirs.commentsDir,
    });
  }

  for (const source of sources) {
    const articles = store.loadArticles(source.articlesDir);
    for (const a of articles) {
      a._project = a.data.project || source.projectId || null;
    }
    allArticles.push(...articles);

    const comments = store.loadComments(source.commentsDir);
    for (const c of comments) {
      c._project = source.projectId || null;
    }
    allComments.push(...comments);
  }

  // Deduplicate by project-qualified ID (keep first occurrence)
  const seen = new Set();
  const uniqueArticles = [];
  for (const a of allArticles) {
    const key = `${a._project ?? "__none__"}:${a.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueArticles.push(a);
    }
  }

  return { articles: uniqueArticles, comments: allComments };
}

function runBuildDocs(opts = {}) {
  const docsRoot = opts.docsRoot || defaultDocsRoot();
  const paths = sitePaths(docsRoot);
  const { articles, comments } = loadAllArticlesAndComments();
  articles.sort(sortByUpdatedDesc);

  ensureSiteScaffold(docsRoot);
  cleanDir(paths.generatedArticlesDir);

  // Generate article pages
  for (const article of articles) {
    fs.writeFileSync(
      path.join(paths.generatedArticlesDir, `${articleSlug(article)}.md`),
      renderArticlePage(article, comments),
      "utf-8"
    );
  }

  // [LIVE_SESSION_DISABLED] 后期恢复时取消下面注释，并删除空数组赋值
  // const liveDir = path.join(docsRoot, "live", "generated");
  // cleanDir(liveDir);
  // const liveSessions = loadLiveSessions();
  // for (const session of liveSessions) {
  //   fs.writeFileSync(
  //     path.join(liveDir, `${liveSessionSlug(session)}.md`),
  //     renderLiveSessionPage(session),
  //     "utf-8"
  //   );
  // }
  const liveSessions = [];

  fs.writeFileSync(path.join(docsRoot, "articles", "index.md"), renderArticleIndex(articles), "utf-8");
  fs.writeFileSync(path.join(docsRoot, "tags", "index.md"), renderTagsIndex(articles), "utf-8");
  // fs.writeFileSync(path.join(docsRoot, "live", "index.md"), renderLiveSessionsIndex(liveSessions), "utf-8");
  updateHome(articles, docsRoot);
  writeSidebar(articles, liveSessions, paths.sidebarFile);

  const summary = [`${articles.length} articles`, `${comments.length} comments`];
  // if (liveSessions.length > 0) summary.push(`${liveSessions.length} live sessions`);
  console.log(`Generated VitePress docs for ${summary.join(", ")}.`);
  return { articles: articles.length, comments: comments.length, liveSessions: 0, docsRoot };
}

if (require.main === module) {
  runBuildDocs();
}

module.exports = {
  runBuildDocs,
  displayTitle,
  loadAllArticlesAndComments,
  loadLiveSessions,
  ensureSiteScaffold,
  articleDisplayTags,
  tagAnchor,
  renderCommentsJson,
  PACKAGE_DOCS_ROOT,
  defaultDocsRoot,
  ensureRuntimeDependencies,
};
