const { USAGE } = require("./constants");

function run(args) {
  const sub = args[1];
  if (sub === "list") {
    const { listProjects } = require("../../lib/usecases/project-registry");
    const projects = listProjects();
    if (projects.length === 0) {
      console.log("No registered projects.");
    } else {
      for (const p of projects) {
        console.log(`  ${p.projectId.padEnd(20)} ${p.root.padEnd(45)} ${(p.registeredAt || "").slice(0, 10)}`);
      }
    }
  } else if (sub === "find") {
    const targetId = args[2];
    if (!targetId || targetId.startsWith("-")) {
      console.error("Error: project ID required. Usage: echoctl project find <projectId>");
      process.exit(1);
    }
    const { findProjectById } = require("../../lib/usecases/project-registry");
    const project = findProjectById(targetId);
    if (!project) {
      console.error(`Project "${targetId}" not found.`);
      process.exit(1);
    }
    console.log(`Project:  ${project.projectId}`);
    console.log(`Root:     ${project.projectRoot}`);
    console.log(`Data:     ${project.dataRoot}`);
  } else {
    console.log(USAGE);
  }
}

module.exports = run;
