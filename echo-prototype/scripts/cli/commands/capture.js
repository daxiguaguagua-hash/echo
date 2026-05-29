const { commandFor } = require("../../lib/cli/names");

function run(args) {
  const action = args[1];
  const { isCaptureEnabled, setCaptureEnabled } = require("../../lib/infra/config");
  if (action === "on") {
    const r = setCaptureEnabled(true);
    console.log(`Capture enabled (${r.configPath})`);
  } else if (action === "off") {
    const r = setCaptureEnabled(false);
    console.log(`Capture disabled (${r.configPath})`);
  } else if (action === "status") {
    console.log(`Capture: ${isCaptureEnabled() ? "on" : "off"}`);
  } else {
    console.error(`Usage: ${commandFor(["capture", "on|off|status"])}`);
    process.exit(1);
  }
}

module.exports = run;
