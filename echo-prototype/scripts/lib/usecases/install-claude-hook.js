const fs = require("fs");
const path = require("path");
const os = require("os");
const { commandFor, isKnownCliCommand } = require("../cli/names");

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

function hookEntry(command) {
  return { matcher: "", hooks: [{ type: "command", command }] };
}

const DESIRED_HOOKS = {
  UserPromptSubmit: [hookEntry(commandFor(["hook", "capture"]))],
  Stop: [hookEntry(commandFor(["hook", "capture"]))],
  StopFailure: [hookEntry(commandFor(["hook", "capture"]))],
  SessionStart: [hookEntry(commandFor(["hook", "status"]))],
};

function readSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  } catch (_) {
    return {};
  }
}

function extractCommand(entry, matches = () => true) {
  // New format: { matcher: "", hooks: [{ type: "command", command: "..." }] }
  if (Array.isArray(entry.hooks)) {
    const hook = entry.hooks.find(
      (h) => typeof h.command === "string" && matches(h.command)
    );
    if (hook) return hook.command;
  }
  // Old format: { command: "..." }
  if (typeof entry.command === "string" && matches(entry.command)) return entry.command;
  return null;
}

function isOldCommandEntry(entry) {
  return typeof entry.command === "string" && !Array.isArray(entry.hooks);
}

// Returns true when two CLI commands differ only in binary name (echoctl vs echo-mcp)
// and share the same subcommand args, e.g. "echo-mcp hook capture" ~ "echoctl hook capture".
function isSameCliSubcommand(existingCmd, desiredCmd) {
  if (existingCmd === desiredCmd) return true;
  if (!isKnownCliCommand(existingCmd)) return false;
  const existingArgs = existingCmd.split(" ").slice(1).join(" ");
  const desiredArgs = desiredCmd.split(" ").slice(1).join(" ");
  return existingArgs === desiredArgs;
}

function installClaudeHook({ write }) {
  const current = readSettings();
  const hooks = current.hooks || {};

  const toAdd = [];
  const alreadyInstalled = [];
  const legacy = [];

  // Detect legacy .sh commands AND already-installed CLI hooks across all hook events
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const cmd = extractCommand(entry, (command) => command.includes(".sh"));
      if (cmd && cmd.includes(".sh")) {
        legacy.push({ event, command: cmd });
      }
      // Also detect already-installed echoctl/echo-mcp hooks via isKnownCliCommand
      const cliCmd = extractCommand(entry, (command) => isKnownCliCommand(command));
      if (cliCmd && isKnownCliCommand(cliCmd)) {
        // Known CLI hook found — will be recognised by upsert logic below
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
      const desiredCmd = desired.hooks[0].command;
      const found = existing.find(
        (e) => {
          const cmd = extractCommand(e, (command) => command === desiredCmd);
          if (cmd === desiredCmd) return true;
          const cmdAny = extractCommand(e, (command) => isKnownCliCommand(command));
          if (cmdAny && isKnownCliCommand(cmdAny) && isSameCliSubcommand(cmdAny, desiredCmd)) return true;
          return false;
        }
      );
      if (found) {
        alreadyInstalled.push({ event, command: desiredCmd });
        if (isOldCommandEntry(found)) {
          Object.assign(found, desired);
        }
      } else {
        toAdd.push({ event, command: desiredCmd });
      }
    }

    if (!hooks[event]) hooks[event] = [];
    for (const desired of desiredEntries) {
      const desiredCmd = desired.hooks[0].command;
      const found = hooks[event].find(
        (e) => {
          const cmd = extractCommand(e, (command) => command === desiredCmd);
          if (cmd === desiredCmd) return true;
          const cmdAny = extractCommand(e, (command) => isKnownCliCommand(command));
          if (cmdAny && isKnownCliCommand(cmdAny) && isSameCliSubcommand(cmdAny, desiredCmd)) return true;
          return false;
        }
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
