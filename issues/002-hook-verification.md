# 002: hook 行为验证（SessionStart 通知 + 捕获开关）

发现日期: 2026-05-20 | 状态: 待验证（等 Codex 上线）

## 问题

两个 hook 相关功能在当前会话中无法完整测试——hook 由 Claude Code 事件触发（SessionStart / UserPromptSubmit / Stop），中途改配置不会回滚已写入的数据。

## 第 8 步：SessionStart 通知

期望在 `~/myNote/` 下新开会话时终端显示：

```
Echo: 13 done | 自动记录 开启中 | echo capture off 暂停
```

涉及：`~/.claude/hooks/echo-status.sh`、`~/.claude/settings.json`

## 第 9 步：捕获开关

期望 `capture_enabled: false` 时 echo-capture.sh 不写入 session-buffer。

为什么当前会话测不了：hook 由 Claude Code 事件触发，中途改配置无法撤销已写入的 turn。需要新会话 + 预先关掉捕获 → 聊几句 → 检查无新文件 → 重新开启。

## 完整测试流程

```bash
# 1. 关掉捕获
cd ~/myNote/echo-prototype && node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(require('os').homedir() + '/.echo-workspace/echo.json','utf-8'));
cfg.capture_enabled = false;
fs.writeFileSync(require('os').homedir() + '/.echo-workspace/echo.json', JSON.stringify(cfg, null, 2));
"

# 2. 在非项目目录新开会话
cd /tmp && claude
# 聊几句，确认没有 Echo 状态通知

# 3. 检查无新文件
ls -lt ~/.echo-workspace/session-buffer/ | head -5

# 4. 恢复捕获
cd ~/myNote/echo-prototype && node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(require('os').homedir() + '/.echo-workspace/echo.json','utf-8'));
cfg.capture_enabled = true;
fs.writeFileSync(require('os').homedir() + '/.echo-workspace/echo.json', JSON.stringify(cfg, null, 2));
"

# 5. 回项目目录验证通知恢复
cd ~/myNote && claude
# 应该看到: Echo: 13 done | 自动记录 开启中
```
