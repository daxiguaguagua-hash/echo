# MCP 安装与 AI 访问端到端验证

日期：2026-05-25

## 背景

Echo 的网页已经提供 MCP 配置入口，`echoctl serve` 也会返回 `/api/mcp-config`。下一步要验证的不是 MCP server 单元测试，而是真实用户路径：

```mermaid
flowchart LR
  A["echoctl serve"] --> B["VitePress 页面"]
  B --> C["复制 MCP 配置"]
  C --> D["AI 客户端安装 MCP"]
  D --> E["AI 调用 Echo MCP tools"]
  E --> F["访问文章/标签/评论"]
```

目标是确认：当 Echo 作为 npm 包安装、用户工作区在另一个路径时，AI 仍能通过项目给出的 MCP 配置访问到正确的 Echo 数据。

## 核心问题

| 问题 | 要验证的结果 |
|------|--------------|
| npm 包路径和工作区路径分离 | MCP 从当前用户 Echo home / project registry 读数据，不依赖包内 `docs/` |
| 网页给出的配置是否可用 | `/api/mcp-config` 返回的 canonical 配置能直接安装到 AI 客户端 |
| AI 是否真的能访问 Echo | AI 能调用 MCP tools 并读到当前项目文章 |
| 功能是否完整 | 搜索、按 ID 读取、上下文、标签、最近文章、标签增删都可用 |
| 失败时是否可诊断 | 配置错误、PATH 找不到、工作区未初始化时有明确错误 |

## 测试对象

### 服务端入口

- `echoctl serve`
- `GET /api/mcp-config`
- `echoctl mcp`
- 兼容别名：`echo-mcp mcp`

### MCP tools

| Tool | 验证内容 |
|------|----------|
| `list_recent` | 能列出最近文章，数量和网页文章列表一致 |
| `search_articles` | 能按关键词查到文章，返回来源信息 |
| `get_article` | 能按 article id 读取完整文章 |
| `get_article_context` | 能读取文章 + 相关评论/上下文 |
| `list_tags` | 能列出标签及计数 |
| `add_tags` | 能给文章 frontmatter 添加标签 |
| `remove_tags` | 能移除刚添加的测试标签 |

## 推荐验证流程

1. 从任意非仓库目录启动：

   ```sh
   echoctl serve
   ```

2. 打开 VitePress 页面，点击 MCP 配置入口，复制 canonical 配置。
3. 在另一个 AI 客户端中安装这份 MCP 配置。
4. 让 AI 执行以下查询：

   ```text
   请通过 Echo MCP 列出最近 5 篇文章。
   请搜索包含 "VitePress" 的文章。
   请读取其中一篇文章的完整内容。
   请列出当前 Echo 标签。
   请给刚才那篇文章添加标签 "mcp-e2e-test"，再移除它。
   ```

5. 回到网页刷新，确认标签变更不会污染文章正文，只改 frontmatter。
6. 跑本地管线：

   ```sh
   echoctl all
   ```

## 验收标准

- AI 客户端安装网页复制出的 MCP 配置后，无需手写路径即可连接成功。
- `initialize` 返回 `serverInfo.name === "echo-mcp"`，版本号和 `/api/status` 一致。
- `list_recent` 至少能看到网页文章列表中的文章。
- `search_articles`、`get_article`、`get_article_context` 返回内容正确。
- `add_tags` / `remove_tags` 只修改 frontmatter，不修改文章正文。
- 从非 npm 包目录启动也能访问同一批工作区文章。
- 安装失败时，用户能从 `echoctl doctor` 或 MCP 错误信息定位问题。
- `npm test`、`npm run all` 通过。

## 需要补的自动化

| 层级 | 建议测试 |
|------|----------|
| API | `GET /api/mcp-config` 返回 canonical + legacy + serverInfo |
| CLI | `echoctl mcp` 可从临时 Echo home 初始化并响应 JSON-RPC |
| E2E | 用子进程模拟 AI 客户端，按 MCP JSON-RPC 调用 7 个 tools |
| Browser | MCP 配置按钮展示内容和 API 返回一致 |

## 风险

| 风险 | 处理 |
|------|------|
| AI 客户端找不到 `echoctl` | 配置里需要说明 PATH 要求，或提供绝对路径 fallback |
| npm 包未全局安装 | 文档区分 `npm link`、全局安装、`npx` 三种模式 |
| 标签写入会影响真实文章元数据 | E2E 使用唯一测试标签，并在最后清理 |
| 多项目 registry 路由不明确 | 明确测试从已注册项目目录和普通目录启动的行为差异 |

## 不做

- 不让 AI 修改文章正文。
- 不把 MCP 配置自动写入用户 AI 客户端配置文件。
- 不要求 fork 或改造 VitePress。
- 不把网页 API 和 MCP server 合并成同一个长驻进程。
