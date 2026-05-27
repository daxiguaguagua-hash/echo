const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const test = require("node:test");

const ECHOCTL = path.resolve(__dirname, "../bin/echoctl.js");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-mcp-e2e-"));
}

function writeArticle(dir, id, title, tags, body, alias) {
  fs.mkdirSync(dir, { recursive: true });
  const aliasLine = alias ? `alias: "${alias}"` : "";
  const lines = [
    "---",
    `id: ${id}`,
    `title: "${title}"`,
    "type: article",
    `created_at: "2026-05-25"`,
    `tags: [${(tags || []).join(", ")}]`,
    "ai_model: test-model",
  ];
  if (aliasLine) lines.push(aliasLine);
  lines.push("---");
  lines.push(body || `# ${title}\n\nBody of ${id}.\n`);
  fs.writeFileSync(path.join(dir, `${id}.md`), lines.join("\n"));
}

function writeComment(dir, id, articleId, author, body) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.md`), [
    "---",
    `id: ${id}`,
    "type: annotation",
    "target:",
    `  article_id: ${articleId}`,
    `author: ${author}`,
    'created_at: "2026-05-25"',
    "---",
    body,
  ].join("\n"));
}

class McpClient {
  constructor(proc) {
    this.proc = proc;
    this.buffer = "";
    this.nextId = 1;
  }

  send(method, params) {
    const msg = { jsonrpc: "2.0", id: this.nextId++, method, params: params || {} };
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
    return msg.id;
  }

  async readResponse(expectedId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout waiting for MCP response")), 10000);
      const onData = (d) => {
        this.buffer += d.toString();
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id === expectedId || msg.id === undefined) {
              clearTimeout(timeout);
              this.proc.stdout.removeListener("data", onData);
              resolve(msg);
              return;
            }
          } catch (_) {}
        }
      };
      this.proc.stdout.on("data", onData);
    });
  }

  async call(method, params) {
    const id = this.send(method, params);
    return this.readResponse(id);
  }

  async initialize() {
    const id = this.send("initialize", { protocolVersion: "2024-11-05", capabilities: {} });
    return this.readResponse(id);
  }
}

function startMcpServer(echoHome) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [ECHOCTL, "mcp"], {
      env: { ...process.env, ECHO_HOME: echoHome },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const client = new McpClient(proc);
    proc.stderr.on("data", () => {});

    proc.on("error", reject);

    client.initialize().then((res) => {
      resolve({ client, proc, initResult: res });
    }).catch(reject);
  });
}

test("MCP spawn E2E: initialize returns serverInfo", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(path.join(echoHome, "articles"), { recursive: true });
  fs.mkdirSync(path.join(echoHome, "comments"), { recursive: true });

  writeArticle(path.join(echoHome, "articles"), "e2e-001", "E2E Test Article", ["e2e"], "E2E body content.");

  const { client, proc, initResult } = await startMcpServer(echoHome);

  assert.equal(initResult.jsonrpc, "2.0");
  assert.equal(initResult.result.serverInfo.name, "echo-mcp");
  assert.ok(initResult.result.serverInfo.version);

  proc.kill("SIGTERM");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("MCP spawn E2E: tools/list returns 9 tools", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(path.join(echoHome, "articles"), { recursive: true });
  fs.mkdirSync(path.join(echoHome, "comments"), { recursive: true });

  writeArticle(path.join(echoHome, "articles"), "e2e-001", "E2E Test", ["e2e"]);

  const { client, proc } = await startMcpServer(echoHome);

  const res = await client.call("tools/list");
  assert.equal(res.jsonrpc, "2.0");
  assert.equal(res.result.tools.length, 9);

  const names = res.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "add_tags", "get_article", "get_article_context", "get_project", "list_projects", "list_recent", "list_tags", "remove_tags", "search_articles",
  ]);

  proc.kill("SIGTERM");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("MCP spawn E2E: list_recent returns articles", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(path.join(echoHome, "articles"), { recursive: true });
  fs.mkdirSync(path.join(echoHome, "comments"), { recursive: true });

  writeArticle(path.join(echoHome, "articles"), "e2e-001", "First", ["a"]);
  writeArticle(path.join(echoHome, "articles"), "e2e-002", "Second", ["b"]);

  const { client, proc } = await startMcpServer(echoHome);

  const res = await client.call("tools/call", { name: "list_recent", arguments: { limit: 10 } });
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.length, 2);
  assert.equal(data[0].id, "e2e-001");

  proc.kill("SIGTERM");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("MCP spawn E2E: search_articles finds by keyword", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(path.join(echoHome, "articles"), { recursive: true });
  fs.mkdirSync(path.join(echoHome, "comments"), { recursive: true });

  writeArticle(path.join(echoHome, "articles"), "e2e-001", "Alpha", [], "# Alpha\n\nUniqueKeywordHere.\n");
  writeArticle(path.join(echoHome, "articles"), "e2e-002", "Beta", [], "# Beta\n\nOther text.\n");

  const { client, proc } = await startMcpServer(echoHome);

  const res = await client.call("tools/call", { name: "search_articles", arguments: { keyword: "UniqueKeywordHere" } });
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.length, 1);
  assert.equal(data[0].id, "e2e-001");

  proc.kill("SIGTERM");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("MCP spawn E2E: get_article returns full article", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(path.join(echoHome, "articles"), { recursive: true });
  fs.mkdirSync(path.join(echoHome, "comments"), { recursive: true });

  writeArticle(path.join(echoHome, "articles"), "e2e-001", "Full Article", ["test"], "# Full Article\n\nFull body content here.\n");

  const { client, proc } = await startMcpServer(echoHome);

  const res = await client.call("tools/call", { name: "get_article", arguments: { id: "e2e-001" } });
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.id, "e2e-001");
  assert.equal(data.title, "Full Article");
  assert.ok(data.content.includes("Full body content"));

  proc.kill("SIGTERM");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("MCP spawn E2E: get_article returns error for missing article", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(path.join(echoHome, "articles"), { recursive: true });
  fs.mkdirSync(path.join(echoHome, "comments"), { recursive: true });

  const { client, proc } = await startMcpServer(echoHome);

  const res = await client.call("tools/call", { name: "get_article", arguments: { id: "nonexistent" } });
  assert.equal(res.jsonrpc, "2.0");
  assert.ok("error" in res);
  assert.equal(res.error.code, -32002);

  proc.kill("SIGTERM");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("MCP spawn E2E: get_article_context returns article with comments", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(path.join(echoHome, "articles"), { recursive: true });
  fs.mkdirSync(path.join(echoHome, "comments"), { recursive: true });

  writeArticle(path.join(echoHome, "articles"), "e2e-001", "Context Test", [], "# Context Test\n\nBody.\n");
  writeComment(path.join(echoHome, "comments"), "ann-001", "e2e-001", "tester", "A test comment.");

  const { client, proc } = await startMcpServer(echoHome);

  const res = await client.call("tools/call", { name: "get_article_context", arguments: { id: "e2e-001" } });
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.id, "e2e-001");
  assert.ok(Array.isArray(data.comments));
  assert.ok(data.comments.length >= 1);

  proc.kill("SIGTERM");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("MCP spawn E2E: list_tags returns tag counts", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(path.join(echoHome, "articles"), { recursive: true });
  fs.mkdirSync(path.join(echoHome, "comments"), { recursive: true });

  writeArticle(path.join(echoHome, "articles"), "e2e-001", "Tagged A", ["alpha", "shared"]);
  writeArticle(path.join(echoHome, "articles"), "e2e-002", "Tagged B", ["beta", "shared"]);

  const { client, proc } = await startMcpServer(echoHome);

  const res = await client.call("tools/call", { name: "list_tags", arguments: {} });
  const data = JSON.parse(res.result.content[0].text);
  const sharedTag = data.find((e) => e.tag === "shared");
  assert.ok(sharedTag);
  assert.equal(sharedTag.count, 2);

  proc.kill("SIGTERM");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("MCP spawn E2E: add_tags and remove_tags roundtrip", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(path.join(echoHome, "articles"), { recursive: true });
  fs.mkdirSync(path.join(echoHome, "comments"), { recursive: true });

  writeArticle(path.join(echoHome, "articles"), "e2e-001", "Tag Test", ["original"], "# Tag Test\n\nBody.\n");

  const { client, proc } = await startMcpServer(echoHome);

  // Add tags
  const addRes = await client.call("tools/call", { name: "add_tags", arguments: { id: "e2e-001", tags: ["e2e-test", "temp"] } });
  const addData = JSON.parse(addRes.result.content[0].text);
  assert.deepEqual(addData.added, ["e2e-test", "temp"]);
  assert.ok(addData.tags.includes("e2e-test"));

  // Verify persisted
  const getRes = await client.call("tools/call", { name: "get_article", arguments: { id: "e2e-001" } });
  const getData = JSON.parse(getRes.result.content[0].text);
  assert.ok(getData.tags.includes("e2e-test"));

  // Verify body not modified
  assert.ok(getData.content.includes("Body."));
  assert.ok(!getData.content.includes("e2e-test"));

  // Remove tags
  const rmRes = await client.call("tools/call", { name: "remove_tags", arguments: { id: "e2e-001", tags: ["e2e-test"] } });
  const rmData = JSON.parse(rmRes.result.content[0].text);
  assert.deepEqual(rmData.removed, ["e2e-test"]);
  assert.ok(!rmData.tags.includes("e2e-test"));
  assert.ok(rmData.tags.includes("original"));

  proc.kill("SIGTERM");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("MCP spawn E2E: search_articles finds by alias", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(path.join(echoHome, "articles"), { recursive: true });
  fs.mkdirSync(path.join(echoHome, "comments"), { recursive: true });

  writeArticle(path.join(echoHome, "articles"), "e2e-001", "命令式标题", [], "# Title\n\nSome content.\n", "人类可读的别名");
  writeArticle(path.join(echoHome, "articles"), "e2e-002", "Another", [], "# Another\n\nOther.\n");

  const { client, proc } = await startMcpServer(echoHome);

  // Search by alias keyword
  const res = await client.call("tools/call", { name: "search_articles", arguments: { keyword: "人类可读" } });
  const data = JSON.parse(res.result.content[0].text);
  assert.equal(data.length, 1);
  assert.equal(data[0].id, "e2e-001");
  assert.equal(data[0].alias, "人类可读的别名");

  // get_article also returns alias
  const getRes = await client.call("tools/call", { name: "get_article", arguments: { id: "e2e-001" } });
  const getData = JSON.parse(getRes.result.content[0].text);
  assert.equal(getData.alias, "人类可读的别名");

  // list_recent also returns alias
  const listRes = await client.call("tools/call", { name: "list_recent", arguments: { limit: 10 } });
  const listData = JSON.parse(listRes.result.content[0].text);
  const e2e001 = listData.find((a) => a.id === "e2e-001");
  assert.ok(e2e001);
  assert.equal(e2e001.alias, "人类可读的别名");

  proc.kill("SIGTERM");
  fs.rmSync(echoHome, { recursive: true, force: true });
});
