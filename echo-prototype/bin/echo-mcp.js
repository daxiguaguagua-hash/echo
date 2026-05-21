#!/usr/bin/env node
const path = require("path");

const USAGE = `echo-mcp — Echo knowledge forum CLI

Usage:
  echo-mcp hook capture          Read hook JSON from stdin, write to session-buffer
  echo-mcp hook status           Generate SessionStart status output
  echo-mcp hook install [--write]  Print or apply Claude Code hook config
  echo-mcp hook doctor           Check hook health
  echo-mcp init                  Create workspace, write echo.json
  echo-mcp doctor                Check overall workspace health
  echo-mcp migrate legacy-buffer  Migrate ~/.echo-buffer to workspace
  echo-mcp convert               Run buffer → article conversion
  echo-mcp validate              Validate all articles and comments
  echo-mcp resolve               Resolve all annotation anchors
  echo-mcp search                Full-text search
`;

const args = process.argv.slice(2);
const cmd = args[0];

function runScript(name) {
  require(path.join(__dirname, "..", "scripts", name));
}

switch (cmd) {
  case "hook": {
    const sub = args[1];
    if (sub === "capture") require("../scripts/lib/hooks/capture");
    else if (sub === "status") require("../scripts/lib/hooks/status");
    else if (sub === "install") console.log("hook install — not yet implemented");
    else if (sub === "doctor") console.log("hook doctor — not yet implemented");
    else console.log(USAGE);
    break;
  }
  case "init":
    console.log("init — not yet implemented");
    break;
  case "doctor":
    console.log("doctor — not yet implemented");
    break;
  case "migrate":
    console.log("migrate — not yet implemented");
    break;
  case "convert":
    runScript("convert.js");
    break;
  case "validate":
    runScript("validate.js");
    break;
  case "resolve":
    runScript("resolve.js");
    break;
  case "search":
    runScript("search.js");
    break;
  default:
    console.log(USAGE);
    process.exit(cmd ? 1 : 0);
}
