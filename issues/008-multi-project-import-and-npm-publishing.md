# Issue 008: 多项目导入 & npm 发布就绪

**日期**: 2026-05-25
**来源**: Claude (DeepSeek) + Codex (OpenAI) 跨模型审查
**状态**: 设计完成，待实施

---

## 背景

本次对话中，Claude 和 Codex 联合审查了 Echo 工作区的 18 个文件、管线行为、registry 状态和 Claude Code 的会话存储结构。审查触发了对"多项目导入"和"npm 发布"两条路径的深度评估。

## Part A: 多项目导入

### 用户场景（真实度评估）

| 步骤 | 真实度 | 判断 |
|------|--------|------|
| 用户从 npm 下载 Echo | 6/10 | 当前 `"private": true`，未发布 |
| 按文档完成初始化 | 7/10 | init 流程存在但缺少 onboarding 文档 |
| 用户想导入所有历史对话 | 9/10 | Echo 的核心价值主张 |
| 扫描全局文件夹找到项目路径 | 7/10 | 数据在，但路径编码不可靠 |

### 当前 importer 的问题

| # | 问题 | 严重度 | 详情 |
|---|------|--------|------|
| 1 | **硬编码单目录** | P0 | `import-sessions.js` 默认只读 `~/.claude/projects/-Users-vincenthuang-myNote`，无法扫描全部 |
| 2 | **无 import manifest** | P0 | 无 session id -> article id 映射，重复运行会 `writeFileSync` 覆盖已存在文章，违反不可变原则 |
| 3 | **多项目归属错乱** | P0 | 当前 importer 的 `project` 来自 cwd/registry，全量导入时所有历史会话会被归到同一个 Echo project |
| 4 | **template-conversation.md 污染** | P0 | 有合法 frontmatter (`id: TEMPLATE-ID`)，被管线计为第 17 篇文章 |
| 5 | **Claude 私有格式依赖** | P1 | `~/.claude/projects/` 目录名编码规则 (`/` -> `-`) 不可靠，是 Claude Code 实现细节而非公开 API |
| 6 | **无 dry-run** | P1 | 没有预览模式，用户无法在写入前看到将要导入什么 |
| 7 | **系统会话无过滤** | P1 | `claude-mem-observer-sessions` 的 420 个系统会话会和用户项目混在一起 |
| 8 | **时区硬编码** | P2 | `+08:00` 硬编码，跨时区用户不准 |
| 9 | **speaker 硬编码** | P2 | 写死 `vincent` / `ai`，不走统一 speaker config |
| 10 | **全量读入内存** | P2 | `readFileSync(...).split("\n")` 对大型历史库有内存压力 |

### 设计决策

**命令设计:**
```bash
echoctl import claude --all --dry-run          # 预览所有项目
echoctl import claude --all --apply             # 确认后执行
echoctl import claude --project <dir> --as-project <id>  # 单项目导入
echoctl import claude --all --exclude <p1>,<p2>  # 排除指定项目
```

**架构: provider adapter 模式**
```
import/
  providers/
    claude-code.js     <- Claude Code JSONL -> Echo markdown
  manifest.js          <- import-manifest.json (session id -> article id 映射)
  scanner.js           <- 扫描 ~/.claude/projects/，列出候选目录
  importer.js          <- 编排: scan -> dry-run report -> confirm -> convert -> write-once
```

**导入数据模型:**
```yaml
source:
  provider: claude-code
  session_id: <uuid>
  source_file_hash: <sha256>
  source_project_dir: "-Users-vincenthuang-myNote"
  original_project_path:
    value: "/Users/vincenthuang/myNote"
    confidence: "inferred"       # 目录名推断，非权威
project: mynote                   # 用户确认的 Echo project
```

**关键原则:**

| 原则 | 做法 |
|------|------|
| 不信任 Claude 私有格式 | provider adapter 隔离 |
| 不假装路径可逆 | 目录名仅作 hint，用户确认映射 |
| 不重复导入 | `import-manifest.json` 记录 session id + hash + article id |
| 不覆盖文章 | 已存在 article 直接 skip |
| 先报告后写入 | 默认 dry-run |
| 系统目录可排除 | ignore list / interactive selection |
| 大文件可承受 | stream JSONL，不一次性读完整文件 |

## Part B: npm 发布就绪

### 当前阻断项

| # | 问题 | 文件 |
|---|------|------|
| 1 | `"private": true` | `package.json` |
| 2 | 包名 `echo-prototype`，应为 `echo` 或 `echoctl` | `package.json` |
| 3 | CLI 无正式 `import` 命令 | `bin/echoctl.js` |
| 4 | 无 onboarding 文档（README 面向开发者，非终端用户） | 缺 |
| 5 | bin entry 未配置为 npm global install 可用 | `package.json` |

### npm 发布 checklist

- [ ] `package.json`: 改 `private` -> `false`，确定包名
- [ ] `package.json`: 配置 `bin`、`files`、`keywords`、`engines`
- [ ] `bin/echoctl.js`: 补齐 `import` 子命令
- [ ] 用户 onboarding 文档：安装 -> 初始化 -> 首次导入 -> 日常使用
- [ ] `.npmignore` 或 `files` 字段：排除测试、issues、开发文档

## Part C: 数据清理（P0 — 阻塞后续功能）

| # | 动作 | 原因 |
|---|------|------|
| 1 | 移除 `template-conversation.md` 或让 loader 忽略它 | 当前被管线计为文章 #17 |
| 2 | 在 registry 注册 myNote 项目 | 当前 cwd 不命中 registry |
| 3 | 清理 `example.md` | 无 frontmatter，残留测试数据 |
| 4 | 给历史文章回填 `project` 字段 | 项目筛选 UI 需要数据 |

## 实施优先级（Codex + Claude 共识）

| 优先级 | 任务 | 类型 |
|--------|------|------|
| **P0** | 数据清理：template + registry + example.md | 框架修正 |
| **P1** | Import provider adapter + manifest + dry-run | 框架建设 |
| **P1** | `echoctl import` CLI 命令 | 框架建设 |
| **P2** | npm 发布准备：package.json + 文档 | 发布准备 |
| **P3** | 底部评论输入框 (已有设计) | 功能 |
| **P3** | 项目筛选视图 | 功能 |
| **P4** | 进化链 UI | 功能 |
| **P4** | AI 查询链 UI | 功能 |

## 跨模型审查记录

Claude (DeepSeek) 和 Codex (OpenAI) 在以下方面达成一致:
- 用户场景真实（9/10），但当前产品化程度低（4/10）
- P0 数据清理必须先做，否则后续功能建在脏数据上
- provider adapter 是正确的架构选择
- import manifest + write-once 是保护不可变原则的关键
- npm 发布不是紧急任务，但 package.json 的修正应该在框架建设阶段完成
