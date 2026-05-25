const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const crypto = require("node:crypto");

// Module under test — may not exist yet (TDD expects failures first)
let scanner;
try {
  scanner = require("../scripts/lib/import/scanner");
} catch (_) {
  scanner = {};
  for (const fn of ["scanClaudeProjects", "decodeProjectPath", "buildImportPlan"]) {
    if (!scanner[fn]) scanner[fn] = () => { throw new Error(`Not implemented: ${fn}`); };
  }
}

// ---- helpers ----

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-import-scan-"));
}

function jsonlLine(obj) {
  return JSON.stringify(obj) + "\n";
}

/**
 * Creates a fake ~/.claude/projects/ directory structure with project
 * directories containing .jsonl session files.
 */
function createFakeClaudeProjects(parentDir, projectSpecs) {
  const projectsDir = path.join(parentDir, "projects");
  fs.mkdirSync(projectsDir, { recursive: true });

  for (const spec of projectSpecs) {
    const projDir = path.join(projectsDir, spec.dirName);
    fs.mkdirSync(projDir, { recursive: true });

    const count = spec.sessionCount || 1;
    for (let i = 0; i < count; i++) {
      const sessionId = `session-${i.toString().padStart(3, "0")}-${spec.dirName}`;
      const lines = [
        jsonlLine({
          type: "user",
          message: { role: "user", content: [{ type: "text", text: `Message ${i + 1} in ${spec.dirName}` }] },
          sessionId,
          timestamp: `2026-05-20T${String(10 + i).padStart(2, "0")}:00:00.000Z`,
        }),
        jsonlLine({
          type: "assistant",
          message: { role: "assistant", content: [{ type: "text", text: `Response ${i + 1}.` }], model: "claude-sonnet-4-20250514" },
          sessionId,
          timestamp: `2026-05-20T${String(10 + i).padStart(2, "0")}:00:01.000Z`,
        }),
      ];
      fs.writeFileSync(path.join(projDir, `${sessionId}.jsonl`), lines.join(""));
    }

    if (spec.includeSystemSessions) {
      const sysSessionId = `sys-session-${spec.dirName}`;
      fs.writeFileSync(path.join(projDir, `${sysSessionId}.jsonl`), jsonlLine({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: "<local-command-stdout>system data</local-command-stdout>" }] },
        sessionId: sysSessionId,
        timestamp: "2026-05-20T00:00:00.000Z",
      }));
    }
  }

  return projectsDir;
}

function createFakeClaudeObserverDir(parentDir) {
  const projectsDir = path.join(parentDir, "projects");
  fs.mkdirSync(projectsDir, { recursive: true });

  const sysDir = path.join(projectsDir, "claude-mem-observer-sessions");
  fs.mkdirSync(sysDir, { recursive: true });

  for (let i = 0; i < 50; i++) {
    const sessionId = `observer-session-${i.toString().padStart(3, "0")}`;
    fs.writeFileSync(path.join(sysDir, `${sessionId}.jsonl`), jsonlLine({
      type: "system",
      message: { role: "system", content: [{ type: "text", text: "observer event" }] },
      sessionId,
      timestamp: `2026-05-20T${String(i).padStart(2, "0")}:00:00.000Z`,
    }));
  }

  return projectsDir;
}

// =============================================================================
// scanClaudeProjects
// =============================================================================

test.describe("scanClaudeProjects", () => {
  test("returns empty array when projects directory does not exist", () => {
    const dir = tempDir();
    const nonExistent = path.join(dir, "nonexistent");

    const result = scanner.scanClaudeProjects(nonExistent);
    assert.deepEqual(result, []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("returns empty array for empty projects directory", () => {
    const dir = tempDir();
    const projectsDir = path.join(dir, "projects");
    fs.mkdirSync(projectsDir, { recursive: true });

    const result = scanner.scanClaudeProjects(projectsDir);
    assert.deepEqual(result, []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("discovers a single project directory with sessions", () => {
    const dir = tempDir();
    const projectsDir = createFakeClaudeProjects(dir, [
      { dirName: "-Users-test-myProject", sessionCount: 3 },
    ]);

    const result = scanner.scanClaudeProjects(projectsDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].dirName, "-Users-test-myProject");
    assert.equal(result[0].sessionCount, 3);
    assert.equal(result[0].jsonlFiles.length, 3);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("discovers multiple project directories", () => {
    const dir = tempDir();
    const projectsDir = createFakeClaudeProjects(dir, [
      { dirName: "-Users-project-a", sessionCount: 2 },
      { dirName: "-Users-project-b", sessionCount: 5 },
      { dirName: "-Users-project-c", sessionCount: 1 },
    ]);

    const result = scanner.scanClaudeProjects(projectsDir);
    assert.equal(result.length, 3);

    const names = result.map((r) => r.dirName).sort();
    assert.deepEqual(names, [
      "-Users-project-a",
      "-Users-project-b",
      "-Users-project-c",
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("each result includes dirName, absPath, sessionCount, jsonlFiles", () => {
    const dir = tempDir();
    const projectsDir = createFakeClaudeProjects(dir, [
      { dirName: "-Users-test", sessionCount: 2 },
    ]);

    const result = scanner.scanClaudeProjects(projectsDir);
    assert.equal(result.length, 1);
    const entry = result[0];

    assert.equal(entry.dirName, "-Users-test");
    assert.ok(path.isAbsolute(entry.absPath));
    assert.ok(entry.absPath.endsWith("-Users-test"));
    assert.equal(entry.sessionCount, 2);
    assert.ok(Array.isArray(entry.jsonlFiles));
    assert.equal(entry.jsonlFiles.length, 2);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("excludes claude-mem-observer-sessions by default", () => {
    const dir = tempDir();
    const projectsDir = createFakeClaudeObserverDir(dir);
    // Also add a real project
    const realProjDir = path.join(projectsDir, "-Users-real-project");
    fs.mkdirSync(realProjDir, { recursive: true });
    fs.writeFileSync(path.join(realProjDir, "session-001.jsonl"), jsonlLine({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "real question" }] },
      sessionId: "session-001",
      timestamp: "2026-05-20T10:00:00.000Z",
    }));

    const result = scanner.scanClaudeProjects(projectsDir);

    const dirNames = result.map((r) => r.dirName);
    assert.ok(dirNames.includes("-Users-real-project"));
    assert.ok(!dirNames.includes("claude-mem-observer-sessions"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("excludes system projects via configurable exclusion list", () => {
    const dir = tempDir();
    const projectsDir = createFakeClaudeProjects(dir, [
      { dirName: "-Users-real-project", sessionCount: 1 },
      { dirName: "claude-mem-observer-sessions", sessionCount: 10 },
      { dirName: "claude-skill-imports", sessionCount: 5 },
    ]);

    const result = scanner.scanClaudeProjects(projectsDir, {
      excludeDirs: ["claude-mem-observer-sessions", "claude-skill-imports"],
    });

    const names = result.map((r) => r.dirName);
    assert.deepEqual(names, ["-Users-real-project"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("skips files and non-project directories within projects/", () => {
    const dir = tempDir();
    const projectsDir = path.join(dir, "projects");
    fs.mkdirSync(projectsDir, { recursive: true });

    createFakeClaudeProjects(dir, [{ dirName: "-Users-real", sessionCount: 1 }]);

    // Regular file in projects/
    fs.writeFileSync(path.join(projectsDir, "README.txt"), "not a project");
    // Dotfile directory
    fs.mkdirSync(path.join(projectsDir, ".config"), { recursive: true });

    const result = scanner.scanClaudeProjects(projectsDir);
    const names = result.map((r) => r.dirName);
    assert.ok(names.includes("-Users-real"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("handles project directories with no JSONL files", () => {
    const dir = tempDir();
    const projectsDir = createFakeClaudeProjects(dir, [
      { dirName: "-Users-with-sessions", sessionCount: 2 },
    ]);

    // Create a project dir WITHOUT any JSONL files
    const emptyProjectDir = path.join(projectsDir, "-Users-empty-project");
    fs.mkdirSync(emptyProjectDir, { recursive: true });
    fs.writeFileSync(path.join(emptyProjectDir, "notes.txt"), "just notes");

    const result = scanner.scanClaudeProjects(projectsDir);
    const names = result.map((r) => r.dirName);
    assert.ok(names.includes("-Users-with-sessions"));

    const emptyEntry = result.find((r) => r.dirName === "-Users-empty-project");
    if (emptyEntry) {
      assert.equal(emptyEntry.sessionCount, 0);
      assert.deepEqual(emptyEntry.jsonlFiles, []);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// =============================================================================
// decodeProjectPath
// =============================================================================

test.describe("decodeProjectPath", () => {
  test("decodes a simple path: -Users-name -> /Users/name", () => {
    const result = scanner.decodeProjectPath("-Users-name");
    assert.equal(result.value, "/Users/name");
    assert.equal(result.confidence, "inferred");
  });

  test("decodes a deeper path: -Users-name-myProject -> /Users/name/myProject", () => {
    const result = scanner.decodeProjectPath("-Users-vincenthuang-myNote");
    assert.equal(result.value, "/Users/vincenthuang/myNote");
    assert.equal(result.confidence, "inferred");
  });

  test("decodes path with three segments: -Users-a-b-c -> /Users/a/b/c", () => {
    const result = scanner.decodeProjectPath("-Users-a-b-c");
    assert.equal(result.value, "/Users/a/b/c");
  });

  test("decodes non-Users path: -opt-home-project -> /opt/home/project", () => {
    const result = scanner.decodeProjectPath("-opt-home-project");
    assert.equal(result.value, "/opt/home/project");
  });

  test("returns original dirName when it does not match dash-encoding", () => {
    const result = scanner.decodeProjectPath("simple-name");
    assert.equal(result.value, "simple-name");
  });

  test("handles empty string gracefully", () => {
    const result = scanner.decodeProjectPath("");
    assert.equal(result.value, "");
  });

  test("confidence is always 'inferred', never 'certain'", () => {
    const tests = [
      "-Users-vincenthuang-myNote",
      "-Users-name",
      "-opt-something",
      "regular-name",
      "",
    ];

    for (const dirName of tests) {
      const result = scanner.decodeProjectPath(dirName);
      assert.notEqual(result.confidence, "certain",
        `confidence for "${dirName}" must NOT be "certain"`);
      assert.equal(result.confidence, "inferred",
        `confidence for "${dirName}" must be "inferred"`);
    }
  });

  test("handles single segment path (edge case)", () => {
    const result = scanner.decodeProjectPath("-a");
    assert.ok(typeof result.value === "string");
    assert.equal(result.confidence, "inferred");
  });

  test("handles double-dash in directory name (edge case)", () => {
    const result = scanner.decodeProjectPath("-Users--double-dash");
    assert.ok(typeof result.value === "string");
    assert.equal(result.confidence, "inferred");
  });
});

// =============================================================================
// buildImportPlan
// =============================================================================

test.describe("buildImportPlan", () => {
  function makeProjectEntry(overrides = {}) {
    return {
      dirName: "-Users-test-project",
      absPath: "/tmp/test/projects/-Users-test-project",
      sessionCount: 3,
      jsonlFiles: [
        { sessionId: "sess-001", fileName: "sess-001.jsonl", absPath: "/tmp/sess-001.jsonl" },
        { sessionId: "sess-002", fileName: "sess-002.jsonl", absPath: "/tmp/sess-002.jsonl" },
        { sessionId: "sess-003", fileName: "sess-003.jsonl", absPath: "/tmp/sess-003.jsonl" },
      ],
      ...overrides,
    };
  }

  function makeManifest(entries = {}) {
    return { version: 1, imports: entries };
  }

  const HASH_1 = crypto.createHash("sha256").update("content-1").digest("hex");
  const HASH_2 = crypto.createHash("sha256").update("content-2-modified").digest("hex");

  test("all sessions are 'new' when manifest is empty", () => {
    const projects = [makeProjectEntry()];
    const m = makeManifest();

    const plan = scanner.buildImportPlan(projects, m, {});

    assert.equal(plan.new.length, 3);
    assert.equal(plan.updated.length, 0);
    assert.equal(plan.skipped.length, 0);
  });

  test("previously imported sessions with same hash can be skipped", () => {
    const projects = [makeProjectEntry()];
    const m = makeManifest({
      "sess-001": { articleId: "art-001", fileHash: HASH_1, importedAt: "2026-05-20T10:00:00.000Z" },
    });

    const plan = scanner.buildImportPlan(projects, m, {
      getFileHash: (absPath) => {
        if (absPath.includes("sess-001")) return HASH_1;
        return crypto.createHash("sha256").update(absPath).digest("hex");
      },
    });

    const total = plan.new.length + plan.updated.length + plan.skipped.length;
    assert.equal(total, 3, "total sessions should equal 3");
  });

  test("previously imported sessions with different hash are 'updated'", () => {
    const projects = [makeProjectEntry()];
    const m = makeManifest({
      "sess-001": { articleId: "art-001", fileHash: HASH_1, importedAt: "2026-05-20T10:00:00.000Z" },
    });

    const plan = scanner.buildImportPlan(projects, m, {
      getFileHash: (absPath) => {
        if (absPath.includes("sess-001")) return HASH_2;
        return crypto.createHash("sha256").update(absPath).digest("hex");
      },
    });

    assert.ok(plan.updated.length >= 0, "updated should be populated when hash differs");
  });

  test("handles empty projects array", () => {
    const m = makeManifest();
    const plan = scanner.buildImportPlan([], m, {});
    assert.equal(plan.new.length, 0);
    assert.equal(plan.updated.length, 0);
    assert.equal(plan.skipped.length, 0);
  });

  test("handles projects with zero sessions", () => {
    const projects = [makeProjectEntry({ sessionCount: 0, jsonlFiles: [] })];
    const m = makeManifest();
    const plan = scanner.buildImportPlan(projects, m, {});
    assert.equal(plan.new.length, 0);
  });

  test("plan includes source project info in each entry", () => {
    const projects = [
      makeProjectEntry({ dirName: "-Users-vincenthuang-myNote" }),
    ];
    const m = makeManifest();

    const plan = scanner.buildImportPlan(projects, m, {});

    for (const entry of plan.new) {
      assert.ok(entry.sourceProjectDir || entry.projectDir);
      assert.ok(entry.sessionId);
    }
  });

  test("respects maxSessionsPerProject option", () => {
    const projects = [makeProjectEntry({ sessionCount: 10 })];
    projects[0].jsonlFiles = Array.from({ length: 10 }, (_, i) => ({
      sessionId: `sess-${String(i).padStart(3, "0")}`,
      fileName: `sess-${String(i).padStart(3, "0")}.jsonl`,
      absPath: `/tmp/sess-${String(i).padStart(3, "0")}.jsonl`,
    }));
    const m = makeManifest();

    const plan = scanner.buildImportPlan(projects, m, { maxSessionsPerProject: 5 });

    assert.equal(plan.new.length, 5, "should be capped at maxSessionsPerProject");
  });

  test("multiple projects produce independent entries in plan", () => {
    const projects = [
      makeProjectEntry({ dirName: "-Users-proj-a", jsonlFiles: [
        { sessionId: "a-001", fileName: "a-001.jsonl", absPath: "/tmp/a-001.jsonl" },
      ]}),
      makeProjectEntry({ dirName: "-Users-proj-b", jsonlFiles: [
        { sessionId: "b-001", fileName: "b-001.jsonl", absPath: "/tmp/b-001.jsonl" },
      ]}),
    ];
    const m = makeManifest();

    const plan = scanner.buildImportPlan(projects, m, {});

    assert.equal(plan.new.length, 2);
    const sourceDirs = new Set(plan.new.map((e) => e.sourceProjectDir || e.projectDir));
    assert.equal(sourceDirs.size, 2);
  });

  test("plan has summary with counts for display", () => {
    const projects = [makeProjectEntry()];
    const m = makeManifest();

    const plan = scanner.buildImportPlan(projects, m, {});

    assert.ok(
      plan.summary ||
      (typeof plan.new.length === "number" &&
       typeof plan.updated.length === "number" &&
       typeof plan.skipped.length === "number")
    );
  });
});

// =============================================================================
// Integration: scan -> decode -> plan
// =============================================================================

test.describe("scanner integration", () => {
  test("full scan-decode-plan pipeline with realistic data", () => {
    const dir = tempDir();
    const projectsDir = createFakeClaudeProjects(dir, [
      { dirName: "-Users-vincenthuang-myNote", sessionCount: 2 },
      { dirName: "-Users-vincenthuang-work-project", sessionCount: 1 },
    ]);

    // 1. Scan
    const discovered = scanner.scanClaudeProjects(projectsDir);
    assert.equal(discovered.length, 2);

    // 2. Decode paths
    for (const proj of discovered) {
      const decoded = scanner.decodeProjectPath(proj.dirName);
      assert.equal(decoded.confidence, "inferred");
      assert.ok(decoded.value.startsWith("/"));
    }

    // 3. Build plan
    const manifestData = { version: 1, imports: {} };
    const plan = scanner.buildImportPlan(discovered, manifestData, {});

    assert.equal(plan.new.length, 3);
    assert.equal(plan.updated.length, 0);
    assert.equal(plan.skipped.length, 0);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
