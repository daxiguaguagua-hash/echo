const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULT_WORKSPACE = path.join(os.homedir(), ".echo-workspace");

function resolveWorkspace() {
  if (process.env.ECHO_WORKSPACE) {
    return process.env.ECHO_WORKSPACE.replace(/^~/, os.homedir());
  }
  const configPath = path.join(DEFAULT_WORKSPACE, "echo.json");
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    if (config.workspace) {
      return config.workspace.replace(/^~/, os.homedir());
    }
  } catch (_) {}
  return DEFAULT_WORKSPACE;
}

function getConfig() {
  const configPath = path.join(resolveWorkspace(), "echo.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (_) {
    return {};
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const ws = resolveWorkspace();

module.exports = {
  resolveWorkspace,
  getConfig,
  ensureDir,
  DEFAULT_WORKSPACE,
  workspaceRoot: ws,
  articlesDir: path.join(ws, "articles"),
  commentsDir: path.join(ws, "comments"),
  bufferDir: path.join(ws, "session-buffer"),
  indexDir: path.join(ws, "index"),
  configPath: path.join(ws, "echo.json"),
};
