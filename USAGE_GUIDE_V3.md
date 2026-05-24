# Echo 使用指南 V3：多项目模型 + 全功能手动验证

目标：一步步验证 Echo 从零到全部功能的完整链路——包括项目注册、hook 路由、管线、搜索、边界情况处理。

> 当前状态：Echo 未 npm 发布，开发期用 `npm link` 让系统有 `echo-mcp` 命令。
>
> 本指南用 `ECHO_HOME` 隔离到 `/tmp/echo-test`，不会污染你的真实 `~/.echo-workspace`。

## 0. 前置条件

```bash
cd /Users/vincenthuang/myNote/echo-prototype
npm install
npm link
which echo-mcp          # 应输出 echo-mcp 的路径
```

## 1. 隔离测试环境

```bash
export ECHO_HOME=/tmp/echo-test
rm -rf "$ECHO_HOME"
echo $ECHO_HOME          # /tmp/echo-test
```

验证完成后恢复：

```bash
unset ECHO_HOME
```

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `ECHO_HOME` | 全局 Echo 管理中心 | `~/.echo-workspace` |
| `ECHO_WORKSPACE` | legacy 单 workspace 覆盖 | 无 |
| `ECHO_CAPTURE` | `on` / `off` 控制捕获 | `on` |

---

## 2. 初始化基础工作区

### 2.1 创建工作区

```bash
echo-mcp init
```

期望输出：

```
Workspace: /tmp/echo-test
Created: articles, comments, session-buffer, index
echo.json: created
```

验证：

```bash
ls /tmp/echo-test
# echo.json  articles/  comments/  session-buffer/  index/
```

### 2.2 幂等性验证

```bash
echo-mcp init
```

期望输出：

```
Workspace: /tmp/echo-test
Skipped (exists): articles, comments, session-buffer, index
echo.json: skipped
```

### 2.3 全局健康检查

```bash
echo-mcp doctor
```

期望输出（关键行）：

```
  OK   Workspace: exists: /tmp/echo-test
  OK   Workspace writable: write test passed
  OK   Subdirectories: all present
  OK   echo.json: valid
  OK   Echo home: exists: /tmp/echo-test
 WARN  registry.json: missing — run echo-mcp init
 WARN  Current project: ... not registered — run echo-mcp init project
```

---

## 3. 注册项目

### 3.1 创建模拟项目

```bash
mkdir -p /tmp/echo-test/my-project
echo "# My Project" > /tmp/echo-test/my-project/ECHO_STATUS.md

mkdir -p /tmp/echo-test/my-project/sub-app
echo "# Sub App" > /tmp/echo-test/my-project/sub-app/ECHO_STATUS.md
```

### 3.2 注册主项目

```bash
cd /tmp/echo-test/my-project
echo-mcp init project
```

期望输出：

```
Project: my-project
Root: /tmp/echo-test/my-project
Data: /tmp/echo-test/projects/my-project
Registered: yes
Created: session-buffer, articles, comments, index
```

验证：

```bash
cat /tmp/echo-test/registry.json
# {"projects":{"my-project":{"root":"/tmp/echo-test/my-project","registeredAt":"..."}}}

ls /tmp/echo-test/projects/my-project
# articles/  comments/  index/  session-buffer/
```

### 3.3 幂等性验证

```bash
echo-mcp init project
```

期望输出：

```
Registered: no (already exists)
```

### 3.4 同名目录冲突

```bash
mkdir -p /tmp/echo-test/my-project-other
cd /tmp/echo-test/my-project-other
echo-mcp init project
```

期望输出：

```
Error: Project "my-project" is already registered at /tmp/echo-test/my-project —
cannot register a different path ... under the same id.
```

### 3.5 注册子项目（验证最长前缀匹配）

```bash
cd /tmp/echo-test/my-project/sub-app
echo-mcp init project
```

期望输出：

```
Project: sub-app
Registered: yes
```

### 3.6 Doctor 双层检查（注册后）

```bash
cd /tmp/echo-test/my-project/sub-app/lib/deep
echo-mcp doctor
```

期望输出中应看到：

```
  OK   registry.json: valid (2 projects)
  OK   Current project: sub-app (data: /tmp/echo-test/projects/sub-app)
  OK   Project data dirs: all present
```

再验证主项目：

```bash
cd /tmp/echo-test/my-project
echo-mcp doctor
# Current project: my-project (data: /tmp/echo-test/projects/my-project)
```

---

## 4. Hook 安装

### 4.1 预览

```bash
echo-mcp hook install claude
```

期望：列出 4 个事件和命令，最后显示 `Run with --write to apply`。

### 4.2 写入安装

**注意：这会修改 `~/.claude/settings.json`。** 如果不想改，跳过此步，第 5 节用手动管道。

```bash
echo-mcp hook install claude --write
```

期望：`Installed:` + `written to ~/.claude/settings.json`。

### 4.3 幂等性

```bash
echo-mcp hook install claude --write
```

期望：`Already installed:` + `All hooks already up to date.`

### 4.4 Hook 健康检查

```bash
echo-mcp hook doctor
```

期望：四个事件均显示 `OK`。

---

## 5. 捕获路由验证

### 5.1 公共辅助函数

贴到终端方便模拟 hook JSON：

```bash
sim_hook() {
  local event="$1" cwd="$2" sid="${3:-test-session-001}" extra="${4:-}"
  if [ -z "$extra" ]; then
    echo "{\"hook_event_name\":\"$event\",\"cwd\":\"$cwd\",\"session_id\":\"$sid\",\"prompt\":\"test prompt from V3 guide\",\"transcript_path\":\"\",\"last_assistant_message\":\"Hello from Echo V3 test\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  else
    echo "{\"hook_event_name\":\"$event\",\"cwd\":\"$cwd\",\"session_id\":\"$sid\",\"prompt\":\"test prompt\",\"transcript_path\":\"\",\"last_assistant_message\":\"test response\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",$extra}"
  fi
}
```

### 5.2 UserPromptSubmit → 已注册项目

```bash
sim_hook UserPromptSubmit /tmp/echo-test/my-project | echo-mcp hook capture
```

期望：`pending saved`

验证：

```bash
ls /tmp/echo-test/projects/my-project/session-buffer/pending/
# test-session-001.json

ls /tmp/echo-test/session-buffer/pending/ 2>/dev/null || echo "不存在，正确"
```

### 5.3 Stop → 完整 turn

```bash
sim_hook Stop /tmp/echo-test/my-project | echo-mcp hook capture
```

期望：`turn t001-t002 saved`

验证：

```bash
ls /tmp/echo-test/projects/my-project/session-buffer/
# session-2026-05-22-v1.md  session-map.txt
```

### 5.4 降级到未注册目录

```bash
sim_hook UserPromptSubmit /tmp/some-random-dir test-session-002 | echo-mcp hook capture
sim_hook Stop /tmp/some-random-dir test-session-002 | echo-mcp hook capture
```

期望：`pending saved` + `turn t001-t002 saved`

验证数据在顶层 workspace：

```bash
ls /tmp/echo-test/session-buffer/
# session-...-v1.md  session-map.txt  pending/
```

### 5.5 StopFailure

```bash
sim_hook StopFailure /tmp/echo-test/my-project "" '"error":"something went wrong"'
```

验证：

```bash
cat /tmp/echo-test/projects/my-project/session-buffer/failures.jsonl
# {"ts":"...","session_id":"test-session-001","error":"something went wrong"}
```

### 5.6 捕获关闭

```bash
ECHO_CAPTURE=off sim_hook UserPromptSubmit /tmp/echo-test/my-project | echo-mcp hook capture
echo $?   # 0, 无输出，不写文件
```

---

## 6. SessionStart 状态

### 6.1 项目内

```bash
sim_hook SessionStart /tmp/echo-test/my-project | echo-mcp hook status
```

期望：`systemMessage` 包含 `Echo (my-project):`

### 6.2 未注册

```bash
sim_hook SessionStart /tmp/some-random-dir | echo-mcp hook status
```

期望：`systemMessage` 为 `Echo:` (无项目标签)

### 6.3 无 ECHO_STATUS.md

```bash
mkdir -p /tmp/echo-test/no-status
sim_hook SessionStart /tmp/echo-test/no-status | echo-mcp hook status
```

期望：无输出，静默退出。

---

## 7. 全管线

```bash
echo-mcp convert    # 处理 buffer → 文章
echo-mcp validate   # OK — N articles, M comments
echo-mcp resolve    # N ok, 0 broken
```

---

## 8. 边界情况

### 8.1 损坏的 registry.json

```bash
echo 'not json!!!' > /tmp/echo-test/registry.json
echo-mcp doctor 2>&1
# ERR  registry.json: corrupt — backed up to .../registry.json.corrupt-...
ls /tmp/echo-test/registry.json.corrupt-*   # 备份存在
```

### 8.2 损坏的 echo.json

```bash
echo '{bad' > /tmp/echo-test/echo.json
echo-mcp doctor          # ERR  echo.json: invalid JSON
echo-mcp init            # echo.json: replaced
echo-mcp doctor          # OK   echo.json: valid
```

### 8.3 Hook-only 模式

```bash
echo-mcp hook doctor     # 只输出 hook 检查
```

---

## 9. 清理

```bash
cd ~
rm -rf /tmp/echo-test
unset ECHO_HOME
echo-mcp doctor          # 恢复检查真实环境
```

---

## 10. 完整命令清单

| 场景 | 命令 |
|------|------|
| 隔离环境 | `export ECHO_HOME=/tmp/echo-test && rm -rf "$ECHO_HOME"` |
| 初始化工作区 | `echo-mcp init` |
| 全局检查 | `echo-mcp doctor` |
| 注册项目 | `echo-mcp init project` |
| 注册项目（指定路径） | `echo-mcp init project --path /path/to/project` |
| Hook 预览 | `echo-mcp hook install claude` |
| Hook 安装 | `echo-mcp hook install claude --write` |
| Hook 检查 | `echo-mcp hook doctor` |
| 捕获（管道） | `echo '{"hook_event_name":"UserPromptSubmit","cwd":"...","session_id":"...","prompt":"..."}' \| echo-mcp hook capture` |
| 会话状态 | `echo '{"hook_event_name":"SessionStart","cwd":"..."}' \| echo-mcp hook status` |
| 转换 | `echo-mcp convert` |
| 校验 | `echo-mcp validate` |
| 解析锚点 | `echo-mcp resolve` |
| 恢复环境 | `unset ECHO_HOME` |

## 11. 架构速查

```
ECHO_HOME (默认 ~/.echo-workspace)
├── echo.json                 # 单 workspace 兼容配置
├── registry.json             # 多项目登记表
├── session-buffer/           # 未注册目录的降级 buffer
├── projects/
│   ├── my-project/           # 项目数据目录
│   │   ├── session-buffer/
│   │   │   ├── pending/
│   │   │   ├── session-*.md
│   │   │   ├── session-map.txt
│   │   │   └── failures.jsonl
│   │   ├── articles/
│   │   ├── comments/
│   │   └── index/
│   └── sub-app/
│       └── ...
└── ...

用户工程目录 (~/echo-notes)
├── echo.json                 # 轻量项目配置
├── ECHO_STATUS.md            # 进度追踪
└── (用户自己的文件)
```

## 12. 路由决策树

```
hook event → 读 data.cwd
  ↓
ECHO_CAPTURE=off? → 静默退出
  ↓
解析 ECHO_HOME → 加载 registry.json
  ↓
findProjectForPath(cwd) — 最长前缀匹配
  ↓
  匹配成功 → bufferRoot = {echoHome}/projects/{id}/
  匹配失败 → bufferRoot = {echoHome}/ (legacy fallback)
  ↓
session-buffer/ 子路径写入 bufferRoot 下
```

## 13. 快速开始：空文件夹 → 跑起来（5 分钟）

```bash
# 1. 安装 CLI
cd /Users/vincenthuang/myNote/echo-prototype
npm install
npm link                         # 让 echo-mcp 命令全局可用

# 2. 创建你的知识库目录
mkdir -p ~/echo-notes
cd ~/echo-notes

# 3. 初始化工作区
echo-mcp init

# 4. 注册项目
echo-mcp init project

# 5. 安装 hook（自动捕获对话）
echo-mcp hook install claude --write

# 6. 检查一切正常
echo-mcp doctor
```

做完后，你每次跟 Claude Code 对话都会被自动捕获到 `~/.echo-workspace/projects/echo-notes/session-buffer/`。

定期跑管线把 buffer 转成文章：

```bash
cd /Users/vincenthuang/myNote/echo-prototype
npm run all        # convert → validate → index → resolve
npm run search -- --keyword "你的关键词"
```

如果不想装 hook，也可以跳过第 5 步，先手动跑 `npm run import` 导入历史 JSONL 会话试试效果。
