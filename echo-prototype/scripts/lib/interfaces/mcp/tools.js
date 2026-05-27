// Echo MCP tool definitions — schema-only, no business logic

const {
  searchArticles,
  getArticle,
  getArticleContext,
  listTags,
  listRecent,
  addTags,
  removeTags,
  listProjects,
  getProject,
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
        project: { type: "string", description: "Filter by project ID, or 'all' for all projects" },
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
  {
    name: "list_projects",
    description: "List all registered Echo projects with their root paths and registration dates.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_project",
    description: "Get details of a single registered Echo project by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project ID (e.g., mynote, echo-notes)" },
      },
      required: ["id"],
    },
  },
  {
    name: "add_tags",
    description: "Add one or more tags to an article. Tags are written back to the markdown file's YAML frontmatter. Duplicate tags are ignored.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Article ID" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to add to the article" },
      },
      required: ["id", "tags"],
    },
  },
  {
    name: "remove_tags",
    description: "Remove one or more tags from an article. Tags are written back to the markdown file's YAML frontmatter. Non-existent tags are silently ignored.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Article ID" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to remove from the article" },
      },
      required: ["id", "tags"],
    },
  },
];

const TOOL_HANDLERS = {
  search_articles: searchArticles,
  get_article: getArticle,
  get_article_context: getArticleContext,
  list_tags: listTags,
  list_recent: listRecent,
  list_projects: listProjects,
  get_project: getProject,
  add_tags: addTags,
  remove_tags: removeTags,
};

module.exports = { TOOLS, TOOL_HANDLERS };
