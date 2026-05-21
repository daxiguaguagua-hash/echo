const fs = require("fs");
const path = require("path");
const os = require("os");

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

const DESIRED_HOOKS = {
  UserPromptSubmit: [{ command: "echo-mcp hook capture" }],
  Stop: [{ command: "echo-mcp hook capture" }],
  StopFailure: [{ command: "echo-mcp hook capture" }],
  SessionStart: [{ command: "echo-mcp hook status" }],
};

function readSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  } catch (_) {
    return {};
  }
}

function installClaudeHook({ write }) {
  const current = readSettings();
  const hooks = current.hooks || {};

  const toAdd = [];
  const alreadyInstalled = [];
  const legacy = [];

  // Detect legacy .sh commands across all hook events
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (typeof entry.command === "string" && entry.command.includes(".sh")) {
        legacy.push({ event, command: entry.command });
      }
    }
  }

  // Upsert desired hooks
  for (const [event, desiredEntries] of Object.entries(DESIRED_HOOKS)) {
    const raw = hooks[event];
    const existing = Array.isArray(raw) ? raw : [];

    if (!hooks[event]) hooks[event] = [];
    else if (!Array.isArray(hooks[event])) hooks[event] = [];

    for (const desired of desiredEntries) {
      const found = existing.find(
        (e) => typeof e.command === "string" && e.command === desired.command
      );
      if (found) {
        alreadyInstalled.push({ event, command: desired.command });
      } else {
        toAdd.push({ event, command: desired.command });
      }
    }

    if (!hooks[event]) hooks[event] = [];
    for (const desired of desiredEntries) {
      const found = hooks[event].find(
        (e) => typeof e.command === "string" && e.command === desired.command
      );
      if (!found) {
        hooks[event].push(desired);
      }
    }
  }

  if (write) {
    current.hooks = hooks;
    const settingsDir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });
    const tmp = SETTINGS_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(current, null, 2) + "\n");
    fs.renameSync(tmp, SETTINGS_PATH);
    return { written: true, toAdd, alreadyInstalled, legacy };
  }

  return { written: false, toAdd, alreadyInstalled, legacy };
}

module.exports = { installClaudeHook, DESIRED_HOOKS, SETTINGS_PATH };
