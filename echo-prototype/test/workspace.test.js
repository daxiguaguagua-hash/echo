const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  expandHome,
  projectIdFromPath,
  resolveEchoHomePath,
  resolveProjectDataRoot,
  resolveWorkspacePath,
} = require("../scripts/lib/infra/workspace");

const homeDir = "/home/example";
const defaultWorkspace = path.join(homeDir, ".echo-workspace");

test("expandHome expands only leading tilde path segments", () => {
  assert.equal(expandHome("~/.echo-workspace", homeDir), "/home/example/.echo-workspace");
  assert.equal(expandHome("/tmp/~/.echo-workspace", homeDir), "/tmp/~/.echo-workspace");
});

test("resolveEchoHomePath defaults to the global Echo data directory", () => {
  const resolved = resolveEchoHomePath({ env: {}, homeDir });

  assert.equal(resolved, "/home/example/.echo-workspace");
});

test("resolveEchoHomePath allows an explicit Echo home override", () => {
  const resolved = resolveEchoHomePath({
    env: { ECHO_HOME: "~/echo-global" },
    homeDir,
  });

  assert.equal(resolved, "/home/example/echo-global");
});

test("projectIdFromPath derives a stable filesystem-safe project id", () => {
  assert.equal(projectIdFromPath("/Users/example/My Echo Notes"), "my-echo-notes");
  assert.equal(projectIdFromPath("/Users/example/echo-notes"), "echo-notes");
});

test("resolveProjectDataRoot stores project data under the global Echo home", () => {
  const resolved = resolveProjectDataRoot("/home/example/echo-notes", {
    echoHome: "/home/example/.echo-workspace",
  });

  assert.equal(resolved, "/home/example/.echo-workspace/projects/echo-notes");
});

test("resolveWorkspacePath prefers ECHO_WORKSPACE over config", () => {
  const resolved = resolveWorkspacePath({
    env: { ECHO_WORKSPACE: "~/custom-echo" },
    homeDir,
    defaultWorkspace,
    readConfig: () => JSON.stringify({ workspace: "~/from-config" }),
  });

  assert.equal(resolved, "/home/example/custom-echo");
});

test("resolveWorkspacePath falls back to echo.json workspace", () => {
  const resolved = resolveWorkspacePath({
    env: {},
    homeDir,
    defaultWorkspace,
    readConfig: () => JSON.stringify({ workspace: "~/from-config" }),
  });

  assert.equal(resolved, "/home/example/from-config");
});

test("resolveWorkspacePath falls back to default workspace when config is missing", () => {
  const resolved = resolveWorkspacePath({
    env: {},
    homeDir,
    defaultWorkspace,
    readConfig: () => {
      throw new Error("missing");
    },
  });

  assert.equal(resolved, defaultWorkspace);
});

test("resolveWorkspacePath ignores malformed config", () => {
  const resolved = resolveWorkspacePath({
    env: {},
    homeDir,
    defaultWorkspace,
    readConfig: () => "{not json",
  });

  assert.equal(resolved, defaultWorkspace);
});
