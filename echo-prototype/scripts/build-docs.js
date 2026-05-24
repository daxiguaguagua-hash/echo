const fs = require("fs");
const path = require("path");

const { resolveDataDirs } = require("./lib/infra/echo-paths");
const store = require("./lib/infra/markdown-store");
const { stripCommentSections } = require("./lib/usecases/strip-comments");

const DOCS_ROOT = path.resolve(__dirname, "../../docs");
const GENERATED_ARTICLES_DIR = path.join(DOCS_ROOT, "articles", "generated");
const SIDEBAR_FILE = path.join(DOCS_ROOT, ".vitepress", "echo-sidebar.mts");
const ARTICLE_ALIASES_FILE = path.resolve(__dirname, "../article-aliases.json");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
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
  return slug || encodeURIComponent(base).replace(/%/g, "").toLowerCase();
}

function loadArticleAliases(file = ARTICLE_ALIASES_FILE) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function displayTitle(article, aliases = {}) {
  return aliases[article.id] || article.data.title || article.id;
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
  const id = raw.match(/turn:\s*([^\s]+)/)?.[1] || "";
  const speaker = raw.match(/speaker=([^\s]+)/)?.[1] || "unknown";
  const replyTo = raw.match(/reply_to=([^\s]+)/)?.[1];
  const reply = replyTo ? ` · reply ${escapeHtml(replyTo)}` : "";
  return `\n\n<div class="echo-turn-marker"><span>${escapeHtml(speaker)}</span><small>${escapeHtml(id)}${reply}</small></div>\n\n`;
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
  return comments
    .filter((comment) => comment.target?.article_id === article.id)
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
    const reply = comment.reply_to ? `<span>回复 ${escapeHtml(comment.reply_to)}</span>` : "";
    const content = escapeHtmlTagsOutsideCode(String(comment.content || "")).trim();
    return [
      `<section class="echo-comment">`,
      `<div class="echo-comment-head"><strong>${escapeHtml(author)}</strong><span>${escapeHtml(date)}</span>${reply}</div>`,
      `<blockquote>${escapeHtml(quote)}</blockquote>`,
      content || "_无正文_",
      `</section>`,
    ].join("\n\n");
  });

  return `## 评论区\n\n<div class="echo-comment-list">\n\n${rows.join("\n\n")}\n\n</div>`;
}

function renderArticlePage(article, comments, aliases) {
  const title = displayTitle(article, aliases);
  const tags = Array.isArray(article.data.tags) ? article.data.tags : [];
  const participants = Array.isArray(article.data.participants)
    ? article.data.participants.map((p) => p.id || p.role).filter(Boolean).join(", ")
    : "";
  const created = normalizeDate(article.data.created_at);
  const updated = normalizeDate(article.data.updated_at);
  const summary = article.data.summary || "";
  const tagHtml = tags.length
    ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")
    : "<span>未标记</span>";

  return `---
title: "${escapeFrontmatterString(title)}"
---

# ${title}

<div class="echo-meta-grid">
  <div><strong>创建</strong><span>${escapeHtml(created || "-")}</span></div>
  <div><strong>更新</strong><span>${escapeHtml(updated || "-")}</span></div>
  <div><strong>参与者</strong><span>${escapeHtml(participants || "-")}</span></div>
  <div><strong>ID</strong><span>${escapeHtml(article.id)}</span></div>
</div>

<div class="echo-tags">${tagHtml}</div>

${summary ? `<p class="echo-summary">${escapeHtml(summary)}</p>` : ""}

${renderBody(article)}

---

${renderComments(article, comments)}
`;
}

function renderArticleIndex(articles, aliases) {
  const rows = articles.map((article) => {
    const title = displayTitle(article, aliases);
    const summary = article.data.summary || "无摘要";
    const updated = normalizeDate(article.data.updated_at || article.data.created_at);
    const tags = Array.isArray(article.data.tags) ? article.data.tags : [];
    const tagHtml = tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || "<span>未标记</span>";
    return `<a class="echo-article-card" href="./generated/${articleSlug(article)}">
  <strong>${escapeHtml(title)}</strong>
  <small>${escapeHtml(updated || "-")}</small>
  <p>${escapeHtml(summary)}</p>
  <div class="echo-tags">${tagHtml}</div>
</a>`;
  });

  return `# 文章

共 ${articles.length} 篇 Echo 文章。

<div class="echo-article-grid">

${rows.join("\n\n")}

</div>
`;
}

function collectTags(articles) {
  const map = new Map();
  for (const article of articles) {
    const tags = Array.isArray(article.data.tags) ? article.data.tags : [];
    for (const tag of tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(article);
    }
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function renderTagsIndex(articles, aliases) {
  const groups = collectTags(articles);
  const sections = groups.map(([tag, taggedArticles]) => {
    const links = taggedArticles
      .map((article) => `- [${displayTitle(article, aliases)}](/articles/generated/${articleSlug(article)})`)
      .join("\n");
    return `## ${tag} (${taggedArticles.length})\n\n${links}`;
  });

  return `# 标签

共 ${groups.length} 个标签，来自 ${articles.length} 篇文章。

<div class="echo-tag-cloud">

${groups.map(([tag, taggedArticles]) => `<a href="#${encodeURIComponent(tag).toLowerCase()}">${escapeHtml(tag)}<span>${taggedArticles.length}</span></a>`).join("\n")}

</div>

${sections.join("\n\n")}
`;
}

function renderHomeArticles(articles, aliases) {
  return articles.slice(0, 6).map((article) => {
    const title = displayTitle(article, aliases);
    const date = normalizeDate(article.data.updated_at || article.data.created_at);
    return `- [${title}](/articles/generated/${articleSlug(article)}) · ${date}`;
  }).join("\n");
}

function updateHome(articles, aliases) {
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

${renderHomeArticles(articles, aliases)}
`;
  fs.writeFileSync(path.join(DOCS_ROOT, "index.md"), home, "utf-8");
}

function writeSidebar(articles, aliases) {
  const items = articles.slice(0, 30).map((article) => {
    const title = displayTitle(article, aliases);
    return `            { text: ${JSON.stringify(title)}, link: '/articles/generated/${articleSlug(article)}' }`;
  }).join(",\n");

  const sidebar = `export const articleSidebar = [
  {
    text: '文章列表',
    items: [
      { text: '全部文章', link: '/articles/' },
      {
        text: '最近文章',
        collapsed: false,
        items: [
${items}
        ],
      },
    ],
  },
]
`;
  fs.writeFileSync(SIDEBAR_FILE, sidebar, "utf-8");
}

function runBuildDocs() {
  const dirs = resolveDataDirs();
  const articles = store.loadArticles(dirs.articlesDir).sort(sortByUpdatedDesc);
  const comments = store.loadComments(dirs.commentsDir);
  const aliases = loadArticleAliases();

  cleanDir(GENERATED_ARTICLES_DIR);
  for (const article of articles) {
    fs.writeFileSync(
      path.join(GENERATED_ARTICLES_DIR, `${articleSlug(article)}.md`),
      renderArticlePage(article, comments, aliases),
      "utf-8"
    );
  }

  fs.writeFileSync(path.join(DOCS_ROOT, "articles", "index.md"), renderArticleIndex(articles, aliases), "utf-8");
  fs.writeFileSync(path.join(DOCS_ROOT, "tags", "index.md"), renderTagsIndex(articles, aliases), "utf-8");
  updateHome(articles, aliases);
  writeSidebar(articles, aliases);

  console.log(`Generated VitePress docs for ${articles.length} articles and ${comments.length} comments.`);
}

if (require.main === module) {
  runBuildDocs();
}

module.exports = { runBuildDocs, loadArticleAliases, displayTitle };
