# 004 - 项目本地管线 CLI 改造

## 背景

当前 Echo 已经有两层目录模型：

```text
用户项目目录
  /Users/vincenthuang/echo-notes
        |
        | cwd 匹配 registry.json
        v
Echo 数据目录
  ~/.echo-workspace/projects/echo-notes/
    session-buffer/
    articles/
    comments/
    index/
```

hook 捕获已经按 `cwd` 匹配 `registry.json`，能把会话写入项目数据目录：

```text
Claude 会话 cwd = ~/echo-notes
        |
        v
~/.echo-workspace/projects/echo-notes/session-buffer/
```

但管线入口仍然是开发期命令：

```bash
cd /Users/vincenthuang/myNote/echo-prototype
npm run all
```

这对真实用户不成立，因为用户只知道自己在 `~/echo-notes`，不应该知道 Echo 源码目录在哪里。

## 现状问题

| 问题 | 当前行为 | 用户感受 |
|------|----------|----------|
| 管线入口偏开发者 | `npm run all` 必须在源码包内执行 | 用户在项目目录里无命令可跑 |
| 路径解析不一致 | hook/MCP 已走 project registry，部分脚本仍读 legacy workspace 常量 | buffer 写到项目目录，convert 可能读不到 |
| CLI 缺少聚合命令 | 有 `echo-mcp convert/validate/resolve/search`，没有 `echo-mcp all` | 用户要么不知道顺序，要么回到 npm |
| 数据目录暴露过早 | 用户容易 `cd ~/.echo-workspace/projects/echo-notes` | 把 Echo 内部数据目录误认为知识库目录 |

## 目标体验

真实用户只需要在自己的项目目录执行 Echo 命令：

```bash
cd ~/echo-notes
echo-mcp init
echo-mcp init project
echo-mcp hook install claude --write
echo-mcp capture on

# 对话后
echo-mcp all
echo-mcp search -- --keyword "关键词"
```

期望数据流：

```text
~/echo-notes
   |
   | echo-mcp all
   v
registry 最长前缀匹配
   |
   v
~/.echo-workspace/projects/echo-notes/
   |-- session-buffer/  -> convert
   |-- articles/        -> validate/index/resolve/search
   |-- comments/
   `-- index/
```

## 设计决定

### 1. `echo-mcp all` 成为用户入口

新增命令：

```bash
echo-mcp all
```

等价执行：

```text
convert -> validate -> index -> resolve
```

失败策略：

| 阶段 | 失败后是否继续 | 原因 |
|------|----------------|------|
| convert | 否 | 文章生成失败，后续没有可信输入 |
| validate | 否 | 数据不合法，index/resolve 会产生误导 |
| index | 否 | 评论区写入失败，需要先修 |
| resolve | 否 | 锚点失败要显式暴露 |

### 2. 所有管线脚本统一走 `resolveDataDirs()`

当前 `capture.js` 和 MCP 已经按项目解析目录；管线脚本也要统一：

| 脚本 | 现在 | 改造后 |
|------|------|--------|
| `convert.js` | `workspace.js` legacy 常量 | `resolveDataDirs({ cwd })` |
| `validate.js` | `workspace.js` legacy 常量 | `resolveDataDirs({ cwd })` |
| `index.js` | `workspace.js` legacy 常量 | `resolveDataDirs({ cwd })` |
| `resolve.js` | `workspace.js` legacy 常量 | `resolveDataDirs({ cwd })` |
| `search.js` | 需要检查 | `resolveDataDirs({ cwd })` |
| `annotate.js` | 需要检查 | `resolveDataDirs({ cwd })` |

原则：`ECHO_WORKSPACE` 继续保留为 legacy/debug 覆盖，但日常路径选择应优先使用：

```text
ECHO_HOME + registry.json + 当前 cwd
```

### 3. 把管线抽成 usecase，CLI 和 npm 共享

建议新增：

```text
scripts/lib/usecases/run-pipeline.js
```

接口：

```js
runPipeline({
  cwd,
  steps: ["convert", "validate", "index", "resolve"],
  dirs,
  logger,
})
```

CLI：

```text
echo-mcp all        -> runPipeline({ cwd: process.cwd() })
echo-mcp convert    -> runPipeline({ steps: ["convert"] })
echo-mcp validate   -> runPipeline({ steps: ["validate"] })
```

npm scripts 保留：

```bash
npm run all
```

但它只是开发者兼容入口，不再是用户文档里的主路径。

### 4. `doctor` 要给出下一步命令

当用户在数据目录运行 `doctor`：

```text
~/.echo-workspace/projects/echo-notes
```

应提示这是 Echo 内部数据目录，不是项目根目录：

```text
WARN Current directory is an Echo data directory.
Use the registered project root instead:
  cd /Users/vincenthuang/echo-notes
```

当 capture 关闭：

```text
WARN Capture: disabled
Run:
  echo-mcp capture on
```

## 实施步骤

### Phase 1 - 路径统一

- [ ] 修改 `convert.js`、`validate.js`、`index.js`、`resolve.js` 使用 `resolveDataDirs()`
- [ ] 补测试：在注册项目 cwd 下，管线读写 `projects/<id>/...`
- [ ] 补测试：未注册 cwd 降级到 Echo home legacy 目录

### Phase 2 - 聚合命令

- [ ] 新增 `scripts/lib/usecases/run-pipeline.js`
- [ ] 新增 `echo-mcp all`
- [ ] 新增 `echo-mcp pipeline` 或先不加，避免命令面过宽
- [ ] 更新 `bin/echo-mcp.js` usage

### Phase 3 - 用户引导

- [ ] `doctor` 识别 Echo 内部数据目录
- [ ] `doctor` 对 capture disabled 给出修复命令
- [ ] 更新 `USAGE_GUIDE_V3.md`
- [ ] 更新 `ECHO_STATUS.md` 手动测试段落

## 验收用例

### 用例 1：真实用户目录

```bash
cd /Users/vincenthuang/echo-notes
echo-mcp doctor
echo-mcp all
```

期望：

```text
读取 ~/.echo-workspace/projects/echo-notes/session-buffer/
写入 ~/.echo-workspace/projects/echo-notes/articles/
```

### 用例 2：源码目录开发者兼容

```bash
cd /Users/vincenthuang/myNote/echo-prototype
npm run all
```

期望：仍可跑通，不破坏现有开发流程。

### 用例 3：误入数据目录

```bash
cd ~/.echo-workspace/projects/echo-notes
echo-mcp doctor
```

期望：提示该目录是内部数据目录，并指出注册项目根目录。

### 用例 4：capture 关闭

```bash
echo-mcp capture off
cd ~/echo-notes
echo-mcp doctor
```

期望：明确提示 `echo-mcp capture on`。

## 临时绕过方案

在 `echo-mcp all` 实现前，可以从任意目录显式指定项目数据目录：

```bash
ECHO_WORKSPACE=/Users/vincenthuang/.echo-workspace/projects/echo-notes \
npm --prefix /Users/vincenthuang/myNote/echo-prototype run all
```

这只是过渡方案，不应写进最终用户主路径。

