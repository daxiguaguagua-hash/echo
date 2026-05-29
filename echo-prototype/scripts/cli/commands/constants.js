const { commandFor, cliNames } = require("../../lib/cli/names");

const USAGE = `${cliNames.canonicalName} — Echo knowledge forum CLI

Usage:
  ${commandFor(["hook", "capture"])}          Read hook JSON from stdin, write to session-buffer
  ${commandFor(["hook", "status"])}           Generate SessionStart status output
  ${commandFor(["hook", "install", "<provider>", "[--write]"])}  Print or apply hook config
  ${commandFor(["hook", "doctor"])}           Check hook health
  ${commandFor(["init"])}                  Create workspace, write echo.json
  ${commandFor(["init", "project", "[--path <dir>]"])}  Register project in ~/.echo-workspace/registry.json
  ${commandFor(["doctor"])}                Check overall workspace health
  ${commandFor(["migrate", "legacy-buffer", "--project <id>|--path <dir>", "[--apply]"])}  Migrate legacy session-buffer into a project
  ${commandFor(["all"])}                   Run full pipeline (convert -> validate -> index -> resolve)
  ${commandFor(["convert"])}               Run buffer -> article conversion
  ${commandFor(["validate"])}              Validate all articles and comments
  ${commandFor(["resolve"])}               Resolve all annotation anchors
  ${commandFor(["search"])}                Full-text search
  ${commandFor(["mcp"])}                   Start MCP server (stdio transport)
  ${commandFor(["capture", "on|off|status"])}  Enable, disable, or check capture status
  ${commandFor(["project", "list"])}    List all registered projects
  ${commandFor(["project", "find", "<projectId>"])}  Show project details
  ${commandFor(["tag", "list"])}    List all tags with usage counts
  ${commandFor(["tag", "add", "<article-id>", "<tag1>", "[tag2...]"])}  Add one or more tags to an article
  ${commandFor(["tag", "remove", "<article-id>", "<tag1>", "[tag2...]"])}  Remove one or more tags from an article
  ${commandFor(["tag", "rename", "<old-tag>", "<new-tag>"])}  Rename a tag across all articles
  ${commandFor(["tag", "purge", "<tag>"])}  Remove a tag from all articles
  ${commandFor(["import", "claude", "--all", "--dry-run|--apply"])}  Import Claude Code sessions
  ${commandFor(["import", "claude", "--project", "<dir>", "--as-project", "<id>"])}  Import single project
  ${commandFor(["serve"])}              Start API + VitePress dev server in background
  ${commandFor(["serve", "--foreground"])}  Start API + VitePress dev server in foreground
  ${commandFor(["refresh"])}            Refresh pipeline + docs without restarting serve
  ${commandFor(["stop"])}               Stop a running serve instance
  ${commandFor(["status", "[--json]", "[--lang <en|zh-CN>]"])}  Show Echo status overview
  ${commandFor(["mcp", "--help"])}           Show MCP setup instructions
`;

const MCP_HELP = `Echo MCP / Echo AI 访问接口

MCP is the bridge that lets AI assistants read and search your Echo archive.
MCP 是让 AI 助手读取、搜索 Echo 本地归档的桥。

What it provides / 它提供：
  search_articles    Search Echo articles / 搜索文章
  get_article        Read one article / 读取文章
  get_article_context  Read article with comments / 读取文章和评论
  list_recent        List recent articles / 最近文章
  list_tags          List tags / 标签列表
  add_tags           Add tags / 添加标签
  remove_tags        Remove tags / 移除标签
  list_projects      List registered projects / 项目列表
  get_project        Read one project / 读取项目信息

Config / 配置：

{
  "mcpServers": {
    "echo": {
      "command": "${cliNames.canonicalName}",
      "args": ["mcp"]
    }
  }
}

Verify / 验证：
  ${cliNames.canonicalName} status        Check Echo status / 查看 Echo 状态
  ${cliNames.canonicalName} doctor        Diagnose setup / 诊断配置
`;

module.exports = { USAGE, MCP_HELP };
