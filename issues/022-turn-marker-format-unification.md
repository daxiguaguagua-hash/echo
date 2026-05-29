# Issue 022: Turn 标记格式统一

**日期**: 2026-05-29
**类型**: bug 修复 + 重构
**优先级**: P1（框架修正）

## 背景

ruoyi-vue-pro 项目的 VitePress 页面中，用户说的话没有气泡边框。

## 问题

### 根因

Echo 有两条文章生成路径，它们的 turn 标记格式不一致：

| 路径 | 函数 | 格式 |
|------|------|------|
| hook capture → convert | `echo-format.toMarkdown()` | `speaker=vincent` |
| JSONL import | `claude-code.toEchoArticle()` | `speaker: ai`（冒号，修复前） |

`build-docs.js` 的正则 `/speaker=([^\s]+)/` 只匹配等号格式，导致 import 路径的 speaker 被识别为 "unknown"。前端 `EchoChatBubbles.vue` 的 `isUserSpeaker()` 无法识别 "unknown"，用户 turn 得不到气泡边框。

### 深层问题

turn 标记的生成和解析分散在 5 个独立位置，没有任何复用：

- **生成**: `capture.js:328`、`echo-format.js:172`、`claude-code.js:226`
- **解析**: `convert-buffer.js:9`、`build-docs.js:149`

## 修复

### Phase 1: 最小改动

1. `claude-code.js:226` — `speaker:` → `speaker=`
2. `EchoChatBubbles.vue:10` — `isUserSpeaker` 加 `'human'`

### Phase 2: 统一生成端

新增 `echo-format.js` 中的 `renderTurnMarker(id, speaker, replyTo)` 共享函数，3 个生成点统一调用。

### Phase 3: 统一解析端

新增 `echo-format.js` 中的 `TURN_MARKER_REGEX` 共享常量，2 个解析点统一引用。

### Phase 4: 回归测试

10 个新增测试覆盖：
- `renderTurnMarker` 生成（无 reply_to / 带 reply_to / 多 speaker）
- `TURN_MARKER_REGEX` 自反性（生成→解析 身份）
- 拒绝错误格式（冒号、逗号）
- `toEchoArticle` 输出中 human/ai turn 的 speaker 值

## 影响的文件

| 文件 | 改动 |
|------|------|
| `echo-prototype/scripts/lib/domain/echo-format.js` | +`renderTurnMarker` + `TURN_MARKER_REGEX` |
| `echo-prototype/scripts/lib/import/providers/claude-code.js` | `speaker:` → `speaker=` + 引入共享函数 |
| `echo-prototype/scripts/lib/hooks/capture.js` | 引入共享函数替代手动拼接 |
| `echo-prototype/scripts/lib/usecases/convert-buffer.js` | 引入共享正则 |
| `echo-prototype/scripts/build-docs.js` | 引入共享正则替代 3 个零散正则 |
| `docs/.vitepress/theme/components/EchoChatBubbles.vue` | `isUserSpeaker` 加 `'human'` |
| `echo-prototype/test/echo-format.test.js` | +6 测试 |
| `echo-prototype/test/import-provider-claude-code.test.js` | +2 测试 |

## 验证

- `npm test`: 343/343 全绿
- `npm run all`: 管线通过
- ruoyi-vue-pro 的 `session-b8cfacc9.md` 重新导入后格式正确

## Commits

```
4e337ae fix: 统一 import 路径 turn 标记为 speaker= 格式
db147a0 refactor: 统一 turn 标记生成为 renderTurnMarker() 共享函数
00bf3b2 refactor: 解析端也统一使用 TURN_MARKER_REGEX
9304c04 test: 新增 turn 标记格式的回归测试 (10 个)
```
