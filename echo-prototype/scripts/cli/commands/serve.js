const path = require("path");

function run(args) {
    if (args.includes("--foreground")) {
      require("../../serve").start().catch((err) => {
        console.error(`${CLI} serve failed:`, err.message);
        process.exit(1);
      });
    } else {
      (async () => {
        const fs = require("fs");
        const { spawn } = require("child_process");
        const {
          readServeInfo,
          serveLogFile,
          formatServeSummary,
          isPidRunning,
        } = require("../../serve");
        const { isCaptureEnabled } = require("../../lib/infra/config");

        const existing = readServeInfo();
        if (existing && isPidRunning(existing.pid)) {
          console.log(formatServeSummary(existing, {
            background: true,
            captureEnabled: isCaptureEnabled(),
            logFile: serveLogFile(),
          }));
          return;
        }

        const logFile = serveLogFile();
        fs.mkdirSync(require("path").dirname(logFile), { recursive: true });
        const logFd = fs.openSync(logFile, "a");
        const child = spawn(process.execPath, [path.resolve(__dirname, "../echoctl.js"), "serve", "--foreground"], {
          detached: true,
          stdio: ["ignore", logFd, logFd],
          env: process.env,
        });
        child.unref();

        const startedAt = Date.now();
        let info = null;
        while (Date.now() - startedAt < 20000) {
          await new Promise((r) => setTimeout(r, 250));
          try {
            info = readServeInfo();
          } catch (_) {
            info = null;
          }
          if (info && info.pid === child.pid && isPidRunning(info.pid)) break;
        }

        fs.closeSync(logFd);

        if (!info || info.pid !== child.pid || !isPidRunning(info.pid)) {
          console.error(`${CLI} serve failed to start in background.`);
          console.error(`See log: ${logFile}`);
          process.exit(1);
        }

        console.log(formatServeSummary(info, {
          background: true,
          captureEnabled: isCaptureEnabled(),
          logFile,
        }));
      })().catch((err) => {
        console.error(`${CLI} serve failed:`, err.message);
        process.exit(1);
      });
    }
}

module.exports = run;
