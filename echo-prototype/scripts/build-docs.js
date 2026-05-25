const fs = require("fs");
const path = require("path");

const { resolveDataDirs } = require("./lib/infra/echo-paths");
const store = require("./lib/infra/markdown-store");
const { stripCommentSections } = require("./lib/usecases/strip-comments");

const DOCS_ROOT = path.resolve(__dirname, "../../docs");
const GENERATED_ARTICLES_DIR = path.join(DOCS_ROOT, "articles", "generated");
const SIDEBAR_FILE = path.join(DOCS_ROOT, ".vitepress", "echo-sidebar.mts");

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

function displayTitle(article) {
  return article.data.alias || article.data.title || article.id;
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

function echoClientScript() {
  return `<script>
(function() {
  if (typeof document === 'undefined') return;
  var API = 'http://127.0.0.1:8787';
  var articleId = 'ARTICLE_ID_PLACEHOLDER';

  // --- Check if serve is running ---
  function checkServe() {
    fetch(API + '/api/capture').then(function(r) { return r.json(); }).then(function(d) {
      var el = document.getElementById('echo-serve-status');
      if (el) el.style.display = 'none';
      initCapture(d.enabled);
    }).catch(function() {
      var el = document.getElementById('echo-serve-status');
      if (el) el.style.display = 'block';
    });
  }

  // --- Capture toggle ---
  function initCapture(enabled) {
    var btn = document.getElementById('echo-capture-btn');
    if (!btn) return;
    btn.textContent = enabled ? '\\u6536\\u96c6: \\u5f00' : '\\u6536\\u96c6: \\u5173';
    btn.className = enabled ? 'echo-btn echo-btn-on' : 'echo-btn echo-btn-off';
    btn.onclick = function() {
      fetch(API + '/api/capture', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({enabled: !enabled}) })
        .then(function(r) { return r.json(); }).then(function(d) { initCapture(d.enabled); });
    };
  }

  // --- MCP config ---
  var mcpBtn = document.getElementById('echo-mcp-btn');
  if (mcpBtn) mcpBtn.onclick = function() {
    fetch(API + '/api/mcp-config').then(function(r) { return r.json(); }).then(function(d) {
      var cfg = JSON.stringify({mcpServers:{echo:{command:d.canonical.command,args:d.canonical.args}}}, null, 2);
      var modal = document.getElementById('echo-mcp-modal');
      var pre = document.getElementById('echo-mcp-config');
      if (pre) pre.textContent = cfg;
      if (modal) modal.style.display = 'flex';
    });
  };
  var closeModal = document.getElementById('echo-mcp-close');
  if (closeModal) closeModal.onclick = function() {
    document.getElementById('echo-mcp-modal').style.display = 'none';
  };
  var copyBtn = document.getElementById('echo-mcp-copy');
  if (copyBtn) copyBtn.onclick = function() {
    var pre = document.getElementById('echo-mcp-config');
    navigator.clipboard.writeText(pre.textContent).then(function() {
      copyBtn.textContent = '\\u5df2\\u590d\\u5236';
      setTimeout(function() { copyBtn.textContent = '\\u590d\\u5236'; }, 1500);
    });
  };

  // --- Text selection comment ---
  var selPopup = document.getElementById('echo-sel-popup');
  document.addEventListener('mouseup', function(e) {
    var sel = window.getSelection();
    var text = sel.toString().trim();
    if (text.length > 2 && text.length < 500) {
      var r = sel.getRangeAt(0);
      var rect = r.getBoundingClientRect();
      selPopup.style.display = 'block';
      selPopup.style.top = (window.scrollY + rect.bottom + 8) + 'px';
      selPopup.style.left = (window.scrollX + rect.left) + 'px';
      selPopup.dataset.quote = text;
    } else {
      selPopup.style.display = 'none';
    }
  });
  document.getElementById('echo-sel-comment').onclick = function() {
    var quote = selPopup.dataset.quote;
    var comment = prompt('\\u8bc4\\u8bba "' + quote.slice(0, 60) + '...":');
    if (!comment) return;
    fetch(API + '/api/comments', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({articleId:articleId, quote:quote, comment:comment}) })
      .then(function(r) { return r.json(); }).then(function() { location.reload(); })
      .catch(function(e) { alert('\\u8bc4\\u8bba\\u5931\\u8d25: ' + e.message); });
    selPopup.style.display = 'none';
  };

  // --- Bottom comment ---
  var submitBtn = document.getElementById('echo-comment-submit');
  if (submitBtn) submitBtn.onclick = function() {
    var ta = document.getElementById('echo-comment-input');
    var comment = ta.value.trim();
    if (!comment) return;
    fetch(API + '/api/comments', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({articleId:articleId, comment:comment, scope:'article'}) })
      .then(function(r) { return r.json(); }).then(function() { location.reload(); })
      .catch(function(e) { alert('\\u8bc4\\u8bba\\u5931\\u8d25: ' + e.message); });
  };

  checkServe();
})();
</script>`;
}

function renderArticlePage(article, comments) {
  const title = displayTitle(article);
  const tags = Array.isArray(article.data.tags) ? article.data.tags : [];
  const participants = Array.isArray(article.data.participants)
    ? article.data.participants.map((p) => p.id || p.role).filter(Boolean).join(", ")
    : "";
  const created = normalizeDate(article.data.created_at);
  const updated = normalizeDate(article.data.updated_at);
  const summary = article.data.summary || "";
  const project = article.data.project || article._project || "";
  const tagHtml = tags.length
    ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")
    : "<span>未标记</span>";

  const projectMeta = project ? `<div><strong>项目</strong><span>${escapeHtml(project)}</span></div>` : "";

  return `---
title: "${escapeFrontmatterString(title)}"
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

${renderBody(article)}

---

${renderComments(article, comments)}

<div class="echo-toolbar">
  <div id="echo-serve-status" style="display:none; color:var(--vp-c-danger-1); font-size:13px; padding:8px 0;">
    API 服务未运行 — 运行 <code>echoctl serve</code> 以启用交互功能
  </div>
  <div class="echo-toolbar-btns">
    <button id="echo-capture-btn" class="echo-btn">收集: --</button>
    <button id="echo-mcp-btn" class="echo-btn">MCP 配置</button>
  </div>
</div>

<div id="echo-mcp-modal" class="echo-modal" style="display:none;">
  <div class="echo-modal-content">
    <h3>MCP 配置</h3>
    <p>将此 JSON 添加到你的 Claude/Codex MCP 配置文件中：</p>
    <pre id="echo-mcp-config"></pre>
    <div class="echo-modal-btns">
      <button id="echo-mcp-copy" class="echo-btn">复制</button>
      <button id="echo-mcp-close" class="echo-btn">关闭</button>
    </div>
  </div>
</div>

<div id="echo-sel-popup" class="echo-sel-popup" style="display:none;">
  <button id="echo-sel-comment" class="echo-btn">评论选中文字</button>
</div>

<div class="echo-comment-box">
  <h3>发表评论</h3>
  <textarea id="echo-comment-input" placeholder="对整篇文章的评论..." rows="3"></textarea>
  <button id="echo-comment-submit" class="echo-btn">提交评论</button>
</div>

${echoClientScript().replace('ARTICLE_ID_PLACEHOLDER', article.id)}
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

function renderArticleIndex(articles) {
  const projects = collectProjects(articles);
  const hasProjects = projects.length > 1;

  const filterNav = hasProjects ? `<nav class="echo-project-filter">
  <button class="echo-filter-btn active" data-project="all">全部 (${articles.length})</button>
${projects.map((p) => {
    const label = p.projectId || "默认";
    return `  <button class="echo-filter-btn" data-project="${escapeHtml(p.projectId || "__none__")}">${escapeHtml(label)} (${p.count})</button>`;
  }).join("\n")}
</nav>
` : "";

  const filterScript = hasProjects ? `
<script>
(function() {
  const btns = document.querySelectorAll('.echo-filter-btn');
  const cards = document.querySelectorAll('.echo-article-card');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      btns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      const project = btn.getAttribute('data-project');
      cards.forEach(function(card) {
        if (project === 'all' || card.getAttribute('data-project') === project || (project === '__none__' && !card.getAttribute('data-project'))) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
})();
</script>
` : "";

  const rows = articles.map((article) => {
    const title = displayTitle(article);
    const summary = article.data.summary || "无摘要";
    const updated = normalizeDate(article.data.updated_at || article.data.created_at);
    const tags = Array.isArray(article.data.tags) ? article.data.tags : [];
    const tagHtml = tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || "<span>未标记</span>";
    const projectAttr = article._project ? ` data-project="${escapeHtml(article._project)}"` : "";
    return `<a class="echo-article-card" href="./generated/${articleSlug(article)}"${projectAttr}>
  <strong>${escapeHtml(title)}</strong>
  <small>${escapeHtml(updated || "-")}</small>
  <p>${escapeHtml(summary)}</p>
  <div class="echo-tags">${tagHtml}</div>
</a>`;
  });

  return `# 文章

共 ${articles.length} 篇 Echo 文章。

${filterNav}
<div class="echo-article-grid">

${rows.join("\n\n")}

</div>
${filterScript}
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

function renderTagsIndex(articles) {
  const groups = collectTags(articles);
  const sections = groups.map(([tag, taggedArticles]) => {
    const links = taggedArticles
      .map((article) => `- [${displayTitle(article)}](/articles/generated/${articleSlug(article)})`)
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

function renderHomeArticles(articles) {
  return articles.slice(0, 6).map((article) => {
    const title = displayTitle(article);
    const date = normalizeDate(article.data.updated_at || article.data.created_at);
    return `- [${title}](/articles/generated/${articleSlug(article)}) · ${date}`;
  }).join("\n");
}

function updateHome(articles) {
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
  fs.writeFileSync(path.join(DOCS_ROOT, "index.md"), home, "utf-8");
}

function writeSidebar(articles) {
  const items = articles.slice(0, 30).map((article) => {
    const title = displayTitle(article);
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

function loadAllArticlesAndComments() {
  const dirs = resolveDataDirs();
  const allArticles = [];
  const allComments = [];

  // Current project / default workspace
  const articles = store.loadArticles(dirs.articlesDir);
  for (const a of articles) {
    a._project = a.data.project || dirs.projectId || null;
  }
  allArticles.push(...articles);

  const comments = store.loadComments(dirs.commentsDir);
  for (const c of comments) {
    c._project = dirs.projectId || null;
  }
  allComments.push(...comments);

  // Registered projects
  try {
    const { listProjects } = require("./lib/usecases/project-registry");
    const projects = listProjects();
    for (const p of projects) {
      if (p.projectId === dirs.projectId) continue;
      const pArticlesDir = path.join(p.dataRoot, "articles");
      const pCommentsDir = path.join(p.dataRoot, "comments");
      const pArticles = store.loadArticles(pArticlesDir);
      const pComments = store.loadComments(pCommentsDir);
      for (const a of pArticles) {
        a._project = a.data.project || p.projectId;
      }
      for (const c of pComments) {
        c._project = p.projectId;
      }
      allArticles.push(...pArticles);
      allComments.push(...pComments);
    }
  } catch (_) {}

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

function runBuildDocs() {
  const { articles, comments } = loadAllArticlesAndComments();
  articles.sort(sortByUpdatedDesc);

  cleanDir(GENERATED_ARTICLES_DIR);
  for (const article of articles) {
    fs.writeFileSync(
      path.join(GENERATED_ARTICLES_DIR, `${articleSlug(article)}.md`),
      renderArticlePage(article, comments),
      "utf-8"
    );
  }

  fs.writeFileSync(path.join(DOCS_ROOT, "articles", "index.md"), renderArticleIndex(articles), "utf-8");
  fs.writeFileSync(path.join(DOCS_ROOT, "tags", "index.md"), renderTagsIndex(articles), "utf-8");
  updateHome(articles);
  writeSidebar(articles);

  console.log(`Generated VitePress docs for ${articles.length} articles and ${comments.length} comments.`);
}

if (require.main === module) {
  runBuildDocs();
}

module.exports = { runBuildDocs, displayTitle };
