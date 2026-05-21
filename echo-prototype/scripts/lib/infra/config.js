const { getConfig } = require("./workspace");

function isCaptureEnabled(env = process.env) {
  if (env.ECHO_CAPTURE === "off") return false;
  if (env.ECHO_CAPTURE === "on") return true;

  const config = getConfig();
  if (config.capture_enabled === false) return false;

  return true;
}

function getSpeakers(env = process.env) {
  return {
    user: env.ECHO_USER_SPEAKER || "vincent",
    ai: env.ECHO_AI_SPEAKER || "ai",
  };
}

module.exports = { isCaptureEnabled, getSpeakers };
