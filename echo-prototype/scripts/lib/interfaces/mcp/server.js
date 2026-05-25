// Echo MCP server — JSON-RPC 2.0 transport + dispatcher
// Business logic: usecases/query-articles.js
// Tool schemas: interfaces/mcp/tools.js
// Errors: domain/errors.js

const readline = require("readline");
const { TOOLS, TOOL_HANDLERS } = require("./tools");
const { NotFoundError } = require("../../domain/errors");
const { resolveDataDirs } = require("../../infra/echo-paths");
const { mcpServerInfo } = require("../../cli/names");

// --- JSON-RPC 2.0 ---

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    error: { code, message },
  };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function send(response) {
  process.stdout.write(JSON.stringify(response) + "\n");
}

const SERVER_INFO = mcpServerInfo;
const CAPABILITIES = { tools: {} };

// --- Request dispatcher ---

function createHandleRequest(deps) {
  return function handleRequest(msg) {
    const { id, method, params } = msg;

    switch (method) {
      case "initialize":
        return jsonRpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: CAPABILITIES,
          serverInfo: SERVER_INFO,
        });

      case "notifications/initialized":
        return null;

      case "tools/list":
        return jsonRpcResult(id, { tools: TOOLS });

      case "tools/call": {
        const toolName = params?.name;
        const handler = TOOL_HANDLERS[toolName];
        if (!handler) {
          return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
        }
        try {
          const result = handler(params?.arguments || {}, deps);
          const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
          return jsonRpcResult(id, { content: [{ type: "text", text }] });
        } catch (err) {
          if (err instanceof NotFoundError) {
            return jsonRpcError(id, -32002, err.message);
          }
          return jsonRpcError(id, -32000, `Tool error: ${err.message}`);
        }
      }

      case "ping":
        return jsonRpcResult(id, {});

      default:
        if (id !== undefined) {
          return jsonRpcError(id, -32601, `Method not found: ${method}`);
        }
        return null;
    }
  };
}

// --- Stdio transport ---

function start(deps = {}) {
  console.log = (...args) => console.error(...args);
  console.warn = (...args) => console.error(...args);
  console.info = (...args) => console.error(...args);

  const dirs = deps.dirs || (deps.pathResolver ? deps.pathResolver({}) : resolveDataDirs());
  const store = deps.store || require("../../infra/markdown-store");

  const handleRequest = createHandleRequest({ dirs, store });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send(jsonRpcError(null, -32700, "Parse error"));
      return;
    }

    if (msg == null || typeof msg !== "object" || Array.isArray(msg)) {
      send(jsonRpcError(null, -32600, "Invalid Request"));
      return;
    }

    try {
      const response = handleRequest(msg);
      if (response) send(response);
    } catch (err) {
      send(jsonRpcError(msg.id !== undefined ? msg.id : null, -32603, "Internal error"));
    }
  });

  rl.on("close", () => { process.exit(0); });

  process.stderr.write("[echo-mcp] MCP server started\n");
}

module.exports = { start, createHandleRequest, NotFoundError };
