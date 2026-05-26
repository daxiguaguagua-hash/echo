# Issue 012 — 多项目网页端不可见：resolveDataDirs 只解析当前项目

日期：2026-05-26
状态：待实现

## 现象

用户在 `~/myHomeworkHelper` 执行了完整流程：

```
echo init → 开启 capture → Claude 聊天
```

项目已注册到 `registry.json`，data 目录已创建，但网页端完全看不到 `myHomeworkHelper` 项目及其文章。

## 根因

`resolveDataDirs()` → `findProjectForPath(cwd)` **只解析当前工作目录匹配的单个项目**。

调用链：
```
build-docs.js
  → resolveDataDirs({ cwd })           # 只找当前 cwd 匹配的 1 个项目
    → findProjectForPath(cwd)          # 扫描 registry，找最长前缀匹配
      → 返回 mynote（因为 cwd 是 ~/myNote）
```

`build-docs.js` 的 `renderArticleIndex()` 虽然有 `collectProjects()` 和项目筛选 UI 代码，但它只能对**单个项目已加载的文章**做分组——文章来源只有 `resolveDataDirs()` 返回的那 1 个项目。

**结论：缺少跨项目文章聚合层。** `build-docs.js` 需要扫描所有已注册项目的数据目录，而非仅当前项目。

## 影响范围

### 需要新增

- **`lib/usecases/`** — 新增 `aggregate-all-projects.js`：
  - 调用 `listProjects()` 获取所有已注册项目
  - 遍历每个项目的 `articles/` 目录
  - 给每篇文章加上 `_project` 标记
  - 返回全部文章的扁平列表 + 所有评论列表

### 需要修改

- **`build-docs.js`** — 将 `resolveDataDirs()` 替换为多项目聚合：
  - 文章加载：从单项目 → 全项目
  - 评论加载：从单项目 → 全项目
  - `renderArticleIndex()`：已有项目筛选 UI 骨架，接入多项目数据即可

### 不需要改

- **管线脚本**（convert/validate/import/search/annotate）— 它们使用 `resolveDataDirs()` 的单项目行为是正确的，不改动

## 验收标准

- [ ] 在 `~/myNote` 运行 `npm run all`，网页端能看到所有已注册项目的文章
- [ ] 项目筛选导航正确显示各项目及其文章数
- [ ] `npm run all` 通过
- [ ] 管线脚本（convert/validate/import）不受影响
