const { MCP_HELP } = require("./constants");

function run(args) {
  if (args[1] === "--help") {
    console.log(MCP_HELP);
    return;
  }
  const { start } = require("../../lib/interfaces/mcp/server");
  try {
    start();
  } catch (err) {
    process.exit(1);
  }
}

module.exports = run;
