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

function serveLogFile() {
  return path.join(resolveEchoHomePath(), ".serve.log");
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

function isPidRunning(pid) {
  if (!isValidPositivePid(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") return false;
    if (err.code === "EPERM") return true;
    throw err;
  }
}

function formatServeSummary(info, opts = {}) {
  const captureEnabled = opts.captureEnabled !== false;
  const projects = opts.projects || listProjects();
  const command = cliNames.canonicalName;
  const title = opts.background
    ? "Echo服务在后台运行 / Echo serve started in background"
    : "Echo服务正在前台运行 / Echo serve running in foreground";
  const rows = [
    ["Docs / 访问地址", `http://${HOST}:${info.docsPort}/`],
    ["API / 接口地址", `http://${HOST}:${info.apiPort}/`],
    ["State / 状态文件", serveInfoFile()],
  ];
  if (opts.logFile) rows.push(["Log / 日志文件", opts.logFile]);

  const labelWidth = Math.max(...rows.map(([label]) => label.length), 22);
  const formatRow = ([label, value]) => `${label.padEnd(labelWidth)}  ${value}`;
  const captureStatus = captureEnabled
    ? "正在收集 AI 聊天记录 / Collecting AI chat logs"
    : "已关闭 AI 聊天记录 / AI chat logging is off";
  const captureCommand = captureEnabled
    ? `${command} capture off`
    : `${command} capture on`;
  const captureHint = captureEnabled
    ? "关闭收集 / Turn off"
    : "开启收集 / Turn on";
  const projectLines = projects.length === 0
    ? ["  (none) No registered projects yet."]
    : projects.map((p) => `  ${p.projectId.padEnd(20)} ${p.root}`);

  return [
    title,
    "",
    ...rows.map(formatRow),
    "",
    `${command} serve              # 后台启动 / Start in background`,
    `${command} serve --foreground # 前台调试 / Run in foreground for debugging`,
    `${command} stop               # 停止服务 / Stop Echo serve`,
    `${command} capture on/off     # 控制 AI 聊天记录收集 / Toggle AI chat logging`,
    "",
    "AI chat capture / AI 聊天记录:",
    `  Status / 当前状态       ${captureStatus}`,
    `  Command / 对应命令      ${captureHint}: ${captureCommand}`,
    "",
    "Registered projects / 已注册项目:",
    ...projectLines,
    "",
    "New projects must be registered before Echo can show their AI chat records.",
    `新项目必须先注册，否则网页不会显示该项目的 AI 聊天记录：${command} init project --path <project-dir>`,
  ].join("\n");
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

async function findFreePort(start) {
  const net = require("net");
  let port = start;
  while (port <= 65535) {
    try {
      return await new Promise((resolve, reject) => {
        const s = net.createServer();
        s.listen(port, HOST, () => {
          const assignedPort = s.address().port;
          s.close(() => resolve(assignedPort));
        });
        s.on("error", reject);
      });
    } catch (_) {
      port++;
    }
  }
  throw new Error(`No free port found from ${start} to 65535`);
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

      if (p === "/api/tags/remove" && req.method === "POST") {
        const body = await readBody(req);
        const tags = Array.isArray(body?.tags) ? body.tags : [];
        if (!body || !body.articleId || tags.length === 0) {
          return jsonResponse(res, 400, { error: "articleId and tags required" }, docsPort);
        }
        const dirs = resolveDirsForProject(body.projectId, deps.dirs);
        try {
          const { removeTags } = require("./lib/usecases/query-articles");
          const result = removeTags({ id: body.articleId, tags }, { dirs, store });
          try { runBuildDocs({ docsRoot: deps.docsRoot || resolveRuntimeSiteDir() }); } catch (e) {
            console.error("[echo] Rebuilding docs after tag removal failed:", e.message);
          }
          return jsonResponse(res, 200, result, docsPort);
        } catch (err) {
          return jsonResponse(res, err.name === "NotFoundError" ? 404 : 422, { error: err.message }, docsPort);
        }
      }

      if (p === "/api/tags/rename" && req.method === "POST") {
        const body = await readBody(req);
        if (!body || !body.oldTag || !body.newTag) {
          return jsonResponse(res, 400, { error: "oldTag and newTag required" }, docsPort);
        }
        const dirs = resolveDirsForProject(body.projectId, deps.dirs);
        try {
          const { renameTag } = require("./lib/usecases/query-articles");
          const result = renameTag({ oldTag: body.oldTag, newTag: body.newTag }, { dirs, store });
          try { runBuildDocs({ docsRoot: deps.docsRoot || resolveRuntimeSiteDir() }); } catch (e) {
            console.error("[echo] Rebuilding docs after tag rename failed:", e.message);
          }
          return jsonResponse(res, 200, result, docsPort);
        } catch (err) {
          return jsonResponse(res, err.name === "NotFoundError" ? 404 : 422, { error: err.message }, docsPort);
        }
      }

      if (p === "/api/tags/purge" && req.method === "POST") {
        const body = await readBody(req);
        if (!body || !body.tag) {
          return jsonResponse(res, 400, { error: "tag required" }, docsPort);
        }
        const dirs = resolveDirsForProject(body.projectId, deps.dirs);
        try {
          const { purgeTag } = require("./lib/usecases/query-articles");
          const result = purgeTag({ tag: body.tag }, { dirs, store });
          try { runBuildDocs({ docsRoot: deps.docsRoot || resolveRuntimeSiteDir() }); } catch (e) {
            console.error("[echo] Rebuilding docs after tag purge failed:", e.message);
          }
          return jsonResponse(res, 200, result, docsPort);
        } catch (err) {
          return jsonResponse(res, err.name === "NotFoundError" ? 404 : 422, { error: err.message }, docsPort);
        }
      }

      if (p === "/api/summary" && req.method === "POST") {
        const body = await readBody(req);
        if (!body || !body.articleId || body.summary === undefined) {
          return jsonResponse(res, 400, { error: "articleId and summary required" }, docsPort);
        }
        const dirs = resolveDirsForProject(body.projectId, deps.dirs);
        try {
          const { updateSummary } = require("./lib/usecases/query-articles");
          const result = updateSummary({ id: body.articleId, summary: body.summary }, { dirs, store });
          try { runBuildDocs({ docsRoot: deps.docsRoot || resolveRuntimeSiteDir() }); } catch (e) {
            console.error("[echo] Rebuilding docs after summary update failed:", e.message);
          }
          return jsonResponse(res, 200, result, docsPort);
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

      if (p === "/api/live-session-state" && req.method === "GET") {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          return jsonResponse(res, 400, { error: "sessionId query parameter required" }, docsPort);
        }
        const projectId = url.searchParams.get("projectId") || null;
        try {
          const dirs = resolveDirsForProject(projectId, deps.dirs);
          const { getLiveSessionState } = require("./lib/usecases/live-session-state");
          return jsonResponse(res, 200, getLiveSessionState(dirs, sessionId), docsPort);
        } catch (err) {
          return jsonResponse(res, 500, { error: err.message }, docsPort);
        }
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

      if (p === "/api/publish" && req.method === "POST") {
        const body = await readBody(req);
        if (!body || !body.sessionId) {
          return jsonResponse(res, 400, { error: "sessionId required" }, docsPort);
        }
        try {
          const dirs = resolveDirsForProject(body.projectId, deps.dirs);
          const baseSessionId = body.sessionId.replace(/-v\d+$/, "");
          const bufferPath = path.join(dirs.bufferDir, `${baseSessionId}.md`);
          if (!fs.existsSync(bufferPath)) {
            return jsonResponse(res, 404, { error: `session buffer not found: ${body.sessionId}` }, docsPort);
          }
          const { parseBuffer, buildArticle } = require("./lib/usecases/convert-buffer");
          const { recordSnapshot, getSnapshotInfo } = require("./lib/usecases/snapshot-manifest");
          const raw = fs.readFileSync(bufferPath, "utf-8");
          const { turns } = parseBuffer(raw);
          if (turns.length === 0) {
            return jsonResponse(res, 422, { error: "buffer has no turns" }, docsPort);
          }

          const snapInfo = getSnapshotInfo(dirs.dataRoot || dirs.articlesDir, baseSessionId);
          if (snapInfo && snapInfo.versions.length > 0) {
            const last = snapInfo.versions[snapInfo.versions.length - 1];
            if (last.turnCount >= turns.length) {
              return jsonResponse(res, 409, {
                error: "already published with same or more turns",
                existingVersion: last.version,
              }, docsPort);
            }
          }

          const version = snapInfo ? snapInfo.versions.length + 1 : 1;
          const articleId = version > 1
            ? `${baseSessionId}-v${version}`
            : baseSessionId;
          const articlePath = path.join(dirs.articlesDir, `${articleId}.md`);
          if (fs.existsSync(articlePath)) {
            return jsonResponse(res, 409, { error: `article ${articleId} already exists` }, docsPort);
          }
          const { id, article, turnCount } = buildArticle(articleId, turns, { project: dirs.projectId });
          const snap = recordSnapshot(dirs.dataRoot || dirs.articlesDir, baseSessionId, id, turnCount);
          fs.mkdirSync(dirs.articlesDir, { recursive: true });
          fs.writeFileSync(articlePath, article);
          try { runBuildDocs({ docsRoot: deps.docsRoot || resolveRuntimeSiteDir() }); } catch (e) {
            console.error("[echo] Rebuilding docs after publish failed:", e.message);
          }
          return jsonResponse(res, 201, {
            ok: true, id, slug: id, turnCount, version: snap.version, latest: true,
          }, docsPort);
        } catch (err) {
          return jsonResponse(res, 500, { error: err.message }, docsPort);
        }
      }

      if (p === "/api/legacy-candidates" && req.method === "GET") {
        const projectId = url.searchParams.get("projectId");
        if (!projectId) {
          return jsonResponse(res, 400, { error: "projectId query parameter required" }, docsPort);
        }
        try {
          const { scanLegacyCandidates } = require("./lib/usecases/legacy-candidates");
          const result = scanLegacyCandidates(projectId);
          return jsonResponse(res, 200, result, docsPort);
        } catch (err) {
          return jsonResponse(res, err.message.includes("not found") ? 404 : 500, { error: err.message }, docsPort);
        }
      }

      if (p === "/api/legacy-candidates/migrate" && req.method === "POST") {
        const body = await readBody(req);
        if (!body || !body.projectId) {
          return jsonResponse(res, 400, { error: "projectId required" }, docsPort);
        }
        try {
          const { migrateLegacyBuffer } = require("./lib/usecases/migrate-legacy-buffer");
          let filterFileNames = null;
          const candidateIds = body.candidateIds;
          if (candidateIds && candidateIds.length > 0) {
            const { scanLegacyCandidates } = require("./lib/usecases/legacy-candidates");
            const scan = scanLegacyCandidates(body.projectId);
            const idSet = new Set(candidateIds);
            filterFileNames = scan.candidates
              .filter((c) => idSet.has(c.sessionId))
              .map((c) => c.fileName);
            if (filterFileNames.length === 0) {
              return jsonResponse(res, 200, {
                ok: true, migrated: 0, skipped: 0,
                targetDir: null, refreshScheduled: false,
              }, docsPort);
            }
          }
          const result = migrateLegacyBuffer({
            projectId: body.projectId,
            apply: true,
            overwrite: false,
            filterFileNames,
          });
          try { runBuildDocs({ docsRoot: deps.docsRoot || resolveRuntimeSiteDir() }); } catch (e) {
            console.error("[echo] Rebuilding docs after legacy migration failed:", e.message);
          }
          return jsonResponse(res, 200, {
            ok: true,
            migrated: result.summary.copy + result.summary.overwrite,
            skipped: result.summary.skippedExisting,
            targetDir: result.targetDir,
            refreshScheduled: true,
          }, docsPort);
        } catch (err) {
          return jsonResponse(res, 500, { error: err.message }, docsPort);
        }
      }

      if (p === "/api/import/claude-candidates" && req.method === "GET") {
        const projectId = url.searchParams.get("projectId");
        if (!projectId) {
          return jsonResponse(res, 400, { error: "projectId query parameter required" }, docsPort);
        }
        try {
          const { discoverClaudeImportCandidates } = require("./lib/usecases/discover-claude-imports");
          const result = discoverClaudeImportCandidates(projectId);
          return jsonResponse(res, 200, result, docsPort);
        } catch (err) {
          return jsonResponse(res, err.message.includes("not found") ? 404 : 500, { error: err.message }, docsPort);
        }
      }

      if (p === "/api/import/claude" && req.method === "POST") {
        const body = await readBody(req);
        if (!body || !body.projectId || !Array.isArray(body.sessionIds) || body.sessionIds.length === 0) {
          return jsonResponse(res, 400, { error: "projectId and sessionIds (non-empty array) required" }, docsPort);
        }
        try {
          const { discoverClaudeImportCandidates } = require("./lib/usecases/discover-claude-imports");
          const provider = require("./lib/import/providers/claude-code");
          const mf = require("./lib/import/manifest");
          const candidates = discoverClaudeImportCandidates(body.projectId);
          const idSet = new Set(body.sessionIds);
          const toImport = candidates.candidates.filter((c) => idSet.has(c.sessionId) && c.status !== "skipped");

          if (toImport.length === 0) {
            return jsonResponse(res, 200, { ok: true, imported: 0, skipped: 0, articlesDir: null, refreshScheduled: false }, docsPort);
          }

          const echoHome = resolveEchoHomePath();
          const manifestPath = path.join(echoHome, "import-manifest.json");
          const manifest = mf.loadManifest(manifestPath);
          const { findProjectById } = require("./lib/usecases/project-registry");
          const project = findProjectById(body.projectId, { echoHome });
          const articlesDir = project ? project.dataRoot + "/articles" : path.join(echoHome, "articles");

          let imported = 0;
          let skipped = 0;

          for (const entry of toImport) {
            const articleId = `session-${entry.sessionId.slice(0, 8)}`;
            const articlePath = path.join(articlesDir, `${articleId}.md`);

            if (fs.existsSync(articlePath)) {
              // Record updated hash so this session won't show as "updated" again
              if (entry.status === "updated") {
                mf.recordImport(manifest, entry.sessionId, articleId, entry.fileHash, { provider: "claude-code" });
              }
              skipped++;
              continue;
            }

            try {
              const turns = provider.readSessionTurns(entry.filePath);
              const classification = provider.classifySession(turns);
              if (!classification.isMeaningful) {
                skipped++;
                continue;
              }

              const metadata = provider.extractMetadata(turns);
              const markdown = provider.toEchoArticle(turns, metadata, {
                sessionId: entry.sessionId,
                project: body.projectId,
              });

              fs.mkdirSync(path.dirname(articlePath), { recursive: true });
              fs.writeFileSync(articlePath, markdown);
              mf.recordImport(manifest, entry.sessionId, articleId, entry.fileHash, { provider: "claude-code" });
              imported++;
            } catch (err) {
              console.error("[echo] import claude error:", err.message);
            }
          }

          mf.saveManifest(manifest, manifestPath);

          try { runBuildDocs({ docsRoot: deps.docsRoot || resolveRuntimeSiteDir() }); } catch (e) {
            console.error("[echo] Rebuilding docs after import failed:", e.message);
          }

          return jsonResponse(res, 200, {
            ok: true, imported, skipped,
            articlesDir, refreshScheduled: true,
          }, docsPort);
        } catch (err) {
          return jsonResponse(res, err.message.includes("not found") ? 404 : 500, { error: err.message }, docsPort);
        }
      }

      if (p === "/api/rebuild-docs" && req.method === "POST") {
        try {
          const { runPipeline } = require("./lib/usecases/run-pipeline");
          runPipeline({ allProjects: true, silent: true, steps: ["validate", "index", "resolve"] });
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

  // Auto-run pipeline so captured buffers become visible without manual steps
  console.log("[echoctl] Running pipeline...");
  try {
    const { runPipeline } = require("./lib/usecases/run-pipeline");
    runPipeline({ allProjects: true, silent: true, steps: ["validate", "index", "resolve"] });
  } catch (e) {
    console.error("[echoctl] pipeline warning:", e.message);
  }

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
    console.log(formatServeSummary({
      apiPort,
      docsPort,
    }, { captureEnabled: isCaptureEnabled(), background: false }));
    console.log("");
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
  findFreePort,
  resolveRuntimeSiteDir,
  readServeInfo,
  clearServeInfo,
  servePidFile,
  serveInfoFile,
  serveLogFile,
  formatServeSummary,
  isPidRunning,
  isValidPositivePid,
  verifyProcessIdentity,
  findServeProcessCandidates,
  isEchoServeCommand,
};
