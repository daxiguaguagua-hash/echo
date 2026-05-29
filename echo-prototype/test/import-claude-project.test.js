const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");

const { registerProject } = require("../scripts/lib/usecases/project-registry");
const { claudeProjectDirName } = require("../scripts/lib/usecases/discover-claude-imports");
const { importClaudeProject } = require("../scripts/lib/usecases/import-claude-project");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-import-claude-project-test-"));
}

function writeClaudeSession(filePath, messages) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, messages.map((message, idx) => JSON.stringify({
    type: message.role === "user" ? "user" : "assistant",
    message,
    timestamp: `2026-05-29T00:00:0${idx}.000Z`,
    sessionId: path.basename(filePath, ".jsonl"),
  })).join("\n"));
}

test("importClaudeProject imports meaningful registered project transcripts", (t) => {
  const echoHome = tempDir();
  const projectRoot = tempDir();
  const claudeProjectsDir = tempDir();

  t.after(() => {
    fs.rmSync(echoHome, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(claudeProjectsDir, { recursive: true, force: true });
  });

  const project = registerProject(projectRoot, { echoHome, projectId: "ruoyi-vue-pro" });
  const claudeDir = path.join(claudeProjectsDir, claudeProjectDirName(projectRoot));
  writeClaudeSession(path.join(claudeDir, "b8cfacc9-dd02-474f-a4fb-783432810890.jsonl"), [
    { role: "user", content: "好，整个你都包了。" },
    { role: "assistant", content: "我先梳理项目结构。" },
    { role: "user", content: "继续，把前后端都跑起来。" },
    { role: "assistant", content: "已完成依赖检查和启动验证。", model: "deepseek-v4-pro" },
  ]);
  writeClaudeSession(path.join(claudeDir, "short-session.jsonl"), [
    { role: "user", content: "hello" },
  ]);

  const result = importClaudeProject("ruoyi-vue-pro", { echoHome, claudeProjectsDir });

  assert.equal(result.total, 2);
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.lowQuality, 1);

  const articlePath = path.join(project.dataRoot, "articles", "session-b8cfacc9.md");
  assert.ok(fs.existsSync(articlePath));
  const article = fs.readFileSync(articlePath, "utf-8");
  assert.match(article, /^project: ruoyi-vue-pro$/m);
  assert.match(article, /^# 好，整个你都包了。/m);

  const manifest = JSON.parse(fs.readFileSync(path.join(echoHome, "import-manifest.json"), "utf-8"));
  assert.equal(manifest.imports["b8cfacc9-dd02-474f-a4fb-783432810890"].articleId, "session-b8cfacc9");
  assert.equal(manifest.imports["short-session"].articleId, "skipped-short-se");
  assert.equal(manifest.imports["short-session"].skipped, true);
});
