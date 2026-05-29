# Echo — 本地优先的 AI 对话知识论坛

Echo 把 Claude Code / AI 编程会话捕获成 Markdown 文章，并提供本地网页用于浏览、搜索、打标签和评论。

核心原则：**文章正文不可变**。AI 对话一旦转成文章，就作为源记录保存；后续整理通过标签、评论、标注和派生内容完成。

## 当前使用方式

> [!TIP]
> **AI 时代的安装方法：**可以将当前页面交给 AI，让它帮你安装和配置 Echo。

### 1. 安装开发版 CLI

```bash
cd /Users/vincenthuang/myNote/echo-prototype
npm install
npm link
```

确认命令可用：

```bash
echoctl --version
```

### 2. 在你的项目目录初始化

每个要被 Echo 收集的文件夹都需要注册一次。未注册目录里的对话会落到 legacy buffer，不会自动显示在网页“项目”分组里。

```bash
mkdir -p ~/echo-notes
cd ~/echo-notes

echoctl init
echoctl init project
echoctl doctor
```

### 3. 安装 Claude Code hook

```bash
echoctl hook install claude --write
echoctl hook doctor
```

之后你在已注册项目目录里和 AI 聊天，hook 会把会话写入：

```text
~/.echo-workspace/projects/<project-id>/session-buffer/
```

### 4. 启动本地网页

```bash
echoctl serve
```

`serve` 默认后台运行，并在启动时自动执行一次：

```text
convert → validate → index → resolve → build docs
```

启动后会显示类似：

```text
Echo服务在后台运行 / Echo serve started in background

Docs / 访问地址             http://127.0.0.1:5173/
API / 接口地址              http://127.0.0.1:8787/
State / 状态文件            ~/.echo-workspace/.serve.json
Log / 日志文件              ~/.echo-workspace/.serve.log

echoctl serve              # 后台启动 / Start in background
echoctl serve --foreground # 前台调试 / Run in foreground for debugging
echoctl stop               # 停止服务 / Stop Echo serve
echoctl capture on/off     # 控制 AI 聊天记录收集 / Toggle AI chat logging
```

打开 `Docs / 访问地址` 即可浏览文章。

### 5. 日常命令

| 命令 | 用途 |
|---|---|
| `echoctl serve` | 后台启动本地网页和 API |
| `echoctl serve --foreground` | 前台启动，方便调试 |
| `echoctl stop` | 停止后台服务 |
| `echoctl capture status` | 查看是否正在收集 AI 聊天记录 |
| `echoctl capture on` | 开启收集 |
| `echoctl capture off` | 关闭收集 |
| `echoctl project list` | 查看已注册项目 |
| `echoctl project find <id>` | 查看项目详情 |
| `echoctl all` | 手动跑完整管线 |
| `echoctl search -- --keyword "关键词"` | 搜索文章 |
| `echoctl tag list` | 查看标签 |
| `echoctl tag add <article-id> <tag>` | 给文章加标签 |
| `echoctl tag remove <article-id> <tag>` | 移除标签 |

## 重要边界

### 空文件夹不会自动变成项目

如果你新建一个空文件夹后直接聊天，但没有执行：

```bash
echoctl init project
```

那么会话会降级写入：

```text
~/.echo-workspace/session-buffer/
```

这个 legacy buffer 不会自动出现在网页项目列表里。正确流程是：

```bash
cd ~/new-project
echoctl init project
echoctl serve
```

### 当前还不是实时刷新

`echoctl serve` 会在启动时自动跑一次管线，但当前版本还没有持续监听新的 `session-buffer`。

也就是说：

| 场景 | 网页是否立刻出现新文章 |
|---|---|
| 启动 `serve` 前已经有 buffer | 会显示 |
| `serve` 已在后台运行，然后继续聊天 | 不会立刻自动出现 |
| 聊完后重启 `echoctl serve` 或手动 `echoctl all` 后刷新 | 会显示 |

后续计划：给 `serve` 增加 watcher，监听新会话并自动重建页面。

## 数据目录

```text
~/.echo-workspace/
  registry.json
  .serve.json
  .serve.log
  session-buffer/             # 未注册目录的 legacy fallback
  projects/
    <project-id>/
      session-buffer/
      articles/
      comments/
      index/
  .site/                      # echoctl serve 生成的 VitePress 站点
```

## 开发命令

这些命令主要给 Echo 项目开发者使用，普通使用优先用 `echoctl`。

```bash
cd /Users/vincenthuang/myNote/echo-prototype

npm test
npm run all
npm run docs:generate
```

## 更多文档

- [USAGE_GUIDE_V3.md](USAGE_GUIDE_V3.md) — 多项目模型和手动验证流程
- [ENGINEERING_BOUNDARIES.md](ENGINEERING_BOUNDARIES.md) — 工程边界和路径模型
- [ECHO_STATUS.md](ECHO_STATUS.md) — 当前进度和已知问题
