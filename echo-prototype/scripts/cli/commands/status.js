function run(args) {
  const json = args.includes("--json");
  const langIdx = args.indexOf("--lang");
  const lang = langIdx !== -1 ? args[langIdx + 1] : (process.env.ECHO_LANG || null);
  const { collectStatus } = require("../../lib/usecases/status-collector");
  const { formatStatus } = require("../../lib/i18n/format");
  const model = collectStatus();
  console.log(formatStatus(model, { json, lang }));
}

module.exports = run;
