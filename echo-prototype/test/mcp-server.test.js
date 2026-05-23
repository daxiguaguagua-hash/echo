const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

// ---- Fixture setup --------------------------------------------------------

const ws = fs.mkdtempSync(path.join(os.tmpdir(), "echo-mcp-test-"));
const articlesDir = path.join(ws, "articles");
const commentsDir = path.join(ws, "comments");
fs.mkdirSync(articlesDir, { recursive: true });
fs.mkdirSync(commentsDir, { recursive: true });

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

// getDirs() uses resolveEchoHomePath() which checks ECHO_HOME, not ECHO_WORKSPACE.
process.env.ECHO_HOME = ws;

// Clear stale cache entries to force fresh resolution of _dirs caching inside mcp-server.
for (const key of Object.keys(require.cache)) {
  if (key.includes("echo-prototype/scripts/lib/")) {
    delete require.cache[key];
  }
}

const { handleRequest } = require("../scripts/lib/mcp-server");

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

// 1. initialize
test("initialize returns protocolVersion, capabilities, and serverInfo", () => {
  const res = handleRequest({ id: 1, method: "initialize", params: {} });

  assertJsonRpcResult(res, 1);
  assert.equal(res.result.protocolVersion, "2024-11-05");
  assert.deepEqual(res.result.capabilities, { tools: {} });
  assert.deepEqual(res.result.serverInfo, { name: "echo-mcp", version: "0.2.0" });
});

// 2. notifications/initialized
test("notifications/initialized returns null (notification — no response)", () => {
  const res = handleRequest({ method: "notifications/initialized" });
  assert.equal(res, null);
});

// 3. tools/list
test("tools/list returns 5 tools with name, description, and inputSchema", () => {
  const res = handleRequest({ id: 2, method: "tools/list" });

  assertJsonRpcResult(res, 2);
  assert.ok(Array.isArray(res.result.tools), "tools must be an array");
  assert.equal(res.result.tools.length, 5, "must have 5 tools");

  const names = res.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "get_article",
    "get_article_context",
    "list_recent",
    "list_tags",
    "search_articles",
  ]);

  for (const tool of res.result.tools) {
    assert.equal(typeof tool.name, "string", `tool ${tool.name} must have string name`);
    assert.equal(typeof tool.description, "string", `tool ${tool.name} must have string description`);
    assert.equal(typeof tool.inputSchema, "object", `tool ${tool.name} must have inputSchema`);
    assert.equal(tool.inputSchema.type, "object", `tool ${tool.name} inputSchema.type must be object`);
    assert.ok("properties" in tool.inputSchema, `tool ${tool.name} inputSchema must have properties`);
  }
});

// 4. tools/call — list_tags
test("tools/call list_tags returns MCP content format with tag counts", () => {
  const res = handleRequest({
    id: 3,
    method: "tools/call",
    params: { name: "list_tags", arguments: {} },
  });

  const data = assertToolContent(res, 3);
  assert.ok(Array.isArray(data), "result must be an array");
  assert.ok(data.length >= 2, "must have at least 2 tags (demo, test)");
  for (const entry of data) {
    assert.equal(typeof entry.tag, "string");
    assert.equal(typeof entry.count, "number");
    assert.ok(entry.count >= 1);
  }

  // Verify exact counts for our known fixtures
  const testTag = data.find((e) => e.tag === "test");
  const demoTag = data.find((e) => e.tag === "demo");
  assert.equal(testTag.count, 2);
  assert.equal(demoTag.count, 2);
});

// 4. tools/call — list_recent
test("tools/call list_recent returns articles sorted by date in MCP content format", () => {
  const res = handleRequest({
    id: 4,
    method: "tools/call",
    params: { name: "list_recent", arguments: { limit: 10 } },
  });

  const data = assertToolContent(res, 4);
  assert.ok(Array.isArray(data), "result must be an array");
  assert.equal(data.length, 2, "must have 2 articles");

  // Newer article first (test-art-001 has 2026-05-21, test-art-002 has 2026-05-20)
  assert.equal(data[0].id, "test-art-001");
  assert.equal(data[0].title, "Test Article One");
  assert.ok(Array.isArray(data[0].tags));
  assert.equal(data[1].id, "test-art-002");
});

// 4. tools/call — search_articles
test("tools/call search_articles returns matching articles with snippets", () => {
  const res = handleRequest({
    id: 5,
    method: "tools/call",
    params: { name: "search_articles", arguments: { keyword: "searchable" } },
  });

  const data = assertToolContent(res, 5);
  assert.ok(Array.isArray(data), "result must be an array");
  assert.equal(data.length, 1, "only one article matches 'searchable'");
  assert.equal(data[0].id, "test-art-001");
  assert.ok(data[0].snippet.includes("searchable"), "snippet must contain the keyword");
});

// 4. tools/call — search_articles with tag filter
test("tools/call search_articles with tag filter", () => {
  const res = handleRequest({
    id: 6,
    method: "tools/call",
    params: { name: "search_articles", arguments: { tag: "mcp" } },
  });

  const data = assertToolContent(res, 6);
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 1);
  assert.equal(data[0].id, "test-art-001");
});

// 4. tools/call — get_article
test("tools/call get_article returns full article data", () => {
  const res = handleRequest({
    id: 7,
    method: "tools/call",
    params: { name: "get_article", arguments: { id: "test-art-001" } },
  });

  const data = assertToolContent(res, 7);
  assert.equal(data.id, "test-art-001");
  assert.equal(data.title, "Test Article One");
  assert.equal(data.created_at, "2026-05-21");
  assert.deepEqual(data.tags, ["test", "demo", "mcp"]);
  assert.equal(data.summary, "A test article for MCP server testing");
  assert.ok(data.content.includes("searchable content"));
  // In fallback mode (no project found), relPath is just the filename
  assert.ok(data.file.endsWith("test-art-001.md"), `file path ends with test-art-001.md: ${data.file}`);
  assert.equal(data.ai_model, "test-model");
});

// 4. tools/call — get_article for non-existent ID (still valid JSON-RPC result)
test("tools/call get_article for missing ID returns error message inside content", () => {
  const res = handleRequest({
    id: 8,
    method: "tools/call",
    params: { name: "get_article", arguments: { id: "nonexistent" } },
  });

  const data = assertToolContent(res, 8);
  assert.equal(typeof data.error, "string");
  assert.match(data.error, /not found/);
});

// 4. tools/call — get_article_context
test("tools/call get_article_context returns article with comments and evolution chain", () => {
  const res = handleRequest({
    id: 9,
    method: "tools/call",
    params: { name: "get_article_context", arguments: { id: "test-art-001" } },
  });

  const data = assertToolContent(res, 9);
  assert.equal(data.id, "test-art-001");
  assert.equal(data.title, "Test Article One");
  assert.ok(Array.isArray(data.tags));
  assert.equal(typeof data.summary, "string");
  assert.equal(typeof data.content_preview, "string");
  assert.ok(data.content_preview.length <= 500);

  // Evolution chain: articles without evolution data produce an empty array
  assert.ok(Array.isArray(data.evolution_chain), "evolution_chain must be an array");

  // Comments
  assert.ok(Array.isArray(data.comments), "comments must be an array");
  assert.ok(data.comments.length >= 1, "must have at least 1 comment");
  const comment = data.comments.find((c) => c.id === "ann-001");
  assert.ok(comment, "comment ann-001 must exist");
  assert.equal(comment.author, "tester");
  assert.equal(comment.target_article_id, "test-art-001");
  assert.equal(comment.anchor_quote, "searchable content");
  assert.equal(comment.comment, "This is a test comment on article one.");
});

// 5. Unknown method with id returns JSON-RPC error -32601
test("unknown method with id returns JSON-RPC error code -32601", () => {
  const res = handleRequest({ id: 10, method: "nonexistent_method" });
  assertJsonRpcError(res, 10, -32601);
  assert.match(res.error.message, /Method not found/);
});

// 5. Unknown method without id returns null (notification)
test("unknown method without id returns null", () => {
  const res = handleRequest({ method: "nonexistent_notification" });
  assert.equal(res, null);
});

// 6. Unknown tool returns JSON-RPC error -32601
test("tools/call with unknown tool name returns JSON-RPC error -32601", () => {
  const res = handleRequest({
    id: 11,
    method: "tools/call",
    params: { name: "nonexistent_tool", arguments: {} },
  });
  assertJsonRpcError(res, 11, -32601);
  assert.match(res.error.message, /Unknown tool/);
});

// 7. ping returns empty result
test("ping returns empty result object", () => {
  const res = handleRequest({ id: 12, method: "ping" });
  assertJsonRpcResult(res, 12);
  assert.deepEqual(res.result, {});
});

// Handler throws (edge case) — pass non-string keyword to trigger TypeError in search_articles
test("tools/call handler exception returns JSON-RPC error -32000", () => {
  const res = handleRequest({
    id: 13,
    method: "tools/call",
    params: { name: "search_articles", arguments: { keyword: 42 } },
  });
  assertJsonRpcError(res, 13, -32000);
  assert.match(res.error.message, /Tool error/);
});

// 8. JSON-RPC 2.0 — all response types carry jsonrpc "2.0"
test("all response types include jsonrpc: '2.0'", () => {
  const responses = [
    handleRequest({ id: 100, method: "initialize", params: {} }),
    handleRequest({ id: 101, method: "tools/list" }),
    handleRequest({ id: 102, method: "ping" }),
    handleRequest({
      id: 103,
      method: "tools/call",
      params: { name: "list_tags", arguments: {} },
    }),
    handleRequest({ id: 104, method: "nonexistent_method" }),
  ];

  for (const res of responses) {
    assert.equal(res.jsonrpc, "2.0", `missing jsonrpc:2.0 in response for id=${res.id}`);
  }
});

// Notification yields null, which is fine (no jsonrpc required)
test("notification responses are null", () => {
  assert.equal(handleRequest({ method: "notifications/initialized" }), null);
});

// Edge: tools/call list_recent respects limit parameter
test("tools/call list_recent respects explicit limit", () => {
  const res = handleRequest({
    id: 14,
    method: "tools/call",
    params: { name: "list_recent", arguments: { limit: 1 } },
  });

  const data = assertToolContent(res, 14);
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 1);
});

// Edge: tools/call search_articles with no filters returns all articles
test("tools/call search_articles with no filters returns all articles", () => {
  const res = handleRequest({
    id: 15,
    method: "tools/call",
    params: { name: "search_articles", arguments: {} },
  });

  const data = assertToolContent(res, 15);
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 2, "must return both articles");
  const ids = data.map((a) => a.id).sort();
  assert.deepEqual(ids, ["test-art-001", "test-art-002"]);
});

// Edge: get_article_context for non-existent ID
test("tools/call get_article_context for missing ID returns error message inside content", () => {
  const res = handleRequest({
    id: 16,
    method: "tools/call",
    params: { name: "get_article_context", arguments: { id: "nonexistent" } },
  });

  const data = assertToolContent(res, 16);
  assert.equal(typeof data.error, "string");
  assert.match(data.error, /not found/);
});
