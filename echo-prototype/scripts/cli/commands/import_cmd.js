const { commandFor } = require("../../lib/cli/names");

function run(args) {
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

    const { scanClaudeProjects, buildImportPlan } = require("../../lib/import/scanner");
    const mf = require("../../lib/import/manifest");
    const provider = require("../../lib/import/providers/claude-code");
    const { resolveEchoHomePath } = require("../../lib/infra/workspace");
    const store = require("../../lib/infra/markdown-store");

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
      const { resolveDataDirs } = require("../../lib/infra/echo-paths");
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

      const { runValidate } = require("../validate");
      const result = runValidate();
      if (result.success) {
        console.log(`Validate: OK — ${result.articleCount} articles, ${result.commentCount} comments`);
      } else {
        console.log(`Validate: ${result.errors.length} error(s) — see above`);
      }
    }
}

module.exports = run;
