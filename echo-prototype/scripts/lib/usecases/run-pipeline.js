/**
 * run-pipeline — orchestrates the full Echo data pipeline.
 *
 * Usage:
 *   const { runPipeline } = require("./usecases/run-pipeline");
 *   runPipeline({ cwd: process.cwd() });
 *   runPipeline({ steps: ["convert", "validate"] });
 */

const { resolveDataDirs } = require("../infra/echo-paths");

function runPipeline(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const steps = opts.steps || ["convert", "validate", "index", "resolve"];

  // Resolve data dirs once, based on cwd -> registry match or legacy fallback
  const dirs = opts.dirs || resolveDataDirs({ cwd });

  const results = {};

  for (const step of steps) {
    try {
      switch (step) {
        case "convert": {
          console.log("[echo] convert — buffer -> articles\n");
          const { runConvert } = require("../../convert");
          const r = runConvert({ dirs, cwd, silent: opts.silent });
          results.convert = { success: true, files: r.files.length };
          console.log("");
          break;
        }
        case "validate": {
          console.log("[echo] validate — check articles + comments\n");
          const { runValidate } = require("../../validate");
          const r = runValidate({ dirs, cwd });
          results.validate = r;
          if (!r.success) {
            console.error(`\n[echo] Pipeline stopped: validate failed with ${r.errors.length} error(s).`);
            return results;
          }
          console.log("");
          break;
        }
        case "index": {
          console.log("[echo] index — generate comment sections\n");
          const { runIndex } = require("../../index");
          const r = runIndex({ dirs, cwd });
          results.index = { success: true, updated: r.updated.length, articleCount: r.articleCount, commentCount: r.commentCount };
          console.log("");
          break;
        }
        case "resolve": {
          console.log("[echo] resolve — verify annotation anchors\n");
          const { runResolve } = require("../../resolve");
          const r = runResolve({ dirs, cwd });
          results.resolve = r;
          if (r.broken > 0) {
            console.error(`\n[echo] Pipeline stopped: resolve found ${r.broken} broken anchor(s).`);
            return results;
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
      return results;
    }
  }

  return results;
}

module.exports = { runPipeline };
