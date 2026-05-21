const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("initWorkspace", () => {
  let tempDir;

  function clearCache() {
    delete require.cache[require.resolve("../scripts/lib/usecases/init-workspace")];
    delete require.cache[require.resolve("../scripts/lib/infra/workspace")];
  }

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), "echo-test-init-" + Math.random().toString(36).slice(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });
    process.env.ECHO_WORKSPACE = tempDir;
    clearCache();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.ECHO_WORKSPACE;
    clearCache();
  });

  it("creates workspace, subdirs, and echo.json on fresh init", () => {
    const { initWorkspace } = require("../scripts/lib/usecases/init-workspace");
    const result = initWorkspace();

    assert.equal(result.workspace, tempDir);
    assert.ok(result.created.includes("articles"));
    assert.ok(result.created.includes("comments"));
    assert.ok(result.created.includes("session-buffer"));
    assert.ok(result.created.includes("index"));
    assert.equal(result.configAction, "created");

    const cfg = JSON.parse(fs.readFileSync(path.join(tempDir, "echo.json"), "utf-8"));
    assert.ok(cfg.capture_enabled);
    assert.ok(cfg.workspace);
  });

  it("is idempotent — skips existing dirs and config", () => {
    // First init
    const { initWorkspace: first } = require("../scripts/lib/usecases/init-workspace");
    assert.equal(first().configAction, "created");

    clearCache();

    // Second init
    const { initWorkspace: second } = require("../scripts/lib/usecases/init-workspace");
    const r2 = second();
    assert.equal(r2.configAction, "skipped");
    assert.equal(r2.created.length, 0);
    assert.equal(r2.skipped.length, 4);
  });

  it("replaces malformed echo.json", () => {
    const cfgPath = path.join(tempDir, "echo.json");
    fs.writeFileSync(cfgPath, "not valid json {{{");

    const { initWorkspace } = require("../scripts/lib/usecases/init-workspace");
    const result = initWorkspace();

    assert.equal(result.configAction, "replaced");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    assert.ok(cfg.capture_enabled);
  });

  it("creates workspace root when ECHO_WORKSPACE path does not exist", () => {
    fs.rmSync(tempDir, { recursive: true, force: true });

    const { initWorkspace } = require("../scripts/lib/usecases/init-workspace");
    const result = initWorkspace();

    assert.ok(fs.existsSync(result.workspace));
    assert.equal(result.configAction, "created");
  });

  it("skips subdir path that is a file instead of directory", () => {
    fs.writeFileSync(path.join(tempDir, "articles"), "not a dir");

    const { initWorkspace } = require("../scripts/lib/usecases/init-workspace");
    const result = initWorkspace();

    assert.ok(result.skipped.includes("articles"));
  });
});
