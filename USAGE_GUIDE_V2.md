# Echo 使用指南 V2：在一个空文件夹里跑起来

目标：拿到一个空文件夹，把它变成 Echo 的知识库工作区，并让 Claude Code 对话自动进入这个工作区。

> 当前状态：Echo 还没有 npm 发布，所以开发期有两种运行方式：
>
> - 推荐开发方式：在 `echo-prototype/` 里 `npm link`，让系统有 `echo-mcp` 命令
> - 保守方式：直接用 `node /path/to/echo-prototype/bin/echo-mcp.js`

## 0. 先分清两个目录

| 目录          | 作用                           | 示例                                        |
| ------------- | ------------------------------ | ------------------------------------------- |
| Echo 源码目录 | 放 CLI、脚本、测试             | `/Users/vincenthuang/myNote/echo-prototype` |
| Echo 工作区   | 放你的文章、评论、buffer、索引 | `/Users/vincenthuang/echo-notes`            |

流程图：

```text
空文件夹
  ↓ init
Echo 工作区
  ↓ hook capture
session-buffer/
  ↓ convert / validate / index / resolve
articles/ + comments/
  ↓ search / annotate
可检索、可批注的本地知识库
```

## 1. 准备 Echo CLI

进入源码目录：

```bash
cd /Users/vincenthuang/myNote/echo-prototype
npm install
```

开发期推荐把 CLI 链接到 PATH：

```bash
npm link
which echo-mcp
echo-mcp doctor
```

如果不想 `npm link`，后面所有 `echo-mcp` 都可以替换成：

```bash
node /Users/vincenthuang/myNote/echo-prototype/bin/echo-mcp.js
```

## 2. 创建一个空文件夹

例如：

```bash
mkdir -p ~/echo-notes
cd ~/echo-notes
```

此时它应该还是空的：

```bash
ls -la
```

## 3. 把空文件夹设为 Echo 工作区

### 推荐方式：写入默认指针配置

原因：Claude Code hook 不一定继承你当前终端里的 `ECHO_WORKSPACE`。所以最稳的做法是让默认配置指向你的空文件夹。

人类用户备注：我们的工具，可不可以直接创建环境变量 ECHO_WORKSPACE？

```bash
mkdir -p ~/.echo-workspace
cat > ~/.echo-workspace/echo.json <<'JSON'
{
  "workspace": "~/echo-notes",
  "capture_enabled": true
}
JSON
```

然后初始化：

```bash
cd ~/echo-notes
echo-mcp init
```

初始化后目录应该变成：

```text
~/echo-notes/
  echo.json
  articles/
  comments/
  session-buffer/
  index/
```

人类用户备注：~/echo-notes/ 这个文件夹里面没有任何改变！

### 临时方式：只在当前命令里指定

这种方式适合测试，不适合长期 hook 捕获：

```bash
cd ~/echo-notes
ECHO_WORKSPACE="$PWD" echo-mcp init
ECHO_WORKSPACE="$PWD" echo-mcp doctor
```

如果选择这种方式，以后每次跑 Echo 命令都要带上 `ECHO_WORKSPACE="$PWD"`。

人类用户备注：
我们需要好好谈谈彼此对 workspace 的看法。
在我看来，echo-note 这样的文件夹应该是用户的独立的工程！

例如：react项目工程。

然后 echo-mcp 作为这个工程的工具，应该在 .echo-workspace 里的某一个表格中，记录这个工程的路径。
同时，在 .echo-workspace 里面创建一个文件夹，专门存放发生在这个 echo-note 文件夹里面的会话，评论等等。

最后，等我们的前端页面完成了，我们就统一展示 .echo-workspace 里面所有的会话，评论记录等等。

## 4. 做健康检查

```bash
echo-mcp doctor
```

理想输出含义：

| 检查项             | 期望                  |
| ------------------ | --------------------- |
| Workspace          | 指向 `~/echo-notes`   |
| Workspace writable | OK                    |
| Subdirectories     | all present           |
| echo.json          | valid                 |
| Capture            | enabled               |
| Hook               | 如果还没安装，会 WARN |

如果 Workspace 仍然指向 `~/.echo-workspace`，说明第 3 步的默认指针没有生效，先检查：

```bash
cat ~/.echo-workspace/echo.json
cat ~/echo-notes/echo.json
```

## 5. 安装 Claude Code hook

先预览，不写文件：

```bash
echo-mcp hook install claude
```

确认后写入 `~/.claude/settings.json`：

```bash
echo-mcp hook install claude --write
```

再检查：

```bash
echo-mcp hook doctor
```

Hook 关系图：

```text
UserPromptSubmit ─┐
                  ├─ echo-mcp hook capture ─→ session-buffer/
Stop ─────────────┘

StopFailure ───────→ echo-mcp hook capture ─→ failures.jsonl

SessionStart ──────→ echo-mcp hook status ───→ 会话启动摘要
```

## 6. 产生第一条数据

开一个新的 Claude Code 会话，正常对话一轮。然后检查：

```bash
ls ~/echo-notes/session-buffer
```

你应该能看到类似：

```text
session-2026-05-21-v1.md
pending/
debug-last-input.json
```

如果没有新文件，按这个顺序排查：

| 问题           | 检查命令                     | 处理                                          |
| -------------- | ---------------------------- | --------------------------------------------- |
| hook 没装      | `echo-mcp hook doctor`       | 重新跑 `echo-mcp hook install claude --write` |
| capture 被关   | `cat ~/echo-notes/echo.json` | 确认 `capture_enabled: true`                  |
| workspace 指错 | `echo-mcp doctor`            | 修正 `~/.echo-workspace/echo.json`            |
| CLI 不在 PATH  | `which echo-mcp`             | 重新 `npm link`                               |

## 7. 把 buffer 变成文章

进入源码目录跑管线：

```bash
cd /Users/vincenthuang/myNote/echo-prototype
npm run all
```

管线做四步：

```text
session-buffer/
  ↓ npm run convert
articles/
  ↓ npm run validate
校验 frontmatter / id / 引用
  ↓ npm run index
把 comments 写入文章底部
  ↓ npm run resolve
校验批注锚点
```

然后回工作区看文章：

```bash
ls ~/echo-notes/articles
```

## 8. 搜索文章

```bash
cd /Users/vincenthuang/myNote/echo-prototype
npm run search -- --keyword "你的关键词"
```

如果你用的是临时 workspace 方式：

```bash
ECHO_WORKSPACE=~/echo-notes npm run search -- --keyword "你的关键词"
```

## 9. 给文章加批注

先找到文章 ID：

```bash
ls ~/echo-notes/articles
```

添加批注：

```bash
cd /Users/vincenthuang/myNote/echo-prototype
npm run annotate -- \
  --article <article-id> \
  --quote "原文片段" \
  --comment "你的批注"
```

写完批注后跑：

```bash
npm run index
npm run resolve
```

## 10. 最小可用命令清单

| 场景           | 命令                                                               |
| -------------- | ------------------------------------------------------------------ |
| 初始化空文件夹 | `echo-mcp init`                                                    |
| 全面检查       | `echo-mcp doctor`                                                  |
| 安装 hook      | `echo-mcp hook install claude --write`                             |
| 检查 hook      | `echo-mcp hook doctor`                                             |
| 生成文章       | `npm run all`                                                      |
| 搜索           | `npm run search -- --keyword "xxx"`                                |
| 添加批注       | `npm run annotate -- --article <id> --quote "..." --comment "..."` |

## 11. 当前限制

| 限制                           | 现状                           | 建议                                 |
| ------------------------------ | ------------------------------ | ------------------------------------ |
| npm 包未发布                   | 不能直接 `npx echo-mcp`        | 开发期用 `npm link`                  |
| 自定义 workspace 指针不够直观  | `init` 不会自动写默认指针      | 手动写 `~/.echo-workspace/echo.json` |
| `migrate legacy-buffer` 未实现 | CLI 只提示 not yet implemented | 暂时手动复制旧 buffer                |
| MCP server 未完成              | 只能用 CLI 搜索、查看          | 等 `search_articles` 等工具实现      |

## 12. 推荐的一次性脚本

把下面的 `~/echo-notes` 改成你想要的空文件夹：

```bash
cd /Users/vincenthuang/myNote/echo-prototype
npm install
npm link

mkdir -p ~/echo-notes
mkdir -p ~/.echo-workspace
cat > ~/.echo-workspace/echo.json <<'JSON'
{
  "workspace": "~/echo-notes",
  "capture_enabled": true
}
JSON

cd ~/echo-notes
echo-mcp init
echo-mcp doctor
echo-mcp hook install claude --write
echo-mcp hook doctor
```

完成后：

```text
新 Claude Code 对话
  ↓
自动写入 ~/echo-notes/session-buffer/
  ↓
在 echo-prototype 跑 npm run all
  ↓
生成 ~/echo-notes/articles/
```
