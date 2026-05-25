const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");

const { loadAllArticlesAndComments } = require("../scripts/build-docs");
const { registerProject } = require("../scripts/lib/usecases/project-registry");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-build-docs-test-"));
}

function writeArticle(dir, id, title) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.md`), [
    "---",
    `id: ${id}`,
    `title: ${title}`,
    "created_at: 2026-05-25T00:00:00.000Z",
    "---",
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
