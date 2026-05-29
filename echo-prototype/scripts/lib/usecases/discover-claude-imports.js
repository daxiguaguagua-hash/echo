const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { resolveEchoHomePath } = require("../infra/workspace");
const { findProjectById } = require("./project-registry");
const { loadManifest } = require("../import/manifest");
const { scanProjectDir } = require("../import/providers/claude-code");

function claudeProjectDirName(projectPath) {
  return "-" + path.resolve(projectPath).slice(1).split(path.sep).join("-");
}

function discoverClaudeImportCandidates(projectId, opts = {}) {
  const echoHome = opts.echoHome || resolveEchoHomePath(opts);
  const project = findProjectById(projectId, { echoHome });
  if (!project) throw new Error(`Project "${projectId}" not found.`);

  const claudeProjectsDir = opts.claudeProjectsDir || path.join(os.homedir(), ".claude", "projects");
  const dirName = claudeProjectDirName(project.projectRoot);
  const projectDir = path.join(claudeProjectsDir, dirName);

  if (!fs.existsSync(projectDir)) {
    return {
      projectId,
      provider: "claude-code",
      projectDir,
      summary: { total: 0, new: 0, updated: 0, skipped: 0 },
      candidates: [],
    };
  }

  const sessions = scanProjectDir(projectDir);
  const manifestPath = path.join(echoHome, "import-manifest.json");
  const manifest = loadManifest(manifestPath);

  const candidates = [];
  const summary = { total: 0, new: 0, updated: 0, skipped: 0 };

  for (const s of sessions) {
    summary.total++;
    const fileHash = crypto.createHash("sha256")
      .update(fs.readFileSync(s.filePath, "utf-8"))
      .digest("hex");

    const existing = manifest.imports && manifest.imports[s.sessionId];
    let status = "new";
    let articleId = `session-${s.sessionId.slice(0, 8)}`;

    if (existing) {
      if (existing.fileHash === fileHash) {
        status = "skipped";
        articleId = existing.articleId;
      } else {
        status = "updated";
        articleId = existing.articleId;
      }
    }

    candidates.push({
      sessionId: s.sessionId,
      filePath: s.filePath,
      status,
      articleId,
      turnCount: s.turnCount,
      mtime: (() => {
        try { return fs.statSync(s.filePath).mtime.toISOString(); } catch (_) { return ""; }
      })(),
      fileHash,
    });

    if (status === "new") summary.new++;
    else if (status === "updated") summary.updated++;
    else summary.skipped++;
  }

  return { projectId, provider: "claude-code", projectDir, summary, candidates };
}

module.exports = { discoverClaudeImportCandidates, claudeProjectDirName };
