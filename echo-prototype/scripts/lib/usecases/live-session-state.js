const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function countTurns(raw) {
  return (String(raw || "").match(/<!-- turn:/g) || []).length;
}

function hashContent(raw) {
  return crypto.createHash("sha256").update(String(raw || "")).digest("hex");
}

function liveStatePath(dataRoot) {
  return path.join(dataRoot, "index", "live-state.json");
}

function readLiveState(dataRoot) {
  try {
    return JSON.parse(fs.readFileSync(liveStatePath(dataRoot), "utf-8"));
  } catch (_) {
    return { sessions: {} };
  }
}

function saveLiveState(dataRoot, state) {
  const filePath = liveStatePath(dataRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function sessionStateFromFile(sessionFile, opts = {}) {
  const sessionId = opts.sessionId || path.basename(sessionFile, ".md");
  if (!fs.existsSync(sessionFile)) {
    return {
      ok: true,
      exists: false,
      projectId: opts.projectId || null,
      sessionId,
      turnCount: 0,
      hash: null,
      updatedAt: null,
    };
  }

  const raw = fs.readFileSync(sessionFile, "utf-8");
  const stat = fs.statSync(sessionFile);
  return {
    ok: true,
    exists: true,
    projectId: opts.projectId || null,
    sessionId,
    turnCount: countTurns(raw),
    hash: hashContent(raw),
    updatedAt: stat.mtime.toISOString(),
  };
}

function writeLiveSessionState(dataRoot, sessionFile, opts = {}) {
  const next = sessionStateFromFile(sessionFile, opts);
  if (!next.exists) return next;

  const state = readLiveState(dataRoot);
  state.sessions = state.sessions || {};
  state.sessions[next.sessionId] = {
    projectId: next.projectId,
    turnCount: next.turnCount,
    hash: next.hash,
    updatedAt: new Date().toISOString(),
    sourcePath: sessionFile,
  };
  saveLiveState(dataRoot, state);

  return {
    ...next,
    updatedAt: state.sessions[next.sessionId].updatedAt,
  };
}

function getLiveSessionState(dirs, sessionId) {
  const dataRoot = dirs.dataRoot || dirs.projectRoot || path.dirname(dirs.articlesDir);
  const bufferDir = dirs.bufferDir || path.join(dataRoot, "session-buffer");
  const sessionFile = path.join(bufferDir, `${sessionId}.md`);
  const computed = sessionStateFromFile(sessionFile, {
    projectId: dirs.projectId || null,
    sessionId,
  });

  if (!computed.exists) return computed;

  const saved = readLiveState(dataRoot).sessions?.[sessionId];
  if (saved && saved.hash === computed.hash) {
    return {
      ...computed,
      updatedAt: saved.updatedAt || computed.updatedAt,
    };
  }
  return computed;
}

module.exports = {
  countTurns,
  hashContent,
  liveStatePath,
  readLiveState,
  saveLiveState,
  sessionStateFromFile,
  writeLiveSessionState,
  getLiveSessionState,
};
