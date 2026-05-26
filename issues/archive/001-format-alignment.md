# 001: convert.js 和 import-sessions.js 格式不一致

发现日期: 2026-05-20 | 状态: 待修复 | 规范: `echo-prototype/ECHO_FORMAT.md`

## 问题清单

对比 `template-conversation.md`（标准）与 `~/.echo-workspace/articles/` 中 11 篇文章，两个数据来源各写各的。

### 1. 参与者字段三种格式

| 来源 | 字段 |
|------|------|
| template | `participants:` (结构化，含 id/role/model) |
| convert.js | `participants:` ✓ |
| import-sessions.js | `ai_models: [deepseek-v4-pro]` (扁平，缺 role) |
| article.md | `ai_model: claude-opus-4-7` (单数) |

### 2. turn 格式

**标准 (convert.js):**
```html
<!-- turn: t001 speaker=vincent -->
我：xxx

<!-- turn: t002 speaker=claude reply_to=t001 -->
## ai 的回复
```

**import-sessions.js:**
```html
<!-- turn: ai -->
xxx
```
缺失 turn ID、reply_to、内容前缀。

### 3. created_at Bug

`session-2026-05-20-v1.md` 的 created_at 为 `2026-05-20-v1T00:00:00+08:00`。文件名版本后缀 `-v1` 漏进了日期字段。convert.js 的 `date.replace("session-", "")` 没有处理版本后缀。

### 4. summary 不统一

template 用 `"一句话描述"`，convert.js 用日期，import-sessions.js 用日期+统计。

### 5. source_session 字段

import-sessions.js 有，convert.js 和 template 没有。

## 解决方案

已创建 `echo-prototype/ECHO_FORMAT.md` 作为统一规范。

### convert.js 需修复
- [ ] created_at 版本后缀解析 bug
- [ ] summary 格式统一

### import-sessions.js 需修复
- [ ] turn 格式：加 ID + reply_to + 内容前缀
- [ ] `ai_models` → `participants`
- [ ] summary 格式统一
- [ ] `source_session` 保留为可选字段

## 受影响文件

**脚本:** `scripts/convert.js`, `scripts/import-sessions.js`
**文章:** 5 个 session-*.md 需重新导入；1 个 created_at 需修复
