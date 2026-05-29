function run(args) {
  const quiet = args.includes("--quiet");
  (async () => {
    try {
      const { refreshServe } = require("../../lib/usecases/refresh-serve");
      const ok = await refreshServe();
      if (!quiet) console.log(ok ? "Refresh OK" : "Refresh failed");
    } catch (e) {
      if (!quiet) console.error("Refresh error:", e.message);
    }
  })();
}

module.exports = run;
