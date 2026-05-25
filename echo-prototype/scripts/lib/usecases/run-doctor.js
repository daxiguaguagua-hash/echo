const fs = require("fs");
const path = require("path");
const os = require("os");
const { resolveWorkspace, resolveEchoHomePath } = require("../infra/workspace");
const { isCaptureEnabled } = require("../infra/config");
const { findProjectForPath } = require("./project-registry");
const { commandFor, isKnownCliCommand, cliNames } = require("../cli/names");

function check(name, status, message) {
  return { name, status, message };
}

function ok(name, message) { return check(name, "ok", message); }
function warn(name, message) { return check(name, "warn", message); }
function error(name, message) { return check(name, "error", message); }


function extractHookCommand(entry, matches = () => true) {
  if (Array.isArray(entry.hooks)) {
    const hook = entry.hooks.find(
      (h) => typeof h.command === "string" && matches(h.command)
    );
    if (hook) return hook.command;
  }
  if (typeof entry.command === "string" && matches(entry.command)) return entry.command;
  return null;
}

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
        results.push(warn("Subdirectory", `${d}/ missing — run ${commandFor(["init"])}`));
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
        results.push(error("echo.json", `invalid JSON — run ${commandFor(["init"])}`));
      }
    } else {
      results.push(warn("echo.json", `missing — run ${commandFor(["init"])}`));
    }

    // 5. Capture status
    const captureOn = isCaptureEnabled();
    if (captureOn) {
      results.push(ok("Capture", "enabled"));
    } else {
      results.push(warn("Capture", `disabled — run: ${commandFor(["capture", "on"])}`));
    }

    // 6. Legacy ~/.echo-buffer (warning only)
    const legacyBuffer = path.join(os.homedir(), ".echo-buffer");
    if (fs.existsSync(legacyBuffer)) {
      results.push(warn("Legacy buffer", `${legacyBuffer} exists — run ${commandFor(["migrate", "legacy-buffer"])}`));
    }

    // 7. Echo home (global)
    const echoHome = resolveEchoHomePath();
    if (fs.existsSync(echoHome)) {
      results.push(ok("Echo home", `exists: ${echoHome}`));
    } else {
      results.push(warn("Echo home", `not found: ${echoHome} — run ${commandFor(["init"])}`));
    }

    // 8. registry.json
    const registryPath = path.join(echoHome, "registry.json");
    let registry = null;
    if (fs.existsSync(registryPath)) {
      try {
        registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
        const count = Object.keys(registry.projects || {}).length;
        results.push(ok("registry.json", `valid (${count} project${count !== 1 ? "s" : ""})`));
      } catch (_) {
        results.push(error("registry.json", "invalid JSON"));
      }
    } else {
      results.push(warn("registry.json", `missing — run ${commandFor(["init"])}`));
    }

    // 9. Current project registration
    let currentProject = null;
    if (registry) {
      const cwd = process.cwd();
      const current = findProjectForPath(cwd, { echoHome });
      if (current) {
        currentProject = current;
        results.push(ok("Current project", `${current.projectId} (data: ${current.dataRoot})`));

        // 10. Project data directories
        const missing = [];
        for (const d of ["session-buffer", "articles", "comments", "index"]) {
          if (!fs.existsSync(path.join(current.dataRoot, d))) {
            missing.push(d);
          }
        }
        if (missing.length > 0) {
          results.push(warn("Project data dirs", `missing: ${missing.join(", ")} — run ${commandFor(["init", "project"])}`));
        } else {
          results.push(ok("Project data dirs", "all present"));
        }
      } else {
        // Check if cwd is inside Echo's data directory first
        const projectsDir = path.join(echoHome, "projects");
        if (cwd.startsWith(projectsDir + path.sep)) {
          let foundProjectRoot = null;
          for (const [id, entry] of Object.entries(registry.projects || {})) {
            const dataRoot = path.join(echoHome, "projects", id);
            if (cwd.startsWith(dataRoot + path.sep) || cwd === dataRoot) {
              foundProjectRoot = entry.root;
              break;
            }
          }
          if (foundProjectRoot) {
            results.push(warn("Data directory detected",
              `This is an Echo internal data directory.\n` +
              `  Use the registered project root instead:\n` +
              `    cd ${foundProjectRoot}`));
          } else {
            results.push(warn("Data directory detected",
              `This appears to be inside Echo's data storage (~/.echo-workspace/projects/).\n` +
              `  Run ${commandFor(["doctor"])} from your project directory instead.`));
          }
        } else {
          results.push(warn("Current project", `${cwd} not registered — run ${commandFor(["init", "project"])}`));
        }
      }
    }
  }

  // 7. Hook configuration
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const hooks = settings.hooks || {};

      for (const event of ["UserPromptSubmit", "Stop", "StopFailure", "SessionStart"]) {
        const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
        const hasEchoMcp = entries.some((e) => {
          const cmd = extractHookCommand(e, (command) => isKnownCliCommand(command));
          return typeof cmd === "string" && isKnownCliCommand(cmd);
        });
        const hasSh = entries.some((e) => {
          const cmd = extractHookCommand(e, (command) => command.includes(".sh"));
          return typeof cmd === "string" && cmd.includes(".sh");
        });

        if (hasEchoMcp) {
          const cmds = entries.filter((e) => {
            const cmd = extractHookCommand(e, (command) => isKnownCliCommand(command));
            return typeof cmd === "string" && isKnownCliCommand(cmd);
          }).map((e) => extractHookCommand(e, (command) => isKnownCliCommand(command)));
          results.push(ok(`Hook: ${event}`, `CLI: ${cmds.join(", ")}`));
        } else if (hasSh) {
          const cmds = entries.filter((e) => {
            const cmd = extractHookCommand(e, (command) => command.includes(".sh"));
            return typeof cmd === "string" && cmd.includes(".sh");
          }).map((e) => extractHookCommand(e, (command) => command.includes(".sh")));
          results.push(warn(`Hook: ${event}`, `legacy .sh: ${cmds.join(", ")} — run ${commandFor(["hook", "install", "claude", "--write"])}`));
        } else {
          results.push(warn(`Hook: ${event}`, `not configured — run ${commandFor(["hook", "install", "claude", "--write"])}`));
        }
      }
    } catch (_) {
      results.push(error("Hook config", `${settingsPath} is invalid JSON`));
    }
  } else {
    results.push(warn("Hook config", `~/.claude/settings.json not found — run ${commandFor(["hook", "install", "claude"])}`));
  }

  // 8. CLI resolvability
  results.push(ok("CLI", `${cliNames.canonicalName} is in PATH; echo-mcp remains supported as alias`));

  return results;
}

module.exports = { runDoctor };
