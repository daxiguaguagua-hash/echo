const path = require("path");
const fs = require("fs");
const {
  resolveEchoHomePath,
  projectIdFromPath,
  resolveProjectDataRoot,
} = require("../infra/workspace");

const PROJECT_DATA_DIRS = ["session-buffer", "articles", "comments", "index"];

/**
 * @param {string} echoHome
 * @returns {{ projects: Record<string, { root: string, registeredAt: string }> }}
 */
function loadRegistry(echoHome) {
  const registryPath = path.join(echoHome, "registry.json");
  let raw;
  try {
    raw = fs.readFileSync(registryPath, "utf-8");
  } catch (_) {
    return { projects: {} };
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    const backup = registryPath + ".corrupt-" + Date.now();
    fs.renameSync(registryPath, backup);
    throw new Error(
      `registry.json is corrupt — backed up to ${backup}. Restore manually or re-register projects.`
    );
  }
}

/**
 * @param {string} echoHome
 * @param {{ projects: Record<string, { root: string, registeredAt: string }> }} registry
 */
function saveRegistry(echoHome, registry) {
  const registryPath = path.join(echoHome, "registry.json");
  if (!fs.existsSync(echoHome)) {
    fs.mkdirSync(echoHome, { recursive: true });
  }
  const tmp = registryPath + ".tmp-" + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2) + "\n");
  fs.renameSync(tmp, registryPath);
}

/**
 * @param {string} projectPath
 * @param {{ echoHome?: string, projectId?: string }} [opts]
 */
function registerProject(projectPath, opts = {}) {
  const echoHome = opts.echoHome || resolveEchoHomePath(opts);
  const absolutePath = path.resolve(projectPath);
  const projectId = opts.projectId || projectIdFromPath(projectPath);
  const registry = loadRegistry(echoHome);

  const existing = registry.projects[projectId];
  if (existing) {
    if (path.resolve(existing.root) !== absolutePath) {
      throw new Error(
        `Project "${projectId}" is already registered at ${existing.root} — ` +
        `cannot register a different path ${absolutePath} under the same id. ` +
        `Use a unique directory name or unregister the existing one first.`
      );
    }
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
    root: absolutePath,
    registeredAt: new Date().toISOString(),
  };
  saveRegistry(echoHome, registry);

  const dataRoot = resolveProjectDataRoot(projectPath, { echoHome, projectId });
  const dirsCreated = [];
  const dirsSkipped = [];
  for (const d of PROJECT_DATA_DIRS) {
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
    projectRoot: absolutePath,
    dataRoot,
    created: true,
    dirsCreated,
    dirsSkipped,
  };
}

/**
 * @param {string} searchPath
 * @param {{ echoHome?: string }} [opts]
 */
function findProjectForPath(searchPath, opts = {}) {
  const echoHome = opts.echoHome || resolveEchoHomePath(opts);
  const registry = loadRegistry(echoHome);
  const resolved = path.resolve(searchPath);

  const entries = Object.entries(registry.projects)
    .map(([id, entry]) => ({ id, root: path.resolve(entry.root) }))
    .sort((a, b) => b.root.length - a.root.length);

  for (const { id, root } of entries) {
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return {
        projectId: id,
        projectRoot: root,
        dataRoot: resolveProjectDataRoot(root, { echoHome, projectId: id }),
      };
    }
  }

  return null;
}

/**
 * @param {string} echoHome
 * @returns {Array<{ projectId: string, root: string, dataRoot: string, registeredAt: string }>}
 */
function listProjects(echoHome) {
  const home = echoHome || resolveEchoHomePath();
  const registry = loadRegistry(home);
  return Object.entries(registry.projects).map(([projectId, entry]) => ({
    projectId,
    root: entry.root,
    dataRoot: resolveProjectDataRoot(entry.root, { echoHome: home, projectId }),
    registeredAt: entry.registeredAt,
  }));
}

module.exports = {
  loadRegistry,
  saveRegistry,
  registerProject,
  findProjectForPath,
  listProjects,
};
