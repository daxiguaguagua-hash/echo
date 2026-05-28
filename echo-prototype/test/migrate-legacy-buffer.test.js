const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");

const { registerProject } = require("../scripts/lib/usecases/project-registry");
const { migrateLegacyBuffer } = require("../scripts/lib/usecases/migrate-legacy-buffer");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-migrate-legacy-"));
}

function writeLegacySession(echoHome, name = "session-2026-05-28-v1.md") {
  const legacyDir = path.join(echoHome, "session-buffer");
  fs.mkdirSync(legacyDir, { recursive: true });
  const filePath = path.join(legacyDir, name);
  fs.writeFileSync(filePath, "<!-- turn: t001 speaker=vincent -->\nhello\n");
  fs.writeFileSync(path.join(legacyDir, "session-map.txt"), `sess-1=${filePath}\n`);
  return { legacyDir, filePath, name };
}

test("migrateLegacyBuffer previews legacy markdown and session map updates", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  const project = registerProject(projectPath, { echoHome, projectId: "demo" });
  const { name } = writeLegacySession(echoHome);

  const result = migrateLegacyBuffer({ echoHome, projectId: "demo" });

  assert.equal(result.applied, false);
  assert.equal(result.projectId, "demo");
  assert.equal(result.summary.copy, 1);
  assert.equal(result.summary.mapUpdates, 1);
  assert.equal(result.files[0].name, name);
  assert.equal(fs.existsSync(path.join(project.dataRoot, "session-buffer", name)), false);

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("migrateLegacyBuffer applies copy into project session-buffer and rewrites session-map", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  const project = registerProject(projectPath, { echoHome, projectId: "demo" });
  const { filePath, name } = writeLegacySession(echoHome);
  fs.writeFileSync(path.join(echoHome, "session-buffer", "auq-counter.txt"), "2");
  fs.mkdirSync(path.join(echoHome, "session-buffer", "pending"), { recursive: true });
  fs.writeFileSync(path.join(echoHome, "session-buffer", "pending", "sess-2.json"), "{}");
  fs.writeFileSync(path.join(echoHome, "session-buffer", "failures.jsonl"), "{\"error\":\"x\"}\n");

  const result = migrateLegacyBuffer({ echoHome, projectId: "demo", apply: true });
  const targetDir = path.join(project.dataRoot, "session-buffer");
  const targetFile = path.join(targetDir, name);

  assert.equal(result.applied, true);
  assert.equal(fs.readFileSync(targetFile, "utf-8"), fs.readFileSync(filePath, "utf-8"));
  assert.equal(fs.readFileSync(path.join(targetDir, "session-map.txt"), "utf-8"), `sess-1=${targetFile}\n`);
  assert.equal(fs.readFileSync(path.join(targetDir, "auq-counter.txt"), "utf-8"), "2");
  assert.equal(fs.existsSync(path.join(targetDir, "pending", "sess-2.json")), true);
  assert.equal(fs.readFileSync(path.join(targetDir, "failures.jsonl"), "utf-8"), "{\"error\":\"x\"}\n");

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("migrateLegacyBuffer can register --path target and skip existing destination files", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  const { name } = writeLegacySession(echoHome);
  const first = migrateLegacyBuffer({ echoHome, projectPath, apply: true });
  const second = migrateLegacyBuffer({ echoHome, projectId: first.projectId, apply: true });

  assert.equal(first.registered, true);
  assert.equal(fs.existsSync(path.join(first.targetDir, name)), true);
  assert.equal(second.summary.skippedExisting, 1);
  assert.equal(second.summary.mapUpdates, 0);

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("migrateLegacyBuffer reports session-map conflicts unless overwrite is requested", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  const project = registerProject(projectPath, { echoHome, projectId: "demo" });
  writeLegacySession(echoHome);
  const targetDir = path.join(project.dataRoot, "session-buffer");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, "session-map.txt"), "sess-1=/tmp/other.md\n");

  const result = migrateLegacyBuffer({ echoHome, projectId: "demo" });

  assert.equal(result.summary.mapConflicts, 1);
  assert.equal(result.mapConflicts[0].sessionId, "sess-1");

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("echoctl migrate legacy-buffer applies migration from the CLI", () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  const { name } = writeLegacySession(echoHome);
  const bin = path.resolve(__dirname, "../bin/echoctl.js");

  const out = execFileSync(
    process.execPath,
    [bin, "migrate", "legacy-buffer", "--path", projectPath, "--apply"],
    {
      encoding: "utf-8",
      env: { ...process.env, ECHO_HOME: echoHome, ECHO_WORKSPACE: echoHome },
    }
  );

  assert.match(out, /Legacy buffer migration applied/);
  assert.match(out, /Registered: yes/);
  assert.equal(fs.existsSync(path.join(echoHome, "projects", path.basename(projectPath).toLowerCase(), "session-buffer", name)), true);

  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});
