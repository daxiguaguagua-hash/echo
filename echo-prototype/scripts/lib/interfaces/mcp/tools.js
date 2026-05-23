// Echo MCP tool definitions — schema-only, no business logic

const {
  searchArticles,
  getArticle,
  getArticleContext,
  listTags,
  listRecent,
} = require("../../usecases/query-articles");

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

module.exports = { TOOLS, TOOL_HANDLERS };
