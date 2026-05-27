# Echo 工程边界与 npm 发布改造说明

本文档整理 2026-05-21 与 Codex 讨论后的工程判断，供 Claude Code 后续执行。目标不是重写产品，而是把当前可运行原型收束成可测试、可发布、可维护的 npm CLI 项目。

---

## 1. 当前判断

Echo 现在已经跑通核心链路，但整体仍偏“脚本原型”。

```mermaid
flowchart TD
  A[Claude Code hooks] --> B[session buffer]
  B --> C[convert.js]
  C --> D[articles/*.md]
  D --> E[validate / index / resolve]
```

主要瓶颈不是 CommonJS 或 TypeScript，而是：

| 问题 | 判断 | 优先级 |
|---|---|---:|
| 没有测试 | 最大瓶颈。现有 `validate/resolve` 是数据校验，不是行为测试 | P0 |
| 没有工程边界 | CLI、业务逻辑、配置、文件系统副作用混在一起 | P0 |
| 配置分散 | Node 脚本和 hook 脚本各自解析路径/env | P0 |
| hook 不可发布 | 当前 hook 指向用户本机绝对路径，不能随 npm 包稳定分发 | P0 |
| CommonJS | 影响 IDE 跳转体验，但不是第一根因 | P1 |
| TypeScript | 有价值，但不应第一步全量迁移 | P2 |

阶段性原则：

```text
先让函数可测，再让模块可跳，再让类型可约束。
```

---

## 2. 目标边界

未来 Echo 应拆成三层：

```mermaid
flowchart TD
  A[npm package] --> B[CLI / lib / templates]
  C[~/.echo-workspace] --> D[用户数据 articles/comments/session-buffer]
  E[Claude Code integration] --> F[调用 Echo CLI]
  F --> C
  A -.init/install.-> C
  A -.install hook.-> E
```

| 边界 | 应该包含 | 不应该包含 |
|---|---|---|
| npm package | CLI、业务函数、配置解析、hook 适配命令、模板 | 用户数据、用户本机绝对路径 |
| `~/.echo-workspace` | articles、comments、session-buffer、echo.json | 源码、npm 包文件 |
| Claude Code hook | 调用 Echo CLI | 内嵌大量业务逻辑 |
| `~/.claude/settings.json` | 用户显式安装后的 hook 配置 | npm install 时自动覆盖 |

---

## 3. 推荐目录结构

先保持 JS，不急着上 TS。

```text
echo-prototype/
  bin/
    echoctl.js

  scripts/
    cli/
      convert.js
      validate.js
      index.js
      resolve.js
      annotate.js
      search.js

    lib/
      domain/
        echo-format.js
        anchor.js
        validation.js
        annotation.js

      usecases/
        convert-buffer.js
        validate-workspace.js
        create-annotation.js
        search-articles.js

      infra/
        config.js
        workspace.js
        markdown-store.js
        hook-input.js

      hooks/
        capture.js
        status.js

  test/
    echo-format.test.js
    anchor.test.js
    validation.test.js
    workspace.test.js

  templates/
    claude/
      settings-snippet.json
```

---

## 4. 代码层边界规则

```mermaid
flowchart TD
  A[CLI layer] --> B[Usecase layer]
  B --> C[Domain layer]
  B --> D[Infra layer]
  D --> E[fs / env / console / process]
```

| 层 | 负责 | 禁止 |
|---|---|---|
| CLI | 参数解析、打印、exit code | 写业务规则 |
| Usecase | 串联读取、转换、校验、写入 | 直接解析 argv/env |
| Domain | 纯函数、格式转换、锚点解析、校验规则 | `fs`、`process`、`console` |
| Infra | workspace、config、文件读写、hook stdin | 决定业务规则 |

优先拆分对象：

| 当前文件 | 优先抽出的纯函数 |
|---|---|
| `scripts/lib/echo-format.js` | 已接近 domain，可先加测试 |
| `scripts/resolve.js` | `stripInlineFormatting`、`findAllPositions`、`resolveAnchor` |
| `scripts/annotate.js` | 参数解析、文章加载、锚点定位、annotation 构造分离 |
| `scripts/validate.js` | 校验规则变成可测试函数 |
| `scripts/convert.js` | `parseBuffer`、`buildArticle`、写入策略分离 |

---

## 5. Workspace 与配置边界

### 5.1 当前兼容模型

当前已实现的 legacy-compatible workspace 是：

```text
~/.echo-workspace
```

当前 canonical buffer 是：

```text
~/.echo-workspace/session-buffer
```

统一解析规则：

```mermaid
flowchart TD
  A[resolveWorkspace] --> B{ECHO_WORKSPACE}
  B -->|有| C[使用 ECHO_WORKSPACE]
  B -->|无| D{~/.echo-workspace/echo.json}
  D -->|有 workspace| E[使用 echo.json workspace]
  D -->|无| F[默认 ~/.echo-workspace]
```

要求：

- 所有 Node 脚本必须通过同一个 `resolveWorkspace()`。
- hook 逻辑也必须走同一套解析，不要在 shell 里自己拼路径。
- `echo.json` 建议使用 `~/.echo-workspace` 这种可移植写法，不写死 `/Users/...`。
- `.env.example` 可以提供默认项，但真正配置来源应集中到 `config.js`。

建议支持的配置项：

| 配置 | 用途 |
|---|---|
| `ECHO_WORKSPACE` | 覆盖 workspace 根目录 |
| `ECHO_CAPTURE` | 临时关闭/开启 hook 捕获 |
| `ECHO_USER_SPEAKER` | 默认 human speaker |
| `ECHO_AI_SPEAKER` | 默认 AI speaker |
| `ECHO_BUFFER_DIR` | 高级调试覆盖，不推荐普通用户使用 |

### 5.2 目标项目模型

USAGE_GUIDE_V2 的 1-4 节暴露了一个核心心智模型问题：用户创建的 `~/echo-notes` 不应该只是 Echo 的数据桶，它应该是一个独立的用户工程；Echo 自己的会话、评论、索引等运行数据应该集中沉淀到全局 Echo home。

目标结构：

```mermaid
flowchart TD
  A[用户工程 ~/echo-notes] --> B[echo.json: 项目身份/偏好]
  C[全局 Echo home ~/.echo-workspace] --> D[registry.json: 项目登记表]
  C --> E[projects/echo-notes/session-buffer]
  C --> F[projects/echo-notes/articles]
  C --> G[projects/echo-notes/comments]
  C --> H[projects/echo-notes/index]
```

目标路径：

```text
~/echo-notes/
  echo.json              # 轻量项目配置，不存放所有 Echo 运行数据

~/.echo-workspace/
  registry.json          # 记录 project_id -> project_root
  projects/
    echo-notes/
      session-buffer/
      articles/
      comments/
      index/
```

边界规则：

| 概念 | 路径 | 责任 |
|---|---|---|
| 用户工程 | `~/echo-notes` | 用户自己的项目，可类比 React 项目目录 |
| Echo home | `~/.echo-workspace` | Echo 全局管理中心 |
| 项目数据目录 | `~/.echo-workspace/projects/<project-id>` | 该项目的会话、文章、评论、索引 |
| registry | `~/.echo-workspace/registry.json` | 多项目索引，供 hook 和前端统一发现 |

配置解析目标：

```mermaid
flowchart TD
  A[当前 cwd] --> B{是否在已登记项目内}
  B -->|是| C[使用 registry 对应 project data root]
  B -->|否| D{ECHO_WORKSPACE 是否设置}
  D -->|是| E[兼容 legacy workspace]
  D -->|否| F[提示运行 echoctl init project]
```

当前实现与目标有一处重要差异：hook capture 为了兼容旧数据模型，未注册目录不会中断，也不会自动注册项目，而是静默 fallback 到 Echo home 顶层：

```text
~/.echo-workspace/session-buffer/
```

这能保证“不丢捕获”，但会带来网页可见性问题：当 `registry.json` 中已有项目时，`build-docs.js` 聚合的是 `~/.echo-workspace/projects/<project-id>/articles/`，不会自动扫描顶层 legacy buffer。2026-05-27 的 `~/myEchoTestV1` 现场问题即由此触发：会话已捕获，但目录未注册，所以项目栏看不到。

后续若要消除歧义，优先选择“显式提示未注册 cwd 需要 `echoctl init project`”，而不是自动注册所有未知目录。

测试边界：

| 模块 | 必须覆盖 |
|---|---|
| `workspace` | `resolveEchoHomePath()` 默认到 `~/.echo-workspace`，`ECHO_HOME` 可覆盖 |
| `workspace` | `projectIdFromPath()` 生成稳定、文件系统安全的项目 ID |
| `workspace` | `resolveProjectDataRoot(projectRoot)` 必须落在 `~/.echo-workspace/projects/<project-id>` |
| `init project` | 只在用户工程写轻量 `echo.json`，不把全量数据目录塞进工程根 |
| `registry` | 登记、重复登记、路径移动、缺失项目目录 |
| `hook capture` | 根据 hook 的 cwd / transcript 项目归属写入对应 project data root |

阶段策略：

| 阶段 | 行为 |
|---|---|
| 当前阶段 | 保留 `ECHO_WORKSPACE` 和单 workspace，新增项目路径函数与测试边界 |
| 下一阶段 | 增加 `registry.json` usecase 和 `echoctl init project` |
| 再下一阶段 | hook capture/status 按 registry 路由到项目数据目录 |
| 前端阶段 | 从 `~/.echo-workspace/registry.json` 汇总所有项目 |

---

## 6. `~/.echo-buffer` 的处理

`~/.echo-buffer` 是旧版 Claude Code hook 留下的缓冲目录。它不应继续作为产品路径。

```mermaid
flowchart TD
  A[旧: ~/.echo-buffer] --> B[只读迁移来源]
  C[新: ~/.echo-workspace/session-buffer] --> D[正式 buffer]
  D --> E[convert/import]
```

决策：

| 路径 | 状态 | 处理 |
|---|---|---|
| `~/.echo-buffer` | legacy | deprecated，只读迁移来源 |
| `~/.echo-workspace/session-buffer` | canonical | 保留，hook 默认写入 |

后续命令建议：

```bash
echoctl doctor
echoctl migrate legacy-buffer
```

迁移策略：

| 文件 | 处理 |
|---|---|
| `session-*.md` | 导入或复制到 `~/.echo-workspace/session-buffer/legacy/` |
| `pending/*.json` | 不自动导入，只提示存在孤儿 pending |
| `debug-last-input.json` | 不迁移 |
| `session-map.txt` | 不迁移 |
| `failures.jsonl` | 可归档到 `session-buffer/legacy/failures.jsonl` |

---

## 7. Hook 发布策略

当前问题：

```text
~/.claude/settings.json -> bash /Users/vincenthuang/.claude/hooks/echo-capture.sh
```

这在本机可用，但不能作为 npm 发布形态。

推荐改为：

```text
~/.claude/settings.json -> echoctl hook capture
~/.claude/settings.json -> echoctl hook status
```

```mermaid
flowchart LR
  A[Claude Code hook event] --> B[echoctl hook capture]
  B --> C[resolveWorkspace]
  C --> D[session-buffer]
```

要求：

- `.sh` 不再承载核心逻辑。
- `.sh` 如保留，只能作为兼容包装或模板。
- `hook capture` 从 stdin 读取 Claude hook JSON。
- `hook status` 从 workspace / project status 生成 SessionStart 输出。
- 不允许 npm `postinstall` 自动修改 `~/.claude/settings.json`。

建议命令：

```bash
echoctl init
echoctl hook install claude
echoctl hook install claude --write
echoctl hook doctor
echoctl hook capture
echoctl hook status
```

安装策略：

| 命令 | 行为 |
|---|---|
| `echoctl init` | 创建 workspace、写 `echo.json`、创建目录 |
| `echoctl hook install claude` | 打印建议配置，不写用户文件 |
| `echoctl hook install claude --write` | 用户显式授权后修改 Claude 配置 |
| `echoctl hook doctor` | 检查 hook 是否存在、路径是否旧、workspace 是否可写 |

---

## 8. 测试策略

先用 Node 内置测试框架：

```bash
node --test
```

package script：

```json
{
  "scripts": {
    "test": "node --test",
    "verify": "npm run test && npm run validate && npm run resolve"
  }
}
```

优先测试：

| 模块 | 边界条件 |
|---|---|
| `echo-format` | 空内容、已有前缀、AI/human、未知 model、标题截断 |
| `anchor` | quote 找不到、多次出现、prefix/suffix 消歧、line_hint 兜底 |
| `validation` | 缺字段、重复 ID、引用不存在、evolution cycle |
| `workspace` | `ECHO_WORKSPACE`、`~` 展开、config 缺失、目录不存在 |
| `hook capture` | UserPromptSubmit、Stop、StopFailure、capture off、无 pending |

注意：

- `validate` 和 `resolve` 是数据校验，不等于测试。
- 测试不要写真实 `~/.echo-workspace`，必须使用临时目录。

---

## 9. CommonJS / ESM / TypeScript 决策

短期：

- 不立刻全量 TS。
- 不先做大规模 ESM 迁移。
- 先抽边界和测试。

中期：

- 业务函数抽出来后，可迁移 ESM。
- 使用 JSDoc 描述核心结构。

长期：

- 当数据结构稳定后再评估 TS。
- TS 重点约束这些类型：
  - `Article`
  - `Turn`
  - `Annotation`
  - `WorkspaceConfig`
  - `HookInput`

---

## 10. 建议执行顺序

```mermaid
flowchart TD
  A[1. 抽 echo-format / anchor 纯函数] --> B[2. 加 node:test]
  B --> C[3. 统一 config/workspace 解析]
  C --> D[4. 把 hook capture/status 迁进 Node CLI]
  D --> E[5. 增加 init / doctor / migrate 命令]
  E --> F[6. 标记 ~/.echo-buffer deprecated]
  F --> G[7. 再考虑 ESM]
  G --> H[8. 最后评估 TypeScript]
```

第一阶段验收标准：

| 项目 | 标准 |
|---|---|
| 测试 | `npm run test` 可跑，覆盖 `echo-format` 和 `anchor` |
| 数据校验 | `npm run validate`、`npm run resolve` 继续通过 |
| workspace | 所有脚本只通过统一 resolver 获取路径 |
| hook | 新增 Node hook 入口，不再依赖 `.sh` 的业务逻辑 |
| legacy | `~/.echo-buffer` 不再被新代码写入 |

---

## 11. 不要做的事

- 不要直接删除用户的 `~/.echo-buffer`。
- 不要 npm install 时自动改 `~/.claude/settings.json`。
- 不要第一步就全量 TypeScript。
- 不要在 domain 函数里读写文件。
- 不要把本机绝对路径写进模板。
- 不要让 hook 和 Node 脚本各自维护一套 workspace 解析逻辑。
