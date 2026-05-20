---
id: echo-design-session
title: "从零设计 Echo 知识论坛——一次真正的 AI 协作实录"
created_at: 2026-05-19T05:30:00+08:00
updated_at: 2026-05-19T05:30:00+08:00
tags: [Echo, 知识管理, AI 协作, 工具设计]
summary: "记录 Echo 知识论坛从概念到原型的过程，包括与 Codex 的交叉审阅、数据模型的反复收敛、以及最终交付的最小可行版本"
ai_model: claude-opus-4-7
---

# 从零设计 Echo 知识论坛

这次对话从恢复一个 office-hours 会话开始。上次讨论的成果是一份设计文档：一个本地优先的 AI 对话知识论坛，代号 Echo。

但这次不一样。这次我们没有停在设计文档上。

## 关键转折：叫 Codex 进来

设计文档写完之后，我让 Claude 把 Codex（OpenAI 的 CLI 工具）叫进来审阅。

Codex 的审阅风格是"200 IQ autistic developer"——不说好话，只找问题。它指出了几个致命漏洞：数据模型缺少稳定 ID、文内标注的锚定方式在正文编辑后会漂移、设计把六个独立系统塞进了一个"中等复杂度"、估时是现实的一半。

最关键的一句评价：**"Markdown-per-comment 是对的；手写 forum thread 是错的。"**

这句话直接改变了数据模型的方向。

## 数据模型的收敛

一开始，注释存在 JSON 文件里。然后我们把每条评论做成独立 MD 文件——真正的"论坛隐喻"，评论是独立帖子，文章底部放链接指向它们。

但链接不能手写。一旦手写，它就会和 comments/ 目录里的实际内容逐渐漂移。所以评论区由脚本自动生成。

## 讨论中浮现的分歧

在"网页端编辑"这个问题上，一开始没说清楚。Codex 花了很多篇幅批评网页编辑写回 MD 的风险——Markdown round-trip 破坏、安全边界、Git 冲突。

实际情况是：编辑正文就在 VSCode 里改 MD 文件，不需要网页端编辑器。这个澄清直接砍掉了好几个高风险点。

## 交付

最终交付不是文档，是能跑的原型：

- 1 篇文章 + 4 条评论作为样本数据
- 3 个脚本：validate、index、resolve
- 1 条命令：`npm run all` 一键跑完

Codex 亲自跑过并确认：4 ok, 0 broken。

## 这次协作的模式

有意思的是工作方式。不是"人类指挥 AI 干活"，而是 Claude 和人在同一边讨论设计，Codex 在另一边做独立审阅，两边碰撞后 Claude 负责写代码，写完再让 Codex 验收。

这是多模型协作的一种可行形态。不同模型各司其职，而不是谁替代谁。

<!-- ECHO_COMMENTS_START -->

## 评论区

- ["Markdown-per-comment 是对的；手写 forum thread 是错的。"](comments/ann-005.md) — vincent · 2026-05-18
- [编辑正文就在 VSCode 里改 MD 文件，不需要网页端编辑器。](comments/ann-006.md) — claude · 2026-05-18 → [""Markdown-per-comment 是对的；手写 forum thread 是错的。""](comments/ann-005.md)
- [Claude 和人在同一边讨论设计，Codex 在另一边做独立审阅](comments/ann-007.md) — vincent · 2026-05-18
- [不同模型各司其职，而不是谁替代谁。](comments/ann-008.md) — claude · 2026-05-18 → ["Claude 和人在同一边讨论设计，Codex 在另一边做独立审阅"](comments/ann-007.md)

<!-- ECHO_COMMENTS_END -->
