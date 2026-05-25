# 横切门禁: 不可变性优先 (Invariant-First)

Echo 最核心的约束。所有设计、实现、审查的第一道门。

## 规则

**文章正文一旦创建，任何人（用户、agent、importer、validator、MCP 工具）不得修改。**

## 门禁检查清单

任何触及以下场景的操作必须先过此门禁:

- [ ] 新管线步骤 — 会不会改正文？
- [ ] import 逻辑 — 重复导入会不会覆盖已存在文章？
- [ ] MCP 工具 — 有没有写回正文的路径？
- [ ] 前端 UI — 有没有编辑/保存正文的功能？
- [ ] validate — 失败时会不会"修正"文章文字？
- [ ] convert — 会不会格式化清理正文？
- [ ] frontmatter 修改 — 只改 `---` 之前，不碰之后

## 正确做法

| 场景 | 禁止 | 正确 |
|------|------|------|
| 发现内容错误 | 改正文 | 加 annotation |
| Markdown 格式不统一 | 自动格式化 | 展示层容错 |
| import 重复运行 | 覆盖 | write-once + skip exists |
| 隐私信息泄漏 | 直接删文字 | 独立删除/脱敏脚本 |

## 测试要求

- convert/import 测试：验证输出正文与输入源逐字一致
- validate 测试：验证不修改传入的文章对象
- markdown-store 测试：验证 `readMarkdownFile` 返回原始内容
- import manifest 测试：验证重复导入被拒绝
