# Echo 进度表

最后更新：2026-05-24 (VitePress 真实文章展示已实现)

## 已完成

- [x] **Hook 捕获系统** — UserPromptSubmit + Stop + StopFailure 三事件，实时写入 `~/.echo-workspace/session-buffer/`
- [x] **Buffer → 文章转换** — `convert.js` 解析 turn 标记、提取参与者、生成 frontmatter
- [x] **数据验证** — `validate.js`：ID 唯一性、必填字段、evolution.of 引用完整性、循环检测
- [x] **评论区自动生成** — `index.js`：扫描 `comments/` → 按 target.article_id 写入文章底部
- [x] **锚点解析** — `resolve.js`：quote + prefix/suffix/occurrence → 文章内定位，支持去歧义
- [x] **CLI 评论工具** — `annotate.js`：一行命令选中原文、写评论、自动计算锚点元数据
- [x] **数据管线** — `npm run all` 一键跑通 convert → validate → index → resolve
- [x] **Frontmatter 规范** — id、type、target、anchor、author、evolution 字段定义完成
- [x] **样本数据** — 10 篇文章 + 9 条评论，锚点全部解析通过
- [x] **历史会话一次性导入** — `import-sessions.js`：扫描 25 个 JSONL，导入 5 个有意义会话（52~11 turns），过滤掉本地命令/空会话
- [x] **工作区系统** — 默认 `~/.echo-workspace/`，`resolveWorkspace()` 统一路径解析（env > config > default）。Hook 已迁移，全管线通过。设计文档：`~/.gstack/projects/echo-prototype/vincenthuang-unknown-design-20260520-073813.md`
- [x] **捕获开关** — `ECHO_CAPTURE` env > `echo.json` capture_enabled > 默认开启。SessionStart 通知显示状态和切换命令。设计文档：`~/.gstack/projects/myNote/vincenthuang-main-design-20260520-084113.md`
- [x] **全文搜索** — `search.js`：关键词搜索 + 标签过滤 + 结果带来源和上下文片段。`npm run search -- --keyword "xxx" --tag "yyy"`
- [x] **格式对齐** — convert.js 和 import-sessions.js 统一到 ECHO_FORMAT.md（5 项差异全部修复，管线通过）
- [x] **共享格式模块** — `scripts/lib/echo-format.js`：JSON 样板 + 单序列化器。convert.js 132→77 行，import-sessions.js 255→185 行。详见 `issues/003-shared-article-renderer.md`
- [x] **可配置 speaker 名** — `ECHO_USER_SPEAKER` / `ECHO_AI_SPEAKER` 环境变量，默认 `vincent` / `ai`。DEFAULT_SPEAKERS 可覆盖
- [x] **工程边界改造说明** — 已整理 `ENGINEERING_BOUNDARIES.md`，明确测试、workspace、hook、legacy buffer、npm 发布边界
- [x] **测试用例第一阶段** — 新增 `node:test`，覆盖 `echo-format`、`anchor`、`workspace` 路径解析边界；`npm run verify` 通过
- [x] **工程骨架搭建** — 目录分层 `bin/` `scripts/cli/` `lib/domain/` `lib/usecases/` `lib/infra/` `lib/hooks/`；lib 文件迁移到对应层；所有 require 路径更新
- [x] **CLI 入口** — `bin/echo-mcp.js`：子命令路由（hook capture/status/install/doctor、init、doctor、migrate、convert、validate、resolve、search）
- [x] **Hook capture Node 化** — `lib/hooks/capture.js`：替代 188 行 bash 脚本，stdin → UserPromptSubmit/Stop/StopFailure 三事件处理，AUQ 检测，capture 开关
- [x] **Hook status Node 化** — `lib/hooks/status.js`：替代 94 行 bash+python 脚本，解析 ECHO_STATUS.md → SessionStart additionalContext + systemMessage
- [x] **配置模块** — `lib/infra/config.js`：`isCaptureEnabled()` 统一 capture 开关逻辑，`getSpeakers()` 统一 speaker 配置
- [x] **最小拆分 CLI/usecase/domain/infra** — annotate.js 去重（复用 anchor.js），validate.js 校验规则 → `lib/domain/validation.js`，convert.js 解析逻辑 → `lib/usecases/convert-buffer.js`。Codex review 通过。23 测试全绿，管线通过。
- [x] **hook 行为验证** — SessionStart 通知在本会话确认正常工作（`SessionStart:startup hook success`），issues/002-hook-verification.md 已过时
- [x] **markdown-store 抽取** — `lib/infra/markdown-store.js`：7 个导出（listMarkdownFiles、readMarkdownFile、loadArticles、loadArticleById、loadComments、indexArticles、nextAnnotationId）；`lib/usecases/strip-comments.js`。5 个 CLI 脚本净减 116 行重复代码。Codex 两轮 review 发现并修复 4 个 bug（ID 覆盖、路径丢失、错误吞咽、扫描不一致）。
- [x] **markdown-store 测试** — `test/markdown-store.test.js`：15 个用例，覆盖 listMarkdownFiles、readMarkdownFile、loadArticles (strict/non-strict)、loadArticleById、loadComments、indexArticles、nextAnnotationId、stripCommentSections。全部用临时目录不碰真实数据。Codex 编写初版，修复了两处测试干扰问题（gray-matter/js-yaml 同进程内同 fixture 二次抛异常行为不一致）。38 测试全绿，管线通过。
- [x] **CLI 命令实现** — `echo-mcp init`、`echo-mcp hook install claude [--write]`、`echo-mcp doctor`、`echo-mcp hook doctor`。三个 usecase（init-workspace、install-claude-hook、run-doctor）+ 19 新增测试。Codex 两轮 review：设计审查 + 测试覆盖率审查。60 测试全绿，管线通过。
- [x] **空文件夹启动指南** — 新增 `USAGE_GUIDE_V2.md`，说明源码目录 vs 工作区、开发期 `npm link`、自定义 workspace 默认指针、hook 安装、首条数据捕获、管线、搜索和批注闭环。`npm run all` 已通过。
- [x] **项目目录模型边界** — 根据 USAGE_GUIDE_V2 的”人类用户备注”，在 `ENGINEERING_BOUNDARIES.md` 明确两层模型：用户工程目录（如 `~/echo-notes`）与全局 Echo home（`~/.echo-workspace`）分离；新增 `resolveEchoHomePath()`、`projectIdFromPath()`、`resolveProjectDataRoot()` 及 workspace 测试边界。
- [x] **Project registry 第一阶段** — `lib/usecases/project-registry.js`：`loadRegistry`、`saveRegistry`、`registerProject`（幂等，同名冲突抛错）、`findProjectForPath`（最长前缀匹配）。`echo-mcp init project [--path <dir>]` 命令。`run-doctor` 扩展 Echo home、registry.json、当前项目注册、项目数据目录检查。15 测试，79 全绿，管线通过。
- [x] **hook 项目路由** — `capture.js`：去掉模块级路径常量，`resolveBufferRoot()` 根据 cwd 查 registry → 匹配则写入 `projects/<project-id>/session-buffer/`，未匹配降级到 `~/.echo-workspace/session-buffer/`。`status.js`：SessionStart 输出加入当前项目名和数据目录。Code Reviewer 审查了 registry，发现并修复 2 项 blocker（同名目录碰撞检测 + 损坏 JSON 备份）。79 测试全绿，管线通过。
- [x] **MCP server 第一阶段** — `scripts/lib/mcp-server.js`：JSON-RPC 2.0 over stdio，实现 5 个工具（`search_articles`、`get_article`、`get_article_context`、`list_tags`、`list_recent`）。零外部 MCP 依赖，纯 Node stdlib。CLI：`echo-mcp mcp` / `npm run mcp`。`markdown-store.loadComments` 新增 `content` 字段。79 测试全绿，管线通过。
- [x] **Hook installer/doctor P2 修复** — nested hook 命令改为全量扫描；旧格式 `{ command }` 才迁移，nested entry 原样保留，避免覆盖同 entry 里的其他命令。新增 3 个回归测试，`npm test` 106 全绿，`npm run all` 通过。

## 进行中

- [x] **MCP Phase 1 重构** (2026-05-23) — 3 个 P0 全部修复：
  1. 路径统一: `infra/echo-paths.js` — `resolveDataDirs(opts)` 统一解析，支持 DI 和 project registry
  2. 错误模型: `NotFoundError` — not-found 走 JSON-RPC error (-32002) 通道
  3. 依赖注入: `createHandleRequest(deps)` + `start(deps)` — 测试直接传 dirs/store，零 env hack
  Codex 审查: GATE PASS (初版 3 P1 + 3 P2 已全部修复)
  新增 4 测试 (limit clamping, forward evolution, NotFoundError export)
  102 测试全绿，管线通过
  📄 **设计讨论记录**: [session-2026-05-23](/Users/vincenthuang/.echo-workspace/articles/session-2026-05-23.md) (20 turns)
  - 重构路线: Phase 1 路径统一+注入 → Phase 2 MCP 分层 (interfaces/mcp/ + usecases/)
- [x] **MCP Phase 2 分层** (2026-05-23) — mcp-server.js 拆为 4 层：
  - `domain/errors.js` — NotFoundError
  - `usecases/query-articles.js` — 5 个工具处理函数（纯业务逻辑）
  - `interfaces/mcp/tools.js` — TOOLS schema + TOOL_HANDLERS 映射
  - `interfaces/mcp/server.js` — JSON-RPC dispatcher + stdio transport
  - `scripts/lib/mcp-server.js` — 向后兼容 re-export
  Codex 审查: GATE PASS，无 P1，依赖图单向无环，逻辑机械保留
  103 测试全绿，管线通过
- [x] **capture 开关命令** — `echo-mcp capture on|off|status`，写入 echo.json 的 `capture_enabled` 字段

## 待做

### 核心功能
- [x] **标签管理** — MCP tools `add_tags` / `remove_tags`, CLI `echo-mcp tag add|remove|list`, persisted to YAML frontmatter. 7 新测试, 113 全绿.

### 展示层
- [x] **VitePress 骨架** — `docs/` 目录、`.vitepress/config.mts`、首页文章列表、示例文章、`docs:dev/build/preview` 脚本，构建通过
- [x] **文章模板** (2026-05-24) — `scripts/build-docs.js` 从 Echo articles/comments 生成 VitePress 页面；首页最近文章、文章列表、标签聚合、真实文章详情、评论区卡片和侧边栏均自动生成；转义原始 XML/HTML 片段避免 Vue 编译失败。Browser 已验证文章列表、真实文章、评论区、标签页；`npm test` 113 全绿，`npm run all` 和 `npm run docs:build` 通过。
- [ ] **进化链 UI** — 文章底部评论区展示，回复链可视化

### 编辑
- [ ] **标签/摘要编辑** — 网页端改 frontmatter 字段，写回 MD
- [ ] **剪贴板导入脚本** — `paste-to-md.sh`（macOS 优先）

### 工程
- [ ] **Git 仓库初始化** — `git init` + `.gitignore`（排除 `.echo-buffer/`、`node_modules/`）
- [ ] **SessionEnd hook** — 清理残留 pending、从 transcript 补漏
- [x] **项目本地管线 CLI** (2026-05-24) — 新增 `echo-mcp all` 从任意注册项目目录运行完整管线 (convert → validate → index → resolve)；所有管线脚本 (convert/validate/index/resolve/search/annotate/import-sessions) 统一走 `resolveDataDirs()` 按 cwd 匹配 project registry；新增 `run-pipeline.js` usecase；doctor 识别 Echo 内部数据目录并提示修复命令。113 测试全绿，`npm run all` 通过。设计文档：[issues/004-project-local-pipeline-cli.md](issues/004-project-local-pipeline-cli.md)
- [x] **Project registry** — `registry.json` schema、登记/读取 usecase、重复登记幂等和路径缺失测试
- [x] **init project 命令** — 新增 `echo-mcp init project [--path <dir>]`：全局 `~/.echo-workspace/registry.json` 登记项目，并创建 `projects/<project-id>/` 数据目录（session-buffer/、articles/、comments/、index/）
- [x] **hook 项目路由** — capture.js：去掉模块级路径常量，按 cwd 匹配 registry 写入对应项目数据目录或降级到 Echo home
- [x] **doctor 双层检查** — `echo-mcp doctor` 同时检查 Echo home、registry.json、当前项目注册、项目数据目录，避免 `~/echo-notes/` “没有任何改变”这类困惑
- [x] **npm CLI 化** — `echo-mcp init`、`hook capture/status/install/doctor` 已实现，`migrate legacy-buffer` 待实现

## 后期改进

- [ ] **持续同步** — 定期扫描新 session JSONL，自动导入 Echo
- [ ] **v2: 上下文池** — 跨文章选取片段 → 共享池 → AI 讨论合成
- [ ] **Codex 模型识别** — `extractParticipants` 从标题解析模型名，不全标为 Claude
- [ ] **turn 编号优化** — 改为只统计当前 session 文件的 turn 数
- [ ] **跨平台** — `paste-to-md.sh` 的 Windows/Linux 版本
- [ ] **npm 发包** — `npx echo-mcp` 一行启动
- [ ] **workspace.js: legacy resolveWorkspace() 双路径问题** — 当前仍兼容单 workspace 模型；下一阶段应统一到 Echo home + project registry，并保留 `ECHO_WORKSPACE` 作为 legacy/调试覆盖
- [ ] **echo-capture.sh: 单引号注入风险** — `$SESSION_FILE` 等变量直接插入 Python 单引号字符串，路径含单引号会语法错误。应通过 `json.dumps` 转义
- [ ] **echo-capture.sh: 全量加载 transcript** — `entries = [json.loads(line) for line in f]` 对长会话有内存压力。应只扫描 `last_count` 之后的新条目
- [ ] **测试临时目录未清理** — `markdown-store.test.js` 的 `tempDir()` 不删 `/tmp` 下的 fixture 目录。应在 test helper 重构时加 `t.after(() => fs.rmSync(dir, { recursive: true, force: true }))`
- [ ] **迁移清理** — 删除旧 `echo-prototype/.echo-buffer/`（已被 `~/.echo-workspace/session-buffer/` 取代）；清理 `echo-prototype/` 中已被复制到 workspace 的旧文章
- [ ] **Karpathy wiki 模式改造** — **已搁置**（2026-05-23 决定不上）。原计划：wikilink 替代 frontmatter 引用、index.md 内容目录、log.md 操作日志。
  - **替代想法**：不做内置 wiki，改为可选的 `sync-to-wiki` 桥接脚本。检测 `~/Documents/SilentBrain/` 等已有 wiki vault，Echo 的 convert/import 输出自动同步到 wiki 的 `raw/articles/` 目录。用户自己决定是否将 Echo 文章提升为 wiki 的 concept/entity 页。这样 Echo 管线不受影响，wiki 作为独立的知识精炼层存在。架构影响评估已存档于 session-2026-05-23。

## 数据来源

| 路径 | 触发方式 | 状态 |
|------|---------|------|
| 实时会话 | UserPromptSubmit + Stop hook → `~/.echo-workspace/session-buffer/` → `convert.js` | 工作中 |
| 历史 session | `~/.claude/projects/<project>/*.jsonl` → `import-sessions.js` | 已完成 |
| 手工导入 | 用户粘贴/拖拽 MD → 手动放 `docs/` | 手动 |

## 管线

```
你说 → UserPromptSubmit hook → 存 prompt
        ↓
我回 → Stop hook → 拼 turn → 写 buffer
        ↓
echo-mcp all (或 npm run all)
  → convert → 加 frontmatter → 正式文章
  → validate → 校验
  → index    → 生成评论区
  → resolve  → 验证锚点
```
