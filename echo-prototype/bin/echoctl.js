#!/usr/bin/env node
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
  ${commandFor(["tag", "list"])}    List all tags with usage counts
  ${commandFor(["tag", "add", "<article-id>", "<tag1>", "[tag2...]"])}  Add one or more tags to an article
  ${commandFor(["tag", "remove", "<article-id>", "<tag1>", "[tag2...]"])}  Remove one or more tags from an article
`;

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
    const result = runPipeline();
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
  case "serve":
    require("../scripts/serve").start().catch((err) => {
      console.error(`${CLI} serve failed:`, err.message);
      process.exit(1);
    });
    break;
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
