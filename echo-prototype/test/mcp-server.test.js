const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("../scripts/lib/infra/markdown-store");

// ---- Fixture setup --------------------------------------------------------

const ws = fs.mkdtempSync(path.join(os.tmpdir(), "echo-mcp-test-"));
const articlesDir = path.join(ws, "articles");
const commentsDir = path.join(ws, "comments");
fs.mkdirSync(articlesDir, { recursive: true });
fs.mkdirSync(commentsDir, { recursive: true });

const dirs = { articlesDir, commentsDir, bufferDir: path.join(ws, "session-buffer"), indexDir: path.join(ws, "index") };

function articleFixture(id, title, created_at, tags, summary, body) {
  const yaml = [
    "---",
    `id: ${id}`,
    `title: "${title}"`,
    "type: article",
    `created_at: "${created_at}"`,
    `tags: [${(tags || []).join(", ")}]`,
    `summary: "${summary || ""}"`,
    "ai_model: test-model",
    "---",
    body,
  ];
  return yaml.join("\n");
}

function annotationFixture(id, articleId, author, quote, body) {
  const yaml = [
    "---",
    `id: ${id}`,
    "type: annotation",
    `article: ${articleId}`,
    'created_at: "2026-05-22"',
    `author: ${author}`,
    "target:",
    `  article_id: ${articleId}`,
    "anchor:",
    `  quote: "${quote}"`,
    "---",
    body,
  ];
  return yaml.join("\n");
}

fs.writeFileSync(
  path.join(articlesDir, "test-art-001.md"),
  articleFixture(
    "test-art-001",
    "Test Article One",
    "2026-05-21",
    ["test", "demo", "mcp"],
    "A test article for MCP server testing",
    "This is the body of the test article. It contains some searchable content for testing the MCP server search functionality.\n"
  )
);

fs.writeFileSync(
  path.join(articlesDir, "test-art-002.md"),
  articleFixture(
    "test-art-002",
    "Second Article",
    "2026-05-20",
    ["test", "demo"],
    "Second test article",
    "Another article with different text. No matching keyword here.\n"
  )
);

fs.writeFileSync(
  path.join(commentsDir, "ann-001.md"),
  annotationFixture(
    "ann-001",
    "test-art-001",
    "tester",
    "searchable content",
    "This is a test comment on article one.\n"
  )
);

// DI: inject dirs and real markdown-store — no ECHO_HOME, no require.cache hacking
const { createHandleRequest } = require("../scripts/lib/interfaces/mcp/server");
const { NotFoundError } = require("../scripts/lib/domain/errors");
const handleRequest = createHandleRequest({ dirs, store });

// Cleanup on exit
process.on("exit", () => {
  try {
    fs.rmSync(ws, { recursive: true, force: true });
  } catch (_) {}
});

// ---- Helpers --------------------------------------------------------------

function assertJsonRpcResult(res, id) {
  assert.equal(res.jsonrpc, "2.0", "jsonrpc must be 2.0");
  assert.equal(res.id, id, "id must match request");
  assert.ok(!("error" in res), "must not be an error response");
  assert.ok("result" in res, "must have result");
}

function assertJsonRpcError(res, id, code) {
  assert.equal(res.jsonrpc, "2.0", "jsonrpc must be 2.0");
  assert.equal(res.id, id, "id must match request");
  assert.ok("error" in res, "must have error");
  assert.equal(res.error.code, code, `error code must be ${code}`);
}

function assertToolContent(res, id) {
  assertJsonRpcResult(res, id);
  assert.ok(Array.isArray(res.result.content), "content must be an array");
  assert.equal(res.result.content.length, 1, "content must have 1 item");
  assert.equal(res.result.content[0].type, "text", "content type must be text");
  assert.equal(typeof res.result.content[0].text, "string", "content text must be string");
  const parsed = JSON.parse(res.result.content[0].text);
  assert.ok(parsed !== undefined, "content text must be valid JSON");
  return parsed;
}

// ---- Tests ----------------------------------------------------------------

test("initialize returns protocolVersion, capabilities, and serverInfo", () => {
  const res = handleRequest({ id: 1, method: "initialize", params: {} });
  assertJsonRpcResult(res, 1);
  assert.equal(res.result.protocolVersion, "2024-11-05");
  assert.deepEqual(res.result.capabilities, { tools: {} });
  assert.deepEqual(res.result.serverInfo, { name: "echo-mcp", version: "0.2.0" });
});

test("notifications/initialized returns null", () => {
  const res = handleRequest({ method: "notifications/initialized" });
  assert.equal(res, null);
});

test("tools/list returns 11 tools with name, description, and inputSchema", () => {
  const res = handleRequest({ id: 2, method: "tools/list" });
  assertJsonRpcResult(res, 2);
  assert.equal(res.result.tools.length, 11);
  const names = res.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "add_tags", "get_article", "get_article_context", "get_project", "list_projects", "list_recent", "list_tags", "purge_tag", "remove_tags", "rename_tag", "search_articles",
  ]);
  for (const tool of res.result.tools) {
    assert.equal(typeof tool.name, "string");
    assert.equal(typeof tool.description, "string");
    assert.equal(tool.inputSchema.type, "object");
    assert.ok("properties" in tool.inputSchema);
  }
});

test("tools/call list_tags returns MCP content format with tag counts", () => {
  const res = handleRequest({ id: 3, method: "tools/call", params: { name: "list_tags", arguments: {} } });
  const data = assertToolContent(res, 3);
  assert.ok(data.length >= 2);
  const testTag = data.find((e) => e.tag === "test");
  const demoTag = data.find((e) => e.tag === "demo");
  assert.equal(testTag.count, 2);
  assert.equal(demoTag.count, 2);
});

test("tools/call list_recent returns articles sorted by date", () => {
  const res = handleRequest({ id: 4, method: "tools/call", params: { name: "list_recent", arguments: { limit: 10 } } });
  const data = assertToolContent(res, 4);
  assert.equal(data.length, 2);
  assert.equal(data[0].id, "test-art-001");
  assert.equal(data[1].id, "test-art-002");
});

test("tools/call search_articles returns matching articles with snippets", () => {
  const res = handleRequest({ id: 5, method: "tools/call", params: { name: "search_articles", arguments: { keyword: "searchable" } } });
  const data = assertToolContent(res, 5);
  assert.equal(data.length, 1);
  assert.equal(data[0].id, "test-art-001");
  assert.ok(data[0].snippet.includes("searchable"));
});

test("tools/call search_articles with tag filter", () => {
  const res = handleRequest({ id: 6, method: "tools/call", params: { name: "search_articles", arguments: { tag: "mcp" } } });
  const data = assertToolContent(res, 6);
  assert.equal(data.length, 1);
  assert.equal(data[0].id, "test-art-001");
});

test("tools/call get_article returns full article data", () => {
  const res = handleRequest({ id: 7, method: "tools/call", params: { name: "get_article", arguments: { id: "test-art-001" } } });
  const data = assertToolContent(res, 7);
  assert.equal(data.id, "test-art-001");
  assert.equal(data.title, "Test Article One");
  assert.deepEqual(data.tags, ["test", "demo", "mcp"]);
  assert.ok(data.content.includes("searchable content"));
});

test("tools/call get_article for missing ID returns JSON-RPC error -32002", () => {
  const res = handleRequest({ id: 8, method: "tools/call", params: { name: "get_article", arguments: { id: "nonexistent" } } });
  assertJsonRpcError(res, 8, -32002);
  assert.match(res.error.message, /not found/);
});

test("tools/call get_article_context returns article with comments", () => {
  const res = handleRequest({ id: 9, method: "tools/call", params: { name: "get_article_context", arguments: { id: "test-art-001" } } });
  const data = assertToolContent(res, 9);
  assert.equal(data.id, "test-art-001");
  assert.ok(Array.isArray(data.comments));
  assert.ok(data.comments.length >= 1);
  const comment = data.comments.find((c) => c.id === "ann-001");
  assert.ok(comment);
  assert.equal(comment.author, "tester");
  assert.equal(comment.comment, "This is a test comment on article one.");
});

test("tools/call get_article_context for missing ID returns JSON-RPC error -32002", () => {
  const res = handleRequest({ id: 10, method: "tools/call", params: { name: "get_article_context", arguments: { id: "nonexistent" } } });
  assertJsonRpcError(res, 10, -32002);
  assert.match(res.error.message, /not found/);
});

test("unknown method with id returns JSON-RPC error -32601", () => {
  const res = handleRequest({ id: 11, method: "nonexistent_method" });
  assertJsonRpcError(res, 11, -32601);
});

test("unknown method without id returns null", () => {
  const res = handleRequest({ method: "nonexistent_notification" });
  assert.equal(res, null);
});

test("tools/call unknown tool returns JSON-RPC error -32601", () => {
  const res = handleRequest({ id: 12, method: "tools/call", params: { name: "nonexistent_tool", arguments: {} } });
  assertJsonRpcError(res, 12, -32601);
});

test("ping returns empty result", () => {
  const res = handleRequest({ id: 13, method: "ping" });
  assertJsonRpcResult(res, 13);
  assert.deepEqual(res.result, {});
});

test("tools/call handler exception returns JSON-RPC error -32000", () => {
  const res = handleRequest({ id: 14, method: "tools/call", params: { name: "search_articles", arguments: { keyword: 42 } } });
  assertJsonRpcError(res, 14, -32000);
  assert.match(res.error.message, /Tool error/);
});

// ---- Tag management -------------------------------------------------------

test("tools/call add_tags adds tags to an article", () => {
  const res = handleRequest({ id: 40, method: "tools/call", params: { name: "add_tags", arguments: { id: "test-art-001", tags: ["new-tag", "extra"] } } });
  const data = assertToolContent(res, 40);
  assert.equal(data.id, "test-art-001");
  assert.deepEqual(data.added, ["new-tag", "extra"]);
  assert.ok(data.tags.includes("test"));
  assert.ok(data.tags.includes("demo"));
  assert.ok(data.tags.includes("mcp"));
  assert.ok(data.tags.includes("new-tag"));
  assert.ok(data.tags.includes("extra"));
});

test("tools/call add_tags ignores duplicate tags", () => {
  // test-art-001 already has "test" tag
  const res = handleRequest({ id: 41, method: "tools/call", params: { name: "add_tags", arguments: { id: "test-art-001", tags: ["test", "demo"] } } });
  const data = assertToolContent(res, 41);
  assert.equal(data.id, "test-art-001");
  // No duplicates in result tags
  assert.equal(data.tags.filter((t) => t === "test").length, 1);
  assert.equal(data.tags.filter((t) => t === "demo").length, 1);
});

test("tools/call add_tags for missing ID returns JSON-RPC error -32002", () => {
  const res = handleRequest({ id: 42, method: "tools/call", params: { name: "add_tags", arguments: { id: "nonexistent", tags: ["foo"] } } });
  assertJsonRpcError(res, 42, -32002);
  assert.match(res.error.message, /not found/);
});

test("tools/call remove_tags removes tags from an article", () => {
  const res = handleRequest({ id: 43, method: "tools/call", params: { name: "remove_tags", arguments: { id: "test-art-001", tags: ["extra"] } } });
  const data = assertToolContent(res, 43);
  assert.equal(data.id, "test-art-001");
  assert.deepEqual(data.removed, ["extra"]);
  assert.ok(!data.tags.includes("extra"));
  // Other tags still present
  assert.ok(data.tags.includes("test"));
  assert.ok(data.tags.includes("demo"));
  assert.ok(data.tags.includes("mcp"));
  assert.ok(data.tags.includes("new-tag"));
});

test("tools/call remove_tags silently ignores non-existent tags", () => {
  const res = handleRequest({ id: 44, method: "tools/call", params: { name: "remove_tags", arguments: { id: "test-art-001", tags: ["nonexistent-tag"] } } });
  const data = assertToolContent(res, 44);
  assert.equal(data.id, "test-art-001");
  assert.deepEqual(data.removed, ["nonexistent-tag"]);
  // Existing tags should be unchanged
  assert.ok(data.tags.includes("test"));
  assert.ok(data.tags.includes("new-tag"));
});

test("tools/call remove_tags for missing ID returns JSON-RPC error -32002", () => {
  const res = handleRequest({ id: 45, method: "tools/call", params: { name: "remove_tags", arguments: { id: "nonexistent", tags: ["foo"] } } });
  assertJsonRpcError(res, 45, -32002);
  assert.match(res.error.message, /not found/);
});

// ---- Tag rename / purge -------------------------------------------------

test("tools/call rename_tag renames a tag across all articles", () => {
  // Both fixture articles have "demo" tag; rename to "renamed-demo"
  const res = handleRequest({ id: 50, method: "tools/call", params: { name: "rename_tag", arguments: { oldTag: "demo", newTag: "renamed-demo" } } });
  const data = assertToolContent(res, 50);
  assert.equal(data.oldTag, "demo");
  assert.equal(data.newTag, "renamed-demo");
  assert.equal(data.renamed, 2);

  // Verify via get_article
  const getRes = handleRequest({ id: 51, method: "tools/call", params: { name: "get_article", arguments: { id: "test-art-001" } } });
  const art1 = assertToolContent(getRes, 51);
  assert.ok(art1.tags.includes("renamed-demo"));
  assert.ok(!art1.tags.includes("demo"));
  assert.ok(art1.tags.includes("test")); // other tags preserved
});

test("tools/call rename_tag for nonexistent tag returns JSON-RPC error -32002", () => {
  const res = handleRequest({ id: 52, method: "tools/call", params: { name: "rename_tag", arguments: { oldTag: "no-such-tag", newTag: "x" } } });
  assertJsonRpcError(res, 52, -32002);
  assert.match(res.error.message, /not found/);
});

test("tools/call purge_tag removes a tag from all articles", () => {
  // Both fixture articles have "test" tag
  const res = handleRequest({ id: 53, method: "tools/call", params: { name: "purge_tag", arguments: { tag: "test" } } });
  const data = assertToolContent(res, 53);
  assert.equal(data.tag, "test");
  assert.equal(data.purged, 2);

  // Verify via get_article
  const getRes = handleRequest({ id: 54, method: "tools/call", params: { name: "get_article", arguments: { id: "test-art-001" } } });
  const art1 = assertToolContent(getRes, 54);
  assert.ok(!art1.tags.includes("test"));
});

test("tools/call purge_tag for nonexistent tag returns JSON-RPC error -32002", () => {
  const res = handleRequest({ id: 55, method: "tools/call", params: { name: "purge_tag", arguments: { tag: "no-such-tag" } } });
  assertJsonRpcError(res, 55, -32002);
  assert.match(res.error.message, /not found/);
});

test("add_tags persists tags — re-read article confirms changes", () => {
  // Add a tag, then get_article to verify it was written to disk
  handleRequest({ id: 46, method: "tools/call", params: { name: "add_tags", arguments: { id: "test-art-002", tags: ["persistent-tag"] } } });
  const res = handleRequest({ id: 47, method: "tools/call", params: { name: "get_article", arguments: { id: "test-art-002" } } });
  const data = assertToolContent(res, 47);
  assert.ok(data.tags.includes("persistent-tag"));
});

// ---- Cross-cutting --------------------------------------------------------

test("all response types include jsonrpc: '2.0'", () => {
  const responses = [
    handleRequest({ id: 100, method: "initialize", params: {} }),
    handleRequest({ id: 101, method: "tools/list" }),
    handleRequest({ id: 102, method: "ping" }),
    handleRequest({ id: 103, method: "tools/call", params: { name: "list_tags", arguments: {} } }),
    handleRequest({ id: 104, method: "nonexistent_method" }),
  ];
  for (const res of responses) {
    assert.equal(res.jsonrpc, "2.0");
  }
});

test("notification responses are null", () => {
  assert.equal(handleRequest({ method: "notifications/initialized" }), null);
});

test("tools/call list_recent respects explicit limit", () => {
  const res = handleRequest({ id: 15, method: "tools/call", params: { name: "list_recent", arguments: { limit: 1 } } });
  const data = assertToolContent(res, 15);
  assert.equal(data.length, 1);
});

test("tools/call search_articles with no filters returns all articles", () => {
  const res = handleRequest({ id: 16, method: "tools/call", params: { name: "search_articles", arguments: {} } });
  const data = assertToolContent(res, 16);
  assert.equal(data.length, 2);
});

test("legacy mcp-server.js re-exports from new interfaces/mcp/server", () => {
  const legacy = require("../scripts/lib/mcp-server");
  assert.equal(typeof legacy.start, "function");
  assert.equal(typeof legacy.createHandleRequest, "function");
  assert.equal(legacy.NotFoundError, require("../scripts/lib/domain/errors").NotFoundError);
});

test("NotFoundError is exported and instanceof works", () => {
  const err = new NotFoundError("test");
  assert.ok(err instanceof NotFoundError);
  assert.ok(err instanceof Error);
  assert.equal(err.message, "test");
});

test("tools/call list_recent clamps invalid limit to safe range", () => {
  // NaN → default 20
  const res1 = handleRequest({ id: 30, method: "tools/call", params: { name: "list_recent", arguments: { limit: "abc" } } });
  const data1 = assertToolContent(res1, 30);
  assert.equal(data1.length, 2);

  // 0 → clamped to 1
  const res2 = handleRequest({ id: 31, method: "tools/call", params: { name: "list_recent", arguments: { limit: 0 } } });
  const data2 = assertToolContent(res2, 31);
  assert.equal(data2.length, 1);

  // negative → clamped to 1
  const res3 = handleRequest({ id: 32, method: "tools/call", params: { name: "list_recent", arguments: { limit: -5 } } });
  const data3 = assertToolContent(res3, 32);
  assert.equal(data3.length, 1);
});

test("tools/call get_article_context shows forward evolution even for root article", () => {
  // test-art-002 has no evolution field — forward lookup should still work
  const res = handleRequest({ id: 33, method: "tools/call", params: { name: "get_article_context", arguments: { id: "test-art-002" } } });
  const data = assertToolContent(res, 33);
  assert.ok(Array.isArray(data.evolution_chain));
  // Root article is always in the chain
  assert.equal(data.evolution_chain[0].id, "test-art-002");
});

// --- list_projects / get_project handler tests ---

test("listProjects handler returns empty array when no projects registered", () => {
  const echoHome = fs.mkdtempSync(path.join(os.tmpdir(), "echo-list-test-"));
  fs.mkdirSync(echoHome, { recursive: true });
  fs.writeFileSync(path.join(echoHome, "registry.json"), JSON.stringify({ projects: {} }));
  const prev = process.env.ECHO_HOME;
  process.env.ECHO_HOME = echoHome;
  try {
    const { listProjects } = require("../scripts/lib/usecases/query-articles");
    const result = listProjects({}, { dirs, store });
    assert.deepEqual(result, []);
  } finally {
    process.env.ECHO_HOME = prev;
    fs.rmSync(echoHome, { recursive: true, force: true });
  }
});

test("listProjects handler returns projects from registry", () => {
  const echoHome = fs.mkdtempSync(path.join(os.tmpdir(), "echo-list-test-"));
  fs.mkdirSync(echoHome, { recursive: true });
  fs.writeFileSync(path.join(echoHome, "registry.json"), JSON.stringify({
    projects: { "proj-a": { root: "/tmp/proj-a", registeredAt: "2026-01-01T00:00:00.000Z" } },
  }));
  const prev = process.env.ECHO_HOME;
  process.env.ECHO_HOME = echoHome;
  try {
    const { listProjects } = require("../scripts/lib/usecases/query-articles");
    const result = listProjects({}, { dirs, store });
    assert.equal(result.length, 1);
    assert.equal(result[0].projectId, "proj-a");
    assert.equal(result[0].root, "/tmp/proj-a");
    assert.ok(result[0].dataRoot);
    assert.equal(result[0].registeredAt, "2026-01-01T00:00:00.000Z");
  } finally {
    process.env.ECHO_HOME = prev;
    fs.rmSync(echoHome, { recursive: true, force: true });
  }
});

test("getProject handler returns project details for known id", () => {
  const echoHome = fs.mkdtempSync(path.join(os.tmpdir(), "echo-get-test-"));
  fs.mkdirSync(echoHome, { recursive: true });
  fs.writeFileSync(path.join(echoHome, "registry.json"), JSON.stringify({
    projects: { "proj-b": { root: "/tmp/proj-b", registeredAt: "2026-02-01T00:00:00.000Z" } },
  }));
  const prev = process.env.ECHO_HOME;
  process.env.ECHO_HOME = echoHome;
  try {
    const { getProject } = require("../scripts/lib/usecases/query-articles");
    const result = getProject({ id: "proj-b" }, { dirs, store });
    assert.equal(result.projectId, "proj-b");
    assert.equal(result.root, "/tmp/proj-b");
    assert.ok(result.dataRoot);
  } finally {
    process.env.ECHO_HOME = prev;
    fs.rmSync(echoHome, { recursive: true, force: true });
  }
});

test("getProject handler throws NotFoundError for unknown id", () => {
  const echoHome = fs.mkdtempSync(path.join(os.tmpdir(), "echo-get-test-"));
  fs.mkdirSync(echoHome, { recursive: true });
  fs.writeFileSync(path.join(echoHome, "registry.json"), JSON.stringify({ projects: {} }));
  const prev = process.env.ECHO_HOME;
  process.env.ECHO_HOME = echoHome;
  try {
    const { getProject } = require("../scripts/lib/usecases/query-articles");
    assert.throws(
      () => getProject({ id: "nonexistent" }, { dirs, store }),
      /not found/
    );
  } finally {
    process.env.ECHO_HOME = prev;
    fs.rmSync(echoHome, { recursive: true, force: true });
  }
});
