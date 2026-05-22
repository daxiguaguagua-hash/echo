const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULT_WORKSPACE = path.join(os.homedir(), ".echo-workspace");

function expandHome(value, homeDir = os.homedir()) {
  return String(value).replace(/^~(?=$|\/)/, homeDir);
}

function resolveEchoHomePath(opts = {}) {
  const env = opts.env || process.env;
  const homeDir = opts.homeDir || os.homedir();
  if (env.ECHO_HOME) {
    return expandHome(env.ECHO_HOME, homeDir);
  }
  return path.join(homeDir, ".echo-workspace");
}

function projectIdFromPath(projectPath) {
  const base = path.basename(path.resolve(projectPath));
  return base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

function resolveProjectDataRoot(projectPath, opts = {}) {
  const echoHome = opts.echoHome || resolveEchoHomePath(opts);
  const projectId = opts.projectId || projectIdFromPath(projectPath);
  return path.join(echoHome, "projects", projectId);
}

function resolveWorkspacePath(opts = {}) {
  const env = opts.env || process.env;
  const homeDir = opts.homeDir || os.homedir();
  const defaultWorkspace = opts.defaultWorkspace || resolveEchoHomePath({ env, homeDir });
  const readConfig = opts.readConfig || ((configPath) => fs.readFileSync(configPath, "utf-8"));

  if (env.ECHO_WORKSPACE) {
    return expandHome(env.ECHO_WORKSPACE, homeDir);
  }

  const configPath = path.join(defaultWorkspace, "echo.json");
  try {
    const raw = readConfig(configPath);
    const config = JSON.parse(raw);
    if (config.workspace) {
      return expandHome(config.workspace, homeDir);
    }
  } catch (_) {}

  return defaultWorkspace;
}

function resolveWorkspace() {
  return resolveWorkspacePath();
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
  resolveWorkspacePath,
  resolveEchoHomePath,
  resolveProjectDataRoot,
  projectIdFromPath,
  expandHome,
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
