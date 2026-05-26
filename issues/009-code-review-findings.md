# Issue 009 — Code Review 发现的问题

日期：2026-05-26
工具：CodeGraph MCP（全项目结构级扫描，62 文件、676 符号、1275 边）

## 发现清单

### 1. echoctl.js 单体膨胀（565 行）

CLI 入口全部塞在一个 `switch(cmd)` 里。`import` case 从第 210 行写到第 393 行（近 200 行），内含文件扫描、manifest 管理、dry-run 报告、实际导入执行逻辑。33 个 `process.exit()` 散布各处，没有统一出口。

**建议**：拆为 `bin/commands/` 子模块，引入 `parseArgs` 或 `commander`。

### 2. readStdin() 重复定义

`capture.js:10` 和 `status.js:8` 有完全相同的 10 行 `readStdin()` 实现。

**建议**：抽到 `lib/infra/` 共享。

### 3. UTC+8 时区硬编码

`capture.js:getLocalDate()` 写死 `const offset = 8 * 60`，非东八区用户日期会错。

**建议**：用 `Intl.DateTimeFormat` 或读 `TZ` 环境变量。

### 4. VitePress stdout 被吞

`serve.js:295` — VitePress 的 `stdio: "pipe"` 只把 stderr pipe 出来（302 行），stdout 完全丢弃。如果 VitePress 启动失败且错误只写到 stdout，完全看不到。

**建议**：至少把 stdout pipe 到 `process.stdout`，或者合并 stdout/stderr。

### 5. loadArticleById 线性扫描无缓存

`markdown-store.js:63-83` — 每次按 ID 查文章遍历整个目录 O(n)。评论、标签、搜索操作都会触发。

**建议**：`loadArticles` 已返回全量，调一次缓存为 `Map<id, article>`。

### 6. write-comment.js 手写 YAML

第 30-46 行和第 93-113 行用字符串拼接手写 YAML frontmatter。项目已在 `markdown-store.js` 引入 `gray-matter`。

**建议**：改用 `matter.stringify(content, data)` 生成 frontmatter，避免特殊字符破坏格式。

### 7. findFreePort 递归风险

`serve.js:80` — `s.on("error", () => resolve(findFreePort(start + 1)))` 递归查找。极端情况（端口 8787~9000 全被占）会栈溢出。

**建议**：改为 `while` 循环。

### 8. 静默 catch 块过多

`serve.js` 至少 6 处 `catch (_) {}` 空 catch。包括 `runBuildDocs` 失败被吞两次（评论 API 190 行、标签 API 209 行），用户完全感知不到文档重建失败。

**建议**：至少打印 `console.error` 或返回 warning 字段。

### 9. session-map.txt 无并发保护

`capture.js:getSessionFile` 用 `appendFileSync` 直接写 map 文件。并行 Claude 会话同时 Stop 可能导致文件损坏。

**建议**：加文件锁或改用 SQLite。

### 10. frontmatter 字段引用方式不统一

`build-docs.js:renderArticlePage` 里 title 用 `escapeFrontmatterString` 正确转义，project 用 `JSON.stringify`，interactive 直接用模板字符串拼接 boolean。三种方式混用。

**建议**：统一 escape 策略，或写一个 `renderFrontmatter` helper。

### 11. import 命令内部重复 require

`echoctl.js:240-242` — 在 `case "import"` 块中间写了 `const os = require("os"); const path = require("path"); const fs = require("fs");`，此时文件顶部早已用过了。

**建议**：移到文件顶部，或拆分子命令后自然消失。
