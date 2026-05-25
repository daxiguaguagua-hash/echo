# 工作流 2: TDD + Codex 测试生成

Codex 写测试用例，Claude 实现代码让测试通过。测试定义契约，实现满足契约。

## 触发条件

- 新模块开发
- 新功能实现
- 重构已有模块（需要新测试覆盖）

## 流程

```
1. Claude 分析设计文档，确定模块 API 契约
2. Claude 派 Codex agent 写测试文件（后台运行）
3. Codex 生成完整测试用例，覆盖:
   - 基础 happy path
   - 边界条件（空输入、null、大输入）
   - 错误处理（格式错误、缺失字段）
   - 不可变性约束（如 Echo 的文章不可变）
   - 并发安全（如 manifest 去重）
4. Claude 跑测试确认失败（红灯）
5. Claude 实现模块代码
6. 跑测试 → 修复 → 重复直到全绿
7. Claude + Codex review 最终代码
```

## 实际案例

**Import 框架**: Codex 写了 106 个测试（49 provider + 29 manifest + 28 scanner），覆盖所有边界条件。Claude 实现 3 个模块，从 106 红灯 → 0 红灯。

**Markdown Store**: Codex 写了 15 个测试，Claude 实现后修复了 4 个 Codex 发现的 bug。

## 关键原则

- **测试即契约**：测试定义 API 签名和行为，不能为了过测改测试
- **Codex 写测试时不知道实现细节**，保证测试的独立性
- 测试必须包含**不可变性验证**（Echo 核心约束）
- 实现完成后，Codex 做最终 review 确认测试质量
