const fs = require("fs");
const path = require("path");
const { resolveEchoHomePath } = require("../infra/workspace");
const { findProjectById, listProjects } = require("./project-registry");

function defaultLegacyBufferDir(echoHome) {
  return path.join(echoHome, "session-buffer");
}

function listMarkdownFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort();
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

function readPendingPayload(pendingDir, sessionId) {
  const pendingFile = path.join(pendingDir, `${sessionId}.json`);
  try {
    return JSON.parse(fs.readFileSync(pendingFile, "utf-8"));
  } catch (_) {
    return null;
  }
}

function claudeProjectDirName(projectPath) {
  return "-" + path.resolve(projectPath).slice(1).split(path.sep).join("-");
}

function resolveProjectForTranscriptPath(transcriptPath, projects) {
  if (!transcriptPath) return null;
  for (const p of projects) {
    if (transcriptPath.includes(claudeProjectDirName(p.root))) return p;
  }
  return null;
}

function resolveProjectForCwd(cwd, projects) {
  if (!cwd) return null;
  const resolved = path.resolve(cwd);
  for (const p of projects) {
    const root = path.resolve(p.root);
    if (resolved === root || resolved.startsWith(root + path.sep)) return p;
  }
  return null;
}

function scanLegacyCandidates(projectId, opts = {}) {
  const echoHome = opts.echoHome || resolveEchoHomePath(opts);
  const sourceDir = opts.from || defaultLegacyBufferDir(echoHome);
  const project = findProjectById(projectId, { echoHome });
  if (!project) throw new Error(`Project "${projectId}" not found.`);

  const projects = listProjects(echoHome);
  const pendingDir = path.join(sourceDir, "pending");
  const markdownNames = listMarkdownFiles(sourceDir);
  const candidates = [];

  // First pass: match by pending JSON evidence
  let hasAnyHighConfidenceMatch = false;
  for (const name of markdownNames) {
    const sourcePath = path.join(sourceDir, name);
    const sessionId = path.basename(name, ".md");
    let stat;
    try { stat = fs.statSync(sourcePath); } catch (_) { continue; }

    const raw = fs.readFileSync(sourcePath, "utf-8");
    const turnCount = (raw.match(/<!-- turn:/g) || []).length;
    if (turnCount === 0) continue;

    const pending = readPendingPayload(pendingDir, sessionId);
    let matched = null;
    let evidence = null;
    let confidence = "low";

    if (pending && pending.transcript_path) {
      matched = resolveProjectForTranscriptPath(pending.transcript_path, projects);
      if (matched) {
        evidence = { kind: "transcript_path", projectRoot: matched.root };
        confidence = "high";
      }
    }
    if (!matched && pending && pending.cwd) {
      matched = resolveProjectForCwd(pending.cwd, projects);
      if (matched) {
        evidence = { kind: "cwd", projectRoot: matched.root };
        confidence = "high";
      }
    }
    if (!matched || matched.projectId !== projectId) continue;

    hasAnyHighConfidenceMatch = true;
    candidates.push({
      sessionId, fileName: name, sourcePath,
      turnCount, mtime: stat.mtime.toISOString(),
      confidence, evidence,
    });
  }

  // Second pass: completed sessions (pending deleted) inherit medium confidence
  // if at least one other session in the same legacy buffer matched this project
  if (hasAnyHighConfidenceMatch) {
    const alreadyMatched = new Set(candidates.map((c) => c.sessionId));
    for (const name of markdownNames) {
      const sessionId = path.basename(name, ".md");
      if (alreadyMatched.has(sessionId)) continue;

      const sourcePath = path.join(sourceDir, name);
      let stat;
      try { stat = fs.statSync(sourcePath); } catch (_) { continue; }
      const raw = fs.readFileSync(sourcePath, "utf-8");
      const turnCount = (raw.match(/<!-- turn:/g) || []).length;
      if (turnCount === 0) continue;

      const pending = readPendingPayload(pendingDir, sessionId);
      if (pending) continue; // has pending but didn't match above — skip

      candidates.push({
        sessionId, fileName: name, sourcePath,
        turnCount, mtime: stat.mtime.toISOString(),
        confidence: "medium",
        evidence: { kind: "shared_buffer", projectRoot: project.root },
      });
    }
  }

  return { projectId, sourceDir, candidates };
}

module.exports = { scanLegacyCandidates, defaultLegacyBufferDir };
