function run(args) {
  const { runSearch } = require("../../lib/usecases/query-articles");
  const { resolveDataDirs } = require("../../lib/infra/echo-paths");

  const keywordIdx = args.indexOf("--keyword");
  const tagIdx = args.indexOf("--tag");
  const keyword = keywordIdx !== -1 ? args[keywordIdx + 1] : null;
  const tag = tagIdx !== -1 ? args[tagIdx + 1] : null;

  if (!keyword && !tag) {
    console.error("Usage: echoctl search -- --keyword <keyword> [--tag <tag>]");
    process.exit(1);
  }

  const dirs = resolveDataDirs();
  const results = runSearch({ keyword, tag }, { dirs });
  if (results.length === 0) {
    console.log("No results found.");
  } else {
    for (const r of results) {
      console.log(`${r.id} — ${r.title || "(untitled)"}`);
      console.log(`  ${r.snippet}`);
      console.log();
    }
  }
}

module.exports = run;
