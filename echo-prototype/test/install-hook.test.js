const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("installClaudeHook", () => {
  let tempDir, origHome;

  function clearCache() {
    delete require.cache[require.resolve("../scripts/lib/usecases/install-claude-hook")];
  }

  function setupSettings(json) {
    const claudeDir = path.join(tempDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    const p = path.join(claudeDir, "settings.json");
    fs.writeFileSync(p, JSON.stringify(json, null, 2));
    return p;
  }

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), "echo-test-hook-" + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });
    origHome = process.env.HOME;
    process.env.HOME = tempDir;
    clearCache();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env.HOME = origHome;
    clearCache();
  });

  it("dry-run reports hooks to add when settings.json is missing", () => {
    const { installClaudeHook } = require("../scripts/lib/usecases/install-claude-hook");
    const result = installClaudeHook({ write: false });

    assert.equal(result.written, false);
    assert.equal(result.toAdd.length, 4);
    assert.equal(result.alreadyInstalled.length, 0);
    assert.equal(result.legacy.length, 0);
  });

  it("detects legacy .sh hooks in existing settings", () => {
    setupSettings({
      hooks: {
        UserPromptSubmit: [
          { command: "bash /Users/test/.claude/hooks/echo-capture.sh" }
        ]
      }
    });

    const { installClaudeHook } = require("../scripts/lib/usecases/install-claude-hook");
    const result = installClaudeHook({ write: false });

    assert.equal(result.legacy.length, 1);
    assert.equal(result.legacy[0].event, "UserPromptSubmit");
    assert.ok(result.legacy[0].command.includes(".sh"));
  });

  it("--write writes settings.json atomically", () => {
    setupSettings({});

    const { installClaudeHook } = require("../scripts/lib/usecases/install-claude-hook");
    const result = installClaudeHook({ write: true });

    assert.equal(result.written, true);
    assert.equal(result.toAdd.length, 4);

    const written = JSON.parse(fs.readFileSync(path.join(tempDir, ".claude", "settings.json"), "utf-8"));
    assert.ok(written.hooks);
    assert.equal(written.hooks.UserPromptSubmit[0].command, "echo-mcp hook capture");
    assert.equal(written.hooks.SessionStart[0].command, "echo-mcp hook status");
  });

  it("is idempotent — second install detects all already installed", () => {
    setupSettings({});

    // First write
    let mod = require("../scripts/lib/usecases/install-claude-hook");
    mod.installClaudeHook({ write: true });
    clearCache();

    // Second run
    mod = require("../scripts/lib/usecases/install-claude-hook");
    const result = mod.installClaudeHook({ write: false });

    assert.equal(result.toAdd.length, 0);
    assert.equal(result.alreadyInstalled.length, 4);
  });

  it("--write creates .claude directory and settings.json when both are missing", () => {
    // No .claude directory, no settings.json
    const { installClaudeHook } = require("../scripts/lib/usecases/install-claude-hook");
    const result = installClaudeHook({ write: true });

    assert.equal(result.written, true);
    const settingsPath = path.join(tempDir, ".claude", "settings.json");
    assert.ok(fs.existsSync(settingsPath));
    const written = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    assert.ok(written.hooks.UserPromptSubmit);
  });

  it("handles non-array hook event entries without crashing", () => {
    setupSettings({
      hooks: {
        UserPromptSubmit: "not-an-array"
      }
    });

    const { installClaudeHook } = require("../scripts/lib/usecases/install-claude-hook");
    const result = installClaudeHook({ write: false });

    // Should not crash; should treat non-array as empty and add our hooks
    assert.ok(result.toAdd.length > 0);
  });
});
