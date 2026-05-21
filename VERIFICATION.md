# Echo 验证清单

运行环境：`cd ~/myNote/echo-prototype`

---

## 1. 全管线

```bash
npm run all
```

**预期：** 所有步骤 `unchanged — skipped` 或 `OK`，结尾 `9 ok, 0 broken`。

---

## 2. 全文搜索

```bash
npm run search -- --keyword "Echo"
```

**预期：** ~11 条结果，每条带文件名、日期、上下文片段。

---

## 3. 标签搜索

```bash
npm run search -- --tag "AI"
```

**预期：** 1 条结果（`为什么你应该把 AI 对话存下来`）。

---

## 4. 组合搜索

```bash
npm run search -- --keyword "知识" --tag "AI"
```

**预期：** 1 条结果，同时匹配关键词和标签。

---

## 5. 无结果搜索

```bash
npm run search -- --keyword "xyzzy_nonexistent"
```

**预期：** `No results for keyword="xyzzy_nonexistent".`

---

## 6. 工作区目录结构

```bash
ls ~/.echo-workspace/
ls ~/.echo-workspace/articles/
ls ~/.echo-workspace/comments/
ls ~/.echo-workspace/session-buffer/
```

**预期：** 每个目录都有文件。

---

## 7. 评论文件内容

```bash
cat ~/.echo-workspace/comments/ann-001.md
```

**预期：** 看到 YAML frontmatter（`---` 包裹的字段） + 评论正文。

---

## 8. SessionStart 通知

下次新开会话时看终端输出。应该显示：

```
Echo: 13 done | 自动记录 开启中 | echo capture off 暂停
```

---

## 9. 测试关闭捕获（可选）

```bash
ECHO_CAPTURE=off echo "这行说明捕获已跳过"
```

**预期：** 不写入 session-buffer。下次会话自动恢复（env 只影响当前进程）。

---

## 10. Git 历史

```bash
git log --oneline -5
```

**预期：** 最近提交依次是搜索 → 捕获开关 → 工作区系统 → 初始提交。

---

有问题随时回来讨论。
