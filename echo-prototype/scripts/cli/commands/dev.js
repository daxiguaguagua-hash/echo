const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function isLinked() {
  try {
    const globalNodeModules = execSync("npm root -g", { encoding: "utf8" }).trim();
    const pkgPath = path.join(globalNodeModules, "echoctl");
    if (!fs.existsSync(pkgPath)) return { linked: false, reason: "not installed" };
    const stat = fs.lstatSync(pkgPath);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(pkgPath);
      return { linked: true, target: path.resolve(globalNodeModules, target) };
    }
    return { linked: false, reason: "installed from npm registry" };
  } catch (err) {
    return { linked: false, reason: err.message };
  }
}

function dev(sourcePath) {
  if (!sourcePath) {
    console.error("Usage: echoctl dev <source-path>");
    console.error("  e.g. echoctl dev ~/myNote/echo-prototype");
    process.exit(1);
  }

  const resolved = path.resolve(sourcePath);
  const pkgJson = path.join(resolved, "package.json");

  if (!fs.existsSync(pkgJson)) {
    console.error(`Error: ${resolved} is not an echoctl source directory.`);
    process.exit(1);
  }

  const info = isLinked();
  if (info.linked && info.target === resolved) {
    console.log(`Already linked to ${resolved}`);
    return;
  }

  console.log(`Linking echoctl to ${resolved}...`);
  execSync("npm link", { cwd: resolved, stdio: "inherit" });
  console.log(`Done. echoctl now runs from ${resolved}`);
}

function prod() {
  const info = isLinked();
  if (!info.linked) {
    console.log("echoctl is already using the published npm version.");
    return;
  }

  console.log("Switching to published npm version...");
  execSync("npm uninstall -g echoctl", { stdio: "inherit" });
  execSync("npm install -g echoctl@latest", { stdio: "inherit" });
  console.log("Done. echoctl now runs from the published npm package.");
}

function status() {
  const info = isLinked();
  if (info.linked) {
    console.log(`Mode: dev (linked to ${info.target})`);
  } else {
    console.log(`Mode: prod (${info.reason})`);
  }
}

function run(args) {
  const sub = args[1];
  if (sub === "on" || sub === "link") {
    dev(args[2] || process.cwd());
  } else if (sub === "off" || sub === "unlink" || sub === "prod") {
    prod();
  } else {
    status();
  }
}

module.exports = run;
