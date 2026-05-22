const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");

const {
  loadRegistry,
  saveRegistry,
  registerProject,
  findProjectForPath,
} = require("../scripts/lib/usecases/project-registry");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-registry-test-"));
}

test("loadRegistry returns empty when registry.json does not exist", () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });

  const registry = loadRegistry(echoHome);

  assert.deepEqual(registry, { projects: {} });
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("loadRegistry returns parsed registry when file exists", () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });
  fs.writeFileSync(path.join(echoHome, "registry.json"), JSON.stringify({
    projects: { "test-proj": { root: "/tmp/test-proj", registeredAt: "2026-01-01T00:00:00.000Z" } },
  }));

  const registry = loadRegistry(echoHome);

  assert.equal(Object.keys(registry.projects).length, 1);
  assert.equal(registry.projects["test-proj"].root, "/tmp/test-proj");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("saveRegistry creates echo home and writes registry.json", () => {
  const echoHome = tempDir();

  saveRegistry(echoHome, {
    projects: { "proj-a": { root: "/home/user/proj-a", registeredAt: "2026-05-22T00:00:00.000Z" } },
  });

  const raw = fs.readFileSync(path.join(echoHome, "registry.json"), "utf-8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.projects["proj-a"].root, "/home/user/proj-a");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("registerProject registers new project and creates data directories", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });

  const result = registerProject(projectPath, { echoHome });

  assert.equal(result.created, true);
  assert.equal(result.projectId, path.basename(projectPath).toLowerCase());
  assert.ok(result.dataRoot.startsWith(echoHome));
  assert.ok(result.dataRoot.endsWith(result.projectId));

  for (const d of ["session-buffer", "articles", "comments", "index"]) {
    assert.ok(fs.existsSync(path.join(result.dataRoot, d)), `expected ${d}/ to exist`);
    assert.ok(result.dirsCreated.includes(d));
  }

  const registry = loadRegistry(echoHome);
  assert.equal(registry.projects[result.projectId].root, path.resolve(projectPath));

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("registerProject is idempotent on repeated registration", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });

  const first = registerProject(projectPath, { echoHome });
  const second = registerProject(projectPath, { echoHome });

  assert.equal(second.created, false);
  assert.equal(second.projectId, first.projectId);
  assert.equal(second.dataRoot, first.dataRoot);
  assert.equal(second.projectRoot, first.projectRoot);
  assert.deepEqual(second.dirsCreated, []);
  assert.deepEqual(second.dirsSkipped, []);

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("registerProject creates dirs only once; second call skips all", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });

  const first = registerProject(projectPath, { echoHome });
  assert.equal(first.dirsCreated.length, 4);

  const second = registerProject(projectPath, { echoHome });
  assert.equal(second.created, false);
  assert.equal(second.dirsCreated.length, 0);
  assert.equal(second.dirsSkipped.length, 0);

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("registerProject handles projects with special characters in path", () => {
  const echoHome = tempDir();
  const projectDir = tempDir() + path.sep + "My Echo Notes!";
  fs.mkdirSync(projectDir, { recursive: true });

  const result = registerProject(projectDir, { echoHome });

  assert.ok(!result.projectId.includes(" "));
  assert.ok(!result.projectId.includes("!"));
  assert.ok(/^[a-z0-9._-]+$/.test(result.projectId));

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true });
});

test("findProjectForPath returns project for exact match", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });
  registerProject(projectPath, { echoHome });

  const found = findProjectForPath(projectPath, { echoHome });

  assert.notEqual(found, null);
  assert.equal(found.projectRoot, path.resolve(projectPath));

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("findProjectForPath returns project for child path of registered project", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });
  registerProject(projectPath, { echoHome });

  const found = findProjectForPath(path.join(projectPath, "sub", "dir"), { echoHome });

  assert.notEqual(found, null);
  assert.equal(found.projectRoot, path.resolve(projectPath));

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("findProjectForPath returns null for unknown path", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });
  registerProject(projectPath, { echoHome });

  const found = findProjectForPath("/nonexistent/path", { echoHome });

  assert.equal(found, null);

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("findProjectForPath returns null when registry is empty", () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });

  const found = findProjectForPath("/any/path", { echoHome });

  assert.equal(found, null);
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("registerProject resolves relative paths to absolute", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });

  const result = registerProject(projectPath, { echoHome });
  assert.ok(path.isAbsolute(result.projectRoot));

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});
