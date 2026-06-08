#!/usr/bin/env node
const { USAGE } = require("./commands/constants");

const commands = {
  status:     require("./commands/status"),
  hook:       require("./commands/hook"),
  init:       require("./commands/init"),
  project:    require("./commands/project"),
  doctor:     require("./commands/doctor"),
  migrate:    require("./commands/migrate"),
  refresh:    require("./commands/refresh"),
  all:        require("./commands/pipeline"),
  convert:    require("./commands/pipeline"),
  validate:   require("./commands/pipeline"),
  resolve:    require("./commands/pipeline"),
  search:     require("./commands/search"),
  mcp:        require("./commands/mcp"),
  import:     require("./commands/import_cmd"),
  serve:      require("./commands/serve"),
  stop:       require("./commands/stop"),
  capture:    require("./commands/capture"),
  tag:        require("./commands/tag"),
  dev:        require("./commands/dev"),
};

const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === "--version" || cmd === "-v" || cmd === "-V") {
  const { version } = require("../../package.json");
  console.log(version);
  process.exit(0);
}

if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
  console.log(USAGE);
  process.exit(0);
}

if (commands[cmd]) {
  commands[cmd](args);
} else {
  console.log(USAGE);
  process.exit(cmd ? 1 : 0);
}
