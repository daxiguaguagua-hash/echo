const { commandFor } = require("../../lib/cli/names");
const { USAGE } = require("./constants");
const { printDoctorResults } = require("./helpers");

function run(args) {
  const sub = args[1];
  if (sub === "capture") require("../../lib/hooks/capture");
  else if (sub === "status") require("../../lib/hooks/status");
  else if (sub === "install") {
    const provider = args[2];
    if (!provider || provider.startsWith("-")) {
      console.error(`Error: provider required. Usage: ${commandFor(["hook", "install", "claude", "[--write]"])}`);
      process.exit(1);
    }
    if (provider !== "claude") {
      console.error(`Error: unknown provider '${provider}'. Only 'claude' is supported.`);
      process.exit(1);
    }
    const write = args.includes("--write");
    const { installClaudeHook } = require("../../lib/usecases/install-claude-hook");
    const result = installClaudeHook({ write });
    if (result.legacy.length > 0) {
      console.log("Legacy .sh hooks detected:");
      for (const l of result.legacy) console.log(`  ${l.event}: ${l.command}`);
      console.log("");
    }
    if (result.toAdd.length > 0) {
      console.log(write ? "Installed:" : "Will install:");
      for (const a of result.toAdd) console.log(`  ${a.event}: ${a.command}`);
    }
    if (result.alreadyInstalled.length > 0) {
      console.log("Already installed:");
      for (const a of result.alreadyInstalled) console.log(`  ${a.event}: ${a.command}`);
    }
    if (result.toAdd.length === 0) console.log("All hooks already up to date.");
    if (!write) console.log("\nRun with --write to apply this configuration.");
    else console.log("\nHook configuration written to ~/.claude/settings.json");
  }
  else if (sub === "doctor") {
    const { runDoctor } = require("../../lib/usecases/run-doctor");
    const results = runDoctor({ hookOnly: true });
    console.log("Hook health check:\n");
    printDoctorResults(results);
  }
  else console.log(USAGE);
}

module.exports = run;
