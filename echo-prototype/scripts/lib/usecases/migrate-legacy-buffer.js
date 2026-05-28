const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveEchoHomePath, ensureDir } = require("../infra/workspace");
const { findProjectById, registerProject } = require("./project-registry");

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

function readSessionMap(mapPath) {
  const rows = [];
  try {
    const raw = fs.readFileSync(mapPath, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      rows.push({ sessionId: line.slice(0, idx), filePath: line.slice(idx + 1) });
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return rows;
}

function writeSessionMap(mapPath, rows) {
  const body = rows.map((row) => `${row.sessionId}=${row.filePath}`).join("\n");
  fs.writeFileSync(mapPath, body ? body + "\n" : "");
}

function appendFileIfExists(source, dest, apply) {
  if (!fs.existsSync(source)) return false;
  if (!apply) return true;
  ensureDir(path.dirname(dest));
  fs.appendFileSync(dest, fs.readFileSync(source, "utf-8"));
  return true;
}

function copyPendingFiles(sourcePendingDir, targetPendingDir, apply, overwrite) {
  let names;
  try {
    names = fs.readdirSync(sourcePendingDir).filter((name) => name.endsWith(".json")).sort();
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const pending = [];
  for (const name of names) {
    const source = path.join(sourcePendingDir, name);
    const dest = path.join(targetPendingDir, name);
    const exists = fs.existsSync(dest);
    const status = exists && !overwrite ? "skipped_existing" : exists ? "overwrite" : "copy";
    pending.push({ name, source, dest, status });
    if (apply && status !== "skipped_existing") {
      ensureDir(targetPendingDir);
      fs.copyFileSync(source, dest);
    }
  }
  return pending;
}

function resolveTargetProject(opts) {
  if (opts.projectId) {
    const project = findProjectById(opts.projectId, { echoHome: opts.echoHome });
    if (!project) throw new Error(`Project "${opts.projectId}" not found. Run echoctl project list or use --path <dir>.`);
    return project;
  }
  if (opts.projectPath) {
    const result = registerProject(opts.projectPath, { echoHome: opts.echoHome });
    return {
      projectId: result.projectId,
      projectRoot: result.projectRoot,
      dataRoot: result.dataRoot,
      registered: result.created,
    };
  }
  throw new Error("Target project required: use --project <id> or --path <dir>.");
}

function migrateLegacyBuffer(opts = {}) {
  const echoHome = opts.echoHome || resolveEchoHomePath(opts);
  const apply = opts.apply === true;
  const overwrite = opts.overwrite === true;
  const move = opts.move === true;
  const sourceDir = path.resolve(opts.from || defaultLegacyBufferDir(echoHome));
  const project = resolveTargetProject({ ...opts, echoHome });
  const targetDir = path.join(project.dataRoot, "session-buffer");

  if (path.resolve(sourceDir) === path.resolve(targetDir)) {
    throw new Error("Source legacy buffer and target project buffer are the same directory.");
  }

  const markdownNames = listMarkdownFiles(sourceDir);
  const files = [];
  const copiedNames = new Set();

  for (const name of markdownNames) {
    const source = path.join(sourceDir, name);
    const dest = path.join(targetDir, name);
    const exists = fs.existsSync(dest);
    const status = exists && !overwrite ? "skipped_existing" : exists ? "overwrite" : "copy";
    files.push({ name, source, dest, status });
    if (status !== "skipped_existing") copiedNames.add(name);
    if (apply && status !== "skipped_existing") {
      ensureDir(targetDir);
      fs.copyFileSync(source, dest);
      if (move) fs.unlinkSync(source);
    }
  }

  const sourceMapPath = path.join(sourceDir, "session-map.txt");
  const targetMapPath = path.join(targetDir, "session-map.txt");
  const sourceMapRows = readSessionMap(sourceMapPath);
  const targetMapRows = readSessionMap(targetMapPath);
  const targetBySession = new Map(targetMapRows.map((row) => [row.sessionId, row.filePath]));
  const mapUpdates = [];
  const mapConflicts = [];

  for (const row of sourceMapRows) {
    const name = path.basename(row.filePath);
    if (!copiedNames.has(name)) continue;
    const nextPath = path.join(targetDir, name);
    const existing = targetBySession.get(row.sessionId);
    if (existing && path.resolve(existing) !== path.resolve(nextPath) && !overwrite) {
      mapConflicts.push({ sessionId: row.sessionId, existing, next: nextPath });
      continue;
    }
    targetBySession.set(row.sessionId, nextPath);
    mapUpdates.push({ sessionId: row.sessionId, filePath: nextPath });
  }

  if (apply && mapUpdates.length > 0) {
    const merged = [...targetBySession.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sessionId, filePath]) => ({ sessionId, filePath }));
    ensureDir(targetDir);
    writeSessionMap(targetMapPath, merged);
  }

  const pending = copyPendingFiles(
    path.join(sourceDir, "pending"),
    path.join(targetDir, "pending"),
    apply,
    overwrite
  );

  const failuresCopied = appendFileIfExists(
    path.join(sourceDir, "failures.jsonl"),
    path.join(targetDir, "failures.jsonl"),
    apply
  );

  const auqCopied = fs.existsSync(path.join(sourceDir, "auq-counter.txt"));
  if (apply && auqCopied) {
    const sourceAuq = path.join(sourceDir, "auq-counter.txt");
    const targetAuq = path.join(targetDir, "auq-counter.txt");
    if (overwrite || !fs.existsSync(targetAuq)) {
      ensureDir(targetDir);
      fs.copyFileSync(sourceAuq, targetAuq);
    }
  }

  return {
    applied: apply,
    moved: apply && move,
    sourceDir,
    targetDir,
    projectId: project.projectId,
    projectRoot: project.projectRoot,
    registered: project.registered === true,
    files,
    mapUpdates,
    mapConflicts,
    pending,
    failuresCopied,
    auqCopied,
    summary: {
      copy: files.filter((f) => f.status === "copy").length,
      overwrite: files.filter((f) => f.status === "overwrite").length,
      skippedExisting: files.filter((f) => f.status === "skipped_existing").length,
      mapUpdates: mapUpdates.length,
      mapConflicts: mapConflicts.length,
      pending: pending.length,
    },
  };
}

module.exports = {
  migrateLegacyBuffer,
  defaultLegacyBufferDir,
  readSessionMap,
};
