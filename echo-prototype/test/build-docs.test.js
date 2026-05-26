const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");

const { loadAllArticlesAndComments, runBuildDocs } = require("../scripts/build-docs");
const { registerProject } = require("../scripts/lib/usecases/project-registry");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-build-docs-test-"));
}

function writeArticle(dir, id, title, opts = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const frontmatter = [
    "---",
    `id: ${id}`,
    `title: ${title}`,
    `created_at: ${opts.createdAt || "2026-05-25T00:00:00.000Z"}`,
  ];
  if (opts.project) frontmatter.push(`project: ${opts.project}`);
  frontmatter.push("---");
  fs.writeFileSync(path.join(dir, `${id}.md`), [
    ...frontmatter,
    "",
    `# ${title}`,
    "",
    "Body",
    "",
  ].join("\n"));
}

test("docs generation includes global articles when run inside an empty registered project", (t) => {
  const oldEchoHome = process.env.ECHO_HOME;
  const oldCwd = process.cwd();
  const echoHome = tempDir();
  const projectRoot = tempDir();

  t.after(() => {
    if (oldEchoHome === undefined) delete process.env.ECHO_HOME;
    else process.env.ECHO_HOME = oldEchoHome;
    process.chdir(oldCwd);
    fs.rmSync(echoHome, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  process.env.ECHO_HOME = echoHome;
  writeArticle(path.join(echoHome, "articles"), "global-article", "Global Article");
  registerProject(projectRoot, { echoHome, projectId: "empty-project" });
  process.chdir(projectRoot);

  const { articles } = loadAllArticlesAndComments();

  assert.deepEqual(articles.map((a) => a.id), ["global-article"]);
  assert.equal(articles[0]._project, null);
});

test("runBuildDocs can generate a runtime VitePress site outside the package docs dir", (t) => {
  const oldEchoHome = process.env.ECHO_HOME;
  const oldCwd = process.cwd();
  const echoHome = tempDir();
  const docsRoot = tempDir();

  t.after(() => {
    if (oldEchoHome === undefined) delete process.env.ECHO_HOME;
    else process.env.ECHO_HOME = oldEchoHome;
    process.chdir(oldCwd);
    fs.rmSync(echoHome, { recursive: true, force: true });
    fs.rmSync(docsRoot, { recursive: true, force: true });
  });

  process.env.ECHO_HOME = echoHome;
  writeArticle(path.join(echoHome, "articles"), "runtime-article", "Runtime Article");
  process.chdir(echoHome);

  const result = runBuildDocs({ docsRoot });

  assert.equal(result.articles, 1);
  assert.equal(result.docsRoot, docsRoot);
  assert.ok(fs.existsSync(path.join(docsRoot, ".vitepress", "config.mts")));
  assert.ok(fs.existsSync(path.join(docsRoot, ".vitepress", "theme", "index.ts")));
  assert.ok(fs.existsSync(path.join(docsRoot, "articles", "generated", "runtime-article.md")));
  assert.match(
    fs.readFileSync(path.join(docsRoot, "articles", "index.md"), "utf-8"),
    /Runtime Article/
  );
});

test("runBuildDocs groups sidebar articles by project while keeping recent shortcut", (t) => {
  const oldEchoHome = process.env.ECHO_HOME;
  const oldCwd = process.cwd();
  const echoHome = tempDir();
  const docsRoot = tempDir();
  const projectRoot = tempDir();

  t.after(() => {
    if (oldEchoHome === undefined) delete process.env.ECHO_HOME;
    else process.env.ECHO_HOME = oldEchoHome;
    process.chdir(oldCwd);
    fs.rmSync(echoHome, { recursive: true, force: true });
    fs.rmSync(docsRoot, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  process.env.ECHO_HOME = echoHome;
  writeArticle(path.join(echoHome, "articles"), "global-article", "Global Article");
  const registered = registerProject(projectRoot, { echoHome, projectId: "mynote" });
  writeArticle(path.join(registered.dataRoot, "articles"), "project-article", "Project Article", {
    project: "mynote",
    createdAt: "2026-05-26T00:00:00.000Z",
  });
  process.chdir(projectRoot);

  runBuildDocs({ docsRoot });

  const sidebar = fs.readFileSync(path.join(docsRoot, ".vitepress", "echo-sidebar.mts"), "utf-8");
  assert.match(sidebar, /text: '最近文章'/);
  assert.match(sidebar, /text: '项目'/);
  assert.match(sidebar, /text: "mynote \(1\)"/);
  assert.match(sidebar, /text: "未归类 \(1\)"/);
  assert.match(sidebar, /Project Article/);
  assert.match(sidebar, /Global Article/);
  assert.ok(sidebar.indexOf("text: '项目'") < sidebar.indexOf('text: "mynote (1)"'));
});
