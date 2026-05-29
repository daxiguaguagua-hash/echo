const fs = require("fs");
const path = require("path");

const { resolveEchoHomePath } = require("../infra/workspace");
const { findProjectById } = require("./project-registry");
const { discoverClaudeImportCandidates } = require("./discover-claude-imports");
const provider = require("../import/providers/claude-code");
const mf = require("../import/manifest");

function importClaudeProject(projectId, opts = {}) {
  const echoHome = opts.echoHome || resolveEchoHomePath(opts);
  const project = findProjectById(projectId, { echoHome });
  if (!project) throw new Error(`Project "${projectId}" not found.`);

  const discovery = discoverClaudeImportCandidates(projectId, {
    echoHome,
    claudeProjectsDir: opts.claudeProjectsDir,
  });
  const selected = opts.sessionIds ? new Set(opts.sessionIds) : null;
  const candidates = discovery.candidates.filter((entry) => {
    if (entry.status === "skipped") return false;
    return !selected || selected.has(entry.sessionId);
  });

  const articlesDir = path.join(project.dataRoot, "articles");
  const manifestPath = path.join(echoHome, "import-manifest.json");
  const manifest = mf.loadManifest(manifestPath);
  const result = {
    ok: true,
    projectId,
    provider: "claude-code",
    projectDir: discovery.projectDir,
    total: discovery.summary.total,
    candidates: candidates.length,
    imported: 0,
    skipped: 0,
    lowQuality: 0,
    failed: 0,
    articlesDir,
    importedArticles: [],
  };

  for (const entry of candidates) {
    const articleId = `session-${entry.sessionId.slice(0, 8)}`;
    const articlePath = path.join(articlesDir, `${articleId}.md`);

    if (fs.existsSync(articlePath)) {
      if (entry.status === "updated") {
        mf.recordImport(manifest, entry.sessionId, articleId, entry.fileHash, { provider: "claude-code" });
      }
      result.skipped++;
      continue;
    }

    try {
      const turns = provider.readSessionTurns(entry.filePath);
      const classification = provider.classifySession(turns);
      if (!classification.isMeaningful) {
        mf.recordImport(manifest, entry.sessionId, `skipped-${entry.sessionId.slice(0, 8)}`, entry.fileHash, {
          provider: "claude-code",
          skipped: true,
          reason: classification.reason,
        });
        result.skipped++;
        result.lowQuality++;
        continue;
      }

      const metadata = provider.extractMetadata(turns);
      const markdown = provider.toEchoArticle(turns, metadata, {
        sessionId: entry.sessionId,
        project: projectId,
      });

      fs.mkdirSync(path.dirname(articlePath), { recursive: true });
      fs.writeFileSync(articlePath, markdown);
      mf.recordImport(manifest, entry.sessionId, articleId, entry.fileHash, { provider: "claude-code" });
      result.imported++;
      result.importedArticles.push({ articleId, articlePath });
    } catch (_) {
      result.failed++;
    }
  }

  mf.saveManifest(manifest, manifestPath);
  return result;
}

module.exports = { importClaudeProject };
