# 横切门禁: 验证门 (Verification Gate)

任何变更完成后的强制验证步骤。

## 规则

**声称"完成"前必须跑验证。没有证据的"完成"不算完成。**

## 门禁检查清单

- [ ] 相关测试全绿（`npm test`）
- [ ] 全管线通过（`npm run all`：convert → validate → index → resolve）
- [ ] 涉及 serve/UI 时：Browser 或 MCP E2E 验证
- [ ] 涉及 article 变更时：verify article count 正确
- [ ] ECHO_STATUS.md 已更新（`- [ ]` → `- [x]`，日期已刷新）
- [ ] 未完成/延后的内容已记到"后期改进"

## 自动化

```bash
npm test && npm run all
```

## 完成后

- git commit
- 如果用户不在场：汇报总结（完成了什么、有什么风险、下一步）
