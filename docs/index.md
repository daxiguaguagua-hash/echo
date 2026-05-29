---
layout: home

hero:
  name: "Echo"
  text: "本地优先的 AI 对话知识论坛"
  tagline: 把 AI 编程会话捕获为不可变的 Markdown 文章，支持浏览、搜索、标签、评论、MCP 访问。
  actions:
    - theme: brand
      text: 快速开始
      link: /../GETTING_STARTED.md
    - theme: alt
      text: 完整文档
      link: /../README.md

features:
  - icon: 📝
    title: 不可变归档
    details: 文章正文一旦创建即不可修改。AI 对话作为源记录永久保存，后续整理通过标签、评论、标注完成。
  - icon: 🔴
    title: Live Session 实时预览
    details: 正在聊天的内容通过 live session 页面实时查看，前端心跳自动检测更新，无需手动刷新。
  - icon: 🤖
    title: MCP AI 接口
    details: 9 个 MCP 工具让 AI 助手直接读取、搜索 Echo 本地归档，成为 AI 的长期记忆。
  - icon: 📁
    title: 多项目支持
    details: 每个项目独立管理，会话自动归入对应项目。空目录需显式注册，未注册目录降级写入 legacy buffer。
  - icon: 🔍
    title: 全文搜索
    details: 本地搜索索引，通过 CLI 或网页快速找到历史对话中的关键信息。
  - icon: 🏷️
    title: 标签管理
    details: 为文章打标签、分类整理，支持添加、移除、重命名、删除标签，构建个人知识体系。
---

## 一分钟了解 Echo

Echo 在你和 AI 聊天时自动捕获会话，转成 Markdown 文章，并在本地网页上展示。你不需要手动整理——hook 会静默工作。

**安装只需三步：**

```bash
cd echo-prototype && npm install && npm link   # 安装 CLI
echoctl init && echoctl init project            # 注册项目
echoctl hook install claude --write             # 安装捕获 hook
```

然后启动网页：

```bash
echoctl serve
```

浏览器打开显示的地址，就能看到你的 AI 对话文章了。

**核心命令速览：**

| 命令 | 用途 |
|---|---|
| `echoctl serve` | 后台启动本地网页和 API |
| `echoctl stop` | 停止后台服务 |
| `echoctl status` | 查看 Echo 全面状态 |
| `echoctl all` | 手动跑完整管线（convert → validate → index） |
| `echoctl refresh` | 不重启 serve 刷新页面 |
| `echoctl search -- --keyword "关键词"` | 全文搜索文章 |
| `echoctl tag add <id> <tag>` | 给文章加标签 |
| `echoctl project list` | 查看已注册项目 |

**MCP 接入（让 AI 读你的归档）：**

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

配置后 AI 助手即可通过 `search_articles`、`get_article`、`list_recent` 等工具访问你的 Echo 归档。

---

> **状态：开发中，未发布 npm。** 当前通过 `npm link` 使用开发版。
>
> 更多文档：[上手指南](/../GETTING_STARTED.md) · [完整 README](https://github.com/daxiguaguagua-hash/echo/blob/main/README.md) · [使用指南 V3](/../USAGE_GUIDE_V3.md) · [工程边界](/../ENGINEERING_BOUNDARIES.md) · [项目进度](/../ECHO_STATUS.md)
