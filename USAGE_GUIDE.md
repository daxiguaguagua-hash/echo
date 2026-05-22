# Echo 使用指南（里程碑1）

从头开始，把 Echo 用起来。

## 1. 从零初始化

安装依赖后，第一步是创建工作区。

```bash
cd echo-prototype
npm install
node bin/echo-mcp.js init
```

这个命令会做三件事：
1. 在 `~/.echo-workspace/` 创建工作区根目录（可通过 `ECHO_WORKSPACE` 环境变量覆盖）
2. 创建四个子目录：`articles/`、`comments/`、`session-buffer/`、`index/`
3. 写入 `echo.json` 配置文件

```bash
# 查看工作区内容
ls ~/.echo-workspace/
# articles/  comments/  echo.json  index/  session-buffer/
```

如果工作区已经存在，`init` 会跳过而不覆盖你的数据。如果 `echo.json` 损坏了（比如手动编辑 JSON 时写错了），`init` 会自动替换为一个可用的默认配置。

> **注意**：默认工作区是 `~/.echo-workspace/`。如果你想放到别的位置，设置环境变量 `ECHO_WORKSPACE=/你的/路径`，或者在 `echo.json` 里改 `workspace` 字段。
> **人类标注**：我们这个init应该有安装选项，就像安装react那样，能够在命令行作出很多的选择。

## 2. 接入 Claude Code 捕获

Echo 通过 Claude Code 的 hook 机制自动捕获你的每一次对话。Hook 在特定事件触发时调用 Echo CLI。

### 2.1 预览配置

先看看会安装什么，不动任何文件：

```bash
node bin/echo-mcp.js hook install claude
```

输出会告诉你哪些 hook 将被添加：
```
Will install:
  UserPromptSubmit: echo-mcp hook capture
  Stop: echo-mcp hook capture
  StopFailure: echo-mcp hook capture
  SessionStart: echo-mcp hook status
```
> **人类标注**：这个“SessionStart”的显示，仍然是个老大难问题啊。

### 2.2 写入配置

确认无误后，用 `--write` 实际写入 `~/.claude/settings.json`：

```bash
node bin/echo-mcp.js hook install claude --write
```
这个命令不会覆盖你已有的其他 hook 配置，它只做 upsert：已有的 hook 不变，缺失的才添加。

如果你的 settings.json 里还有旧的 `.sh` 脚本路径，install 会检测到并提示你。

> **人类标注1**：其实这里只需要有一个像react安装过程那样的，持续的命令行配置，让大家选好了再写更好
> **人类标注2**：而且这里很让人费解：
```shell
❯ node bin/echo-mcp.js hook install claude
Will install:
  UserPromptSubmit: echo-mcp hook capture
  Stop: echo-mcp hook capture
  StopFailure: echo-mcp hook capture
  SessionStart: echo-mcp hook status

Run with --write to apply this configuration.
```
这里的最后一句，建议改为 
```shell
Run with "node bin/echo-mcp.js hook install claude --write" to apply this configuration
```
这样写清楚一些会比较好？具体你来定。


### 2.3 检查 hook 状态

```bash
node bin/echo-mcp.js hook doctor
```

你会看到每个事件（UserPromptSubmit、Stop、StopFailure、SessionStart）是否已经配置了 `echo-mcp` 命令。如果有事件还没配置，它会提示你运行 install 命令。

### 2.4 四个 hook 各干什么

| Hook 事件 | 触发时机 | Echo 做什么 |
|-----------|---------|------------|
| `UserPromptSubmit` | 你每次发消息 | 把你的 prompt 存为 pending |
| `Stop` | AI 回复完成 | 把 prompt + AI 回复拼成一个 turn，写入 session-buffer |
| `StopFailure` | AI 回复失败 | 记录失败日志到 `failures.jsonl` |
| `SessionStart` | 每次新会话启动 | 读取 `ECHO_STATUS.md`，注入项目进度到你的上下文 |

### 2.5 暂停/恢复捕获

不想被记录了？关掉：

```bash
export ECHO_CAPTURE=off
```

或者在 `~/.echo-workspace/echo.json` 里设 `"capture_enabled": false`。

恢复：`export ECHO_CAPTURE=on` 或把 `capture_enabled` 改回 `true`。

## 3. 日常采集：一次对话如何变成 buffer

整个过程是自动的，你不需要手动干预。以下是背后发生的事情：

```
1. 你输入问题 → UserPromptSubmit hook 触发
   → capture.js 把 prompt 存到 session-buffer/pending/<session-id>.json

2. AI 回复完毕 → Stop hook 触发
   → capture.js 读取 pending prompt，拼成 turn 标记（t001, t002...）
   → 追写到 session-buffer/session-YYYY-MM-DD-v1.md

3. 如果 AI 崩溃 → StopFailure hook 触发
   → capture.js 写一条失败记录到 session-buffer/failures.jsonl
```

buffer 文件长这样：

```markdown
<!-- turn: t001 speaker=vincent -->
我：帮我查一下这个 bug

<!-- turn: t002 speaker=ai reply_to=t001 -->
## ai 的回复
找到问题了，在 src/foo.js 第 42 行...
```

buffer 文件会自动累积当前会话的所有 turn。一个 buffer 文件对应一个 session。

> **注意**：buffer 不是最终文章。你需要运行 convert 命令来生成正式文章（见下一节）。

## 4. 生成与校验文章

### 4.1 一键管线

最简单的方式：跑全管线。

```bash
npm run all
```

这会依次执行：
1. **convert** — 把 `session-buffer/` 里的原始对话转成带 frontmatter 的文章
2. **validate** — 校验所有文章的 ID 唯一性、必填字段、引用完整性
3. **index** — 把批注（评论）按 `target.article_id` 写入对应文章底部
4. **resolve** — 验证所有批注的锚点（引用原文的定位是否正确）

### 4.2 单步执行

你也可以分步跑：

```bash
node bin/echo-mcp.js convert     # buffer → 文章
node bin/echo-mcp.js validate    # 数据校验
node bin/echo-mcp.js resolve     # 锚点解析
```

或者用 npm scripts：

```bash
npm run convert
npm run validate
npm run resolve
```

### 4.3 校验通过是什么样

```bash
$ npm run validate
OK — 13 articles, 9 comments

$ npm run resolve
9 ok, 0 broken, 0 needs_review, 0 ambiguous
```

如果校验不通过，validate 会打印具体的错误（哪个文件、什么问题）。

## 5. 搜索知识库

### 5.1 关键词搜索

```bash
node bin/echo-mcp search
# 交互式，输入关键词

npm run search -- --keyword "你的搜索词"
```

搜索会扫所有文章的内容和 frontmatter，返回匹配的文章 ID、标题和上下文片段。

### 5.2 按标签过滤

```bash
npm run search -- --keyword "架构" --tag "engineering"
```

前提是你的文章 frontmatter 里有 `tags:` 字段。

### 5.3 搜索结果什么样

```
Found 3 results:

[article-001] 关于工程边界设计的讨论
  ...核心链路已经跑通，主要瓶颈不是 CommonJS 或 TypeScript，而是没有测试...

[article-005] 工作区系统设计
  ...resolveWorkspace() 统一路径解析，优先级：env > config > default...
```

## 6. 给文章加批注

Echo 的批注不是独立评论，而是锚定在原文具体位置的标注。每条批注引用原文中的一个片段（quote），系统用 prefix + suffix 或 line_hint 来定位。

### 6.1 添加批注

```bash
npm run annotate -- \
  --article <article-id> \
  --quote "你要引用的原文片段" \
  --comment "你的批注内容"
```

annotate 会自动：
1. 在原文中搜索你引用的 quote
2. 计算锚点元数据（prefix、suffix、occurrence、line_hint）
3. 在 `comments/` 目录下创建一个新的批注文件（`ann-NNN.md`）
4. 把批注关联到目标文章（通过 `target.article_id`）

### 6.2 锚点是怎么定位的

批注文件里的 frontmatter 会记录：

```yaml
anchor:
  quote: "原文片段"
  prefix: "前面几个字"      # quote 前面 60 个字符
  suffix: "后面几个字"      # quote 后面 60 个字符
  occurrence: 1             # 第几次出现（如果原文中多次出现）
  line_hint: 42             # 行号（兜底）
```

`resolve` 命令会用这些信息去原文中精确定位。如果 quote 在原文中只出现一次，prefix/suffix 就能定位；如果多次出现，用 occurrence + line_hint 消歧义。

### 6.3 跑完 annotate 之后

```bash
npm run index     # 把批注写入对应文章底部
npm run resolve   # 验证所有锚点
```

## 7. 维护与排障

### 7.1 全面健康检查

```bash
node bin/echo-mcp.js doctor
```

输出示例：

```
Echo health check:

    OK  Workspace: exists: /Users/vincenthuang/.echo-workspace
    OK  Workspace writable: write test passed
    OK  Subdirectories: all present
    OK  echo.json: valid (workspace=~/.echo-workspace)
    OK  Capture: enabled
  WARN  Legacy buffer: /Users/vincenthuang/.echo-buffer exists
  WARN  Hook: UserPromptSubmit: not configured
    OK  CLI: echo-mcp is in PATH
```

### 7.2 只看 hook 状态

```bash
node bin/echo-mcp.js hook doctor
```

### 7.3 常见问题

| 症状 | 原因 | 修复 |
|------|------|------|
| `doctor` 报 Subdirectory 缺失 | `init` 没跑或目录被误删 | `echo-mcp init`（幂等，不会丢数据） |
| `doctor` 报 echo.json 无效 | 手动编辑 JSON 写错了 | `echo-mcp init`（会自动替换损坏的配置） |
| `doctor` 报 Hook 未配置 | 没安装 hook 或 settings.json 丢失 | `echo-mcp hook install claude --write` |
| `doctor` 报 Legacy buffer | 有旧版 `~/.echo-buffer` 目录 | `echo-mcp migrate legacy-buffer`（见第 8 节） |
| hook 捕获没反应 | capture 被关闭了 | 检查 `ECHO_CAPTURE` 环境变量和 `echo.json` 里的 `capture_enabled` |
| buffer 没有新 turn | Stop hook 可能没触发 | 检查 `session-buffer/debug-last-input.json` 看 hook 收到的数据 |

## 8. 迁移旧数据与导入历史

### 8.1 迁移旧版 buffer

如果你之前的版本用的是 `~/.echo-buffer/`（旧路径），可以迁移到新工作区：

```bash
node bin/echo-mcp.js migrate legacy-buffer
```

> 这个命令目前还在开发中。暂时可以手动把旧文件复制到 `~/.echo-workspace/session-buffer/legacy/`。

### 8.2 导入历史会话

Echo 可以从 Claude Code 的历史 JSONL 文件中导入过去的会话：

```bash
npm run import
```

这会扫描 `~/.claude/projects/<project>/*.jsonl`，把有实质内容（不是空会话或纯本地命令）的会话挑出来，转成 Echo 文章。

导入完成后，跑一次全管线：

```bash
npm run all
```

## 速查表

```bash
# 初始化
echo-mcp init

# hook 管理
echo-mcp hook install claude        # 预览
echo-mcp hook install claude --write # 写入
echo-mcp hook doctor                # 状态

# 文章管线
npm run all                         # 全管线
echo-mcp convert                    # buffer → 文章
echo-mcp validate                   # 校验
echo-mcp resolve                    # 锚点

# 搜索
npm run search -- --keyword "x" --tag "y"

# 批注
npm run annotate -- --article <id> --quote "..." --comment "..."

# 维护
echo-mcp doctor                     # 全面检查
echo-mcp hook doctor                # hook 检查

# 导入
npm run import                      # 从 JSONL 导入历史
echo-mcp migrate legacy-buffer      # 迁移旧 buffer
```

## 环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ECHO_WORKSPACE` | `~/.echo-workspace` | 工作区根目录（最高优先级） |
| `ECHO_CAPTURE` | `on` | hook 捕获开关（`on`/`off`） |
| `ECHO_USER_SPEAKER` | `vincent` | 你在文章中的 speaker 名 |
| `ECHO_AI_SPEAKER` | `ai` | AI 在文章中的 speaker 名 |
| `ECHO_BUFFER_DIR` | （默认在 workspace 内） | 高级调试用，不建议普通用户设置 |
