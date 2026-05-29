# Echo — 本地优先的 AI 对话知识论坛

Echo 把 Claude Code / AI 编程会话捕获成 Markdown 文章，并提供本地网页用于浏览、搜索、打标签和评论。

核心原则：**文章正文不可变**。AI 对话一旦转成文章，就作为源记录保存；后续整理通过标签、评论、标注和派生内容完成。

> **状态：开发中，未发布 npm。** 当前通过 `npm link` 使用开发版。

## 当前使用方式

> [!TIP]
> **AI 时代的安装方法：**可以将当前页面交给 AI，让它帮你安装和配置 Echo。

### 1. 安装开发版 CLI

```bash
cd echo-prototype
npm install
npm link
```

确认命令可用：

```bash
echoctl --version
```

### 2. 在你的项目目录初始化

每个要被 Echo 收集的文件夹都需要注册一次。未注册目录里的对话会落到 legacy buffer，不会自动显示在网页"项目"分组里。

```bash
cd ~/your-project

echoctl init              # 初始化工作区
echoctl init project      # 注册当前目录为 Echo 项目
echoctl doctor            # 检查配置是否正确
```

### 3. 安装 Claude Code hook

```bash
echoctl hook install claude --write
echoctl hook doctor
```

之后你在已注册项目目录里和 AI 聊天，hook 会把会话写入：

```text
~/.echo-workspace/projects/<project-id>/session-buffer/
```

### 4. 导入历史会话（可选）

如果项目目录在安装 Echo 之前已经有 Claude 对话记录：

```bash
echoctl import claude --all --dry-run    # 预览
echoctl import claude --all --apply      # 确认导入
```

### 5. 启动本地网页

```bash
echoctl serve
```

`serve` 默认后台运行，启动时自动跑管线。启动后打开浏览器访问显示的 Docs 地址即可浏览文章。

### 6. 日常命令

| 命令 | 用途 |
|---|---|
| `echoctl serve` | 后台启动本地网页和 API |
| `echoctl serve --foreground` | 前台启动，方便调试 |
| `echoctl stop` | 停止后台服务 |
| `echoctl status` | 查看 Echo 全面状态 |
| `echoctl doctor` | 诊断配置问题 |
| `echoctl capture status` | 查看是否正在收集 AI 聊天记录 |
| `echoctl capture on` | 开启收集 |
| `echoctl capture off` | 关闭收集 |
| `echoctl project list` | 查看已注册项目 |
| `echoctl project find <id>` | 查看项目详情 |
| `echoctl all` | 手动跑完整管线 |
| `echoctl refresh` | 不重启 serve 刷新页面 |
| `echoctl search -- --keyword "关键词"` | 全文搜索文章 |
| `echoctl tag list` | 查看标签 |
| `echoctl tag add <article-id> <tag>` | 给文章加标签 |
| `echoctl tag remove <article-id> <tag>` | 移除标签 |
| `echoctl tag rename <old> <new>` | 重命名标签 |
| `echoctl tag purge <tag>` | 删除标签 |
| `echoctl import claude --all --dry-run` | 预览历史会话导入 |
| `echoctl migrate legacy-buffer --apply` | 迁移 legacy buffer |

## 数据模型

### Live session vs 正式文章

Echo 区分两种页面状态：

| 类型 | 说明 | 刷新方式 |
|---|---|---|
| **Live session** | 仍在增长中的会话，从 buffer 实时渲染 | 前端心跳自动检测更新 |
| **正式文章** | 显式发布后的快照，正文不可变 | 不会自动覆盖 |

正在聊天的内容通过 live session 页面查看；会话结束或决定发布时，才转为不可变的正式文章。

### 空文件夹不会自动变成项目

如果你新建一个空文件夹后直接聊天，但没有执行 `echoctl init project`，会话会降级写入 `~/.echo-workspace/session-buffer/`，不会自动出现在网页项目列表里。

## MCP（AI 访问接口）

MCP 是让 AI 助手读取、搜索 Echo 本地归档的桥。当前支持 9 个工具：

| 工具 | 用途 |
|---|---|
| `search_articles` | 全文搜索文章 |
| `get_article` | 读取单篇文章 |
| `get_article_context` | 读取文章及其评论 |
| `list_recent` | 最近文章列表 |
| `list_tags` | 标签列表 |
| `add_tags` / `remove_tags` | 添加/移除标签 |
| `rename_tag` / `purge_tag` | 重命名/删除标签 |
| `list_projects` / `get_project` | 项目列表/详情 |

配置方法（添加到 AI 工具的 MCP 设置中）：

```json
{
  "mcpServers": {
    "echo": {
      "command": "echoctl",
      "args": ["mcp"]
    }
  }
}
```

## 数据目录

```text
~/.echo-workspace/
  registry.json
  .serve.json
  .serve.log
  session-buffer/             # 未注册目录的 legacy fallback
  projects/
    <project-id>/
      session-buffer/         # hook 写入的实时会话
      articles/               # 正式文章 (.md)
      comments/               # 文内标注评论
      index/                  # 搜索索引
  .site/                      # serve 生成的 VitePress 站点
```

## 开发

在 `echo-prototype/` 下：

```bash
cd echo-prototype

npm test
npm run all
npm run docs:generate
```

## 更多文档

- [USAGE_GUIDE_V3.md](USAGE_GUIDE_V3.md) — 多项目模型与全功能手动验证
- [ENGINEERING_BOUNDARIES.md](ENGINEERING_BOUNDARIES.md) — 工程边界和路径模型
- [ECHO_STATUS.md](ECHO_STATUS.md) — 当前进度和已知问题
