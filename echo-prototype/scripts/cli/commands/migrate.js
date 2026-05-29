const { commandFor } = require("../../lib/cli/names");
const { scheduleRefreshIfServeRunning } = require("./helpers");

function run(args) {
    const sub = args[1];
    if (sub !== "legacy-buffer") {
      console.error(`Usage: ${commandFor(["migrate", "legacy-buffer", "--project <id>|--path <dir>", "[--apply]"])}`);
      process.exit(1);
    }

    function valueAfter(flag) {
      const idx = args.indexOf(flag);
      if (idx === -1) return null;
      const value = args[idx + 1];
      return value && !value.startsWith("-") ? value : null;
    }

    const projectId = valueAfter("--project");
    const projectPath = valueAfter("--path");
    const from = valueAfter("--from");
    const apply = args.includes("--apply");
    const overwrite = args.includes("--overwrite");
    const move = args.includes("--move");

    if ((args.includes("--project") && !projectId) || (args.includes("--path") && !projectPath) || (args.includes("--from") && !from)) {
      console.error("Error: --project, --path, and --from require a value.");
      process.exit(1);
    }
    if (projectId && projectPath) {
      console.error("Error: use only one target: --project <id> or --path <dir>.");
      process.exit(1);
    }

    try {
      const { migrateLegacyBuffer } = require("../../lib/usecases/migrate-legacy-buffer");
      const result = migrateLegacyBuffer({ projectId, projectPath, from, apply, overwrite, move });
      console.log(apply ? "Legacy buffer migration applied." : "Legacy buffer migration preview. Re-run with --apply to write changes.");
      console.log(`Project: ${result.projectId}`);
      console.log(`Source:  ${result.sourceDir}`);
      console.log(`Target:  ${result.targetDir}`);
      if (result.registered) console.log("Registered: yes");
      console.log(`Files:   copy ${result.summary.copy}, overwrite ${result.summary.overwrite}, skipped ${result.summary.skippedExisting}`);
      console.log(`Map:     update ${result.summary.mapUpdates}, conflicts ${result.summary.mapConflicts}`);
      console.log(`Pending: ${result.summary.pending}`);
      if (result.failuresCopied) console.log("Failures: append failures.jsonl");
      if (result.auqCopied) console.log("AUQ:     copy auq-counter.txt when target is empty");
      if (result.mapConflicts.length > 0) {
        console.log("\nSession map conflicts:");
        for (const c of result.mapConflicts) {
          console.log(`  ${c.sessionId}`);
          console.log(`    existing: ${c.existing}`);
          console.log(`    legacy:   ${c.next}`);
        }
        console.log("Use --overwrite only if these sessions should point to the migrated legacy files.");
      }
      if (apply && scheduleRefreshIfServeRunning()) {
        console.log(`Serve refresh: scheduled`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
}

module.exports = run;
