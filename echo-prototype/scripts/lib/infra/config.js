const fs = require("fs");
const path = require("path");
const { getConfig, resolveWorkspace } = require("./workspace");

function isCaptureEnabled(env = process.env) {
  if (env.ECHO_CAPTURE === "off") return false;
  if (env.ECHO_CAPTURE === "on") return true;

  const config = getConfig();
  if (config.capture_enabled === false) return false;

  return true;
}

function setCaptureEnabled(value) {
  const ws = resolveWorkspace();
  const configPath = path.join(ws, "echo.json");
  const config = getConfig();
  config.capture_enabled = value;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  return { capture_enabled: value, configPath };
}

function getSpeakers(env = process.env) {
  return {
    user: env.ECHO_USER_SPEAKER || "vincent",
    ai: env.ECHO_AI_SPEAKER || "ai",
  };
}

module.exports = { isCaptureEnabled, setCaptureEnabled, getSpeakers };
