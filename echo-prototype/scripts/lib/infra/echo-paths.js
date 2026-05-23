const path = require("path");
const {
  resolveEchoHomePath,
} = require("./workspace");

function resolveDataDirs(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const echoHome = opts.echoHome || resolveEchoHomePath(opts);

  let projectRoot = echoHome;

  if (opts.registry) {
    const project = opts.registry.findProjectForPath(cwd, { echoHome });
    if (project) {
      projectRoot = project.dataRoot;
    }
  } else {
    try {
      const { findProjectForPath } = require("../usecases/project-registry");
      const project = findProjectForPath(cwd, { echoHome });
      if (project) {
        projectRoot = project.dataRoot;
      }
    } catch (err) {
      // Only swallow MODULE_NOT_FOUND — registry may not be installed.
      // Registry corruption or parse errors must surface.
      if (err.code !== "MODULE_NOT_FOUND") throw err;
    }
  }

  return {
    articlesDir: path.join(projectRoot, "articles"),
    commentsDir: path.join(projectRoot, "comments"),
    bufferDir: path.join(projectRoot, "session-buffer"),
    indexDir: path.join(projectRoot, "index"),
  };
}

module.exports = { resolveDataDirs };
