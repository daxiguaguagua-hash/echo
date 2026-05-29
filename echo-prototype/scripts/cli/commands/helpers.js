const { spawn } = require("child_process");
const path = require("path");

function scheduleRefreshIfServeRunning(entryPath) {
  const { getRunningServeInfo } = require("../../lib/usecases/refresh-serve");
  if (!getRunningServeInfo()) return false;
  const child = spawn(process.execPath, [entryPath || path.resolve(__dirname, "../echoctl.js"), "refresh", "--quiet"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return true;
}

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

module.exports = { scheduleRefreshIfServeRunning, printDoctorResults };
