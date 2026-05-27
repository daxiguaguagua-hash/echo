# Issue 014 — capture.js 同步 Bash 修复 + 测试覆盖

日期：2026-05-27
来源：Codex 审查 Issue 013 修复后，讨论 hook 测试策略
关联：[Issue 013](013-auq-capture-quality.md)

## 背景

Echo 的 hook 捕获系统有两套实现：

| 文件 | 语言 | 状态 |
|------|------|------|
| `~/.claude/hooks/echo-capture.sh` | Bash + 内嵌 Python | 实际安装的 hook，已修复 Issue 013 |
| `echo-prototype/scripts/lib/hooks/capture.js` | Node.js | 可测试版本，**逻辑落后于 bash 版** |

Issue 013 在 bash 脚本中做了 4 项修复，但 Node 版 `capture.js` 完全没有同步。Codex 审查后建议：**不直接测 bash 脚本，改为同步 Node 版后测 Node 版**。bash 版最多后续做一个 CLI smoke test。

## 差距分析

Bash 版已修但 Node 版缺失的功能：

| 功能 | Bash (已修) | Node (capture.js) |
|------|------------|-------------------|
| ordered_blocks 保留 text/AUQ 交错顺序 | 有 | 无 — 只收集 `{input, answer}` 数组 |
| tool_use_id 关联答案（防错配） | `answers_by_id[tool_use_id]` | 无 — 按顺序遍历附近 user message |
| 单问题 vs 多问题答案展示 | 单问题：`你的选择：xxx`；多问题：逐行 `Q：A` | 始终输出原始字符串 |
| import re 置顶 | 已做 | N/A（Node 不需要） |
| 答案缺失兜底 | `（未收到回答）` | 无 |

## 任务拆解

### Phase 1：可测试性重构（P0）

`capture.js` 当前有两个问题阻止测试：

1. 文件末尾无条件执行 `main()`，`require()` 时会直接跑完并 `process.exit()`
2. 没有 `module.exports`，外部无法引用内部函数

**修改：**

```js
// 文件末尾替换
if (require.main === module) {
  main().catch(() => process.exit(0));
}

module.exports = {
  getLocalDate,
  resolveBufferRoot,
  getSessionFile,
  extractAuqBlock,
  handleUserPromptSubmit,
  handleStop,
  handleStopFailure,
  main,
};
```

### Phase 2：同步 AUQ 逻辑（P0）

将 `extractAuqBlock` 从旧实现升级为与 bash 版一致：

1. **ordered_blocks** — 在遍历 assistant content 时，保留 text 和 auq 块的原始交错顺序
2. **tool_use_id 配对** — 收集答案时用 `cb.tool_use_id` 建 `Map<string, string>`，输出时用 `block.id` 查找
3. **答案展示** — `parsed.length === 1` 时输出 `你的选择：xxx`；多个时逐行 `- Q：**A**`
4. **答案缺失兜底** — 无匹配时输出 `*（未收到回答）*`

具体改动参考 `~/.claude/hooks/echo-capture.sh` 第 110-208 行的 Python 逻辑，翻译为 JavaScript。

### Phase 3：编写测试（P0）

新增 `echo-prototype/test/hooks-capture.test.js`。

#### 测试辅助函数

```js
function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-capture-test-"));
}

function writeFixture(dir, relPath, text) {
  const file = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function jsonl(entries) {
  return entries.map(e => JSON.stringify(e)).join("\n") + "\n";
}
```

#### Transcript fixture 结构

```js
// 基础：单个 AUQ，带前后文本
const singleAuqTranscript = jsonl([
  {
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "Before question.\n" },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "AskUserQuestion",
          input: {
            questions: [{
              header: "Scope",
              question: "Ship what?",
              options: [
                { label: "MVP", description: "Smallest useful version" },
                { label: "Full", description: "Everything" },
              ],
            }],
          },
        },
        { type: "text", text: "After question.\n" },
      ],
    },
  },
  {
    type: "user",
    message: {
      content: [{
        type: "tool_result",
        tool_use_id: "toolu_1",
        content: "Your questions have been answered: \"Ship what?\"=\"MVP\". You can now continue with these answers in mind.",
      }],
    },
  },
]);

// 错配场景：答案反序到达
const reversedAnswerTranscript = jsonl([
  {
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use", id: "toolu_A", name: "AskUserQuestion",
          input: { questions: [{ header: "Q1", question: "Question A?", options: [{ label: "A1", description: "..." }] }] },
        },
        {
          type: "tool_use", id: "toolu_B", name: "AskUserQuestion",
          input: { questions: [{ header: "Q2", question: "Question B?", options: [{ label: "B1", description: "..." }] }] },
        },
      ],
    },
  },
  {
    type: "user",
    message: {
      content: [{
        type: "tool_result", tool_use_id: "toolu_B",
        content: 'Your questions have been answered: "Question B?"="B1". You can now continue.',
      }],
    },
  },
  {
    type: "user",
    message: {
      content: [{
        type: "tool_result", tool_use_id: "toolu_A",
        content: 'Your questions have been answered: "Question A?"="A1". You can now continue.',
      }],
    },
  },
]);
```

#### 测试矩阵（15 个用例）

##### extractAuqBlock（8 个）

| # | 测试名 | 输入 | 断言 |
|---|--------|------|------|
| 1 | `returns empty when transcript missing` | `{ transcript_path: "/nonexistent" }, 0` | `{ block: "", newCount: 0 }` |
| 2 | `returns empty when no AUQ in transcript` | 纯文本 transcript | `{ block: "", newCount: 0 }` |
| 3 | `preserves interleaved text and AUQ order` | 文本 + AUQ + 文本 | `block` 中 "Before" 在 "Scope" 前，"Scope" 在 "After" 前 |
| 4 | `pairs answer by tool_use_id (reversed arrival)` | 答案反序 transcript | AUQ_A 的答案是 A1，AUQ_B 的答案是 B1 |
| 5 | `renders single-question answer inline` | 1 question + 1 answer | `*你的选择：MVP*` |
| 6 | `renders multi-question answers per question` | 2 questions + 2 answers | 逐行显示 Q 和 A |
| 7 | `falls back when answer missing` | AUQ 无对应 tool_result | 输出 `*（未收到回答）*` |
| 8 | `only returns new AUQs after lastCount` | `lastCount = 1`，2 AUQ | 只输出第 2 个，`newCount = 2` |

##### handleUserPromptSubmit（1 个）

| # | 测试名 | 断言 |
|---|--------|------|
| 9 | `writes pending prompt JSON` | `session-buffer/pending/<sid>.json` 存在，字段正确 |

##### handleStop（5 个）

| # | 测试名 | 断言 |
|---|--------|------|
| 10 | `writes markdown turn with user prompt and AI reply` | session md 包含 user prompt、AI reply、turn marker |
| 11 | `removes pending after successful write` | pending JSON 被删除 |
| 12 | `skips when pending prompt missing` | 不创建 session md，不抛错 |
| 13 | `skips when assistant message empty` | pending 保留，不创建 turn |
| 14 | `appends subsequent turns with incremented counter` | 两轮同 sid，turn marker 递增 |

##### handleStopFailure（1 个）

| # | 测试名 | 断言 |
|---|--------|------|
| 15 | `appends to failures.jsonl` | JSONL 一行，含 `ts/session_id/error` |

#### 额外：subprocess smoke test（可选，P1）

```js
// ECHO_CAPTURE=off 时不写文件
const result = spawnSync(process.execPath, [
  "scripts/lib/hooks/capture.js",
], {
  input: JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s1" }),
  env: { ...process.env, ECHO_CAPTURE: "off", ECHO_HOME: tempDir },
  encoding: "utf-8",
});
assert.equal(result.status, 0);
// session-buffer 目录不应被创建
```

### Phase 4：验证（P0）

```bash
cd echo-prototype && npm test && npm run all
```

所有现有测试 + 新增测试全绿，管线通过。

## 测试不覆盖的范围

- `main()` 函数（读 stdin + 派发）— 不在单元测试范围，后续通过 CLI smoke test 覆盖
- `~/.claude/hooks/echo-capture.sh` — 不直接测，后续可选加一个 `echoctl hook capture` smoke test
- `readStdin()` — 已有独立模块，输入边界在其自己的测试中覆盖

## 优先级

| Phase | 内容 | 优先级 |
|-------|------|--------|
| Phase 1 | 可测试性重构（module.exports + require.main） | P0 |
| Phase 2 | 同步 AUQ 逻辑（ordered_blocks + tool_use_id + 答案展示） | P0 |
| Phase 3 | 编写 15 个测试用例 | P0 |
| Phase 4 | npm test + npm run all 验证 | P0 |

## 设计决策

- **不测 bash 脚本**：bash hook 在 `~/.claude/` 禁读路径下，难以 mock 和断言。Node 版是可测试、可维护的 canonical 实现。
- **不引入测试框架**：继续用 `node:test`（零依赖），与项目其余 17 个测试文件一致。
- **不 mock 内部模块**：`isCaptureEnabled()` 的开关行为用 subprocess 测试，不在同进程 mock。
- **按 `tool_use_id` 配对答案**：这是 Issue 013 Codex 审查的核心发现。旧的顺序遍历逻辑在答案反序到达时会错配。
