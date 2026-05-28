#!/usr/bin/env node
const os = require("os");
const path = require("path");
const fs = require("fs");
const { commandFor, cliNames } = require("../scripts/lib/cli/names");

const CLI = cliNames.canonicalName;
const USAGE = `${CLI} — Echo knowledge forum CLI

Usage:
  ${commandFor(["hook", "capture"])}          Read hook JSON from stdin, write to session-buffer
  ${commandFor(["hook", "status"])}           Generate SessionStart status output
  ${commandFor(["hook", "install", "<provider>", "[--write]"])}  Print or apply hook config
  ${commandFor(["hook", "doctor"])}           Check hook health
  ${commandFor(["init"])}                  Create workspace, write echo.json
  ${commandFor(["init", "project", "[--path <dir>]"])}  Register project in ~/.echo-workspace/registry.json
  ${commandFor(["doctor"])}                Check overall workspace health
  ${commandFor(["migrate", "legacy-buffer"])}  Migrate ~/.echo-buffer to workspace
  ${commandFor(["all"])}                   Run full pipeline (convert -> validate -> index -> resolve)
  ${commandFor(["convert"])}               Run buffer -> article conversion
  ${commandFor(["validate"])}              Validate all articles and comments
  ${commandFor(["resolve"])}               Resolve all annotation anchors
  ${commandFor(["search"])}                Full-text search
  ${commandFor(["mcp"])}                   Start MCP server (stdio transport)
  ${commandFor(["capture", "on|off|status"])}  Enable, disable, or check capture status
  ${commandFor(["project", "list"])}    List all registered projects
  ${commandFor(["project", "find", "<projectId>"])}  Show project details
  ${commandFor(["tag", "list"])}    List all tags with usage counts
  ${commandFor(["tag", "add", "<article-id>", "<tag1>", "[tag2...]"])}  Add one or more tags to an article
  ${commandFor(["tag", "remove", "<article-id>", "<tag1>", "[tag2...]"])}  Remove one or more tags from an article
  ${commandFor(["import", "claude", "--all", "--dry-run|--apply"])}  Import Claude Code sessions
  ${commandFor(["import", "claude", "--project", "<dir>", "--as-project", "<id>"])}  Import single project
  ${commandFor(["serve"])}              Start API + VitePress dev server in background
  ${commandFor(["serve", "--foreground"])}  Start API + VitePress dev server in foreground
  ${commandFor(["refresh"])}            Refresh pipeline + docs without restarting serve
  ${commandFor(["stop"])}               Stop a running serve instance
`;

function scheduleRefreshIfServeRunning() {
  const { getRunningServeInfo } = require("../scripts/lib/usecases/refresh-serve");
  if (!getRunningServeInfo()) return false;
  const { spawn } = require("child_process");
  const child = spawn(process.execPath, [__filename, "refresh", "--quiet"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return true;
}

function printDoctorResults(results) {
  let hasError = false;
  for (const r of results) {
    const icon = r.status === "ok" ? "  OK" : r.status === "warn" ? "WARN" : "ERR ";
    console.log(`  ${icon}  ${r.name}: ${r.message}`);
    if (r.status === "error") hasError = true;
  }
  console.log(`\n${results.length} checks.`);
  if (hasError) process.exit(1);
}

const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === "--version" || cmd === "-v" || cmd === "-V") {
  const { version } = require("../package.json");
  console.log(version);
  process.exit(0);
}

switch (cmd) {
  case "hook": {
    const sub = args[1];
    if (sub === "capture") require("../scripts/lib/hooks/capture");
    else if (sub === "status") require("../scripts/lib/hooks/status");
    else if (sub === "install") {
      const provider = args[2];
      if (!provider || provider.startsWith("-")) {
        console.error(`Error: provider required. Usage: ${commandFor(["hook", "install", "claude", "[--write]"])}`);
        process.exit(1);
      }
      if (provider !== "claude") {
        console.error(`Error: unknown provider '${provider}'. Only 'claude' is supported.`);
        process.exit(1);
      }
      const write = args.includes("--write");
      const { installClaudeHook } = require("../scripts/lib/usecases/install-claude-hook");

      const result = installClaudeHook({ write });

      if (result.legacy.length > 0) {
        console.log("Legacy .sh hooks detected:");
        for (const l of result.legacy) {
          console.log(`  ${l.event}: ${l.command}`);
        }
        console.log("");
      }

      if (result.toAdd.length > 0) {
        console.log(write ? "Installed:" : "Will install:");
        for (const a of result.toAdd) {
          console.log(`  ${a.event}: ${a.command}`);
        }
      }

      if (result.alreadyInstalled.length > 0) {
        console.log("Already installed:");
        for (const a of result.alreadyInstalled) {
          console.log(`  ${a.event}: ${a.command}`);
        }
      }

      if (result.toAdd.length === 0) {
        console.log("All hooks already up to date.");
      }

      if (!write) {
        console.log("\nRun with --write to apply this configuration.");
      } else {
        console.log("\nHook configuration written to ~/.claude/settings.json");
      }
    }
    else if (sub === "doctor") {
      const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
      const results = runDoctor({ hookOnly: true });
      console.log("Hook health check:\n");
      printDoctorResults(results);
    }
    else console.log(USAGE);
    break;
  }
  case "init": {
    const sub = args[1];
    if (sub === "project") {
      const projectPath = args.includes("--path") ? args[args.indexOf("--path") + 1] : process.cwd();
      if (!projectPath || projectPath.startsWith("-")) {
        console.error("Error: --path requires a directory path");
        process.exit(1);
      }
      const { registerProject } = require("../scripts/lib/usecases/project-registry");
      const result = registerProject(projectPath);
      console.log(`Project: ${result.projectId}`);
      console.log(`Root: ${result.projectRoot}`);
      console.log(`Data: ${result.dataRoot}`);
      if (result.created) {
        console.log(`Registered: yes`);
        if (result.dirsCreated.length > 0) {
          console.log(`Created: ${result.dirsCreated.join(", ")}`);
        }
        if (result.dirsSkipped.length > 0) {
          console.log(`Skipped (exists): ${result.dirsSkipped.join(", ")}`);
        }
      } else {
        console.log(`Registered: no (already exists)`);
      }
      if (scheduleRefreshIfServeRunning()) {
        console.log(`Serve refresh: scheduled`);
      }
    } else {
      const { initWorkspace } = require("../scripts/lib/usecases/init-workspace");
      const result = initWorkspace();
      console.log(`Workspace: ${result.workspace}`);
      if (result.created.length > 0) {
        console.log(`Created: ${result.created.join(", ")}`);
      }
      if (result.skipped.length > 0) {
        console.log(`Skipped (exists): ${result.skipped.join(", ")}`);
      }
      console.log(`echo.json: ${result.configAction}`);
    }
    break;
  }
  case "project": {
    const sub = args[1];
    if (sub === "list") {
      const { listProjects } = require("../scripts/lib/usecases/project-registry");
      const projects = listProjects();
      if (projects.length === 0) {
        console.log("No registered projects.");
      } else {
        for (const p of projects) {
          console.log(`  ${p.projectId.padEnd(20)} ${p.root.padEnd(45)} ${(p.registeredAt || "").slice(0, 10)}`);
        }
      }
    } else if (sub === "find") {
      const targetId = args[2];
      if (!targetId || targetId.startsWith("-")) {
        console.error("Error: project ID required. Usage: echoctl project find <projectId>");
        process.exit(1);
      }
      const { findProjectById } = require("../scripts/lib/usecases/project-registry");
      const project = findProjectById(targetId);
      if (!project) {
        console.error(`Project "${targetId}" not found.`);
        process.exit(1);
      }
      console.log(`Project:  ${project.projectId}`);
      console.log(`Root:     ${project.projectRoot}`);
      console.log(`Data:     ${project.dataRoot}`);
    } else {
      console.log(USAGE);
    }
    break;
  }
  case "refresh": {
    const quiet = args.includes("--quiet");
    (async () => {
      const { requestRunningServeRefresh } = require("../scripts/lib/usecases/refresh-serve");
      const remote = await requestRunningServeRefresh();
      if (remote.attempted) {
        if (!quiet) {
          console.log(remote.ok ? "Serve refresh: ok" : `Serve refresh: failed — ${remote.message}`);
        }
        if (!remote.ok) process.exit(1);
        return;
      }

      const { runPipeline } = require("../scripts/lib/usecases/run-pipeline");
      const { runBuildDocs } = require("../scripts/build-docs");
      const { resolveRuntimeSiteDir } = require("../scripts/serve");
      runPipeline({ allProjects: true, silent: quiet });
      runBuildDocs({ docsRoot: resolveRuntimeSiteDir() });
      if (!quiet) console.log("Local refresh: ok");
    })().catch((err) => {
      if (!quiet) console.error(`Refresh failed: ${err.message}`);
      process.exit(1);
    });
    break;
  }
  case "doctor": {
    const { runDoctor } = require("../scripts/lib/usecases/run-doctor");
    const results = runDoctor();
    console.log("Echo health check:\n");
    printDoctorResults(results);
    break;
  }
  case "migrate":
    console.log("migrate — not yet implemented");
    break;
  case "all": {
    const { runPipeline } = require("../scripts/lib/usecases/run-pipeline");
    const result = runPipeline({ allProjects: true });
    const hasError = Object.values(result).some((r) => r && (r.success === false || r.broken > 0));
    if (hasError) process.exit(1);
    break;
  }
  case "convert": {
    const { runConvert } = require("../scripts/convert");
    runConvert();
    break;
  }
  case "validate": {
    const { runValidate } = require("../scripts/validate");
    const result = runValidate();
    if (result.success) {
      console.log(`OK — ${result.articleCount} articles, ${result.commentCount} comments`);
    } else {
      console.log(`FAIL — ${result.errors.length} error(s):\n`);
      for (const e of result.errors) console.log(`  ${e}`);
      process.exit(1);
    }
    break;
  }
  case "resolve": {
    const { runResolve } = require("../scripts/resolve");
    const result = runResolve();
    if (result.broken > 0) process.exit(1);
    break;
  }
  case "search": {
    const { runSearch } = require("../scripts/search");
    const args = process.argv.slice(2);
    const opts = { keyword: "", tag: "" };
    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--keyword" || args[i] === "-k") opts.keyword = args[++i] || "";
      else if (args[i] === "--tag" || args[i] === "-t") opts.tag = args[++i] || "";
    }
    const result = runSearch(opts);
    if (result.count === 0) process.exit(0);
    console.log(`${result.count} result(s):\n`);
    for (const a of result.results) {
      const ca = a.created_at;
      const d = ca instanceof Date ? ca.toISOString().slice(0, 10) : String(ca || "").slice(0, 10);
      console.log(`  ${a.title || a.id}`);
      console.log(`  ${a._file}  ·  ${d}`);
      if (a._snippet) console.log(`  > ${a._snippet}`);
      if (a.tags && a.tags.length) console.log(`  tags: ${a.tags.join(", ")}`);
      console.log();
    }
    break;
  }
  case "mcp":
    require("../scripts/lib/interfaces/mcp/server").start();
    break;
  case "import": {
    const sub = args[1];
    if (sub !== "claude") {
      console.error(`Error: unknown provider '${sub || "(none)"}'. Only 'claude' is supported.`);
      console.error(`Usage: ${commandFor(["import", "claude", "--all", "--dry-run|--apply"])}`);
      process.exit(1);
    }

    const all = args.includes("--all");
    const dryRun = args.includes("--dry-run");
    const apply = args.includes("--apply");
    const projectIdx = args.indexOf("--project");
    const asProjectIdx = args.indexOf("--as-project");
    const excludeIdx = args.indexOf("--exclude");

    const targetProject = projectIdx !== -1 ? args[projectIdx + 1] : null;
    const asProject = asProjectIdx !== -1 ? args[asProjectIdx + 1] : null;
    const excludeDirs = excludeIdx !== -1 ? args[excludeIdx + 1].split(",").map((s) => s.trim()) : [];

    if (!all && !targetProject) {
      console.error("Error: need --all or --project <dir>");
      console.error(`Usage: ${commandFor(["import", "claude", "--all", "--dry-run|--apply"])}`);
      process.exit(1);
    }

    if (!dryRun && !apply) {
      console.error("Error: need --dry-run or --apply");
      process.exit(1);
    }

    const claudeProjectsDir = path.join(os.homedir(), ".claude", "projects");

    if (!fs.existsSync(claudeProjectsDir)) {
      console.error(`Error: ${claudeProjectsDir} not found. No Claude Code sessions to import.`);
      process.exit(1);
    }

    const { scanClaudeProjects, buildImportPlan } = require("../scripts/lib/import/scanner");
    const mf = require("../scripts/lib/import/manifest");
    const provider = require("../scripts/lib/import/providers/claude-code");
    const { resolveEchoHomePath } = require("../scripts/lib/infra/workspace");
    const store = require("../scripts/lib/infra/markdown-store");

    const echoHome = resolveEchoHomePath();
    const manifestPath = path.join(echoHome, "import-manifest.json");
    const manifest = mf.loadManifest(manifestPath);

    const scanOpts = {};
    if (excludeDirs.length > 0) scanOpts.excludeDirs = excludeDirs;

    let projects;
    if (targetProject) {
      const dirName = path.basename(targetProject);
      const fullPath = path.join(claudeProjectsDir, dirName);
      if (!fs.existsSync(fullPath)) {
        console.error(`Error: project directory not found: ${fullPath}`);
        process.exit(1);
      }
      projects = [{
        dirName, absPath: fullPath, jsonlFiles: [], sessionCount: 0,
        decodedPath: targetProject, pathConfidence: "inferred",
      }];
      const entries = fs.readdirSync(fullPath).filter((f) => f.endsWith(".jsonl"));
      projects[0].jsonlFiles = entries.map((f) => ({
        sessionId: f.replace(/\.jsonl$/, ""),
        fileName: f,
        absPath: path.join(fullPath, f),
      }));
      projects[0].sessionCount = projects[0].jsonlFiles.length;
    } else {
      projects = scanClaudeProjects(claudeProjectsDir, scanOpts);
    }

    if (projects.length === 0) {
      console.log("No Claude Code projects found.");
      process.exit(0);
    }

    const plan = buildImportPlan(projects, manifest, {});

    console.log("");
    console.log(`Claude Code projects: ${projects.length}`);
    console.log(`Sessions found:      ${plan.summary.total}`);
    console.log(`  New:               ${plan.summary.newCount}`);
    console.log(`  Updated:           ${plan.summary.updatedCount}`);
    console.log(`  Skipped (same):    ${plan.summary.skippedCount}`);
    console.log("");

    if (dryRun) {
      if (plan.new.length > 0 || plan.updated.length > 0) {
        console.log("Would import:");
        for (const entry of plan.new.slice(0, 20)) {
          console.log(`  [NEW]     ${entry.sessionId}  (${entry.projectDir}, ${entry.turnCount} turns)`);
        }
        if (plan.new.length > 20) console.log(`  ... and ${plan.new.length - 20} more`);
        for (const entry of plan.updated.slice(0, 10)) {
          console.log(`  [UPDATED] ${entry.sessionId}  (${entry.projectDir})`);
        }
        if (plan.updated.length > 10) console.log(`  ... and ${plan.updated.length - 10} more`);
      }
      if (plan.skipped.length > 0) {
        console.log("Would skip (already imported, unchanged):");
        for (const entry of plan.skipped.slice(0, 5)) {
          console.log(`  ${entry.sessionId}  ->  ${entry.articleId}`);
        }
        if (plan.skipped.length > 5) console.log(`  ... and ${plan.skipped.length - 5} more`);
      }
      if (plan.new.length === 0 && plan.updated.length === 0) {
        console.log("Nothing to import. All sessions already imported and unchanged.");
      }
      console.log(`\nRun with --apply to execute.`);
      process.exit(0);
    }

    if (apply) {
      const { resolveDataDirs } = require("../scripts/lib/infra/echo-paths");
      const dirs = resolveDataDirs();
      const targetArticlesDir = asProject
        ? path.join(echoHome, "projects", asProject, "articles")
        : dirs.articlesDir;

      const opts = {
        userSpeaker: process.env.ECHO_USER_SPEAKER || "vincent",
        aiSpeaker: process.env.ECHO_AI_SPEAKER || "ai",
        project: asProject || dirs.projectId || null,
      };

      let imported = 0;
      let skipped = 0;

      const toProcess = [...plan.new, ...plan.updated];
      for (const entry of toProcess) {
        const articlePath = path.join(targetArticlesDir, `session-${entry.sessionId.slice(0, 8)}.md`);

        if (fs.existsSync(articlePath)) {
          console.log(`  SKIP  ${entry.sessionId}  (article exists)`);
          skipped++;
          continue;
        }

        try {
          const turns = provider.readSessionTurns(entry.filePath);
          const classification = provider.classifySession(turns);
          if (!classification.isMeaningful) {
            console.log(`  SKIP  ${entry.sessionId}  (${classification.reason})`);
            skipped++;
            continue;
          }

          const metadata = provider.extractMetadata(turns);
          const markdown = provider.toEchoArticle(turns, metadata, {
            sessionId: entry.sessionId,
            project: opts.project,
          });

          fs.mkdirSync(path.dirname(articlePath), { recursive: true });
          fs.writeFileSync(articlePath, markdown);
          mf.recordImport(manifest, entry.sessionId, `session-${entry.sessionId.slice(0, 8)}`, entry.fileHash, { provider: "claude-code" });

          console.log(`  OK    ${entry.sessionId}  ->  session-${entry.sessionId.slice(0, 8)}.md  (${classification.estimatedQuality}, ${classification.turnCount} turns)`);
          imported++;
        } catch (err) {
          console.error(`  FAIL  ${entry.sessionId}: ${err.message}`);
        }
      }

      mf.saveManifest(manifest, manifestPath);

      console.log(`\nImported: ${imported}  Skipped: ${skipped + plan.skipped.length}`);
      console.log(`Articles: ${targetArticlesDir}`);

      const { runValidate } = require("../scripts/validate");
      const result = runValidate();
      if (result.success) {
        console.log(`Validate: OK — ${result.articleCount} articles, ${result.commentCount} comments`);
      } else {
        console.log(`Validate: ${result.errors.length} error(s) — see above`);
      }
    }
    break;
  }
  case "serve":
    if (args.includes("--foreground")) {
      require("../scripts/serve").start().catch((err) => {
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
        } = require("../scripts/serve");
        const { isCaptureEnabled } = require("../scripts/lib/infra/config");

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
        const child = spawn(process.execPath, [__filename, "serve", "--foreground"], {
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
    break;
  case "stop": {
    (async () => {
      const {
        readServeInfo,
        clearServeInfo,
        findServeProcessCandidates,
        isValidPositivePid,
        verifyProcessIdentity,
      } = require("../scripts/serve");

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
    break;
  }
  case "capture": {
    const action = args[1];
    const { isCaptureEnabled, setCaptureEnabled } = require("../scripts/lib/infra/config");
    if (action === "on") {
      const r = setCaptureEnabled(true);
      console.log(`Capture enabled (${r.configPath})`);
    } else if (action === "off") {
      const r = setCaptureEnabled(false);
      console.log(`Capture disabled (${r.configPath})`);
    } else if (action === "status") {
      console.log(`Capture: ${isCaptureEnabled() ? "on" : "off"}`);
    } else {
      console.error(`Usage: ${commandFor(["capture", "on|off|status"])}`);
      process.exit(1);
    }
    break;
  }
  case "tag": {
    const { resolveDataDirs } = require("../scripts/lib/infra/echo-paths");
    const store = require("../scripts/lib/infra/markdown-store");
    const { listTags, addTags, removeTags } = require("../scripts/lib/usecases/query-articles");
    const dirs = resolveDataDirs();
    const deps = { dirs, store };
    const sub = args[1];

    if (sub === "list") {
      const tags = listTags({}, deps);
      if (tags.length === 0) {
        console.log("No tags found.");
      } else {
        console.log(`${"Tag".padEnd(30)} Usage`);
        console.log("-".repeat(42));
        for (const { tag, count } of tags) {
          console.log(`${tag.padEnd(30)} ${count}`);
        }
      }
    } else if (sub === "add") {
      const articleId = args[2];
      const tags = args.slice(3);
      if (!articleId || tags.length === 0) {
        console.error(`Usage: ${commandFor(["tag", "add", "<article-id>", "<tag1>", "[tag2...]"])}`);
        process.exit(1);
      }
      try {
        const result = addTags({ id: articleId, tags }, deps);
        console.log(`Article: ${result.id}`);
        console.log(`Tags:   ${result.tags.join(", ")}`);
        console.log(`Added:  ${result.added.join(", ")}`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    } else if (sub === "remove") {
      const articleId = args[2];
      const tags = args.slice(3);
      if (!articleId || tags.length === 0) {
        console.error(`Usage: ${commandFor(["tag", "remove", "<article-id>", "<tag1>", "[tag2...]"])}`);
        process.exit(1);
      }
      try {
        const result = removeTags({ id: articleId, tags }, deps);
        console.log(`Article: ${result.id}`);
        console.log(`Tags:    ${result.tags.join(", ") || "(none)"}`);
        console.log(`Removed: ${result.removed.join(", ")}`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    } else {
      console.error(`Usage: ${commandFor(["tag", "list|add|remove"])}`);
      process.exit(1);
    }
    break;
  }
  default:
    console.log(USAGE);
    process.exit(cmd ? 1 : 0);
}
