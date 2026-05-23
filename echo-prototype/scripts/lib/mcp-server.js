// Echo MCP server — JSON-RPC 2.0 over stdio
// Implements Model Context Protocol (MCP) for Echo knowledge forum

const path = require("path");
const readline = require("readline");
const store = require("./infra/markdown-store");
const { ensureDir, resolveEchoHomePath } = require("./infra/workspace");

let _dirs = null;

function getDirs() {
  if (_dirs) return _dirs;
  const echoHome = resolveEchoHomePath();
  const { findProjectForPath } = require("./usecases/project-registry");
  const project = findProjectForPath(process.cwd(), { echoHome });
  if (project) {
    _dirs = {
      articles: path.join(project.dataRoot, "articles"),
      comments: path.join(project.dataRoot, "comments"),
    };
  } else {
    _dirs = {
      articles: path.join(echoHome, "articles"),
      comments: path.join(echoHome, "comments"),
    };
  }
  return _dirs;
}

// --- JSON-RPC 2.0 ---

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    error: { code, message },
  };
}

function jsonRpcResult(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function send(response) {
  process.stdout.write(JSON.stringify(response) + "\n");
}

// --- MCP lifecycle ---

const SERVER_INFO = {
  name: "echo-mcp",
  version: "0.2.0",
};

const CAPABILITIES = {
  tools: {},
};

// --- Tool implementations ---

function searchArticles(args) {
  ensureDir(getDirs().articles);
  const keyword = (args.keyword || "").toLowerCase();
  const tag = (args.tag || "").toLowerCase();

  const articles = store.loadArticles(getDirs().articles).map((a) => ({
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

function getArticle(args) {
  ensureDir(getDirs().articles);
  const article = store.loadArticleById(getDirs().articles, args.id);
  if (!article) return { error: `Article "${args.id}" not found` };

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

function getArticleContext(args) {
  ensureDir(getDirs().articles);
  const article = store.loadArticleById(getDirs().articles, args.id);
  if (!article) return { error: `Article "${args.id}" not found` };

  // Load comments for this article
  ensureDir(getDirs().comments);
  const comments = store.loadComments(getDirs().comments).filter(
    (c) => c.target && c.target.article_id === args.id
  );

  // Load evolution chain
  let evolutionChain = [];
  const evo = article.data.evolution;
  if (evo) {
    // Walk backward to find origin
    let cursor = evo;
    while (cursor && cursor.of) {
      const prev = store.loadArticleById(getDirs().articles, cursor.of);
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
    // Add current
    evolutionChain.push({
      id: article.data.id,
      title: article.data.title || article.data.id,
      direction: null,
    });
    // Walk forward
    const allArticles = store.loadArticles(getDirs().articles);
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

function listTags() {
  ensureDir(getDirs().articles);
  const articles = store.loadArticles(getDirs().articles);
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

function listRecent(args) {
  ensureDir(getDirs().articles);
  const limit = Math.min(args.limit != null ? parseInt(args.limit, 10) : 20, 100);

  const articles = store.loadArticles(getDirs().articles);
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

// --- Tool definitions ---

const TOOLS = [
  {
    name: "search_articles",
    description: "Full-text search across Echo articles. Supports keyword search in body text and tag filtering.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Keyword to search in article body (case-insensitive)" },
        tag: { type: "string", description: "Filter by tag (case-insensitive)" },
      },
    },
  },
  {
    name: "get_article",
    description: "Retrieve a single article by its ID with full content.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Article ID (e.g., article-ai-dialogue)" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_article_context",
    description: "Get article with its comments, evolution chain, and metadata. Use this when exploring how ideas connect across articles.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Article ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_tags",
    description: "List all tags in the Echo workspace with usage counts.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_recent",
    description: "List recently created articles, ordered by creation date.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Maximum number of articles to return (default: 20, max: 100)" },
      },
    },
  },
];

const TOOL_HANDLERS = {
  search_articles: searchArticles,
  get_article: getArticle,
  get_article_context: getArticleContext,
  list_tags: listTags,
  list_recent: listRecent,
};

// --- Request dispatcher ---

function handleRequest(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return jsonRpcResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: CAPABILITIES,
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
      // No response needed for notifications
      return null;

    case "tools/list":
      return jsonRpcResult(id, { tools: TOOLS });

    case "tools/call": {
      const toolName = params?.name;
      const handler = TOOL_HANDLERS[toolName];
      if (!handler) {
        return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
      }
      try {
        const result = handler(params?.arguments || {});
        // Convert result to MCP content format
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return jsonRpcResult(id, {
          content: [{ type: "text", text }],
        });
      } catch (err) {
        return jsonRpcError(id, -32000, `Tool error: ${err.message}`);
      }
    }

    case "ping":
      return jsonRpcResult(id, {});

    default:
      if (id !== undefined) {
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
      }
      return null;
  }
}

// --- Stdio transport ---

function start() {
  // Suppress console output — MCP uses stdout for JSON-RPC
  console.log = (...args) => console.error(...args);
  console.warn = (...args) => console.error(...args);
  console.info = (...args) => console.error(...args);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send(jsonRpcError(null, -32700, "Parse error"));
      return;
    }

    const response = handleRequest(msg);
    if (response) send(response);
  });

  rl.on("close", () => {
    process.exit(0);
  });

  process.stderr.write("[echo-mcp] MCP server started\n");
}

module.exports = { start, handleRequest };
