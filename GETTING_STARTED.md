# Echo 五分钟上手指南

目标：5 分钟内从零看到自己的 AI 对话出现在本地网页上。

## 前提

- macOS（目前仅支持 macOS）
- Node.js ≥ 18
- Claude Code 已安装并配置

## 1. 安装 Echo（1 分钟）

```bash
cd echo-prototype
npm install
npm link

echoctl --version   # 应输出 0.1.0
```

## 2. 注册你的项目（1 分钟）

进入你日常和 AI 聊天的项目目录：

```bash
cd ~/your-project

echoctl init              # 初始化 Echo 工作区
echoctl init project      # 告诉 Echo "这个目录归我管"
echoctl doctor            # 确认一切正常
```

## 3. 安装 Hook（30 秒）

Hook 让 Echo 在你和 AI 聊天时自动捕获会话：

```bash
echoctl hook install claude --write
```

之后在这个目录下和 AI 聊天，Echo 就会自动记录。

## 4. 导入旧对话（可选，1 分钟）

如果这个项目之前已经和 AI 聊了很多，想把历史会话也导入：

```bash
echoctl import claude --all --dry-run    # 先预览，看看会导入什么
echoctl import claude --all --apply      # 确认后执行
```

## 5. 启动网页（30 秒）

```bash
echoctl serve
```

浏览器打开显示的 Docs 地址（通常是 `http://127.0.0.1:5173/`），就能看到你的 AI 对话文章了。

## 6. 日常使用

聊完天后，网页会自动更新 live session 页面。想把某个会话"发布"为正式文章，在文章页点击底部的**发布最新快照**按钮。

| 我想要... | 命令 |
|---|---|
| 看网页 | `echoctl serve` |
| 关网页 | `echoctl stop` |
| 看全部状态 | `echoctl status` |
| 暂停记录 | `echoctl capture off` |
| 继续记录 | `echoctl capture on` |
| 搜索文章 | `echoctl search -- --keyword "关键词"` |
| 给文章打标签 | `echoctl tag add <文章id> <标签>` |
| 看所有标签 | `echoctl tag list` |
| 手动刷新页面 | `echoctl refresh` |

## 7. 让 AI 也能读你的 Echo

在 Claude Code / Codex 的 MCP 配置中添加：

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

之后 AI 就能搜索和阅读你的 Echo 归档了。

## 常见问题

**Q: 为什么我的项目在网页上看不到？**

A: 必须先 `echoctl init project` 注册。未注册目录的对话会进入 legacy buffer，不会自动显示。

**Q: 正在聊天的内容网页上看不到？**

A: 查看 live session 页面（侧边栏的 Live 入口）。正式文章需要手动发布才会生成。

**Q: 怎么卸载？**

A: `echoctl hook install claude --write` 会覆盖 hook 配置（空写会清掉）。然后删除 `~/.echo-workspace/` 和 `npm unlink echoctl`。

## 下一步

- [README.md](README.md) — 完整功能列表
- [USAGE_GUIDE_V3.md](USAGE_GUIDE_V3.md) — 多项目模型和完整验证流程
- [ENGINEERING_BOUNDARIES.md](ENGINEERING_BOUNDARIES.md) — 数据目录和路径模型
