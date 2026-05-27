# Issue 013 — AUQ 捕获质量问题

日期：2026-05-26
来源：`~/myHomeworkHelper` 跨会话测试，6 次 AskUserQuestion 交互
测试文档：`/Users/vincenthuang/myHomeworkHelper/auq-hook-issues.md`

## 背景

Echo hook (`echo-capture.sh`) 在 Stop 事件中扫描 transcript，检测 `AskUserQuestion` 工具调用并写入 session-buffer。Issue 013 的背景修复（全局计数器 → 按 session 隔离）已生效，AUQ 不再被静默跳过。但渲染层仍有两个质量问题。

## 问题 1：AUQ 之间的叙述文本丢失（严重）

**现象**：同一个 turn 内，多个 AUQ 调用之间的普通文本（叙述、过渡、上下文衔接）全部丢失。整个 turn 只保留了 AUQ 块和答案，没有连贯的叙事结构。

**根因**：`last_assistant_message` 只包含最后一个 assistant message 的文本。当 Claude 在一次响应中发送叙述文本和 AUQ 工具调用时，叙述文本在单独的 content block 中。hook 的 AUQ 检测只提取 tool_use/tool_result，丢弃了中间的 text 块。

**影响**：读者看到一串互不关联的问卷题目，无法理解对话上下文流。

**修复方向**：在扫描 transcript 时，不止提取 AUQ 的 tool_use 和 tool_result，也要保留同一 assistant entry 内的 text 块，按时间顺序交错排列。

## 问题 2：答案格式为原始系统返回值（中等）

**现象**：用户选择以未解析的英文系统消息形式呈现：
```
*你的选择：Your questions have been answered: "Q"="A". You can now continue with these answers in mind.*
```

**期望格式**：
```
*你的选择：想不明白就出去吃酸菜鱼，不要辣椒，鱼要黑鱼*
```

**根因**：hook 直接把 `AskUserQuestion` 的 tool_result 原始字符串写入转录，没有解析。tool_result 结构固定：`Your questions have been answered: "Q1"="A1". You can now continue...`

**修复方向**：用正则拆出 `"question"="answer"` 对，只保留答案文本。

## 优先级

| 问题 | 严重度 | 修复难度 | 建议顺序 |
|------|--------|----------|----------|
| 问题 1：叙述文本丢失 | 高 | 中 | 先修 |
| 问题 2：答案格式 | 中 | 低 | 后修 |

## 额外发现

- `pending/auq-<session-id>.txt` 计数器正确记录了 AUQ 调用次数，说明检测逻辑正常，问题在渲染层。
- 用户使用自定义输入（"Other"）和预设选项两种方式，目前都受问题 2 影响。
