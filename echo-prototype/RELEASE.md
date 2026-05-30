# echoctl 发布流水线

## 概述

echoctl 使用 **GitHub Actions CI** 实现自动化构建和 npm 发布。
每次打 tag 推送到 GitHub，自动跑测试 → 构建 → 发布到 npm。

## 一条龙发布

```bash
# 1. 确保工作区干净
git status

# 2. 升级版本号（选其一）
cd echo-prototype
npm version patch   # 0.2.2 → 0.2.3（小修小补）
npm version minor   # 0.2.2 → 0.3.0（新功能）
npm version major   # 0.2.2 → 1.0.0（大版本）

# 3. 推送到 GitHub（自动触发 CI + 发布）
git push --follow-tags
```

> `npm version` 会自动修改 `package.json` 版本号、生成 git commit 和 tag。
> 如果它没生成 tag（工作区不干净时），手动操作：
> ```bash
> git add echo-prototype/package.json echo-prototype/package-lock.json
> git commit -m "chore: bump version to x.y.z"
> git tag vx.y.z
> git push origin main vx.y.z
> ```

## CI/CD 流水线

文件：`.github/workflows/ci.yml`

### 触发条件

| 事件 | 触发 |
|------|------|
| `push` 到 `main` 分支 | 运行测试（Node 18/20/22） |
| `pull_request` 到 `main` | 运行测试 |
| 推送 `v*` tag | 运行测试 + 发布到 npm |

### Jobs

```
push tag vx.y.z
  ├── test (18)  ← Node 18 下跑 357 个测试
  ├── test (20)  ← Node 20 下跑
  ├── test (22)  ← Node 22 下跑
  └── release    ← 三个测试都通过才执行
       ├── npm ci
       ├── npm run build     ← 生成 bin 入口 + 验证 CLI
       └── npm publish --access public  ← 发布到 npm
```

## 构建脚本

文件：`echo-prototype/package.json`

| 命令 | 作用 |
|------|------|
| `npm run build` | 生成 `bin/echoctl.js` 入口 + 验证 `--version` |
| `npm test` | 运行 357 个单元测试（`node --test`） |
| `npm run prepack` | 打包前执行 build |
| `npm run prepublishOnly` | 发布前执行 test |
| `npm run verify` | 测试 + validate + resolve |

### 发布的文件（94 个，365 KB）

| 路径 | 说明 |
|------|------|
| `bin/echoctl.js` | CLI 入口 shim |
| `scripts/cli/` | 全部 17 个子命令 |
| `scripts/lib/` | 领域层、基础设施、MCP server |
| `scripts/serve.js` | HTTP API + VitePress 服务 |
| `scripts/build-docs.js` | 文档生成器 |
| `docs/.vitepress/` | VitePress 主题配置 |

## 前置条件

### npm 账号

- npm 账号：`application16`
- 需要在 GitHub 仓库 Secrets 中设置 `NPM_TOKEN`：
  - 去 https://www.npmjs.com/settings/application16/tokens 创建 **Automation token**
  - 在 https://github.com/daxiguaguagua-hash/echo/settings/secrets/actions 添加 `NPM_TOKEN`
- Automation token 可以绕过 2FA，专门给 CI/CD 使用

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 0.1.0 | - | 初版 |
| 0.2.2 | 2026-05-30 | 首个自动化发布版本 |
