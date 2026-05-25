const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_EXCLUSIONS = ["claude-mem-observer-sessions", "private-tmp"];

function scanClaudeProjects(claudeProjectsDir, opts = {}) {
  const excludeList = opts.excludeDirs || opts.exclude || DEFAULT_EXCLUSIONS;
  const exclusions = new Set(excludeList);

  if (!fs.existsSync(claudeProjectsDir)) return [];

  const entries = fs.readdirSync(claudeProjectsDir);
  const projects = [];

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    if (exclusions.has(entry)) continue;

    const fullPath = path.join(claudeProjectsDir, entry);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const fileNames = fs.readdirSync(fullPath).filter((f) => f.endsWith(".jsonl"));
    if (fileNames.length === 0) continue;

    const jsonlFiles = fileNames.map((f) => ({
      sessionId: f.replace(/\.jsonl$/, ""),
      fileName: f,
      absPath: path.join(fullPath, f),
    }));

    const decoded = decodeProjectPath(entry);

    projects.push({
      dirName: entry,
      absPath: fullPath,
      sessionCount: jsonlFiles.length,
      jsonlFiles,
      decodedPath: decoded.value,
      pathConfidence: decoded.confidence,
    });
  }

  return projects;
}

function decodeProjectPath(dirName) {
  if (!dirName || dirName.trim() === "") {
    return { value: "", confidence: "inferred" };
  }

  if (!dirName.startsWith("-")) {
    return { value: dirName, confidence: "inferred" };
  }

  const pathStr = "/" + dirName.slice(1).replace(/-/g, "/");

  return { value: pathStr, confidence: "inferred" };
}

function buildImportPlan(projects, manifest, opts = {}) {
  const maxSessionsPerProject = opts.maxSessionsPerProject || Infinity;
  const plan = {
    new: [],
    updated: [],
    skipped: [],
    summary: { total: 0, newCount: 0, updatedCount: 0, skippedCount: 0 },
  };

  const computeHash = opts.getFileHash || ((absPath) => {
    try {
      const content = fs.readFileSync(absPath, "utf-8");
      return crypto.createHash("sha256").update(content).digest("hex");
    } catch {
      return crypto.createHash("sha256").update(absPath).digest("hex");
    }
  });

  for (const project of projects) {
    const jsonlFiles = project.jsonlFiles || [];
    let projectSessionCount = 0;

    for (const jf of jsonlFiles) {
      if (projectSessionCount >= maxSessionsPerProject) break;

      const sessionId = jf.sessionId;
      const filePath = jf.absPath;
      const fileHash = computeHash(filePath);

      const entry = {
        sessionId,
        filePath,
        fileHash,
        projectDir: project.dirName,
        decodedPath: project.decodedPath,
        pathConfidence: project.pathConfidence,
        turnCount: 0,
      };

      if (manifest.imports && manifest.imports[sessionId]) {
        const existing = manifest.imports[sessionId];
        if (existing.fileHash === fileHash) {
          plan.skipped.push({ ...entry, articleId: existing.articleId });
        } else {
          plan.updated.push({ ...entry, previousArticleId: existing.articleId });
        }
      } else {
        plan.new.push(entry);
      }

      projectSessionCount++;
    }
  }

  plan.summary.total = plan.new.length + plan.updated.length + plan.skipped.length;
  plan.summary.newCount = plan.new.length;
  plan.summary.updatedCount = plan.updated.length;
  plan.summary.skippedCount = plan.skipped.length;

  return plan;
}

module.exports = { scanClaudeProjects, decodeProjectPath, buildImportPlan };
