const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const crypto = require("node:crypto");

let discoverClaudeImportCandidates;
let claudeProjectDirName;
try {
  const mod = require("../scripts/lib/usecases/discover-claude-imports");
  discoverClaudeImportCandidates = mod.discoverClaudeImportCandidates;
  claudeProjectDirName = mod.claudeProjectDirName;
} catch (_) {
  discoverClaudeImportCandidates = () => { throw new Error("Not implemented"); };
  claudeProjectDirName = () => { throw new Error("Not implemented"); };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-discover-"));
}

test("claudeProjectDirName encodes a unix path", () => {
  const result = claudeProjectDirName("/Users/test/my-project");
  assert.equal(result, "-Users-test-my-project");
});

test("claudeProjectDirName encodes path with spaces", () => {
  const result = claudeProjectDirName("/Users/test/my project");
  assert.equal(result, "-Users-test-my-project");
});

test("returns empty candidates when Claude project dir does not exist", () => {
  const tmp = tempDir();
  try {
    const echoHome = path.join(tmp, "echo-home");
    const registryPath = path.join(echoHome, "registry.json");
    fs.mkdirSync(echoHome, { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify({
      projects: { testproj: { projectId: "testproj", root: "/nonexistent/path", dataRoot: path.join(echoHome, "projects", "testproj") } },
    }));

    const result = discoverClaudeImportCandidates("testproj", { echoHome });
    assert.equal(result.projectId, "testproj");
    assert.equal(result.summary.total, 0);
    assert.equal(result.candidates.length, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("discovers new sessions not in manifest", () => {
  const tmp = tempDir();
  try {
    const echoHome = path.join(tmp, "echo-home");
    const projectRoot = path.join(tmp, "my-project");
    fs.mkdirSync(projectRoot, { recursive: true });

    const dataRoot = path.join(echoHome, "projects", "myproj");
    const registryPath = path.join(echoHome, "registry.json");
    fs.mkdirSync(echoHome, { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify({
      projects: { myproj: { projectId: "myproj", root: projectRoot, dataRoot } },
    }));

    const dirName = claudeProjectDirName(projectRoot);
    const claudeDir = path.join(tmp, "claude-home", ".claude", "projects", dirName);
    fs.mkdirSync(claudeDir, { recursive: true });

    const sessionId = "abc12345-6789-4abc-def0-123456789abc";
    const jsonlPath = path.join(claudeDir, `${sessionId}.jsonl`);
    fs.writeFileSync(jsonlPath, [
      JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "Hello" }] }, sessionId, timestamp: "2026-05-20T10:00:00.000Z" }),
      "\n",
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Hi there" }], model: "claude-4" }, sessionId, timestamp: "2026-05-20T10:00:01.000Z" }),
      "\n",
    ].join(""));

    const origHomedir = os.homedir;
    os.homedir = () => path.join(tmp, "claude-home");

    try {
      const result = discoverClaudeImportCandidates("myproj", { echoHome });
      assert.equal(result.summary.total, 1);
      assert.equal(result.summary.new, 1);
      assert.equal(result.summary.skipped, 0);
      assert.equal(result.candidates.length, 1);
      assert.equal(result.candidates[0].sessionId, sessionId);
      assert.equal(result.candidates[0].status, "new");
      assert.equal(result.candidates[0].turnCount, 2);
    } finally {
      os.homedir = origHomedir;
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("marks sessions as skipped when already in manifest with same hash", () => {
  const tmp = tempDir();
  try {
    const echoHome = path.join(tmp, "echo-home");
    const projectRoot = path.join(tmp, "my-project");
    fs.mkdirSync(projectRoot, { recursive: true });

    const dataRoot = path.join(echoHome, "projects", "myproj");
    const registryPath = path.join(echoHome, "registry.json");
    fs.mkdirSync(echoHome, { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify({
      projects: { myproj: { projectId: "myproj", root: projectRoot, dataRoot } },
    }));

    const dirName = claudeProjectDirName(projectRoot);
    const claudeDir = path.join(tmp, "claude-home", ".claude", "projects", dirName);
    fs.mkdirSync(claudeDir, { recursive: true });

    const sessionId = "abc12345-6789-4abc-def0-123456789abc";
    const jsonlPath = path.join(claudeDir, `${sessionId}.jsonl`);
    const content = [
      JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "Hello" }] }, sessionId, timestamp: "2026-05-20T10:00:00.000Z" }),
      "\n",
    ].join("");
    fs.writeFileSync(jsonlPath, content);

    const fileHash = crypto.createHash("sha256").update(content).digest("hex");

    const manifestPath = path.join(echoHome, "import-manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      imports: { [sessionId]: { articleId: "session-abc12345", fileHash, importedAt: "2026-05-20T10:00:00.000Z" } },
    }));

    const origHomedir = os.homedir;
    os.homedir = () => path.join(tmp, "claude-home");

    try {
      const result = discoverClaudeImportCandidates("myproj", { echoHome });
      assert.equal(result.summary.total, 1);
      assert.equal(result.summary.skipped, 1);
      assert.equal(result.summary.new, 0);
      assert.equal(result.candidates[0].status, "skipped");
    } finally {
      os.homedir = origHomedir;
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("marks sessions as updated when manifest hash differs", () => {
  const tmp = tempDir();
  try {
    const echoHome = path.join(tmp, "echo-home");
    const projectRoot = path.join(tmp, "my-project");
    fs.mkdirSync(projectRoot, { recursive: true });

    const dataRoot = path.join(echoHome, "projects", "myproj");
    const registryPath = path.join(echoHome, "registry.json");
    fs.mkdirSync(echoHome, { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify({
      projects: { myproj: { projectId: "myproj", root: projectRoot, dataRoot } },
    }));

    const dirName = claudeProjectDirName(projectRoot);
    const claudeDir = path.join(tmp, "claude-home", ".claude", "projects", dirName);
    fs.mkdirSync(claudeDir, { recursive: true });

    const sessionId = "abc12345-6789-4abc-def0-123456789abc";
    const jsonlPath = path.join(claudeDir, `${sessionId}.jsonl`);
    fs.writeFileSync(jsonlPath, [
      JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "Updated content" }] }, sessionId, timestamp: "2026-05-21T10:00:00.000Z" }),
      "\n",
    ].join(""));

    const manifestPath = path.join(echoHome, "import-manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      imports: { [sessionId]: { articleId: "session-abc12345", fileHash: "old-different-hash", importedAt: "2026-05-20T10:00:00.000Z" } },
    }));

    const origHomedir = os.homedir;
    os.homedir = () => path.join(tmp, "claude-home");

    try {
      const result = discoverClaudeImportCandidates("myproj", { echoHome });
      assert.equal(result.summary.total, 1);
      assert.equal(result.summary.updated, 1);
      assert.equal(result.summary.new, 0);
      assert.equal(result.candidates[0].status, "updated");
      assert.equal(result.candidates[0].articleId, "session-abc12345");
    } finally {
      os.homedir = origHomedir;
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("throws when project is not registered", () => {
  const tmp = tempDir();
  try {
    const echoHome = path.join(tmp, "echo-home");
    fs.mkdirSync(echoHome, { recursive: true });
    fs.writeFileSync(path.join(echoHome, "registry.json"), JSON.stringify({ projects: {} }));

    assert.throws(() => {
      discoverClaudeImportCandidates("nonexistent", { echoHome });
    }, /not found/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
