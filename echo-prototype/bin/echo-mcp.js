#!/usr/bin/env node
const path = require("path");

const USAGE = `echo-mcp — Echo knowledge forum CLI

Usage:
  echo-mcp hook capture          Read hook JSON from stdin, write to session-buffer
  echo-mcp hook status           Generate SessionStart status output
  echo-mcp hook install <provider> [--write]  Print or apply hook config
  echo-mcp hook doctor           Check hook health
  echo-mcp init                  Create workspace, write echo.json
  echo-mcp init project [--path <dir>]  Register project in ~/.echo-workspace/registry.json
  echo-mcp doctor                Check overall workspace health
  echo-mcp migrate legacy-buffer  Migrate ~/.echo-buffer to workspace
  echo-mcp convert               Run buffer -> article conversion
  echo-mcp validate              Validate all articles and comments
  echo-mcp resolve               Resolve all annotation anchors
  echo-mcp search                Full-text search
`;

function printDoctorResults(results) {
  let hasError = false;
  for (const r of results) {
    const icon = r.status === "ok" ? "  OK" : r.status === "warn" ? "WARN" : "ERR ";
    console.log(`  ${icon}  ${r.name}: ${r.message}`);
    if (r.status === "error") hasError = true;
  }
  console.log(`\n${results.length} checks.`);
  if (hasError) process.exit(1);
}

const args = process.argv.slice(2);
const cmd = args[0];

function runScript(name) {
  require(path.join(__dirname, "..", "scripts", name));
}

switch (cmd) {
  case "hook": {
    const sub = args[1];
    if (sub === "capture") require("../scripts/lib/hooks/capture");
    else if (sub === "status") require("../scripts/lib/hooks/status");
    else if (sub === "install") {
      const provider = args[2];
      if (!provider || provider.startsWith("-")) {
        console.error("Error: provider required. Usage: echo-mcp hook install claude [--write]");
        process.exit(1);
      }
      if (provider !== "claude") {
        console.error(`Error: unknown provider '${provider}'. Only 'claude' is supported.`);
        process.exit(1);
      }
      const write = args.includes("--write");
      const { installClaudeHook } = require("../scripts/lib/usecases/install-claude-hook");

      const result = installClaudeHook({ write });

      if (result.legacy.length > 0) {
        console.log("Legacy .sh hooks detected:");
        for (const l of result.legacy) {
          console.log(`  ${l.event}: ${l.command}`);
        }
        console.log("");
      }

      if (result.toAdd.length > 0) {
        console.log(write ? "Installed:" : "Will install:");
        for (const a of result.toAdd) {
          console.log(`  ${a.event}: ${a.command}`);
        }
      }

      if (result.alreadyInstalled.length > 0) {
        console.log("Already installed:");
        for (const a of result.alreadyInstalled) {
          console.log(`  ${a.event}: ${a.command}`);
        }
      }

      if (result.toAdd.length === 0) {
        console.log("All hooks already up to date.");
      }

      if (!write) {
        console.log("\nRun with --write to apply this configuration.");
      } else {
        console.log("\nHook configuration written to ~/.claude/settings.json");
      }
    }
    else if (sub === "doctor") {
      const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
      const results = runDoctor({ hookOnly: true });
      console.log("Hook health check:\n");
      printDoctorResults(results);
    }
    else console.log(USAGE);
    break;
  }
  case "init": {
    const sub = args[1];
    if (sub === "project") {
      const projectPath = args.includes("--path") ? args[args.indexOf("--path") + 1] : process.cwd();
      if (!projectPath || projectPath.startsWith("-")) {
        console.error("Error: --path requires a directory path");
        process.exit(1);
      }
      const { registerProject } = require("../scripts/lib/usecases/project-registry");
      const result = registerProject(projectPath);
      console.log(`Project: ${result.projectId}`);
      console.log(`Root: ${result.projectRoot}`);
      console.log(`Data: ${result.dataRoot}`);
      if (result.created) {
        console.log(`Registered: yes`);
        if (result.dirsCreated.length > 0) {
          console.log(`Created: ${result.dirsCreated.join(", ")}`);
        }
        if (result.dirsSkipped.length > 0) {
          console.log(`Skipped (exists): ${result.dirsSkipped.join(", ")}`);
        }
      } else {
        console.log(`Registered: no (already exists)`);
      }
    } else {
      const { initWorkspace } = require("../scripts/lib/usecases/init-workspace");
      const result = initWorkspace();
      console.log(`Workspace: ${result.workspace}`);
      if (result.created.length > 0) {
        console.log(`Created: ${result.created.join(", ")}`);
      }
      if (result.skipped.length > 0) {
        console.log(`Skipped (exists): ${result.skipped.join(", ")}`);
      }
      console.log(`echo.json: ${result.configAction}`);
    }
    break;
  }
  case "doctor": {
    const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
    const results = runDoctor();
    console.log("Echo health check:\n");
    printDoctorResults(results);
    break;
  }
  case "migrate":
    console.log("migrate — not yet implemented");
    break;
  case "convert":
    runScript("convert.js");
    break;
  case "validate":
    runScript("validate.js");
    break;
  case "resolve":
    runScript("resolve.js");
    break;
  case "search":
    runScript("search.js");
    break;
  default:
    console.log(USAGE);
    process.exit(cmd ? 1 : 0);
}
