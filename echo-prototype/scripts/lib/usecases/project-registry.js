const path = require("path");
const fs = require("fs");
const {
  resolveEchoHomePath,
  projectIdFromPath,
  resolveProjectDataRoot,
} = require("../infra/workspace");

function loadRegistry(echoHome) {
  const registryPath = path.join(echoHome, "registry.json");
  try {
    return JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  } catch (_) {
    return { projects: {} };
  }
}

function saveRegistry(echoHome, registry) {
  const registryPath = path.join(echoHome, "registry.json");
  if (!fs.existsSync(echoHome)) {
    fs.mkdirSync(echoHome, { recursive: true });
  }
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
}

function registerProject(projectPath, opts = {}) {
  const echoHome = opts.echoHome || resolveEchoHomePath(opts);
  const projectId = projectIdFromPath(projectPath);
  const registry = loadRegistry(echoHome);

  const existing = registry.projects[projectId];
  if (existing) {
    return {
      projectId,
      projectRoot: existing.root,
      dataRoot: resolveProjectDataRoot(projectPath, { echoHome, projectId }),
      created: false,
      dirsCreated: [],
      dirsSkipped: [],
    };
  }

  registry.projects[projectId] = {
    root: path.resolve(projectPath),
    registeredAt: new Date().toISOString(),
  };
  saveRegistry(echoHome, registry);

  const dataRoot = resolveProjectDataRoot(projectPath, { echoHome, projectId });
  const dirs = ["session-buffer", "articles", "comments", "index"];
  const dirsCreated = [];
  const dirsSkipped = [];
  for (const d of dirs) {
    const full = path.join(dataRoot, d);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
      dirsCreated.push(d);
    } else {
      dirsSkipped.push(d);
    }
  }

  return {
    projectId,
    projectRoot: path.resolve(projectPath),
    dataRoot,
    created: true,
    dirsCreated,
    dirsSkipped,
  };
}

function findProjectForPath(searchPath, opts = {}) {
  const echoHome = opts.echoHome || resolveEchoHomePath(opts);
  const registry = loadRegistry(echoHome);
  const resolved = path.resolve(searchPath);

  for (const [id, entry] of Object.entries(registry.projects)) {
    if (resolved === path.resolve(entry.root) || resolved.startsWith(path.resolve(entry.root) + path.sep)) {
      return {
        projectId: id,
        projectRoot: entry.root,
        dataRoot: resolveProjectDataRoot(entry.root, { echoHome, projectId: id }),
      };
    }
  }

  return null;
}

module.exports = {
  loadRegistry,
  saveRegistry,
  registerProject,
  findProjectForPath,
};
