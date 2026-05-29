function run(args) {
  const { runPipeline } = require("../../lib/usecases/run-pipeline");
  const cmd = args[0];

  if (cmd === "all") {
    runPipeline({ allProjects: true, silent: true });
    console.log("Pipeline complete.");
  } else if (cmd === "convert") {
    runPipeline({ allProjects: true, silent: true, steps: ["convert"] });
  } else if (cmd === "validate") {
    const { resolveDataDirs } = require("../../lib/infra/echo-paths");
    const dirs = resolveDataDirs();
    const { validateWorkspace } = require("../../lib/domain/validation");
    const results = validateWorkspace(dirs);
    console.log(`Validation: ${results.errors.length} error(s), ${results.warnings.length} warning(s)`);
    if (results.errors.length > 0) process.exit(1);
  } else if (cmd === "resolve") {
    const { resolveDataDirs } = require("../../lib/infra/echo-paths");
    const dirs = resolveDataDirs();
    const { resolveAnchors } = require("../../lib/domain/anchor");
    resolveAnchors(dirs);
    console.log("Anchors resolved.");
  }
}

module.exports = run;
