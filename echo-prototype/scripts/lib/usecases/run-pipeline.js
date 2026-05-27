/**
 * run-pipeline — orchestrates the full Echo data pipeline.
 *
 * Usage:
 *   const { runPipeline } = require("./usecases/run-pipeline");
 *   runPipeline();                                    // current project only
 *   runPipeline({ allProjects: true });               // all registered projects
 *   runPipeline({ steps: ["convert", "validate"] });
 */

const { resolveDataDirs } = require("../infra/echo-paths");

function runOneProject(dirs, steps, opts) {
  const results = {};

  for (const step of steps) {
    try {
      switch (step) {
        case "convert": {
          console.log(`[echo] convert — buffer -> articles (${dirs.projectId || "default"})\n`);
          const { runConvert } = require("../../convert");
          const r = runConvert({ dirs, cwd: opts.cwd, silent: opts.silent });
          results.convert = { success: true, files: r.files.length };
          console.log("");
          break;
        }
        case "validate": {
          console.log(`[echo] validate — check articles + comments (${dirs.projectId || "default"})\n`);
          const { runValidate } = require("../../validate");
          const r = runValidate({ dirs, cwd: opts.cwd });
          results.validate = r;
          if (!r.success) {
            console.error(`\n[echo] Pipeline stopped: validate failed with ${r.errors.length} error(s).`);
            return { ...results, _halted: true };
          }
          console.log("");
          break;
        }
        case "index": {
          console.log(`[echo] index — generate comment sections (${dirs.projectId || "default"})\n`);
          const { runIndex } = require("../../index");
          const r = runIndex({ dirs, cwd: opts.cwd });
          results.index = { success: true, updated: r.updated.length, articleCount: r.articleCount, commentCount: r.commentCount };
          console.log("");
          break;
        }
        case "resolve": {
          console.log(`[echo] resolve — verify annotation anchors (${dirs.projectId || "default"})\n`);
          const { runResolve } = require("../../resolve");
          const r = runResolve({ dirs, cwd: opts.cwd });
          results.resolve = r;
          if (r.broken > 0) {
            console.error(`\n[echo] Pipeline stopped: resolve found ${r.broken} broken anchor(s).`);
            return { ...results, _halted: true };
          }
          console.log("");
          break;
        }
        default:
          throw new Error(`Unknown pipeline step: ${step}`);
      }
    } catch (err) {
      console.error(`\n[echo] Pipeline stopped: ${step} threw an error.`);
      console.error(`  ${err.message}`);
      results[step] = { success: false, error: err.message };
      return { ...results, _halted: true };
    }
  }

  return results;
}

function runPipeline(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const steps = opts.steps || ["convert", "validate", "index", "resolve"];

  if (opts.allProjects) {
    const { aggregateAllProjects } = require("./aggregate-all-projects");
    const sources = aggregateAllProjects();
    const allResults = {};

    for (const src of sources) {
      const dirs = {
        articlesDir: src.articlesDir,
        commentsDir: src.commentsDir,
        bufferDir: src.bufferDir,
        indexDir: src.indexDir,
        projectId: src.projectId,
        projectRoot: src.root,
      };
      const result = runOneProject(dirs, steps, opts);
      allResults[src.projectId] = result;
      if (result._halted) return allResults;
      delete result._halted;
    }

    return allResults;
  }

  const dirs = opts.dirs || resolveDataDirs({ cwd });
  return runOneProject(dirs, steps, opts);
}

module.exports = { runPipeline };
