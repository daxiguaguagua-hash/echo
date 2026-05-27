/**
 * aggregate-all-projects — return data directories for all registered projects.
 *
 * Used by run-pipeline (npm run all) and build-docs (loadAllArticlesAndComments).
 */
const path = require("path");
const {
  resolveEchoHomePath,
  resolveProjectDataRoot,
} = require("../infra/workspace");

/**
 * @param {{ echoHome?: string }} [opts]
 * @returns {Array<{ projectId: string, root: string, dataRoot: string, articlesDir: string, commentsDir: string, bufferDir: string, indexDir: string }>}
 */
function aggregateAllProjects(opts = {}) {
  const echoHome = opts.echoHome || resolveEchoHomePath(opts);
  let projects = [];

  try {
    const { listProjects } = require("./project-registry");
    projects = listProjects(echoHome);
  } catch (e) {
    console.error("[echo] aggregateAllProjects: failed to load project registry:", e.message);
  }

  const sources = [];

  for (const p of projects) {
    const dataRoot = p.dataRoot || resolveProjectDataRoot(p.root, { echoHome, projectId: p.projectId });
    sources.push({
      projectId: p.projectId,
      root: p.root,
      dataRoot,
      articlesDir: path.join(dataRoot, "articles"),
      commentsDir: path.join(dataRoot, "comments"),
      bufferDir: path.join(dataRoot, "session-buffer"),
      indexDir: path.join(dataRoot, "index"),
    });
  }

  return sources;
}

module.exports = { aggregateAllProjects };
