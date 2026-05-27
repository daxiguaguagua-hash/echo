const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");

const { loadAllArticlesAndComments, runBuildDocs, tagAnchor } = require("../scripts/build-docs");
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
  if (opts.tags) {
    frontmatter.push("tags:");
    for (const tag of opts.tags) frontmatter.push(`  - ${tag}`);
  }
  frontmatter.push("---");
  fs.writeFileSync(path.join(dir, `${id}.md`), [
    ...frontmatter,
    "",
    `# ${title}`,
    "",
    opts.body || "Body",
    "",
  ].join("\n"));
}

function readTagsPayload(tagsIndex) {
  const match = tagsIndex.match(/<EchoTagsPage payload="([^"]+)" \/>/);
  assert.ok(match, "tags page should render EchoTagsPage payload");
  return JSON.parse(decodeURIComponent(match[1]));
}

function readProjectTabsPayload(articleIndex) {
  const match = articleIndex.match(/<EchoProjectTabs payload="([^"]+)" \/>/);
  assert.ok(match, "article index should render EchoProjectTabs payload");
  return JSON.parse(decodeURIComponent(match[1]));
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
  const articleIndex = fs.readFileSync(path.join(docsRoot, "articles", "index.md"), "utf-8");
  const payload = readProjectTabsPayload(articleIndex);
  assert.deepEqual(payload[0].articles.map((article) => article.title), ["Runtime Article"]);
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

test("runBuildDocs renders article index project tabs named by project", (t) => {
  const oldEchoHome = process.env.ECHO_HOME;
  const oldCwd = process.cwd();
  const echoHome = tempDir();
  const docsRoot = tempDir();
  const mynoteRoot = tempDir();
  const homeworkRoot = tempDir();

  t.after(() => {
    if (oldEchoHome === undefined) delete process.env.ECHO_HOME;
    else process.env.ECHO_HOME = oldEchoHome;
    process.chdir(oldCwd);
    fs.rmSync(echoHome, { recursive: true, force: true });
    fs.rmSync(docsRoot, { recursive: true, force: true });
    fs.rmSync(mynoteRoot, { recursive: true, force: true });
    fs.rmSync(homeworkRoot, { recursive: true, force: true });
  });

  process.env.ECHO_HOME = echoHome;
  const mynote = registerProject(mynoteRoot, { echoHome, projectId: "mynote" });
  const homework = registerProject(homeworkRoot, { echoHome, projectId: "myhomeworkhelper" });
  writeArticle(path.join(mynote.dataRoot, "articles"), "mynote-article", "Mynote Article", {
    project: "mynote",
  });
  writeArticle(path.join(homework.dataRoot, "articles"), "homework-article", "Homework Article", {
    project: "myhomeworkhelper",
  });
  process.chdir(mynoteRoot);

  runBuildDocs({ docsRoot });

  const articleIndex = fs.readFileSync(path.join(docsRoot, "articles", "index.md"), "utf-8");
  const payload = readProjectTabsPayload(articleIndex);

  assert.deepEqual(payload.map((group) => group.label), ["myhomeworkhelper", "mynote"]);
  assert.deepEqual(payload.find((group) => group.label === "mynote").articles.map((article) => article.title), ["Mynote Article"]);
  assert.deepEqual(payload.find((group) => group.label === "myhomeworkhelper").articles.map((article) => article.title), ["Homework Article"]);
  assert.equal(payload.find((group) => group.label === "mynote").articles[0].href, "./generated/mynote--mynote-article");
});

test("runBuildDocs renders project as the first visible tag and includes it in tags page", (t) => {
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
  const registered = registerProject(projectRoot, { echoHome, projectId: "mynote" });
  writeArticle(path.join(registered.dataRoot, "articles"), "project-tagged", "Project Tagged", {
    project: "mynote",
    tags: ["AI"],
  });
  process.chdir(projectRoot);

  runBuildDocs({ docsRoot });

  const articleIndex = fs.readFileSync(path.join(docsRoot, "articles", "index.md"), "utf-8");
  const articleIndexPayload = readProjectTabsPayload(articleIndex);
  assert.deepEqual(articleIndexPayload[0].articles[0].tags, ["mynote", "AI"]);

  const articlePage = fs.readFileSync(path.join(docsRoot, "articles", "generated", "mynote--project-tagged.md"), "utf-8");
  assert.match(articlePage, /<div class="echo-tags"><span>mynote<\/span><span>AI<\/span><\/div>/);

  const tagsIndex = fs.readFileSync(path.join(docsRoot, "tags", "index.md"), "utf-8");
  const payload = readTagsPayload(tagsIndex);
  const mynote = payload.find((group) => group.tag === "mynote");
  assert.equal(mynote.anchor, "tag-mynote-1");
  assert.deepEqual(mynote.articles.map((article) => article.title), ["Project Tagged"]);
});

test("runBuildDocs uses project-qualified slugs for duplicate article ids", (t) => {
  const oldEchoHome = process.env.ECHO_HOME;
  const oldCwd = process.cwd();
  const echoHome = tempDir();
  const docsRoot = tempDir();
  const mynoteRoot = tempDir();
  const homeworkRoot = tempDir();

  t.after(() => {
    if (oldEchoHome === undefined) delete process.env.ECHO_HOME;
    else process.env.ECHO_HOME = oldEchoHome;
    process.chdir(oldCwd);
    fs.rmSync(echoHome, { recursive: true, force: true });
    fs.rmSync(docsRoot, { recursive: true, force: true });
    fs.rmSync(mynoteRoot, { recursive: true, force: true });
    fs.rmSync(homeworkRoot, { recursive: true, force: true });
  });

  process.env.ECHO_HOME = echoHome;
  const mynote = registerProject(mynoteRoot, { echoHome, projectId: "mynote" });
  const homework = registerProject(homeworkRoot, { echoHome, projectId: "myhomeworkhelper" });
  writeArticle(path.join(mynote.dataRoot, "articles"), "session-2026-05-27", "新增 echoctl 查找项目", {
    project: "mynote",
  });
  writeArticle(path.join(homework.dataRoot, "articles"), "session-2026-05-27", "你怎么知道注册表里面有三个项目？", {
    project: "myhomeworkhelper",
  });
  process.chdir(mynoteRoot);

  runBuildDocs({ docsRoot });

  const generatedDir = path.join(docsRoot, "articles", "generated");
  assert.ok(fs.existsSync(path.join(generatedDir, "mynote--session-2026-05-27.md")));
  assert.ok(fs.existsSync(path.join(generatedDir, "myhomeworkhelper--session-2026-05-27.md")));

  const mynotePage = fs.readFileSync(path.join(generatedDir, "mynote--session-2026-05-27.md"), "utf-8");
  const homeworkPage = fs.readFileSync(path.join(generatedDir, "myhomeworkhelper--session-2026-05-27.md"), "utf-8");
  assert.match(mynotePage, /新增 echoctl 查找项目/);
  assert.match(homeworkPage, /你怎么知道注册表里面有三个项目？/);

  const sidebar = fs.readFileSync(path.join(docsRoot, ".vitepress", "echo-sidebar.mts"), "utf-8");
  assert.match(sidebar, /\/articles\/generated\/mynote--session-2026-05-27/);
  assert.match(sidebar, /\/articles\/generated\/myhomeworkhelper--session-2026-05-27/);
  assert.doesNotMatch(sidebar, /\/articles\/generated\/session-2026-05-27'/);
});

test("runBuildDocs writes tag cloud links to explicit tag section anchors", (t) => {
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
  writeArticle(path.join(echoHome, "articles"), "ai-one", "AI One", { tags: ["AI 协作"] });
  writeArticle(path.join(echoHome, "articles"), "ai-two", "AI Two", { tags: ["AI 协作"] });
  process.chdir(echoHome);

  runBuildDocs({ docsRoot });

  const tagsIndex = fs.readFileSync(path.join(docsRoot, "tags", "index.md"), "utf-8");
  const anchor = tagAnchor("AI 协作", 2);
  const payload = readTagsPayload(tagsIndex);
  const aiCoop = payload.find((group) => group.tag === "AI 协作");
  assert.equal(aiCoop.anchor, anchor);
  assert.equal(aiCoop.articles.length, 2);
  assert.match(tagsIndex, /<EchoTagsPage payload="/);
  assert.doesNotMatch(tagsIndex, /href="#ai%20/);
});

test("runBuildDocs keeps turn markers as hidden metadata", (t) => {
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
  writeArticle(path.join(echoHome, "articles"), "turns", "Turns", {
    body: [
      "<!-- turn: t001 speaker=vincent -->",
      "Question",
      "<!-- turn: t002 speaker=claude reply_to=t001 -->",
      "Answer",
    ].join("\n\n"),
  });
  process.chdir(echoHome);

  runBuildDocs({ docsRoot });

  const articlePage = fs.readFileSync(path.join(docsRoot, "articles", "generated", "turns.md"), "utf-8");
  assert.match(articlePage, /<span class="echo-turn-marker" hidden aria-hidden="true" data-turn-id="t001" data-speaker="vincent"><\/span>/);
  assert.match(articlePage, /data-turn-id="t002" data-speaker="claude" data-reply-to="t001"/);
  assert.doesNotMatch(articlePage, /reply t001/);
});
