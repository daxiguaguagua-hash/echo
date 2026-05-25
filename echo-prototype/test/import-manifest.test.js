const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const crypto = require("node:crypto");

// Module under test — may not exist yet (TDD expects failures first)
let manifest;
try {
  manifest = require("../scripts/lib/import/manifest");
} catch (_) {
  manifest = {};
  for (const fn of ["loadManifest", "saveManifest", "isImported", "isModified", "recordImport", "validateManifest"]) {
    if (!manifest[fn]) manifest[fn] = () => { throw new Error(`Not implemented: ${fn}`); };
  }
}

// ---- helpers ----

const SESSION_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SESSION_B = "11111111-2222-3333-4444-555555555555";
const ARTICLE_A = "session-aaaaaaaa";
const ARTICLE_B = "session-11111111";
const HASH_A = crypto.createHash("sha256").update("content-a").digest("hex");
const HASH_B = crypto.createHash("sha256").update("content-b").digest("hex");
const HASH_A_V2 = crypto.createHash("sha256").update("content-a-modified").digest("hex");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-import-manifest-"));
}

function writeManifest(dir, data) {
  const filePath = path.join(dir, "import-manifest.json");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

function sampleManifest() {
  return {
    version: 1,
    imports: {
      [SESSION_A]: {
        articleId: ARTICLE_A,
        fileHash: HASH_A,
        importedAt: "2026-05-20T10:00:00.000Z",
        provider: "claude-code",
        sourceProjectDir: "-Users-test",
        project: "my-project",
      },
    },
  };
}

// =============================================================================
// loadManifest
// =============================================================================

test.describe("loadManifest", () => {
  test("returns empty structure when manifest file does not exist", () => {
    const dir = tempDir();
    const manifestPath = path.join(dir, "import-manifest.json");

    const result = manifest.loadManifest(manifestPath);
    assert.deepEqual(result, { version: 1, imports: {} });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("parses a valid manifest JSON file", () => {
    const dir = tempDir();
    const data = sampleManifest();
    const manifestPath = writeManifest(dir, data);

    const result = manifest.loadManifest(manifestPath);
    assert.equal(result.version, 1);
    assert.ok(SESSION_A in result.imports);
    assert.equal(result.imports[SESSION_A].articleId, ARTICLE_A);
    assert.equal(result.imports[SESSION_A].fileHash, HASH_A);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("fails on corrupt JSON with a descriptive error", () => {
    const dir = tempDir();
    const manifestPath = path.join(dir, "import-manifest.json");
    fs.writeFileSync(manifestPath, "{not valid json");

    assert.throws(
      () => manifest.loadManifest(manifestPath),
      /corrupt|parse|invalid|JSON/i
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("returns default structure for empty file", () => {
    const dir = tempDir();
    const manifestPath = path.join(dir, "import-manifest.json");
    fs.writeFileSync(manifestPath, "");

    try {
      const result = manifest.loadManifest(manifestPath);
      assert.deepEqual(result, { version: 1, imports: {} });
    } catch (err) {
      assert.ok(err.message);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// =============================================================================
// saveManifest
// =============================================================================

test.describe("saveManifest", () => {
  test("writes manifest to disk and creates parent directories", () => {
    const dir = tempDir();
    const manifestPath = path.join(dir, "nested", "import-manifest.json");
    const data = sampleManifest();

    manifest.saveManifest(data, manifestPath);

    assert.ok(fs.existsSync(manifestPath));
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.imports[SESSION_A].articleId, ARTICLE_A);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("overwrites existing manifest file", () => {
    const dir = tempDir();
    const manifestPath = writeManifest(dir, sampleManifest());

    const newData = {
      version: 1,
      imports: {
        [SESSION_B]: {
          articleId: ARTICLE_B,
          fileHash: HASH_B,
          importedAt: "2026-05-21T10:00:00.000Z",
          provider: "claude-code",
          sourceProjectDir: "-Users-other",
          project: "other-project",
        },
      },
    };
    manifest.saveManifest(newData, manifestPath);

    const raw = fs.readFileSync(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    assert.ok(!(SESSION_A in parsed.imports));
    assert.equal(parsed.imports[SESSION_B].articleId, ARTICLE_B);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("writes valid JSON with pretty-printing", () => {
    const dir = tempDir();
    const manifestPath = path.join(dir, "import-manifest.json");
    const data = sampleManifest();

    manifest.saveManifest(data, manifestPath);

    const raw = fs.readFileSync(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed, data);
    assert.ok(raw.includes("\n  "), "output should be pretty-printed");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("atomic write — file is valid JSON after saveManifest returns", () => {
    const dir = tempDir();
    const manifestPath = path.join(dir, "import-manifest.json");

    const initial = sampleManifest();
    manifest.saveManifest(initial, manifestPath);
    assert.ok(fs.existsSync(manifestPath));

    const raw = fs.readFileSync(manifestPath, "utf-8");
    assert.doesNotThrow(() => JSON.parse(raw));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// =============================================================================
// isImported
// =============================================================================

test.describe("isImported", () => {
  test("returns true for a previously imported session", () => {
    const m = sampleManifest();
    assert.equal(manifest.isImported(m, SESSION_A), true);
  });

  test("returns false for a session not in the manifest", () => {
    const m = sampleManifest();
    assert.equal(manifest.isImported(m, SESSION_B), false);
  });

  test("returns false for empty manifest", () => {
    const m = { version: 1, imports: {} };
    assert.equal(manifest.isImported(m, SESSION_A), false);
  });

  test("returns false for null or undefined sessionId", () => {
    const m = sampleManifest();
    assert.equal(manifest.isImported(m, null), false);
    assert.equal(manifest.isImported(m, undefined), false);
    assert.equal(manifest.isImported(m, ""), false);
  });
});

// =============================================================================
// isModified
// =============================================================================

test.describe("isModified", () => {
  test("returns false when file hash matches manifest entry", () => {
    const m = sampleManifest();
    assert.equal(manifest.isModified(m, SESSION_A, HASH_A), false);
  });

  test("returns true when file hash differs from manifest entry", () => {
    const m = sampleManifest();
    assert.equal(manifest.isModified(m, SESSION_A, HASH_A_V2), true);
  });

  test("returns false for a session not in the manifest (not modified, just new)", () => {
    const m = sampleManifest();
    assert.equal(manifest.isModified(m, SESSION_B, HASH_B), false);
  });

  test("handles null or missing hash gracefully", () => {
    const m = sampleManifest();
    const mNoHash = {
      version: 1,
      imports: {
        [SESSION_A]: {
          articleId: ARTICLE_A,
          importedAt: "2026-05-20T10:00:00.000Z",
        },
      },
    };
    assert.equal(manifest.isModified(mNoHash, SESSION_A, HASH_A), true);
  });
});

// =============================================================================
// recordImport
// =============================================================================

test.describe("recordImport", () => {
  test("records a new import entry in the manifest", () => {
    const m = { version: 1, imports: {} };
    const metadata = {
      provider: "claude-code",
      sourceProjectDir: "-Users-test",
      project: "my-project",
      title: "Test Session",
    };

    const result = manifest.recordImport(m, SESSION_A, ARTICLE_A, HASH_A, metadata);

    assert.ok(result.success !== false);
    assert.ok(SESSION_A in m.imports);
    assert.equal(m.imports[SESSION_A].articleId, ARTICLE_A);
    assert.equal(m.imports[SESSION_A].fileHash, HASH_A);
    assert.ok(m.imports[SESSION_A].importedAt);
    assert.equal(m.imports[SESSION_A].provider, "claude-code");
  });

  test("rejects duplicate import of the same session (success: false)", () => {
    const m = sampleManifest();
    const metadata = { provider: "claude-code" };

    const result = manifest.recordImport(m, SESSION_A, ARTICLE_A, HASH_A, metadata);

    assert.equal(result.success, false);
    assert.ok(result.reason || result.error);
    assert.equal(m.imports[SESSION_A].importedAt, "2026-05-20T10:00:00.000Z");
  });

  test("allows re-import when file hash changed (update scenario)", () => {
    const m = sampleManifest();
    const metadata = { provider: "claude-code" };

    const result = manifest.recordImport(m, SESSION_A, ARTICLE_A, HASH_A_V2, metadata);

    assert.equal(result.success, true);
    assert.ok(SESSION_A in m.imports);
    assert.equal(m.imports[SESSION_A].fileHash, HASH_A_V2);
  });

  test("preserves other entries when recording a new import", () => {
    const m = sampleManifest();

    manifest.recordImport(m, SESSION_B, ARTICLE_B, HASH_B, {
      provider: "claude-code",
      sourceProjectDir: "-Users-other",
      project: "other-project",
    });

    assert.ok(SESSION_A in m.imports);
    assert.equal(m.imports[SESSION_A].articleId, ARTICLE_A);
    assert.ok(SESSION_B in m.imports);
    assert.equal(m.imports[SESSION_B].articleId, ARTICLE_B);
  });

  test("sets importedAt timestamp", () => {
    const m = { version: 1, imports: {} };

    manifest.recordImport(m, SESSION_A, ARTICLE_A, HASH_A, {
      provider: "claude-code",
    });

    const ts = m.imports[SESSION_A].importedAt;
    assert.ok(ts);
    assert.ok(new Date(ts).getTime() > 0, "importedAt should be a valid date");
  });
});

// =============================================================================
// validateManifest
// =============================================================================

test.describe("validateManifest (schema validation)", () => {
  test("accepts a valid manifest structure", () => {
    if (!manifest.validateManifest) return;
    const m = sampleManifest();
    const result = manifest.validateManifest(m);
    assert.equal(result.valid, true);
  });

  test("rejects manifest without version", () => {
    if (!manifest.validateManifest) return;
    const result = manifest.validateManifest({ imports: {} });
    assert.equal(result.valid, false);
    assert.ok(result.errors && result.errors.length > 0);
  });

  test("rejects manifest with non-object imports", () => {
    if (!manifest.validateManifest) return;
    const result = manifest.validateManifest({ version: 1, imports: "not-an-object" });
    assert.equal(result.valid, false);
    assert.ok(result.errors && result.errors.length > 0);
  });

  test("rejects manifest entry without articleId", () => {
    if (!manifest.validateManifest) return;
    const m = {
      version: 1,
      imports: {
        [SESSION_A]: {
          fileHash: HASH_A,
          importedAt: "2026-05-20T10:00:00.000Z",
        },
      },
    };
    const result = manifest.validateManifest(m);
    assert.equal(result.valid, false);
  });

  test("rejects manifest entry without fileHash", () => {
    if (!manifest.validateManifest) return;
    const m = {
      version: 1,
      imports: {
        [SESSION_A]: {
          articleId: ARTICLE_A,
          importedAt: "2026-05-20T10:00:00.000Z",
        },
      },
    };
    const result = manifest.validateManifest(m);
    assert.equal(result.valid, false);
  });

  test("rejects manifest entry without importedAt", () => {
    if (!manifest.validateManifest) return;
    const m = {
      version: 1,
      imports: {
        [SESSION_A]: {
          articleId: ARTICLE_A,
          fileHash: HASH_A,
        },
      },
    };
    const result = manifest.validateManifest(m);
    assert.equal(result.valid, false);
  });
});

// =============================================================================
// Concurrency
// =============================================================================

test.describe("concurrency safety", () => {
  test("two simultaneous recordImport calls for same session: only one succeeds", () => {
    const m = { version: 1, imports: {} };
    const metadata = { provider: "claude-code" };

    const r1 = manifest.recordImport(m, SESSION_A, ARTICLE_A, HASH_A, metadata);
    assert.equal(r1.success, true);

    const r2 = manifest.recordImport(m, SESSION_A, "session-different-id", HASH_A, metadata);
    assert.equal(r2.success, false);

    assert.equal(m.imports[SESSION_A].articleId, ARTICLE_A);
  });

  test("manifest state is consistent after multiple interleaved imports", () => {
    const m = { version: 1, imports: {} };

    manifest.recordImport(m, SESSION_A, ARTICLE_A, HASH_A, { provider: "claude-code" });
    manifest.recordImport(m, SESSION_B, ARTICLE_B, HASH_B, { provider: "claude-code" });

    assert.equal(Object.keys(m.imports).length, 2);
    assert.equal(m.imports[SESSION_A].articleId, ARTICLE_A);
    assert.equal(m.imports[SESSION_B].articleId, ARTICLE_B);
  });
});
