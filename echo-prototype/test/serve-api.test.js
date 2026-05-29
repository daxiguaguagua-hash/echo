const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const test = require("node:test");

const net = require("node:net");
const { createRouter, findFreePort } = require("../scripts/serve");
const { registerProject } = require("../scripts/lib/usecases/project-registry");
const { resolveDataDirs } = require("../scripts/lib/infra/echo-paths");
function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-serve-test-"));
}

function jsonRequest(router, method, pathname, body, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(pathname, "http://127.0.0.1");
    const req = new http.IncomingMessage(null);
    req.method = method;
    req.url = url.pathname + url.search;
    req.headers = headers;
    const chunks = [];
    const res = {
      _chunks: chunks,
      writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
      end(data) {
        this._chunks.push(data || "");
        this.body = this._chunks.join("") ? JSON.parse(this._chunks.join("")) : null;
        resolve(this);
      },
    };
    if (body) { req.push(JSON.stringify(body)); }
    req.push(null);
    router(req, res);
  });
}

function readTagsPayload(tagsIndex) {
  const match = tagsIndex.match(/<EchoTagsPage payload="([^"]+)" \/>/);
  assert.ok(match, "tags page should render EchoTagsPage payload");
  return JSON.parse(decodeURIComponent(match[1]));
}

test("GET /api/mcp-config returns canonical, legacy, and serverInfo", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const router = createRouter({ docsPort: 5173, docsRoot: "/tmp/fake-site" });

  const res = await jsonRequest(router, "GET", "/api/mcp-config");
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.canonical);
  assert.ok(res.body.canonical.command);
  assert.ok(Array.isArray(res.body.canonical.args));
  assert.ok(Array.isArray(res.body.legacy));
  assert.ok(res.body.serverInfo);
  assert.equal(res.body.serverInfo.name, "echo-mcp");

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("GET /api/mcp-config has valid CORS headers", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const router = createRouter({ docsPort: 5173 });

  const res = await jsonRequest(router, "GET", "/api/mcp-config");
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers["Access-Control-Allow-Origin"]);

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("GET /api/status allows localhost origin for docs port", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const router = createRouter({ docsPort: 5173 });

  const res = await jsonRequest(router, "GET", "/api/status", null, { origin: "http://localhost:5173" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "http://localhost:5173");

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("POST /api/comments returns 400 without articleId", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const router = createRouter({ docsPort: 5173 });

  const res = await jsonRequest(router, "POST", "/api/comments", { comment: "test" });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes("articleId"));

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("POST /api/comments returns 400 without comment", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const router = createRouter({ docsPort: 5173 });

  const res = await jsonRequest(router, "POST", "/api/comments", { articleId: "test-1" });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes("comment"));

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("POST /api/comments writes article-level comment to project data dir", async () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const { projectId } = registerProject(projectPath, { echoHome });
  const dirs = resolveDataDirs({ cwd: projectPath });

  fs.mkdirSync(dirs.articlesDir, { recursive: true });
  fs.writeFileSync(path.join(dirs.articlesDir, "test-article-1.md"), [
    "---",
    "id: test-article-1",
    "title: Test Article",
    "created_at: 2026-05-25T00:00:00.000Z",
    "---",
    "",
    "# Test Article",
    "",
    "Body text.",
    "",
  ].join("\n"));

  const router = createRouter({ docsPort: 5173, docsRoot: "/tmp/fake-site", dirs });

  const res = await jsonRequest(router, "POST", "/api/comments", {
    articleId: "test-article-1",
    comment: "Great article!",
    scope: "article",
    projectId,
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.articleId, "test-article-1");
  assert.equal(res.body.scope, "article");

  const commentFiles = fs.readdirSync(dirs.commentsDir);
  assert.ok(commentFiles.length >= 1);

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("POST /api/comments falls back when projectId not found", async () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const dirs = resolveDataDirs({ cwd: projectPath });
  fs.mkdirSync(dirs.articlesDir, { recursive: true });
  fs.writeFileSync(path.join(dirs.articlesDir, "test-article-2.md"), [
    "---",
    "id: test-article-2",
    "title: Test Article 2",
    "created_at: 2026-05-25T00:00:00.000Z",
    "---",
    "",
    "# Test Article 2",
    "",
    "Body.",
    "",
  ].join("\n"));

  const router = createRouter({ docsPort: 5173, docsRoot: "/tmp/fake-site", dirs });

  const res = await jsonRequest(router, "POST", "/api/comments", {
    articleId: "test-article-2",
    comment: "Nice!",
    scope: "article",
    projectId: "nonexistent-project-id",
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.articleId, "test-article-2");

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("POST /api/tags adds a tag to article frontmatter and rebuilds docs", async () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  const docsRoot = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const { projectId } = registerProject(projectPath, { echoHome });
  const dirs = resolveDataDirs({ cwd: projectPath });

  fs.mkdirSync(dirs.articlesDir, { recursive: true });
  const articlePath = path.join(dirs.articlesDir, "tag-target.md");
  fs.writeFileSync(articlePath, [
    "---",
    "id: tag-target",
    "title: Tag Target",
    "created_at: 2026-05-25T00:00:00.000Z",
    "tags: []",
    "project: " + projectId,
    "---",
    "",
    "# Tag Target",
    "",
    "Body text.",
    "",
  ].join("\n"));

  const router = createRouter({ docsPort: 5173, docsRoot, dirs });

  const res = await jsonRequest(router, "POST", "/api/tags", {
    articleId: "tag-target",
    tag: "新标记",
    projectId,
  });

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body.tags, ["新标记"]);
  assert.match(fs.readFileSync(articlePath, "utf-8"), /新标记/);
  const tagPayload = readTagsPayload(fs.readFileSync(path.join(docsRoot, "tags", "index.md"), "utf-8"));
  assert.ok(tagPayload.some((group) => group.tag === "新标记"));

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

test("POST /api/tags/rename renames a tag across multiple articles", async () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  const docsRoot = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const { projectId } = registerProject(projectPath, { echoHome });
  const dirs = resolveDataDirs({ cwd: projectPath });

  fs.mkdirSync(dirs.articlesDir, { recursive: true });
  for (const [id, tags] of [["art-a", ["旧标签", "公共"]], ["art-b", ["旧标签"]]]) {
    const articlePath = path.join(dirs.articlesDir, `${id}.md`);
    fs.writeFileSync(articlePath, [
      "---",
      `id: ${id}`,
      `title: ${id}`,
      "created_at: 2026-05-25T00:00:00.000Z",
      `tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]`,
      `project: ${projectId}`,
      "---",
      "",
      `# ${id}`,
      "",
      "Body.",
      "",
    ].join("\n"));
  }

  const router = createRouter({ docsPort: 5173, docsRoot, dirs });

  const res = await jsonRequest(router, "POST", "/api/tags/rename", {
    oldTag: "旧标签",
    newTag: "新标签",
    projectId,
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.oldTag, "旧标签");
  assert.equal(res.body.newTag, "新标签");
  assert.equal(res.body.renamed, 2);
  assert.match(fs.readFileSync(path.join(dirs.articlesDir, "art-a.md"), "utf-8"), /新标签/);
  assert.doesNotMatch(fs.readFileSync(path.join(dirs.articlesDir, "art-a.md"), "utf-8"), /旧标签/);
  assert.match(fs.readFileSync(path.join(dirs.articlesDir, "art-b.md"), "utf-8"), /新标签/);
  assert.doesNotMatch(fs.readFileSync(path.join(dirs.articlesDir, "art-b.md"), "utf-8"), /旧标签/);

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

test("POST /api/tags/rename returns 400 without oldTag", async () => {
  const router = createRouter({ docsPort: 5173 });
  const res = await jsonRequest(router, "POST", "/api/tags/rename", { newTag: "x" });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes("oldTag"));
});

test("POST /api/tags/rename returns 404 for tag not found", async () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  const docsRoot = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const { projectId } = registerProject(projectPath, { echoHome });
  const dirs = resolveDataDirs({ cwd: projectPath });
  fs.mkdirSync(dirs.articlesDir, { recursive: true });

  const router = createRouter({ docsPort: 5173, docsRoot, dirs });
  const res = await jsonRequest(router, "POST", "/api/tags/rename", {
    oldTag: "nonexistent",
    newTag: "x",
    projectId,
  });

  assert.equal(res.statusCode, 404);

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

test("POST /api/tags/purge removes a tag from all articles", async () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  const docsRoot = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const { projectId } = registerProject(projectPath, { echoHome });
  const dirs = resolveDataDirs({ cwd: projectPath });

  fs.mkdirSync(dirs.articlesDir, { recursive: true });
  for (const [id, tags] of [["art-x", ["删除我", "保留"]], ["art-y", ["删除我"]]]) {
    const articlePath = path.join(dirs.articlesDir, `${id}.md`);
    fs.writeFileSync(articlePath, [
      "---",
      `id: ${id}`,
      `title: ${id}`,
      "created_at: 2026-05-25T00:00:00.000Z",
      `tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]`,
      `project: ${projectId}`,
      "---",
      "",
      `# ${id}`,
      "",
      "Body.",
      "",
    ].join("\n"));
  }

  const router = createRouter({ docsPort: 5173, docsRoot, dirs });

  const res = await jsonRequest(router, "POST", "/api/tags/purge", {
    tag: "删除我",
    projectId,
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.tag, "删除我");
  assert.equal(res.body.purged, 2);
  assert.doesNotMatch(fs.readFileSync(path.join(dirs.articlesDir, "art-x.md"), "utf-8"), /删除我/);
  assert.match(fs.readFileSync(path.join(dirs.articlesDir, "art-x.md"), "utf-8"), /保留/);
  assert.doesNotMatch(fs.readFileSync(path.join(dirs.articlesDir, "art-y.md"), "utf-8"), /删除我/);

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

test("POST /api/tags/purge returns 400 without tag", async () => {
  const router = createRouter({ docsPort: 5173 });
  const res = await jsonRequest(router, "POST", "/api/tags/purge", {});
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes("tag"));
});

test("POST /api/tags/purge returns 404 for tag not found", async () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  const docsRoot = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const { projectId } = registerProject(projectPath, { echoHome });
  const dirs = resolveDataDirs({ cwd: projectPath });
  fs.mkdirSync(dirs.articlesDir, { recursive: true });

  const router = createRouter({ docsPort: 5173, docsRoot, dirs });
  const res = await jsonRequest(router, "POST", "/api/tags/purge", {
    tag: "nonexistent",
    projectId,
  });

  assert.equal(res.statusCode, 404);

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

test("GET /api/status returns capture state and version", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const router = createRouter({ docsPort: 5173 });

  const res = await jsonRequest(router, "GET", "/api/status");
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(typeof res.body.captureEnabled, "boolean");
  assert.ok(res.body.version);
  assert.equal(typeof res.body.author, "string");
  assert.ok(res.body.author.length > 0);

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("GET /api/live-session-state returns hash and turn count for project buffer", async () => {
  const echoHome = tempDir();
  const projectPath = tempDir();
  fs.mkdirSync(projectPath, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const { projectId } = registerProject(projectPath, { echoHome });
  const dirs = resolveDataDirs({ cwd: projectPath });
  fs.mkdirSync(dirs.bufferDir, { recursive: true });
  fs.writeFileSync(path.join(dirs.bufferDir, "session-live-v1.md"), [
    "<!-- turn: t001 speaker=vincent -->",
    "hello",
    "",
    "<!-- turn: t002 speaker=ai reply_to=t001 -->",
    "hi",
    "",
  ].join("\n"));

  const router = createRouter({ docsPort: 5173, dirs });
  const res = await jsonRequest(router, "GET", `/api/live-session-state?projectId=${projectId}&sessionId=session-live-v1`);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.exists, true);
  assert.equal(res.body.projectId, projectId);
  assert.equal(res.body.sessionId, "session-live-v1");
  assert.equal(res.body.turnCount, 2);
  assert.equal(typeof res.body.hash, "string");

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
  fs.rmSync(projectPath, { recursive: true, force: true });
});

test("POST /api/capture toggles capture state", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const router = createRouter({ docsPort: 5173 });

  const on = await jsonRequest(router, "POST", "/api/capture", { enabled: true });
  assert.equal(on.statusCode, 200);
  assert.equal(on.body.enabled, true);

  const off = await jsonRequest(router, "POST", "/api/capture", { enabled: false });
  assert.equal(off.statusCode, 200);
  assert.equal(off.body.enabled, false);

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("OPTIONS returns CORS headers", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });
  process.env.ECHO_HOME = echoHome;

  const router = createRouter({ docsPort: 5173 });

  const res = await jsonRequest(router, "OPTIONS", "/api/status");
  assert.equal(res.statusCode, 204);

  delete process.env.ECHO_HOME;
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("findFreePort returns a free port", async () => {
  const port = await findFreePort(19800);
  assert.ok(port >= 19800);
  assert.ok(port <= 65535);
  assert.equal(typeof port, "number");
});

test("GET /api/import/claude-candidates returns 400 without projectId", async () => {
  const router = createRouter({ docsPort: 5173 });
  const res = await jsonRequest(router, "GET", "/api/import/claude-candidates");
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes("projectId"));
});

test("GET /api/import/claude-candidates returns 404 for unregistered project", async () => {
  const router = createRouter({ docsPort: 5173 });
  const res = await jsonRequest(router, "GET", "/api/import/claude-candidates?projectId=nonexistent-test-proj");
  assert.equal(res.statusCode, 404);
  assert.ok(res.body.error.includes("not found"));
});

test("POST /api/import/claude returns 400 without projectId", async () => {
  const router = createRouter({ docsPort: 5173 });
  const res = await jsonRequest(router, "POST", "/api/import/claude", { sessionIds: ["abc"] });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes("projectId"));
});

test("POST /api/import/claude returns 400 without sessionIds", async () => {
  const router = createRouter({ docsPort: 5173 });
  const res = await jsonRequest(router, "POST", "/api/import/claude", { projectId: "test" });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes("sessionIds"));
});

test("POST /api/import/claude returns 404 for unregistered project", async () => {
  const router = createRouter({ docsPort: 5173 });
  const res = await jsonRequest(router, "POST", "/api/import/claude", {
    projectId: "nonexistent-test-proj", sessionIds: ["abc"],
  });
  assert.equal(res.statusCode, 404);
  assert.ok(res.body.error.includes("not found"));
});

test("findFreePort skips occupied ports", async () => {
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(19801, "127.0.0.1", resolve));

  try {
    const port = await findFreePort(19801);
    assert.ok(port > 19801, `expected port > 19801, got ${port}`);
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});
