const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("runDoctor", () => {
  let tempDir, origHome;

  function clearCache() {
    delete require.cache[require.resolve("../scripts/lib/usecases/run-doctor")];
    delete require.cache[require.resolve("../scripts/lib/infra/workspace")];
    delete require.cache[require.resolve("../scripts/lib/infra/config")];
  }

  function setupWorkspace() {
    for (const d of ["articles", "comments", "session-buffer", "index"]) {
      fs.mkdirSync(path.join(tempDir, d), { recursive: true });
    }
    fs.writeFileSync(path.join(tempDir, "echo.json"), JSON.stringify({
      workspace: "~/.echo-workspace",
      capture_enabled: true,
    }, null, 2));
  }

  function setupSettings(json) {
    const claudeDir = path.join(tempDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, "settings.json"), JSON.stringify(json, null, 2));
  }

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), "echo-test-dr-" + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });
    origHome = process.env.HOME;
    process.env.HOME = tempDir;
    process.env.ECHO_WORKSPACE = tempDir;
    clearCache();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env.HOME = origHome;
    delete process.env.ECHO_WORKSPACE;
    clearCache();
  });

  it("reports ok for a healthy workspace", () => {
    setupWorkspace();
    const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
    const results = runDoctor();

    assert.ok(results.find(r => r.name === "Workspace" && r.status === "ok"));
    assert.ok(results.find(r => r.name === "Workspace writable" && r.status === "ok"));
    assert.ok(results.find(r => r.name === "Subdirectories" && r.status === "ok"));
    assert.ok(results.find(r => r.name === "echo.json" && r.status === "ok"));
  });

  it("reports error for invalid echo.json", () => {
    fs.writeFileSync(path.join(tempDir, "echo.json"), "{{{broken");
    const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
    const results = runDoctor();

    const cfgCheck = results.find(r => r.name === "echo.json");
    assert.equal(cfgCheck.status, "error");
  });

  it("hook-only mode skips workspace checks", () => {
    const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
    const results = runDoctor({ hookOnly: true });

    assert.equal(results.find(r => r.name === "Workspace"), undefined);
    assert.equal(results.find(r => r.name === "Subdirectories"), undefined);
    assert.equal(results.find(r => r.name === "echo.json"), undefined);
    // Should have hook-related check (either per-event or warn about missing settings)
    assert.ok(results.find(r => r.name.startsWith("Hook") || r.name === "CLI"));
  });

  it("detects echo-mcp hooks as ok", () => {
    setupWorkspace();
    setupSettings({
      hooks: {
        UserPromptSubmit: [{ command: "echo-mcp hook capture" }],
        Stop: [{ command: "echo-mcp hook capture" }],
        StopFailure: [{ command: "echo-mcp hook capture" }],
        SessionStart: [{ command: "echo-mcp hook status" }],
      }
    });

    const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
    const results = runDoctor();

    for (const event of ["UserPromptSubmit", "Stop", "StopFailure", "SessionStart"]) {
      const h = results.find(r => r.name === `Hook: ${event}`);
      assert.ok(h);
      assert.equal(h.status, "ok");
    }
  });

  it("handles non-array hook event entries without crashing", () => {
    setupWorkspace();
    setupSettings({
      hooks: {
        UserPromptSubmit: "not-an-array"
      }
    });

    const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
    const results = runDoctor();

    // Should not crash; non-array entries are treated as empty
    assert.ok(results.length > 0);
  });

  it("reports error when workspace directory is missing", () => {
    // Delete the workspace dir
    fs.rmSync(tempDir, { recursive: true, force: true });

    const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
    const results = runDoctor();

    const ws = results.find(r => r.name === "Workspace");
    assert.equal(ws.status, "error");
  });

  it("reports warn when echo.json is missing", () => {
    const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
    const results = runDoctor();

    const cfg = results.find(r => r.name === "echo.json");
    assert.equal(cfg.status, "warn");
  });

  it("reports warn when echo.json is valid JSON but missing workspace field", () => {
    fs.writeFileSync(path.join(tempDir, "echo.json"), JSON.stringify({ capture_enabled: true }));

    const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
    const results = runDoctor();

    const cfg = results.find(r => r.name === "echo.json");
    assert.equal(cfg.status, "warn");
  });
});
