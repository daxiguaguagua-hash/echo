# Echo 进度表

最后更新：2026-05-26 (标签页锚点修复 — 标签云使用显式 section anchor，避免影响搜索落点)

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
- [ ] **npm 发布准备** (Issue 008) — `"private": false`；确定包名；配置 `bin`/`files`/`keywords`；用户 onboarding 文档。
- [ ] **底部评论输入框** — 支持文章级评论和后续回复链扩展。作者身份从 `echo.json` 读取。
- [ ] **进化链 UI** — 文章底部评论区展示，回复链可视化
- [ ] **项目筛选视图** — 统一归档下按 project 元数据显示 `全部` / 单项目文章。元数据在 convert 时根据 registry 补齐。
- [x] **MCP 配置按钮** (2026-05-24) — `EchoArticleActions.vue` 已实现 MCP 配置弹窗和复制功能。
- [x] **MCP 安装与 AI 访问端到端验证** (2026-05-25) — 新增 `mcp-e2e.test.js`：spawn `echoctl mcp` 从临时 `ECHO_HOME`，测试真实 JSON-RPC 通信覆盖 initialize、tools/list、全部 7 个 tool（含 add_tags/remove_tags 回环和 alias 搜索）。设计文档：[issues/007-mcp-install-e2e.md](issues/007-mcp-install-e2e.md)
- [x] **搜索落点增强** (2026-05-26) — VitePress local search 点击结果后记录搜索词，文章页落地时在正文中高亮命中词，并选择离当前 hash 标题最近的命中滚入视口；仅改主题 UI 层，不改文章正文和数据管线。
- [x] **底部评论区布局修复** (2026-05-26) — `doc-bottom` 插槽中的 Echo 交互区重新约束到正文宽度，避免长文章底部评论表单和右侧 `On this page` 目录重叠；Browser 验证当前页面横向不再相交。
- [x] **serve 交互按钮恢复** (2026-05-26) — 修复 `localhost` / `127.0.0.1` 混用导致 API CORS 不匹配的问题；前端在缺少 `VITE_ECHO_API_BASE` 时默认探测 `http://127.0.0.1:8787`，避免普通 docs 页面直接降级隐藏 MCP 配置和收集开关。新增 serve API 回归测试，`npm test` 252 全绿，`npm run docs:build` 和 `npm run all` 通过。
- [x] **顶部导航高亮修复** (2026-05-26) — VitePress nav 为 `文章` / `标签` 增加 `activeMatch`，确保从首页按钮、顶部导航或文章卡片进入 `/articles/` 与 `/articles/generated/...` 后仍保持正确高亮。
- [x] **侧边栏项目分组** (2026-05-26) — 文章 sidebar 从单一“最近文章”列表调整为“全部文章 / 最近文章 / 项目”结构；项目分组按 `project` 元数据展示，如 `mynote (16)`，最近文章保留为折叠快捷入口。新增 build-docs 回归测试；Browser 验证 `http://localhost:5174/articles/` 渲染正确；`npm test` 253 全绿，`npm run docs:build` 和 `npm run all` 通过。
- [x] **标签页锚点修复** (2026-05-26) — `/tags/` 标签云不再猜测 VitePress 标题 slug，改为生成显式 `tag-...` section anchor；仅影响标签页本身，不改文章页搜索落点和 annotation anchor。新增中文标签回归测试；Browser 验证 `AI 协作` 点击后滚动到对应 section；`npm test` 254 全绿，`npm run docs:build` 和 `npm run all` 通过。
- [ ] **AI 查询链 UI** — MCP 查询写入 query log，v1 先做全局最近查询日志，v2 按文章关联

### 编辑
- [ ] **标签/摘要编辑** — 网页端改 frontmatter 字段，写回 MD
- [ ] **剪贴板导入脚本** — `paste-to-md.sh`（macOS 优先）

### 工程
- [ ] **Git 仓库初始化** — `git init` + `.gitignore`（排除 `.echo-buffer/`、`node_modules/`）
- [ ] **SessionEnd hook** — 清理残留 pending、从 transcript 补漏
- [x] **项目本地管线 CLI** (2026-05-24) — 新增 `echo-mcp all` 从任意注册项目目录运行完整管线 (convert → validate → index → resolve)；所有管线脚本 (convert/validate/index/resolve/search/annotate/import-sessions) 统一走 `resolveDataDirs()` 按 cwd 匹配 project registry；新增 `run-pipeline.js` usecase；doctor 识别 Echo 内部数据目录并提示修复命令。113 测试全绿，`npm run all` 通过。设计文档：[issues/004-project-local-pipeline-cli.md](issues/004-project-local-pipeline-cli.md)
- [ ] **SessionEnd hook** — 清理残留 pending、从 transcript 补漏
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
