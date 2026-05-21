# Echo 进度表

最后更新：2026-05-21

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

## 进行中

- [ ] **继续拆分 CLI/usecase/domain/infra** — 骨架已建好，`convert.js`、`annotate.js`、`validate.js` 中的纯逻辑抽到 `lib/domain/` 和 `lib/usecases/`

## 待做
- [ ] **hook 行为验证** — SessionStart 通知 + 捕获开关需新会话测试，当前会话无法验证。详见 `issues/002-hook-verification.md`
- [ ] **工程边界落地** — 按 `ENGINEERING_BOUNDARIES.md` 继续拆分 CLI/usecase/domain/infra，统一 workspace/config 与 hook 入口

### 核心功能
- [ ] **MCP server** — `search_articles`、`get_article`、`get_article_context`、`list_tags`、`list_recent`
- [ ] **标签管理** — 列出所有标签及使用次数、文章加/删标签

### 展示层
- [ ] **VitePress 骨架** — `docs/` 目录、`.vitepress/config.mts`、首页文章列表
- [ ] **文章模板** — VitePress 渲染 Echo 文章的样式
- [ ] **进化链 UI** — 文章底部评论区展示，回复链可视化

### 编辑
- [ ] **标签/摘要编辑** — 网页端改 frontmatter 字段，写回 MD
- [ ] **剪贴板导入脚本** — `paste-to-md.sh`（macOS 优先）

### 工程
- [ ] **Git 仓库初始化** — `git init` + `.gitignore`（排除 `.echo-buffer/`、`node_modules/`）
- [ ] **SessionEnd hook** — 清理残留 pending、从 transcript 补漏
- [ ] **npm CLI 化** — 增加 `echo-mcp init`、`hook capture/status/install/doctor`、`migrate legacy-buffer`

## 后期改进

- [ ] **持续同步** — 定期扫描新 session JSONL，自动导入 Echo
- [ ] **v2: 上下文池** — 跨文章选取片段 → 共享池 → AI 讨论合成
- [ ] **Codex 模型识别** — `extractParticipants` 从标题解析模型名，不全标为 Claude
- [ ] **turn 编号优化** — 改为只统计当前 session 文件的 turn 数
- [ ] **跨平台** — `paste-to-md.sh` 的 Windows/Linux 版本
- [ ] **npm 发包** — `npx echo-mcp` 一行启动
- [ ] **workspace.js: resolveWorkspace() 双路径问题** — 配置文件始终从 `DEFAULT_WORKSPACE` 读取，与 `getConfig()` 读的路径不一致。需要统一或加文档说明
- [ ] **echo-capture.sh: 单引号注入风险** — `$SESSION_FILE` 等变量直接插入 Python 单引号字符串，路径含单引号会语法错误。应通过 `json.dumps` 转义
- [ ] **echo-capture.sh: 全量加载 transcript** — `entries = [json.loads(line) for line in f]` 对长会话有内存压力。应只扫描 `last_count` 之后的新条目
- [ ] **迁移清理** — 删除旧 `echo-prototype/.echo-buffer/`（已被 `~/.echo-workspace/session-buffer/` 取代）；清理 `echo-prototype/` 中已被复制到 workspace 的旧文章

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
npm run convert → 加 frontmatter → 正式文章
npm run validate → 校验
npm run index    → 生成评论区
npm run resolve  → 验证锚点
```
