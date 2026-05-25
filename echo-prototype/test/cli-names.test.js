const assert = require("node:assert/strict");
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
