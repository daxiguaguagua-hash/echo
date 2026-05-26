# Issue 011 — echoctl 新增查找已注册项目，同步到 MCP

日期：2026-05-26
状态：待实现

## 背景

`project-registry.js` 已经实现了 `listProjects()` 和 `findProjectById()` 两个函数，`registry.json` 中已有 3 个注册项目（echo-notes、mynote、myhomeworkhelper）。但 CLI 和 MCP 层面都没有暴露这些能力。

## 现状

| 层级 | 已实现 | 缺失 |
|------|--------|------|
| usecase (`project-registry.js`) | `listProjects()`, `findProjectById()` | — |
| CLI (`echoctl.js`) | `echoctl init project` (注册) | `echoctl project list`, `echoctl project find <id>` |
| MCP (`echo-mcp`) | `import`, `convert`, `validate`, 文章 CRUD | 无项目列表/查找工具 |

## 实现计划

### 1. echoctl CLI 新增子命令

```
echoctl project list              # 列出所有已注册项目
echoctl project find <projectId>  # 查找单个项目详情
echoctl project find --root <path> # 按路径反查项目
```

输出格式建议：
```
$ echoctl project list
  echo-notes         /path/to/echo-notes      2026-05-24
  mynote             /path/to/myNote           2026-05-25
  myhomeworkhelper   /path/to/myHomeworkHelper 2026-05-26

$ echoctl project find mynote
  Project:  mynote
  Root:     /path/to/myNote
  Data:     ~/.echo-workspace/projects/mynote
  Since:    2026-05-25
```

### 2. MCP 新增工具

在 `echo-mcp` 中新增两个 MCP tool：

- **`list_projects`** — 列出所有已注册项目（名称、路径、注册时间）
- **`get_project`** — 按 projectId 获取单个项目详情

### 3. 同步逻辑

`echoctl project list` 和 MCP `list_projects` 都调用同一个 `listProjects()` 函数，保证行为一致。

## 影响范围

- `echo-prototype/bin/echoctl.js` — 新增 `project list` / `project find` case
- `echo-prototype/scripts/lib/usecases/project-registry.js` — 可能需要补充 `findByRoot()`
- `echo-mcp` server — 新增 2 个 MCP tool

## 验收标准

- [ ] `echoctl project list` 列出所有已注册项目
- [ ] `echoctl project find <id>` 返回单个项目详情
- [ ] MCP `list_projects` 与 CLI 输出一致
- [ ] MCP `get_project` 与 CLI `find` 输出一致
- [ ] `npm run all` 通过
