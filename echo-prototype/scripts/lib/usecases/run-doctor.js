const fs = require("fs");
const path = require("path");
const os = require("os");
const { resolveWorkspace } = require("../infra/workspace");
const { isCaptureEnabled } = require("../infra/config");

function check(name, status, message) {
  return { name, status, message };
}

function ok(name, message) { return check(name, "ok", message); }
function warn(name, message) { return check(name, "warn", message); }
function error(name, message) { return check(name, "error", message); }

function runDoctor({ hookOnly } = {}) {
  const ws = resolveWorkspace();
  const results = [];

  if (!hookOnly) {
    // 1. Workspace exists
    if (fs.existsSync(ws)) {
      results.push(ok("Workspace", `exists: ${ws}`));
    } else {
      results.push(error("Workspace", `not found: ${ws}`));
    }

    // 2. Workspace writable (real temp file test)
    try {
      const probe = path.join(ws, ".echo-doctor-probe");
      fs.writeFileSync(probe, "");
      fs.unlinkSync(probe);
      results.push(ok("Workspace writable", "write test passed"));
    } catch (_) {
      results.push(error("Workspace writable", "cannot write to workspace"));
    }

    // 3. Subdirectories
    for (const d of ["articles", "comments", "session-buffer", "index"]) {
      const full = path.join(ws, d);
      if (!fs.existsSync(full)) {
        results.push(warn("Subdirectory", `${d}/ missing — run echo-mcp init`));
      }
    }
    if (results.filter(r => r.name === "Subdirectory").length === 0) {
      results.push(ok("Subdirectories", "all present"));
    }

    // 4. echo.json valid JSON (direct parse, not getConfig)
    const configPath = path.join(ws, "echo.json");
    if (fs.existsSync(configPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (cfg.workspace) {
          results.push(ok("echo.json", `valid (workspace=${cfg.workspace})`));
        } else {
          results.push(warn("echo.json", "valid JSON but no workspace field"));
        }
      } catch (_) {
        results.push(error("echo.json", "invalid JSON — run echo-mcp init"));
      }
    } else {
      results.push(warn("echo.json", "missing — run echo-mcp init"));
    }

    // 5. Capture status
    const captureOn = isCaptureEnabled();
    results.push(ok("Capture", captureOn ? "enabled" : "disabled"));

    // 6. Legacy ~/.echo-buffer (warning only)
    const legacyBuffer = path.join(os.homedir(), ".echo-buffer");
    if (fs.existsSync(legacyBuffer)) {
      results.push(warn("Legacy buffer", `${legacyBuffer} exists — run echo-mcp migrate legacy-buffer`));
    }
  }

  // 7. Hook configuration
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const hooks = settings.hooks || {};

      for (const event of ["UserPromptSubmit", "Stop", "StopFailure", "SessionStart"]) {
        const entries = hooks[event] || [];
        const hasEchoMcp = entries.some(
          (e) => typeof e.command === "string" && e.command.startsWith("echo-mcp")
        );
        const hasSh = entries.some(
          (e) => typeof e.command === "string" && e.command.includes(".sh")
        );

        if (hasEchoMcp) {
          const cmds = entries.filter(e => typeof e.command === "string" && e.command.startsWith("echo-mcp")).map(e => e.command);
          results.push(ok(`Hook: ${event}`, `echo-mcp: ${cmds.join(", ")}`));
        } else if (hasSh) {
          const cmds = entries.filter(e => typeof e.command === "string" && e.command.includes(".sh")).map(e => e.command);
          results.push(warn(`Hook: ${event}`, `legacy .sh: ${cmds.join(", ")} — run echo-mcp hook install claude --write`));
        } else {
          results.push(warn(`Hook: ${event}`, "not configured — run echo-mcp hook install claude --write"));
        }
      }
    } catch (_) {
      results.push(error("Hook config", `${settingsPath} is invalid JSON`));
    }
  } else {
    results.push(warn("Hook config", "~/.claude/settings.json not found — run echo-mcp hook install claude"));
  }

  // 8. echo-mcp command resolvability
  results.push(ok("CLI", "echo-mcp is in PATH (installed via npm or linked)"));

  return results;
}

module.exports = { runDoctor };
