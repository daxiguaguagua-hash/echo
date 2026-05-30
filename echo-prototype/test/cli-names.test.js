const assert = require("node:assert/strict");
const path = require("path");
const test = require("node:test");
const { commandFor, allCliNames, isKnownCliCommand, cliNames, mcpServerInfo } = require("../scripts/lib/cli/names");

test("commandFor builds canonical command strings", () => {
  assert.equal(commandFor(["init"]), "echoctl init");
  assert.equal(commandFor(["hook", "capture"]), "echoctl hook capture");
  assert.equal(commandFor(["hook", "install", "claude", "--write"]), "echoctl hook install claude --write");
});

test("allCliNames includes canonical and legacy", () => {
  const names = allCliNames();
  assert.ok(names.includes("echoctl"));
  assert.ok(names.includes("echo-mcp"));
  assert.equal(names.length, 2);
});

test("isKnownCliCommand matches canonical and legacy", () => {
  assert.ok(isKnownCliCommand("echoctl hook capture"));
  assert.ok(isKnownCliCommand("echo-mcp hook capture"));
  assert.ok(isKnownCliCommand("echoctl"));
  assert.ok(isKnownCliCommand("echo-mcp"));
});

test("isKnownCliCommand rejects unknown commands", () => {
  assert.equal(isKnownCliCommand("git status"), false);
  assert.equal(isKnownCliCommand(""), false);
  assert.equal(isKnownCliCommand(42), false);
  assert.equal(isKnownCliCommand(null), false);
});

test("mcpServerInfo is stable", () => {
  assert.equal(mcpServerInfo.name, "echo-mcp");
  assert.equal(mcpServerInfo.version, "0.2.0");
});

test("cliNames canonicalName is echoctl", () => {
  assert.equal(cliNames.canonicalName, "echoctl");
});

test("echoctl project list outputs registered projects", () => {
  const fs = require("fs");
  const { execSync } = require("child_process");
  const echoHome = fs.mkdtempSync(path.join(require("os").tmpdir(), "echo-test-"));
  const cwd = path.resolve(__dirname, "..");
  const env = { ...process.env, ECHO_HOME: echoHome };

  // Register a temp project
  execSync("node bin/echoctl.js init project --path " + echoHome, { cwd, env, encoding: "utf-8" });

  const out = execSync("node bin/echoctl.js project list", { cwd, env, encoding: "utf-8" });
  assert.ok(out.includes("echo-test-")); // project id derived from temp dir name
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("echoctl project find outputs project details", () => {
  const fs = require("fs");
  const { execSync } = require("child_process");
  const echoHome = fs.mkdtempSync(path.join(require("os").tmpdir(), "echo-test-"));
  const projectId = path.basename(echoHome).toLowerCase();
  const cwd = path.resolve(__dirname, "..");
  const env = { ...process.env, ECHO_HOME: echoHome };

  // Register a temp project
  execSync("node bin/echoctl.js init project --path " + echoHome, { cwd, env, encoding: "utf-8" });

  const out = execSync(`node bin/echoctl.js project find ${projectId}`, { cwd, env, encoding: "utf-8" });
  assert.ok(out.includes("Project:"));
  assert.ok(out.includes(projectId));
  assert.ok(out.includes("Root:"));
  fs.rmSync(echoHome, { recursive: true, force: true });
});
