const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ECHOCTL = path.resolve(__dirname, "../bin/echoctl.js");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-stop-test-"));
}

function runStop(echoHome) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ECHOCTL, "stop"], {
      env: { ...process.env, ECHO_HOME: echoHome },
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ status: code, stdout, stderr }));
  });
}

function writeServeInfo(echoHome, info) {
  fs.writeFileSync(path.join(echoHome, ".serve.pid"), String(info.pid));
  fs.writeFileSync(path.join(echoHome, ".serve.json"), JSON.stringify(info, null, 2));
}

function waitForReady(child) {
  return new Promise((resolve) => {
    const buf = [];
    const onData = (d) => {
      buf.push(d.toString());
      if (buf.join("").includes("ready")) {
        child.stdout.removeListener("data", onData);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    setTimeout(() => {
      child.stdout.removeListener("data", onData);
      resolve();
    }, 2000);
  });
}

// --- No serve info ---

test("echoctl stop exits 0 when no serve info exists", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });

  const result = await runStop(echoHome);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /No running serve instance found/);

  fs.rmSync(echoHome, { recursive: true, force: true });
});

// --- Valid PID, process handles SIGTERM cleanly ---

test("echoctl stop sends SIGTERM, polls exit, and cleans up state files", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });

  const child = spawn(process.execPath, [
    "-e",
    `
      const fs = require("node:fs");
      const path = require("node:path");
      const echoHome = process.env.ECHO_HOME;
      process.on("SIGTERM", () => {
        fs.rmSync(path.join(echoHome, ".serve.pid"), { force: true });
        fs.rmSync(path.join(echoHome, ".serve.json"), { force: true });
        process.exit(0);
      });
      process.stdout.write("ready\\n");
      setInterval(() => {}, 1000);
    `,
  ], {
    env: { ...process.env, ECHO_HOME: echoHome },
    stdio: "pipe",
  });

  await waitForReady(child);

  writeServeInfo(echoHome, {
    pid: child.pid,
    apiPort: 8787,
    docsPort: 5173,
    startedAt: new Date().toISOString(),
    identity: "echo-serve",
  });

  const result = await runStop(echoHome);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Sent SIGTERM to serve/);
  assert.match(result.stdout, new RegExp(`Serve stopped \\(pid ${child.pid}\\)`));
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.json")), false);
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.pid")), false);

  fs.rmSync(echoHome, { recursive: true, force: true });
});

// --- Stale PID (ESRCH before signal) ---

test("echoctl stop clears stale serve info when pid does not exist", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });

  writeServeInfo(echoHome, {
    pid: 99999999,
    apiPort: 8787,
    docsPort: 5173,
    startedAt: new Date().toISOString(),
    identity: "echo-serve",
  });

  const result = await runStop(echoHome);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Process 99999999 is no longer running/);
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.json")), false);
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.pid")), false);

  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("echoctl stop clears stale serve info and stops recorded child process", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });

  const child = spawn(process.execPath, [
    "-e",
    `
      process.stdout.write("ready\\n");
      setInterval(() => {}, 1000);
    `,
  ], { stdio: "pipe" });
  await waitForReady(child);

  writeServeInfo(echoHome, {
    pid: 99999999,
    vitepressPid: child.pid,
    childPids: [child.pid],
    apiPort: 8787,
    docsPort: 5173,
    startedAt: new Date().toISOString(),
    identity: "echo-serve",
  });

  const result = await runStop(echoHome);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Process 99999999 is no longer running/);
  assert.match(result.stdout, new RegExp(`Stopped child process\\(es\\): ${child.pid}`));
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.json")), false);
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.pid")), false);

  fs.rmSync(echoHome, { recursive: true, force: true });
});

test("isEchoServeCommand recognizes only Echo serve commands", () => {
  const { isEchoServeCommand, resolveRuntimeSiteDir } = require("../scripts/serve");
  const oldEchoHome = process.env.ECHO_HOME;
  const echoHome = tempDir();
  process.env.ECHO_HOME = echoHome;

  const site = resolveRuntimeSiteDir();
  assert.equal(isEchoServeCommand(`node /repo/bin/echoctl.js serve`), true);
  assert.equal(isEchoServeCommand(`node /repo/scripts/serve.js`), true);
  assert.equal(isEchoServeCommand(`node /repo/node_modules/.bin/vitepress dev ${site} --host 127.0.0.1`), true);
  assert.equal(isEchoServeCommand("node /other/app.js"), false);

  if (oldEchoHome === undefined) delete process.env.ECHO_HOME;
  else process.env.ECHO_HOME = oldEchoHome;
  fs.rmSync(echoHome, { recursive: true, force: true });
});

// --- Corrupted serve info ---

test("echoctl stop cleans up corrupted serve info and exits 1", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });
  fs.writeFileSync(path.join(echoHome, ".serve.json"), "{not valid json");

  const result = await runStop(echoHome);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Corrupted serve state file/);
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.json")), false);
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.pid")), false);

  fs.rmSync(echoHome, { recursive: true, force: true });
});

// --- Invalid pid ---

test("echoctl stop cleans up when pid is not a positive integer", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });

  writeServeInfo(echoHome, {
    pid: "not-a-number",
    apiPort: 8787,
    docsPort: 5173,
    startedAt: new Date().toISOString(),
    identity: "echo-serve",
  });

  const result = await runStop(echoHome);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid pid/);
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.json")), false);
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.pid")), false);

  fs.rmSync(echoHome, { recursive: true, force: true });
});

// --- Missing identity field ---

test("echoctl stop refuses when identity field is missing", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });

  const child = spawn(process.execPath, [
    "-e",
    `
      process.stdout.write("ready\\n");
      setInterval(() => {}, 1000);
    `,
  ], { stdio: "pipe" });
  await waitForReady(child);

  writeServeInfo(echoHome, {
    pid: child.pid,
    apiPort: 8787,
    docsPort: 5173,
    startedAt: new Date().toISOString(),
    // missing identity
  });

  const result = await runStop(echoHome);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not an echo serve/);
  // State preserved for manual inspection
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.json")), true);

  child.kill("SIGKILL");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

// --- Wrong identity field ---

test("echoctl stop refuses when identity field is wrong", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });

  const child = spawn(process.execPath, [
    "-e",
    `
      process.stdout.write("ready\\n");
      setInterval(() => {}, 1000);
    `,
  ], { stdio: "pipe" });
  await waitForReady(child);

  writeServeInfo(echoHome, {
    pid: child.pid,
    apiPort: 8787,
    docsPort: 5173,
    startedAt: new Date().toISOString(),
    identity: "something-else",
  });

  const result = await runStop(echoHome);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not an echo serve/);

  child.kill("SIGKILL");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

// --- Process ignores SIGTERM ---

test("echoctl stop warns when process ignores SIGTERM and preserves state", async () => {
  const echoHome = tempDir();
  fs.mkdirSync(echoHome, { recursive: true });

  const child = spawn(process.execPath, [
    "-e",
    `
      process.on("SIGTERM", () => {});
      process.stdout.write("ready\\n");
      setInterval(() => {}, 1000);
    `,
  ], { stdio: "pipe" });

  await waitForReady(child);

  writeServeInfo(echoHome, {
    pid: child.pid,
    apiPort: 8787,
    docsPort: 5173,
    startedAt: new Date().toISOString(),
    identity: "echo-serve",
  });

  const result = await runStop(echoHome);

  // Exits 1, warns but preserves state
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Sent SIGTERM to serve/);
  assert.match(result.stderr, /still running/);
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.json")), true);
  assert.equal(fs.existsSync(path.join(echoHome, ".serve.pid")), true);

  child.kill("SIGKILL");
  fs.rmSync(echoHome, { recursive: true, force: true });
});

// --- Additional pid boundary tests ---

for (const [label, pid] of [["pid 0", 0], ["pid -1", -1], ["pid 1.5", 1.5]]) {
  test(`echoctl stop refuses invalid pid: ${label}`, async () => {
    const echoHome = tempDir();
    fs.mkdirSync(echoHome, { recursive: true });

    writeServeInfo(echoHome, {
      pid,
      apiPort: 8787,
      docsPort: 5173,
      startedAt: new Date().toISOString(),
      identity: "echo-serve",
    });

    const result = await runStop(echoHome);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid pid/);
    assert.equal(fs.existsSync(path.join(echoHome, ".serve.json")), false);
    assert.equal(fs.existsSync(path.join(echoHome, ".serve.pid")), false);

    fs.rmSync(echoHome, { recursive: true, force: true });
  });
}
