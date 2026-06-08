const { scheduleRefreshIfServeRunning } = require("./helpers");

function run(args) {
  const sub = args[1];
  if (sub === "project") {
    const projectPath = args.includes("--path") ? args[args.indexOf("--path") + 1] : process.cwd();
    if (!projectPath || projectPath.startsWith("-")) {
      console.error("Error: --path requires a directory path");
      process.exit(1);
    }
    const { registerProject } = require("../../lib/usecases/project-registry");
    const result = registerProject(projectPath);
    console.log(`Project: ${result.projectId}`);
    console.log(`Root: ${result.projectRoot}`);
    console.log(`Data: ${result.dataRoot}`);
    if (result.created) {
      console.log(`Registered: yes`);
      if (result.dirsCreated.length > 0) console.log(`Created: ${result.dirsCreated.join(", ")}`);
      if (result.dirsSkipped.length > 0) console.log(`Skipped (exists): ${result.dirsSkipped.join(", ")}`);
    } else {
      console.log(`Registered: no (already exists)`);
    }
    let articlesImported = 0;
    try {
      const { importClaudeProject } = require("../../lib/usecases/import-claude-project");
      const imported = importClaudeProject(result.projectId);
      if (imported.total > 0) {
        console.log(`Claude transcripts: ${imported.total} found, ${imported.imported} imported, ${imported.skipped} skipped`);
        articlesImported = imported.imported;
      } else {
        console.log(`Claude transcripts: none found`);
      }
    } catch (err) {
      console.log(`Claude transcripts: import skipped (${err.message})`);
    }
    if (scheduleRefreshIfServeRunning()) {
      console.log(`Serve refresh: scheduled`);
      if (articlesImported > 0) {
        const shortcut = process.platform === "darwin" ? "Cmd+Shift+R" : "Ctrl+Shift+R";
        console.log(`\n  After the page refreshes, press ${shortcut} in your browser to see the new articles.\n`);
      }
    }
  } else {
    const { initWorkspace } = require("../../lib/usecases/init-workspace");
    const result = initWorkspace();
    console.log(`Workspace: ${result.workspace}`);
    if (result.created.length > 0) console.log(`Created: ${result.created.join(", ")}`);
    if (result.skipped.length > 0) console.log(`Skipped (exists): ${result.skipped.join(", ")}`);
    console.log(`echo.json: ${result.configAction}`);
  }
}

module.exports = run;
