// Central CLI naming configuration — single source of truth for all command names.
// Usage: require("../cli/names") — then use commandFor(...) for output, isKnownCliCommand() for detection.

const cliNames = {
  canonicalName: "echoctl",
  legacyNames: ["echo-mcp"],
};

const mcpServerInfo = {
  name: "echo-mcp",
  version: "0.2.0",
};

function commandFor(args) {
  return [cliNames.canonicalName, ...args].join(" ");
}

function allCliNames() {
  return [cliNames.canonicalName, ...cliNames.legacyNames];
}

function isKnownCliCommand(command) {
  if (typeof command !== "string") return false;
  return allCliNames().some((name) => command === name || command.startsWith(`${name} `));
}

module.exports = {
  cliNames,
  mcpServerInfo,
  commandFor,
  allCliNames,
  isKnownCliCommand,
};
