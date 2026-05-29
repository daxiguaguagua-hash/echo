# Echo 进度表

最后更新：2026-05-29 (Live 页改为共享心跳 + hash 变化刷新；目标测试、docs 生成与管线通过)

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
- [x] **Codex Desktop MCP 实机安装验证** (2026-05-25) — VitePress `/api/mcp-config` 返回 canonical 配置 `{ command: "echoctl", args: ["mcp"] }`；已通过 `codex mcp add echo -- echoctl mcp` 写入 `/Users/vincenthuang/.codex/config.toml`。`codex mcp get/list` 显示 `echo` enabled；stdio JSON-RPC 验证 `initialize`、`tools/list`、`search_articles` 均成功。当前会话工具发现层未热加载 Echo，需新线程/重载后作为 Codex MCP 工具出现。
- [x] **Hook installer/doctor P2 修复** — nested hook 命令改为全量扫描；旧格式 `{ command }` 才迁移，nested entry 原样保留，避免覆盖同 entry 里的其他命令。新增 3 个回归测试，`npm test` 106 全绿，`npm run all` 通过。
- [x] **下一阶段产品架构文档** (2026-05-28) — 新增 4 份 issues 设计文档：capture 生命周期与 legacy 恢复、`echoctl status`/help/i18n、publish snapshot 版本模型、下一阶段实现交接清单。详见 [issues/017](issues/017-capture-lifecycle-and-legacy-recovery.md)、[issues/018](issues/018-echoctl-status-help-i18n.md)、[issues/019](issues/019-publish-snapshot-version-model.md)、[issues/020](issues/020-next-implementation-handoff.md)。
- [x] **Legacy 候选扫描与页面恢复** (Issue 017, 2026-05-28) — 新增 `lib/usecases/legacy-candidates.js`：按 transcript_path 和 cwd 匹配 legacy buffer 归属项目；`GET /api/legacy-candidates` 和 `POST /api/legacy-candidates/migrate` API；`EchoLegacyRecovery.vue` 弹框组件，提示用户确认迁移；前端 `echo-api.ts` 已同步。
- [x] **`echoctl status` 与 i18n 框架** (Issue 018, 2026-05-28) — 新增 `lib/usecases/status-collector.js`：汇集 serve/capture/hook/project/data/legacy/MCP 状态；`lib/i18n/` 消息层（en/zh-CN/bilingual）；`echoctl status [--json] [--lang en|zh-CN]` 命令；`echoctl mcp --help`；`echoctl --help` 中英双语。
- [x] **Publish 快照版本模型** (Issue 019, 2026-05-28) — 新增 `lib/usecases/snapshot-manifest.js`（`snapshots.json` 外部版本索引）；`POST /api/publish` 支持重复发布同一 session（新增 turn 时创建版本化 article）；不覆盖旧文章正文。
- [x] **发布入口可见性修复** (Issue 019 follow-up, 2026-05-28) — 文章页底部新增 `发布最新快照`，session 文章可直接从文章页发布当前 live buffer；`EchoLiveSession` 改用统一 `echo-api` 调用，避免从 VitePress 5173 错打 `/api/publish`。Browser 验证按钮可见，已发布文章点击后提示“已经是最新快照”。
- [x] **三轮 Codex 审计修复** (2026-05-28) — Issue 017 4 项（migrate candidateIds 过滤、completed session 回退匹配、transcript_path 编码、多项目 projectId）；Issue 018 5 项（nested hook 检测+SessionStart、i18n key 映射、MCP 计数双语、ECHO_LANG env、stale URL 隐藏）；Issue 019 4 项（serve 跳过 convert、版本号剥离 buffer 查找、manifest 原子写、loadManifest fail-closed）。管线全绿。
- [x] **发布提示跨文章状态泄漏修复** (Issue 019 follow-up, 2026-05-28) — `EchoArticleActions` 在 VitePress 客户端切换文章时清空 tag/comment/publish 临时状态，避免 `已经是最新快照` 这类提示从上一篇文章带到下一篇。Browser 复现后验证：v2 点击提示，切到 v3 后提示消失。
- [x] **未导入 Claude 历史会话发现设计** (Issue 021, 2026-05-29) — 明确区分 legacy buffer 与 Claude `.jsonl` transcript：前者是 Echo 旧路径误捕获，走 migrate；后者是 Echo 开启前/未捕获的历史会话，走 import。设计 `echoctl status`、页面空状态、API dry-run/confirm 与验收标准，详见 [issues/021](issues/021-unimported-claude-transcript-discovery.md)。
- [x] **Live 页 30 秒跳转修复** (2026-05-29) — 移除生成页 frontmatter 里的全局 `<meta http-equiv="refresh">`，改由 `EchoLiveSession` 组件在当前 Live 路径仍可见时刷新；离开 Live 页后组件卸载并清理 timer，避免浏览其他页面时被拉回。新增回归测试，`npm test` 332/332 通过，`npm run all` 通过。
- [x] **项目筛选空项目修复** (2026-05-29) — `EchoProjectTabs` 将已注册但当前 0 篇文章的项目也渲染为可选 tab，避免全局下拉框选择 `echo-notes` / `ruoyi-vue-pro` 时回退到“全部”。Browser 验证：空项目显示 0 张卡片，`mynote` 显示 21 张卡片；`npm test` 332/332 通过，`npm run all` 通过。
- [x] **注册项目自动补导入历史会话** (2026-05-29) — 新增 `importClaudeProject()` usecase，`echoctl init project` 注册后自动扫描对应 Claude transcript 目录并导入有意义会话，避免用户还要手动跑 `import claude`。已补救 `ruoyi-vue-pro`：5 条 transcript 中 1 条高质量会话导入为 `session-b8cfacc9.md`，4 条单用户回合跳过；`npm test` 333/333 通过，`npm run all` 通过。
- [x] **Live 页共享心跳与按需刷新** (2026-05-29) — Stop hook 写入 `index/live-state.json`，`GET /api/live-session-state` 返回 session hash/turnCount；前端新增单例 heartbeat，Live 页只在当前 session hash 变化时刷新，避免每 30 秒整页闪烁重置。Live 路径接入侧边栏与右侧目录，徽标文案改为“有更新时自动刷新”。

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
- [x] **文章别名优化** (2026-05-24) — 新增 `article-aliases.json`，生成 VitePress 时将 `session-2026-05-22` 展示为「幂等是什么：一次和两次为什么一样」，同步首页、文章列表、文章页和侧边栏；避免 `npm run all` 从 buffer 重建文章时覆盖别名。
- [x] **serve 文章展示修复** (2026-05-25) — 修复从已注册但暂无文章的项目目录运行 `echoctl serve` 时文章列表显示 0 篇的问题；docs 生成现在汇总「当前项目 + 全局归档 + 其他注册项目」并去重。同步修复文章详情页点击后变成 VitePress 404 的问题：交互脚本延迟到 DOM 就绪后初始化并补齐判空。Browser 验证 `http://127.0.0.1:5173/articles/` 显示 17 篇，且 `/claude-mem`、`/gstack`、`/office-hours` 三篇详情页可打开；`npm test` 122 全绿，`npm run all` 通过。
- [x] **serve runtime site 路径分离** (2026-05-25) — `echoctl serve` 不再把用户文章生成到 npm 包内 `docs/`，而是在 Echo home 下创建/刷新 `~/.echo-workspace/.site` 并从该目录启动 VitePress；repo `docs/` 只作为包内主题/模板来源和开发调试目录。新增 `runBuildDocs({ docsRoot })` 测试，确认可在包外 runtime site 生成页面。Browser 验证 runtime site `http://127.0.0.1:5174/articles/` 文章列表和详情页可打开；`npm test` 124 全绿，`npm run docs:build` 与 `npm run all` 通过。
- [x] **产品表层设计讨论** (2026-05-24) — 记录 alias 数据模型、MCP 配置复制、AI 查询链、文内评论、底部评论输入、`echoctl` 命名、网页 capture 开关、项目筛选。设计文档：[issues/005-echo-product-surface.md](issues/005-echo-product-surface.md)
- [x] **产品表层跨模型审查** (2026-05-24) — Claude 子代理独立审查了 005 设计文档。锚点漂移风险已澄清为不适用（文章正文不可变，锚点永远有效）。`echoctl serve` 是拱心石。5 项待确认全部关闭。实施顺序：echoctl → serve → alias → 评论 UI → 项目筛选 → MCP 配置 → AI 查询链。
- [x] **CLI 改名为 echoctl** — 新增 `echoctl` 主命令，保留 `echo-mcp` 兼容别名 (2026-05-24 — names.js 中央模块 + echoctl bin + echo-mcp 兼容别名)
- [x] **VitePress Vue 组件化重构** — 不 fork/改造 VitePress 源码；用官方 `enhanceApp`、默认主题 Layout slots、Vue 组件替代 `build-docs.js` 中的内联 `echoClientScript()`。设计文档：[issues/006-vitepress-vue-component-refactor.md](issues/006-vitepress-vue-component-refactor.md)
- [x] **本地网页 API / serve 模式** (2026-05-25) — `echoctl serve` 同时启动 API + VitePress；修复 `runBuildDocs()` 缺失 `docsRoot` 导致评论后重建写入包内 `docs/` 的 bug；修复 `projectId` 被当 `cwd` 用的语义错误；新增 `findProjectById`；新增 runtime site vitepress symlink；新增 9 个 serve API 测试。
- [x] **alias 数据模型** (2026-05-25) — frontmatter `alias` 已全面接入 search/MCP/build-docs；清理 `article-aliases.json` 临时文件；新增 MCP E2E 回归测试验证 alias 在 search_articles/get_article/list_recent 中可用。
- [x] **文内选区评论** (2026-05-25) — 修复 `EchoSelectionComment.vue` 只传 `quote` 缺失 `prefix/suffix/occurrence` 的问题；新增 `computeAnchor()` 从 DOM 提取完整锚点数据；`build-docs.js` 新增 `highlightAnnotations()` 在渲染时为已标注文字包裹 `<mark class="echo-highlight">`；新增 highlight CSS 样式。
- [x] **P0 数据清理** (Issue 008, 2026-05-25) — `template-conversation.md` 和 `example.md` 移出 articles/；16 篇历史文章迁移到 `projects/mynote/articles/` 并回填 `project: mynote` 字段；mynote 注册到 registry。管线 16 articles + 10 comments。
- [x] **Import provider adapter + manifest** (Issue 008, 2026-05-25) — `import/providers/claude-code.js`：JSONL 解析、噪声过滤、会话分类、元数据提取、不可变文章生成；`import/manifest.js`：导入记录防重；`import/scanner.js`：多项目扫描、路径解码、`buildImportPlan`。Codex 106 测试 + TDD 实现，251 全绿。
- [x] **`echoctl import` CLI** (Issue 008, 2026-05-25) — `echoctl import claude --all --dry-run/--apply`；`--project <dir> --as-project <id>`；`--exclude` 过滤系统目录。已接线 import 框架，dry-run 已验证。
- [x] **npm 发布准备** (Issue 008) — `echoctl@0.1.0`：包名已确定、`"private": false`、`bin`/`files`/`keywords`/`engines` 已配置、npm pack 产物 38 文件 43KB 无污染。用户 onboarding 文档后续按需补充。
- [x] **底部评论输入框** — 支持文章级评论和后续回复链扩展。作者身份从 `echo.json` 读取。详见 [issues/015-bottom-comment-input.md](issues/015-bottom-comment-input.md)
- [x] **进化链 UI** — 文章底部评论区展示，回复链可视化 (2026-05-27)
- [x] **项目筛选视图** — `EchoGlobalControls` 全局导航栏项目选择器 + `EchoProjectTabs` 文章页 tabs 双向同步（localStorage）。`/api/projects` API + `useProjectFilter` 共享状态。Dropdown 选中后文章页自动过滤该项目的文章。
- [x] **MCP 配置按钮** (2026-05-24) — `EchoArticleActions.vue` 已实现 MCP 配置弹窗和复制功能。
- [x] **MCP 安装与 AI 访问端到端验证** (2026-05-25) — 新增 `mcp-e2e.test.js`：spawn `echoctl mcp` 从临时 `ECHO_HOME`，测试真实 JSON-RPC 通信覆盖 initialize、tools/list、全部 7 个 tool（含 add_tags/remove_tags 回环和 alias 搜索）。设计文档：[issues/007-mcp-install-e2e.md](issues/007-mcp-install-e2e.md)
- [x] **搜索落点增强** (2026-05-26) — VitePress local search 点击结果后记录搜索词，文章页落地时在正文中高亮命中词，并选择离当前 hash 标题最近的命中滚入视口；仅改主题 UI 层，不改文章正文和数据管线。
- [x] **底部评论区布局修复** (2026-05-26) — `doc-bottom` 插槽中的 Echo 交互区重新约束到正文宽度，避免长文章底部评论表单和右侧 `On this page` 目录重叠；Browser 验证当前页面横向不再相交。
- [x] **serve 交互按钮恢复** (2026-05-26) — 修复 `localhost` / `127.0.0.1` 混用导致 API CORS 不匹配的问题；前端在缺少 `VITE_ECHO_API_BASE` 时默认探测 `http://127.0.0.1:8787`，避免普通 docs 页面直接降级隐藏 MCP 配置和收集开关。新增 serve API 回归测试，`npm test` 252 全绿，`npm run docs:build` 和 `npm run all` 通过。
- [x] **顶部导航高亮修复** (2026-05-26) — VitePress nav 为 `文章` / `标签` 增加 `activeMatch`，确保从首页按钮、顶部导航或文章卡片进入 `/articles/` 与 `/articles/generated/...` 后仍保持正确高亮。
- [x] **侧边栏项目分组** (2026-05-26) — 文章 sidebar 从单一“最近文章”列表调整为“全部文章 / 最近文章 / 项目”结构；项目分组按 `project` 元数据展示，如 `mynote (16)`，最近文章保留为折叠快捷入口。新增 build-docs 回归测试；Browser 验证 `http://localhost:5174/articles/` 渲染正确；`npm test` 253 全绿，`npm run docs:build` 和 `npm run all` 通过。
- [x] **标签页锚点修复** (2026-05-26) — `/tags/` 标签云不再猜测 VitePress 标题 slug，改为生成显式 `tag-...` section anchor；仅影响标签页本身，不改文章页搜索落点和 annotation anchor。新增中文标签回归测试；Browser 验证 `AI 协作` 点击后滚动到对应 section；`npm test` 254 全绿，`npm run docs:build` 和 `npm run all` 通过。
- [x] **网页标签创建** (2026-05-26) — 文章列表和文章详情页将 `project` 作为第一枚虚拟标签展示，`/tags/` 同步纳入项目标签；文章详情页新增“创建标记”输入框，调用 `/api/tags` 复用 `addTags` 写回 frontmatter 并重建站点。新增 build-docs 与 serve API 回归测试；Browser 验证标签展示与按钮可用态；`npm test` 256 全绿，`npm run docs:build` 和 `npm run all` 通过。
- [x] **标签页筛选** (2026-05-26) — `/tags/` 改为 Vue 组件 `EchoTagsPage`，点击标签后仅显示该标签对应文章，URL hash 保持可分享；选中标签使用品牌色高亮，未选中标签弱化为灰色。Browser 验证 `知识管理` 只显示 3 篇文章且样式状态正确；`npm test` 256 全绿，`npm run docs:build` 和 `npm run all` 通过。
- [x] **Turn marker 隐藏展示** (2026-05-26) — 文章页不再显示 `claude t004 · reply t003` 这类 turn marker；`build-docs.js` 改为输出隐藏 metadata 节点，保留 `data-turn-id`、`data-speaker`、`data-reply-to`，CSS 兜底隐藏旧节点。新增 build-docs 回归测试，`node --test test/build-docs.test.js` 和 `npm run docs:build` 通过。
- [x] **跨项目同 ID 文章 URL 冲突修复** (2026-05-27) — VitePress 生成文章页时改用 project-qualified slug（如 `mynote--session-2026-05-27`），避免不同项目同一 `id` 互相覆盖；侧边栏、首页、文章列表、标签页链接同步使用新 slug；评论渲染按项目过滤，避免同 ID 文章串评论。新增 build-docs 回归测试；`npm test -- test/build-docs.test.js`、`npm run all`、`npm run docs:build` 通过。
- [x] **同项目多会话文章 ID 冲突修复** (2026-05-27) — `convert-buffer` 保留 `session-YYYY-MM-DD-vN` 文件名作为文章 ID，只用日期部分写 `created_at`，避免同一项目同一天多轮会话互相覆盖。已将 `myhomeworkhelper` 的 `v1-v4` buffer 转成正式文章；Browser 验证侧边栏显示 `myhomeworkhelper (5)`。新增 convert-buffer 回归测试；`npm test -- test/convert-buffer.test.js test/build-docs.test.js`、`npm run all`、`npm run docs:generate` 通过。
- [x] **文章列表项目选项卡** (2026-05-27) — `/articles/` 新增 `EchoProjectTabs`，按文章所在项目/文件夹生成 `全部`、`mynote`、`myhomeworkhelper` 等选项卡；选项卡名就是项目名，点击后仅显示该项目文章。新增 build-docs 回归测试；`npm test -- test/build-docs.test.js` 通过。
- [x] **echoctl stop 孤立 docs 进程清理** (2026-05-27) — `serve` 状态文件新增 VitePress 子进程 PID；`echoctl stop` 在主进程已退出时会继续清理记录的子进程，并在状态文件缺失但 5173/8787 上仍有 Echo serve/VitePress 进程时识别并停止孤立进程，避免出现”docs 还在、API 已停”的半残页面。已清理本机遗留 PID 96905；`npm test -- test/serve-api.test.js test/stop-command.test.js test/build-docs.test.js` 和 `npm run all` 通过。
- [x] **serve 启动时自动运行管线** (2026-05-27) — `echoctl serve` 启动时在 `runBuildDocs()` 之前自动执行 `runPipeline({ allProjects: true, silent: true })`，确保 capture 的 buffer 自动转换为可见文章，不再需要手动跑 `npm run all`。`npm run all` 通过，`npm run docs:generate` 生成 18 篇文章。
- [x] **旧全局目录关联切断** (2026-05-27) — 网页生成在存在 registry 项目时只聚合 `projects/<project-id>/` 数据，不再把 Echo home 根目录的 legacy `articles/` 混入当前项目视图；capture 在 `cwd` 缺失或 stale 时可通过 Claude transcript 目录精确匹配 registry 项目，避免新会话继续写入 `~/.echo-workspace/session-buffer/`。新增 hook/build-docs 回归测试；旧全局目录保留为后续清理项。
- [ ] **AI 查询链 UI** — MCP 查询写入 query log，v1 先做全局最近查询日志，v2 按文章关联
- [x] **Live session 与不可变文章分层** (2026-05-28) — 正在进行的 AI 会话从 `session-buffer` 渲染 live page，30 秒自动刷新；显式 publish 后生成不可变 article（不可覆盖）。Live 页面位于 `/live/generated/<project>--<session>.md`，含 LIVE 脉冲标记、turn 计数、发布按钮和已发布文章链接。POST `/api/publish` 端点将 buffer 转为正式文章。设计记录：[issues/016-live-session-vs-immutable-article.md](issues/016-live-session-vs-immutable-article.md)

### 编辑
- [x] **全局控制入口迁移** (2026-05-28) — 新增 `EchoGlobalControls`，将 `收集 开/关` 和 `MCP` 配置入口迁移到 VitePress 顶部导航；文章页底部只保留与当前文章相关的评论/标记操作。Browser 已验证文章列表、文章详情与 MCP 弹窗。
- [x] **文章正文聊天气泡化** — 用户发言靠右、AI 回复靠左，基于隐藏 `echo-turn-marker` 在 VitePress 渲染后分组，不修改原文且不影响 search landing / annotation anchor。设计记录：[issues/010-article-chat-bubbles.md](issues/010-article-chat-bubbles.md)
- [x] **聊天气泡运行时修复** (2026-05-26) — 修复 VitePress 将隐藏 turn marker 包进空 `<p>` 后，`EchoChatBubbles` 从 `span.nextSibling` 找不到正文节点的问题；现在以 marker 所在空段落作为边界，并刷新 runtime site。Browser 验证 `session-2026-05-25` 生成 10 个气泡 turn。
- [x] **聊天气泡宽度自适应** (2026-05-26) — 气泡改为 `width: fit-content` + `max-width` 兜底，短用户消息按内容收缩，长回复仍限制在正文宽度内。
- [x] **VitePress 生成物落点修正** (2026-05-26) — `scripts/build-docs.js` 默认生成到 Echo runtime site `~/.echo-workspace/.site`，`docs:*` 脚本改为构建 runtime site；当前工程 `docs/` 仅保留主题模板和占位 Markdown，不再写入真实文章列表/标签页。
- [x] **echoctl 项目查找命令** (2026-05-27) — CLI 新增 `echoctl project list` / `echoctl project find <id>`，MCP 新增 `list_projects` / `get_project` 工具，详见 [issues/011-echoctl-list-projects-mcp-sync.md](issues/011-echoctl-list-projects-mcp-sync.md)
- [x] **多项目 pipeline 聚合** (2026-05-27) — `echoctl all` 改为对所有已注册项目运行完整管线 (convert → validate → index → resolve)；新增 `aggregate-all-projects.js` usecase；`loadAllArticlesAndComments()` 已支撑多项目网页聚合，详见 [issues/012-multi-project-web-visibility.md](issues/012-multi-project-web-visibility.md)
- [x] **代码质量修复 11 项** (2026-05-27) — Issue 009 全部关闭：readStdin 去重、UTC+8 Intl.DateTimeFormat、VitePress stdout pipe、write-comment gray-matter、静默 catch→console.error、loadArticleById Map 缓存、findFreePort 递归→while 循环、frontmatter escaping 统一（escapeFrontmatterString）、session-map `wx` 原子创建、echoctl.js 重复 require 清理。1 项暂缓：echoctl.js 拆分（565 行重构，建议单独 PR）。详见 [issues/009-code-review-findings.md](issues/009-code-review-findings.md)
- [x] **空文件夹 AUQ 端到端验证** (2026-05-27) — 在隔离空项目 `/private/tmp/echo-auq-empty-experiment/empty-project` 注册项目，模拟 `AskUserQuestion` 对话，验证 buffer → article → VitePress 页面均显示“AI 提供了以下选项”、全部选项 label/description 和“你的选择”。同时发现 `npm run docs:dev` 在自定义 `ECHO_HOME` 下仍指向 `~/.echo-workspace/.site`，需后续修复脚本路径。
- [x] **myEchoTestV1 项目注册兜底** (2026-05-27) — 异常原因：`~/myEchoTestV1` 未注册，hook 将会话写入 legacy `~/.echo-workspace/session-buffer/session-2026-05-27-v13.md`，网页项目列表只聚合已注册项目。处理：注册为 `myechotestv1`，复制已捕获 buffer 到项目数据目录，补 `session-map.txt` 与 `auq-counter.txt`，`echoctl all` 后生成 1 篇文章；浏览器验证 `/articles/` 已显示 `myechotestv1 (1)`，总数 27。
- [x] **myEchoTestV2 项目显示修复** (2026-05-28) — `~/myechotestv2` 已注册但测试对话仍写入 legacy buffer。原因是 `~/.claude/settings.json` 同时保留旧 bash hook 和新版 CLI hook，旧 `echo-capture.sh` 固定写入 `~/.echo-workspace/session-buffer/`。处理：复制 legacy buffer 到 `projects/myechotestv2/session-buffer/`，补当前 session-map，跑 `echoctl all` 生成文章，并通过 `/api/rebuild-docs` 重建网页；同时移除旧 bash hook，仅保留 `echo-mcp hook capture/status`。
- [x] **serve 自动刷新方案** (2026-05-28) — 新增 `echoctl refresh`，运行中的 serve 可通过 `/api/rebuild-docs` 执行 `runPipeline({ allProjects: true })` + `runBuildDocs()`，无需重启。`echoctl init project` 注册后会自动安排 refresh；hook 捕获 Stop 成功后也会后台触发 refresh，让新对话进入页面而不要求用户 `Ctrl+C` 重启。
- [x] **legacy buffer 迁移命令** (2026-05-28) — 新增 `echoctl migrate legacy-buffer --project <id>|--path <dir> [--apply]`，把未注册项目误入 legacy `session-buffer` 的会话迁移到项目数据目录；默认 dry-run，执行时同步 `.md`、`session-map.txt`、pending、failures 和 AUQ 计数，支持 `--overwrite` / `--move`。
- [x] **未注册目录 legacy fallback 复盘文档** (2026-05-27) — 已更新 [issues/012-multi-project-web-visibility.md](issues/012-multi-project-web-visibility.md)、[USAGE_GUIDE_V3.md](USAGE_GUIDE_V3.md)、[ENGINEERING_BOUNDARIES.md](ENGINEERING_BOUNDARIES.md)，说明“未注册目录 → 顶层 legacy buffer → 页面项目聚合不可见”的原因、调用链、现场处理记录和后续产品决策。
- [x] **echoctl serve 后台模式** (2026-05-27) — `echoctl serve` 默认后台启动 API + VitePress，输出中英文对齐提示：Docs/API/State/Log、`echoctl stop` 停止命令、`echoctl serve --foreground` 前台调试、`echoctl capture on/off` 收集开关，并显示“正在收集/已关闭 AI 聊天记录”与对应命令。保留 `--foreground` 使用原前台流程；新增格式化输出测试。
- [x] **echoctl serve 注册项目提示** (2026-05-28) — 启动摘要新增“已注册项目”列表，并明确提示新项目必须先运行 `echoctl init project --path <project-dir>` 注册，否则网页不会显示该项目的 AI 聊天记录。
- [x] **README 当前使用方式重写** (2026-05-27) — README 改为当前真实用户路径：安装方法前用醒目的 TIP 提示“AI 时代的安装方法：可以将当前页面交给 AI，让它帮你安装和配置 Echo”；`npm link` 安装开发版 CLI、`echoctl init project` 注册项目、`echoctl hook install claude --write` 安装 hook、`echoctl serve` 后台启动网页；删除过时的 npm 主流程和旧测试数量，补充未注册目录 legacy fallback 与 serve 暂无实时 watcher 的边界说明。
- [x] **创建标记表单样式重设计** (2026-05-28) — 保留原有 `postTag` 行为，将底部“创建标记”卡片改为轻量 `标记` 工具条，减少与评论区的视觉重复；Browser 移动宽度检查无横向溢出。
- [ ] **标签/摘要编辑** — 网页端改 frontmatter 字段，写回 MD
- [ ] **剪贴板导入脚本** — `paste-to-md.sh`（macOS 优先）
- [x] **未导入 Claude 历史会话提示** — Issue 021 后端完成：`discoverClaudeImportCandidates` usecase、status `transcripts` 字段、API `GET /api/import/claude-candidates` + `POST /api/import/claude`、echo-api.ts。7 新测试，331 全绿，管线通过。页面空状态 Vue 组件待后续。

### 工程
- [ ] **Git 仓库初始化** — `git init` + `.gitignore`（排除 `.echo-buffer/`、`node_modules/`）
- [ ] **SessionEnd hook** — 清理残留 pending、从 transcript 补漏
- [x] **项目本地管线 CLI** (2026-05-24) — 新增 `echo-mcp all` 从任意注册项目目录运行完整管线 (convert → validate → index → resolve)；所有管线脚本 (convert/validate/index/resolve/search/annotate/import-sessions) 统一走 `resolveDataDirs()` 按 cwd 匹配 project registry；新增 `run-pipeline.js` usecase；doctor 识别 Echo 内部数据目录并提示修复命令。113 测试全绿，`npm run all` 通过。设计文档：[issues/004-project-local-pipeline-cli.md](issues/004-project-local-pipeline-cli.md)
- [ ] **SessionEnd hook** — 清理残留 pending、从 transcript 补漏
- [x] **AUQ 捕获质量修复** — 问题 1：AUQ 之间的叙述文本丢失（已修复：ordered_blocks 保留原始交错顺序）；问题 2：答案格式为原始系统返回值（已修复：正则解析并 join 所有答案）。详见 [issues/013-auq-capture-quality.md](issues/013-auq-capture-quality.md)
- [x] **capture.js 同步 + 测试覆盖** — Phase 1: 可测试性重构 (module.exports)；Phase 2: 同步 Bash 版 AUQ 修复 (ordered_blocks + tool_use_id + 答案展示)；Phase 3: 15 个 node:test 用例覆盖 extractAuqBlock/handleStop/handleUserPromptSubmit/handleStopFailure。详见 [issues/014-capture-js-sync-and-test.md](issues/014-capture-js-sync-and-test.md)
- [x] **Project registry** — `registry.json` schema、登记/读取 usecase、重复登记幂等和路径缺失测试
- [x] **init project 命令** — 新增 `echo-mcp init project [--path <dir>]`：全局 `~/.echo-workspace/registry.json` 登记项目，并创建 `projects/<project-id>/` 数据目录（session-buffer/、articles/、comments/、index/）
- [x] **hook 项目路由** — capture.js：去掉模块级路径常量，按 cwd 匹配 registry 写入对应项目数据目录；cwd 缺失时从 Claude transcript 路径匹配 registry，避免误写全局旧 buffer。
- [x] **doctor 双层检查** — `echo-mcp doctor` 同时检查 Echo home、registry.json、当前项目注册、项目数据目录，避免 `~/echo-notes/` “没有任何改变”这类困惑
- [x] **npm CLI 化** — `echo-mcp init`、`hook capture/status/install/doctor` 已实现，`migrate legacy-buffer` 待实现

## 后期改进

- [ ] **历史重复文章清理** — 修复同项目同日多会话 ID 冲突后，`myhomeworkhelper/session-2026-05-27.md` 这类旧无版本文章可能与 `-vN` 文章重复；需设计显式迁移/删除路径，不在常规 convert/validate 中自动改正文或删文章。
- [ ] **旧全局 Echo home 目录清理** — `~/.echo-workspace/session-buffer/`、`~/.echo-workspace/articles/`、`~/.echo-workspace/comments/` 属于 project registry 之前的 legacy 数据区；当前网页和新 capture 已切到 `~/.echo-workspace/projects/<project-id>/`，后续跑两三轮确认无新写入后再显式归档或清理。
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
- [ ] **build-docs 读 snapshots.json** (Issue 019 P2 延后) — 文章列表默认只显示 latest snapshot，需接入 `snapshots.json` 版本索引；当前 build-docs 加载全部 article 不做版本过滤。
- [ ] **help 文案进 i18n 层** (Issue 018 P2 延后) — `echoctl --help`/`mcp --help` 文案仍硬编码在 bin/echoctl.js，未进入 `lib/i18n/messages/`；`echo-mcp --help` 缺少 legacy 命令提醒。
- [ ] **Code Review 改进项** — 11 项代码质量问题，详见 [issues/009-code-review-findings.md](issues/009-code-review-findings.md)（2026-05-26，CodeGraph 全项目扫描）
- [x] **echoctl 查找已注册项目 + MCP 同步** — CLI 新增 `echoctl project list` / `echoctl project find <id>`，MCP 新增 `list_projects` / `get_project` 工具，详见 [issues/011-echoctl-list-projects-mcp-sync.md](issues/011-echoctl-list-projects-mcp-sync.md)（2026-05-27）
- [x] **多项目网页端不可见** — `echoctl all` 改为对所有已注册项目运行完整管线；新增 `aggregate-all-projects.js` usecase；`loadAllArticlesAndComments()` 已支撑多项目网页聚合。详见 [issues/012-multi-project-web-visibility.md](issues/012-multi-project-web-visibility.md)（2026-05-27）

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
