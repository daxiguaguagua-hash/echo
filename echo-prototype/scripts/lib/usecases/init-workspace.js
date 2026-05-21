const path = require("path");
const fs = require("fs");
const { resolveWorkspace, ensureDir } = require("../infra/workspace");

function initWorkspace() {
  const ws = resolveWorkspace();
  const configPath = path.join(ws, "echo.json");

  const subdirs = ["articles", "comments", "session-buffer", "index"];
  const created = [];
  const skipped = [];

  // Create workspace root
  ensureDir(ws);

  // Create subdirectories
  for (const d of subdirs) {
    const full = path.join(ws, d);
    if (!fs.existsSync(full)) {
      ensureDir(full);
      created.push(d);
    } else {
      skipped.push(d);
    }
  }

  // Write echo.json if missing; if malformed, warn and overwrite
  let configAction = "skipped";
  if (fs.existsSync(configPath)) {
    try {
      JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (_) {
      configAction = "replaced";
      writeDefaultConfig(configPath, ws);
    }
  } else {
    configAction = "created";
    writeDefaultConfig(configPath, ws);
  }

  return { workspace: ws, created, skipped, configAction };
}

function writeDefaultConfig(configPath, ws) {
  const relative = ws.startsWith(process.env.HOME || "") ? ws.replace(process.env.HOME || "", "~") : ws;
  fs.writeFileSync(configPath, JSON.stringify({
    workspace: relative,
    capture_enabled: true,
  }, null, 2) + "\n");
}

module.exports = { initWorkspace };
