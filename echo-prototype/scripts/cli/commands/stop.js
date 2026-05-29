function run(args) {
    (async () => {
      const {
        readServeInfo,
        clearServeInfo,
        findServeProcessCandidates,
        isValidPositivePid,
        verifyProcessIdentity,
      } = require("../../serve");

      function childPidsFrom(info) {
        return [
          ...(Array.isArray(info.childPids) ? info.childPids : []),
          info.vitepressPid,
        ].filter((pid, index, arr) => isValidPositivePid(pid) && pid !== info.pid && arr.indexOf(pid) === index);
      }

      function signalPid(pid, signal = "SIGTERM") {
        try {
          process.kill(pid, signal);
          return true;
        } catch (err) {
          if (err.code === "ESRCH") return false;
          throw err;
        }
      }

      function stopExtraPids(pids) {
        const stopped = [];
        for (const pid of pids) {
          if (signalPid(pid)) stopped.push(pid);
        }
        return stopped;
      }

      let info;
      try {
        info = readServeInfo();
      } catch (err) {
        console.error(`Error: ${err.message}`);
        clearServeInfo();
        process.exit(1);
      }
      if (!info) {
        const candidates = findServeProcessCandidates();
        if (candidates.length === 0) {
          console.log("No running serve instance found.");
          process.exit(0);
        }
        const stopped = stopExtraPids(candidates.map((p) => p.pid));
        if (stopped.length > 0) {
          console.log(`No serve state found, but stopped orphaned Echo process(es): ${stopped.join(", ")}.`);
        } else {
          console.log("No running serve instance found.");
        }
        clearServeInfo();
        process.exit(0);
      }

      const pid = info.pid;
      if (!isValidPositivePid(pid)) {
        console.error(`Error: invalid pid in serve state: ${JSON.stringify(info)}. Cleaning up.`);
        clearServeInfo();
        process.exit(1);
      }

      // Verify the pid is alive, owned by us, and is an echo serve process
      try {
        process.kill(pid, 0);
      } catch (err) {
        if (err.code === "ESRCH") {
          console.log(`Process ${pid} is no longer running.`);
          const stopped = stopExtraPids(childPidsFrom(info));
          if (stopped.length > 0) console.log(`Stopped child process(es): ${stopped.join(", ")}.`);
          clearServeInfo();
          process.exit(0);
        }
        if (err.code === "EPERM") {
          console.error(`Error: process ${pid} belongs to another user. Cannot stop.`);
          process.exit(1);
        }
        throw err;
      }

      if (!verifyProcessIdentity(info)) {
        console.error(`Error: process ${pid} is not an echo serve. PID may have been reused. State file preserved — check manually.`);
        process.exit(1);
      }

      // Send SIGTERM — handle race where process exits between check and signal
      try {
        process.kill(pid, "SIGTERM");
      } catch (err) {
        if (err.code === "ESRCH") {
          console.log(`Process ${pid} already exited.`);
          clearServeInfo();
          process.exit(0);
        }
        throw err;
      }
      console.log(`Sent SIGTERM to serve (pid ${pid}, API port ${info.apiPort}, docs port ${info.docsPort}).`);

      // Poll for exit (2s timeout, 100ms intervals)
      const POLL_MS = 2000;
      const INTERVAL_MS = 100;
      const startTime = Date.now();
      let exited = false;
      while (Date.now() - startTime < POLL_MS) {
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
        try {
          process.kill(pid, 0);
        } catch (err) {
          if (err.code === "ESRCH") {
            exited = true;
            break;
          }
          throw err;
        }
      }

      if (exited) {
        const stopped = stopExtraPids(childPidsFrom(info));
        if (stopped.length > 0) console.log(`Stopped child process(es): ${stopped.join(", ")}.`);
        console.log(`Serve stopped (pid ${pid}).`);
        clearServeInfo();
      } else {
        console.error(`Warning: SIGTERM sent but process ${pid} is still running. State file preserved — check the process manually.`);
        process.exit(1);
      }
    })().catch((err) => {
      console.error(`Failed to stop serve: ${err.message}`);
      process.exit(1);
    });
}

module.exports = run;
