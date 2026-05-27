const fs = require("fs");
const http = require("http");
const { execFileSync, spawn } = require("child_process");
const path = require("path");
const { runBuildDocs } = require("./build-docs");
const { isCaptureEnabled, setCaptureEnabled, getAuthor } = require("./lib/infra/config");
const { resolveDataDirs } = require("./lib/infra/echo-paths");
const { listProjects } = require("./lib/usecases/project-registry");
const { resolveEchoHomePath } = require("./lib/infra/workspace");
const { cliNames, mcpServerInfo } = require("./lib/cli/names");
const store = require("./lib/infra/markdown-store");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const DEFAULT_API_PORT = 8787;
const DEFAULT_DOCS_PORT = 5173;
const HOST = "127.0.0.1";

function servePidFile() {
  return path.join(resolveEchoHomePath(), ".serve.pid");
}

function serveInfoFile() {
  return path.join(resolveEchoHomePath(), ".serve.json");
}

function writeServeInfo(apiPort, docsPort, vitepressPid) {
  fs.writeFileSync(servePidFile(), String(process.pid));
  fs.writeFileSync(serveInfoFile(), JSON.stringify({
    pid: process.pid,
    vitepressPid: vitepressPid || null,
    childPids: vitepressPid ? [vitepressPid] : [],
    apiPort,
    docsPort,
    startedAt: new Date().toISOString(),
    identity: "echo-serve",
  }, null, 2));
}

function clearServeInfo() {
  try { fs.unlinkSync(servePidFile()); } catch (_) {}
  try { fs.unlinkSync(serveInfoFile()); } catch (_) {}
}

function readServeInfo() {
  let raw;
  try {
    raw = fs.readFileSync(serveInfoFile(), "utf-8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new Error(`Corrupted serve state file: ${serveInfoFile()}. Delete it manually or re-run serve.`);
  }
}

function isValidPositivePid(pid) {
  return Number.isInteger(pid) && pid > 0;
}

function verifyProcessIdentity(info) {
  // File-level identity marker guards against stale or manually-created state files.
  // PID reuse is extremely unlikely because serve's SIGTERM handler calls
  // clearServeInfo() on graceful shutdown, and EPERM prevents cross-user kills.
  return info.identity === "echo-serve";
}

function isEchoServeCommand(command) {
  const runtimeSite = resolveRuntimeSiteDir();
  return (
    (command.includes("echoctl") && command.includes("serve")) ||
    (command.includes("scripts/serve") && command.includes("node")) ||
    (command.includes("vitepress") && command.includes(runtimeSite))
  );
}

function findServeProcessCandidates(ports = [DEFAULT_API_PORT, DEFAULT_DOCS_PORT]) {
  const pids = new Set();
  for (const port of ports) {
    try {
      const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf-8" });
      for (const line of out.split(/\r?\n/)) {
        const pid = Number(line.trim());
        if (isValidPositivePid(pid)) pids.add(pid);
      }
    } catch (_) {}
  }

  const candidates = [];
  for (const pid of pids) {
    try {
      const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf-8" }).trim();
      if (command && isEchoServeCommand(command)) {
        candidates.push({ pid, command });
      }
    } catch (_) {}
  }
  return candidates;
}

function resolveRuntimeSiteDir() {
  return path.join(resolveEchoHomePath(), ".site");
}

function findFreePort(start) {
  const net = require("net");
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(start, HOST, () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.on("error", () => resolve(findFreePort(start + 1)));
  });
}

function allowedOrigin(origin, docsPort) {
  if (!origin) return `http://${HOST}:${docsPort || DEFAULT_DOCS_PORT}`;
  try {
    const url = new URL(origin);
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const isDocsPort = url.port === String(docsPort || DEFAULT_DOCS_PORT);
    if ((url.protocol === "http:" || url.protocol === "https:") && isLocalhost && isDocsPort) {
      return origin;
    }
  } catch (_) {}
  return `http://${HOST}:${docsPort || DEFAULT_DOCS_PORT}`;
}

function jsonResponse(res, code, data, docsPort) {
  const origin = allowedOrigin(res.req?.headers?.origin, docsPort);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (_) {
        resolve(null);
      }
    });
  });
}

function resolveDirsForProject(projectId, fallbackDirs) {
  if (!projectId) return fallbackDirs || resolveDataDirs();
  const { findProjectById } = require("./lib/usecases/project-registry");
  const project = findProjectById(projectId);
  return project ? resolveDataDirs({ cwd: project.projectRoot }) : (fallbackDirs || resolveDataDirs());
}

function createRouter(deps) {
  const docsPort = deps.docsPort || DEFAULT_DOCS_PORT;
  return async function router(req, res) {
    res.req = req;
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": allowedOrigin(req.headers.origin, docsPort),
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    const url = new URL(req.url, `http://${HOST}`);
    const p = url.pathname;

    try {
      if (p === "/api/status" && req.method === "GET") {
        const dirs = deps.dirs || resolveDataDirs();
        return jsonResponse(res, 200, {
          ok: true,
          captureEnabled: isCaptureEnabled(),
          projectId: dirs.projectId || null,
          version: mcpServerInfo.version,
          author: getAuthor(),
        }, docsPort);
      }

      if (p === "/api/capture" && req.method === "GET") {
        return jsonResponse(res, 200, { enabled: isCaptureEnabled() }, docsPort);
      }

      if (p === "/api/capture" && req.method === "POST") {
        const body = await readBody(req);
        if (!body || typeof body.enabled !== "boolean") {
          return jsonResponse(res, 400, { error: "body.enabled (boolean) required" }, docsPort);
        }
        const r = setCaptureEnabled(body.enabled);
        return jsonResponse(res, 200, { enabled: r.capture_enabled }, docsPort);
      }

      if (p === "/api/comments" && req.method === "POST") {
        const body = await readBody(req);
        if (!body || !body.articleId || !body.comment) {
          return jsonResponse(res, 400, { error: "articleId and comment required" }, docsPort);
        }
        const dirs = resolveDirsForProject(body.projectId, deps.dirs);
        try {
          const { writeComment } = require("./lib/usecases/write-comment");
          const result = writeComment({
            articleId: body.articleId,
            quote: body.quote,
            comment: body.comment,
            author: body.author || "vincent",
            scope: body.scope || (body.quote ? undefined : "article"),
            prefix: body.prefix,
            suffix: body.suffix,
            occurrence: body.occurrence,
            evolutionKind: body.evolutionKind || "null",
            evolutionOf: body.evolutionOf || [],
            status: body.status || "open",
            dirs,
            store,
          });
          try { runBuildDocs({ docsRoot: deps.docsRoot || resolveRuntimeSiteDir() }); } catch (e) {
            console.error("[echo] Rebuilding docs after comment failed:", e.message);
          }
          return jsonResponse(res, 201, result, docsPort);
        } catch (err) {
          return jsonResponse(res, 422, { error: err.message }, docsPort);
        }
      }

      if (p === "/api/tags" && req.method === "POST") {
        const body = await readBody(req);
        const tags = Array.isArray(body?.tags)
          ? body.tags
          : (body?.tag ? [body.tag] : []);
        if (!body || !body.articleId || tags.length === 0) {
          return jsonResponse(res, 400, { error: "articleId and tag(s) required" }, docsPort);
        }
        const dirs = resolveDirsForProject(body.projectId, deps.dirs);
        try {
          const { addTags } = require("./lib/usecases/query-articles");
          const result = addTags({ id: body.articleId, tags }, { dirs, store });
          try { runBuildDocs({ docsRoot: deps.docsRoot || resolveRuntimeSiteDir() }); } catch (e) {
            console.error("[echo] Rebuilding docs after tag change failed:", e.message);
          }
          return jsonResponse(res, 201, result, docsPort);
        } catch (err) {
          return jsonResponse(res, err.name === "NotFoundError" ? 404 : 422, { error: err.message }, docsPort);
        }
      }

      if (p === "/api/projects" && req.method === "GET") {
        const echoHome = resolveEchoHomePath();
        const projects = listProjects(echoHome);
        const dirs = resolveDataDirs();
        return jsonResponse(res, 200, {
          projects: projects.map((p) => ({
            id: p.projectId,
            name: p.projectId,
            root: p.root,
            dataRoot: p.dataRoot,
          })),
          currentId: dirs.projectId,
        }, docsPort);
      }

      if (p === "/api/mcp-config" && req.method === "GET") {
        return jsonResponse(res, 200, {
          canonical: {
            command: cliNames.canonicalName,
            args: ["mcp"],
          },
          legacy: cliNames.legacyNames.map((name) => ({
            command: name,
            args: ["mcp"],
          })),
          serverInfo: mcpServerInfo,
        }, docsPort);
      }

      if (p === "/api/query-log" && req.method === "GET") {
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const dirs = deps.dirs || resolveDataDirs();
        try {
          const { readRecentQueryLog } = require("./lib/infra/query-log");
          return jsonResponse(res, 200, readRecentQueryLog(dirs, limit), docsPort);
        } catch (_) {
          return jsonResponse(res, 200, [], docsPort);
        }
      }

      if (p === "/api/rebuild-docs" && req.method === "POST") {
        try {
          runBuildDocs({ docsRoot: deps.docsRoot || resolveRuntimeSiteDir() });
          return jsonResponse(res, 200, { ok: true }, docsPort);
        } catch (err) {
          return jsonResponse(res, 500, { error: err.message }, docsPort);
        }
      }

      jsonResponse(res, 404, { error: "not found" }, docsPort);
    } catch (err) {
      jsonResponse(res, 500, { error: err.message }, docsPort);
    }
  };
}

async function start() {
  const docsDir = resolveRuntimeSiteDir();
  console.log("[echoctl] Building docs...");
  try {
    runBuildDocs({ docsRoot: docsDir });
  } catch (e) {
    console.error("[echoctl] build-docs warning:", e.message);
  }

  // Ensure vitepress is resolvable from the runtime site directory
  const siteModules = path.join(docsDir, "node_modules");
  const pkgVitepress = path.join(PACKAGE_ROOT, "node_modules", "vitepress");
  if (!fs.existsSync(siteModules)) fs.mkdirSync(siteModules, { recursive: true });
  const vpLink = path.join(siteModules, "vitepress");
  if (!fs.existsSync(vpLink)) {
    try { fs.symlinkSync(pkgVitepress, vpLink, "dir"); } catch (_) {}
  }

  const apiPort = await findFreePort(DEFAULT_API_PORT);
  const docsPort = await findFreePort(DEFAULT_DOCS_PORT);

  const vitepress = spawn("npx", ["vitepress", "dev", docsDir, "--port", String(docsPort), "--host", HOST], {
    cwd: PACKAGE_ROOT,
    stdio: "pipe",
    env: {
      ...process.env,
      VITE_ECHO_API_BASE: `http://${HOST}:${apiPort}`,
    },
  });

  vitepress.stdout.on("data", (d) => process.stdout.write(d));
  vitepress.stderr.on("data", (d) => process.stderr.write(d));
  vitepress.on("error", (err) => {
    console.error("[echoctl] VitePress failed:", err.message);
    process.exit(1);
  });

  const router = createRouter({ docsPort, docsRoot: docsDir });
  const server = http.createServer(router);
  server.listen(apiPort, HOST, () => {
    writeServeInfo(apiPort, docsPort, vitepress.pid);
    console.log(`\n  Echo serve started:`);
    console.log(`  API:       http://${HOST}:${apiPort}`);
    console.log(`  Docs:      http://${HOST}:${docsPort}`);
    console.log(`  Site dir:  ${docsDir}`);
    console.log(`  MCP name:  ${mcpServerInfo.name} v${mcpServerInfo.version}\n`);
  });

  function shutdown() {
    console.log("\n[echoctl] shutting down...");
    clearServeInfo();
    server.close();
    vitepress.kill("SIGTERM");
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  start().catch((err) => {
    console.error("[echoctl] serve failed:", err.message);
    process.exit(1);
  });
}

module.exports = {
  start,
  createRouter,
  resolveRuntimeSiteDir,
  readServeInfo,
  clearServeInfo,
  servePidFile,
  isValidPositivePid,
  verifyProcessIdentity,
  findServeProcessCandidates,
  isEchoServeCommand,
};
