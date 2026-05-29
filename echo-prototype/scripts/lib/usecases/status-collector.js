const fs = require("fs");
const path = require("path");
const os = require("os");
const { resolveEchoHomePath } = require("../infra/workspace");
const { isCaptureEnabled } = require("../infra/config");
const { findProjectForPath } = require("./project-registry");
const { cliNames } = require("../cli/names");
const { scanLegacyCandidates } = require("./legacy-candidates");
const { discoverClaudeImportCandidates } = require("./discover-claude-imports");

function serveInfoFile() {
  return path.join(resolveEchoHomePath(), ".serve.json");
}

function readServeInfo() {
  try {
    return JSON.parse(fs.readFileSync(serveInfoFile(), "utf-8"));
  } catch (_) {
    return null;
  }
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function extractHookCommand(entry) {
  if (Array.isArray(entry.hooks)) {
    const h = entry.hooks.find((h) => typeof h.command === "string");
    if (h) return h.command;
  }
  if (typeof entry.command === "string") return entry.command;
  return null;
}

function checkHookInstalled() {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    const hooks = settings.hooks || {};
    for (const event of ["SessionStart", "UserPromptSubmit", "Stop", "StopFailure"]) {
      const entries = hooks[event] || [];
      const has = entries.some((e) => {
        const cmd = extractHookCommand(e);
        return cmd && (cmd.includes("echoctl") || cmd.includes("echo-mcp"));
      });
      if (!has) return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

function countMdFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).length;
  } catch (_) {
    return 0;
  }
}

function collectStatus(opts = {}) {
  const echoHome = resolveEchoHomePath(opts);
  const serveInfo = readServeInfo();
  const serveRunning = serveInfo ? isPidRunning(serveInfo.pid) : false;
  const project = findProjectForPath(process.cwd(), { echoHome });
  const TOOLS = require("../interfaces/mcp/tools").TOOLS;

  let legacyBuffers = 0;
  let legacyCandidates = 0;
  try {
    const legacyDir = path.join(echoHome, "session-buffer");
    if (fs.existsSync(legacyDir)) {
      legacyBuffers = fs.readdirSync(legacyDir).filter((f) => f.endsWith(".md")).length;
    }
    if (project) {
      const result = scanLegacyCandidates(project.projectId, { echoHome });
      legacyCandidates = result.candidates.length;
    }
  } catch (_) {}

  let transcripts = null;
  let transcriptNew = 0;
  let transcriptUpdated = 0;
  if (project) {
    try {
      const r = discoverClaudeImportCandidates(project.projectId, { echoHome });
      transcripts = { provider: r.provider, projectDir: r.projectDir, ...r.summary };
      transcriptNew = r.summary.new;
      transcriptUpdated = r.summary.updated;
    } catch (_) {}
  }

  return {
    serve: {
      running: serveRunning,
      docsUrl: (serveRunning && serveInfo) ? `http://127.0.0.1:${serveInfo.docsPort}/` : null,
      apiUrl: (serveRunning && serveInfo) ? `http://127.0.0.1:${serveInfo.apiPort}/` : null,
      pid: serveInfo ? serveInfo.pid : null,
      logFile: path.join(echoHome, ".serve.log"),
    },
    capture: { enabled: isCaptureEnabled() },
    hook: { provider: "claude", installed: checkHookInstalled() },
    project: project ? {
      registered: true, projectId: project.projectId,
      root: project.projectRoot, dataRoot: project.dataRoot,
    } : {
      registered: false, projectId: null, root: null, dataRoot: null,
    },
    data: project ? {
      liveBuffers: countMdFiles(path.join(project.dataRoot, "session-buffer")),
      articles: countMdFiles(path.join(project.dataRoot, "articles")),
      comments: countMdFiles(path.join(project.dataRoot, "comments")),
    } : { liveBuffers: 0, articles: 0, comments: 0 },
    legacy: { buffers: legacyBuffers, currentProjectCandidates: legacyCandidates },
    transcripts,
    mcp: {
      command: cliNames.canonicalName, args: ["mcp"], toolCount: TOOLS.length,
    },
    nextActions: [
      ...(serveRunning && serveInfo && serveInfo.docsPort
        ? [{ kind: "open_docs", label: "Open Docs", url: `http://127.0.0.1:${serveInfo.docsPort}/` }]
        : []),
      ...(legacyCandidates > 0
        ? [{ kind: "review_legacy", label: "Review legacy candidates" }]
        : []),
      ...(transcriptNew > 0 || transcriptUpdated > 0
        ? [{ kind: "review_transcripts", label: "Review unimported Claude transcripts" }]
        : []),
    ],
    _meta: { echoHome, collectedAt: new Date().toISOString() },
  };
}

module.exports = { collectStatus };
