// Echo MCP server — JSON-RPC 2.0 over stdio
// Implements Model Context Protocol (MCP) for Echo knowledge forum

const readline = require("readline");
const { resolveDataDirs } = require("./infra/echo-paths");
const { ensureDir } = require("./infra/workspace");

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
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
// Each handler receives (args, deps) where deps = { dirs, store }

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

  // Walk backward through evolution chain with cycle detection
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

  // Current article
  evolutionChain.push({
    id: article.data.id,
    title: article.data.title || article.data.id,
    direction: null,
  });

  // Walk forward: find articles whose evolution.of points to this article
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

function createHandleRequest(deps) {
  return function handleRequest(msg) {
    const { id, method, params } = msg;

    switch (method) {
      case "initialize":
        return jsonRpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: CAPABILITIES,
          serverInfo: SERVER_INFO,
        });

      case "notifications/initialized":
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
          const result = handler(params?.arguments || {}, deps);
          const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
          return jsonRpcResult(id, {
            content: [{ type: "text", text }],
          });
        } catch (err) {
          if (err instanceof NotFoundError) {
            return jsonRpcError(id, -32002, err.message);
          }
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
  };
}

// --- Stdio transport ---

/**
 * Start the MCP server over stdio.
 *
 * @param {object} [deps]
 * @param {object} [deps.dirs]         - Pre-resolved data directories (bypass echo-paths)
 * @param {object} [deps.store]        - Markdown store implementation
 * @param {object} [deps.pathResolver] - Function (opts) => dirs (bypass echo-paths entirely)
 */
function start(deps = {}) {
  console.log = (...args) => console.error(...args);
  console.warn = (...args) => console.error(...args);
  console.info = (...args) => console.error(...args);

  const dirs = deps.dirs || (deps.pathResolver ? deps.pathResolver({}) : resolveDataDirs());
  const store = deps.store || require("./infra/markdown-store");

  const handleRequest = createHandleRequest({ dirs, store });

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

    // JSON-RPC 2.0: Request MUST be an Object
    if (msg == null || typeof msg !== "object" || Array.isArray(msg)) {
      send(jsonRpcError(null, -32600, "Invalid Request"));
      return;
    }

    try {
      const response = handleRequest(msg);
      if (response) send(response);
    } catch (err) {
      send(jsonRpcError(msg.id !== undefined ? msg.id : null, -32603, "Internal error"));
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });

  process.stderr.write("[echo-mcp] MCP server started\n");
}

module.exports = { start, createHandleRequest, NotFoundError };
