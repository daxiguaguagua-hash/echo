const fs = require("fs");
const path = require("path");

function manifestPath(dataRoot) {
  return path.join(dataRoot, "snapshots.json");
}

function loadManifest(dataRoot) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(dataRoot), "utf-8"));
  } catch (err) {
    if (err.code === "ENOENT") return { sessions: {} };
    throw err;
  }
}

function saveManifest(dataRoot, manifest) {
  const p = manifestPath(dataRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp-" + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  fs.renameSync(tmp, p);
}

function recordSnapshot(dataRoot, sessionId, articleId, turnCount) {
  const manifest = loadManifest(dataRoot);
  if (!manifest.sessions[sessionId]) {
    manifest.sessions[sessionId] = { latestArticleId: null, versions: [] };
  }
  const entry = manifest.sessions[sessionId];
  const nextVersion = entry.versions.length + 1;
  entry.versions.push({
    version: nextVersion,
    articleId,
    publishedAt: new Date().toISOString(),
    turnCount,
  });
  entry.latestArticleId = articleId;
  saveManifest(dataRoot, manifest);
  return { version: nextVersion, latest: true };
}

function getSnapshotInfo(dataRoot, sessionId) {
  const manifest = loadManifest(dataRoot);
  return manifest.sessions[sessionId] || null;
}

module.exports = { loadManifest, saveManifest, recordSnapshot, getSnapshotInfo };
