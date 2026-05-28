const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  clearArticleCache,
  listMarkdownFiles,
  readMarkdownFile,
  loadArticles,
  loadArticleById,
  loadComments,
  indexArticles,
  nextAnnotationId,
} = require("../scripts/lib/infra/markdown-store");
const { stripCommentSections } = require("../scripts/lib/usecases/strip-comments");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-markdown-store-"));
}

function writeFixture(dir, relPath, text) {
  const file = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function articleFixture(id, title, body = "Article body.\n") {
  return [
    "---",
    `id: ${id}`,
    `title: "${title}"`,
    "type: article",
    'created: "2026-05-21"',
    "---",
    body,
  ].join("\n");
}

function annotationFixture(id, articleId, body = "Comment body.\n") {
  return [
    "---",
    `id: ${id}`,
    "type: annotation",
    `article: ${articleId}`,
    'created: "2026-05-21"',
    "---",
    body,
  ].join("\n");
}

test("listMarkdownFiles returns all .md files recursively, skips dotfiles and node_modules", () => {
  const dir = tempDir();
  writeFixture(dir, "root.md", "# Root\n");
  writeFixture(dir, "nested/deep.md", "# Deep\n");
  writeFixture(dir, ".hidden.md", "# Hidden\n");
  writeFixture(dir, ".hidden/inside.md", "# Hidden dir\n");
  writeFixture(dir, "node_modules/pkg/readme.md", "# Package\n");
  writeFixture(dir, "nested/notes.txt", "not markdown\n");

  const relPaths = listMarkdownFiles(dir)
    .map((file) => path.relative(dir, file))
    .sort();

  assert.deepEqual(relPaths, ["nested/deep.md", "root.md"]);
});

test("readMarkdownFile parses a valid file returning { data, content, raw }", () => {
  const dir = tempDir();
  const raw = articleFixture("art-001", "First Article", "This is the body.\n");
  const file = writeFixture(dir, "art-001.md", raw);

  assert.deepEqual(readMarkdownFile(file), {
    data: {
      id: "art-001",
      title: "First Article",
      type: "article",
      created: "2026-05-21",
    },
    content: "This is the body.\n",
    raw,
  });
});

test("loadArticles returns list of article records with id, data, content, raw, absPath, relPath", () => {
  const dir = tempDir();
  const raw = articleFixture("art-001", "First Article", "Useful body.\n");
  const file = writeFixture(dir, "articles/art-001.md", raw);

  assert.deepEqual(loadArticles(dir), [
    {
      id: "art-001",
      data: {
        id: "art-001",
        title: "First Article",
        type: "article",
        created: "2026-05-21",
      },
      content: "Useful body.\n",
      raw,
      absPath: file,
      relPath: path.join("articles", "art-001.md"),
    },
  ]);
});

test("loadArticles skips files without id and annotation-type files", () => {
  const dir = tempDir();
  writeFixture(dir, "valid.md", articleFixture("art-001", "Valid"));
  writeFixture(
    dir,
    "missing-id.md",
    "---\ntitle: \"Missing ID\"\ntype: article\n---\nNo id.\n"
  );
  writeFixture(dir, "ann-001.md", annotationFixture("ann-001", "art-001"));

  assert.deepEqual(
    loadArticles(dir).map((record) => record.id),
    ["art-001"]
  );
});

test("loadArticles non-strict skips bad files and logs warning", () => {
  const dir = tempDir();
  writeFixture(dir, "good.md", articleFixture("art-001", "Good"));
  // Unclosed YAML quote — guaranteed to break gray-matter.
  writeFixture(dir, "bad.md", '---\nid: "unterminated\n---\nBad body.\n');

  const errors = [];
  const orig = console.error;
  console.error = (msg) => errors.push(msg);
  try {
    const articles = loadArticles(dir);
    assert.deepEqual(articles.map((r) => r.id), ["art-001"]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /skipping unparseable file/);
  } finally {
    console.error = orig;
  }
});

test("loadArticles strict throws on parse error", () => {
  const dir = tempDir();
  // Bare colon breaks YAML mapping — different fixture to avoid test interference.
  writeFixture(dir, "bad.md", '---\nid: :\n---\nBad body.\n');

  assert.throws(
    () => loadArticles(dir, { strict: true }),
    /YAML frontmatter parse error/
  );
});

test("loadArticleById finds a specific article by id", () => {
  const dir = tempDir();
  writeFixture(dir, "art-001.md", articleFixture("art-001", "First"));
  const raw = articleFixture("art-002", "Second", "Second body.\n");
  const file = writeFixture(dir, "nested/art-002.md", raw);

  assert.deepEqual(loadArticleById(dir, "art-002"), {
    id: "art-002",
    data: {
      id: "art-002",
      title: "Second",
      type: "article",
      created: "2026-05-21",
    },
    content: "Second body.\n",
    raw,
    absPath: file,
    relPath: path.join("nested", "art-002.md"),
  });
});

test("loadArticleById returns null for non-existent id", () => {
  const dir = tempDir();
  writeFixture(dir, "art-001.md", articleFixture("art-001", "First"));

  assert.equal(loadArticleById(dir, "missing"), null);
});

test("loadArticleById skips bad files and finds later valid article", () => {
  const dir = tempDir();
  writeFixture(dir, "00-bad.md", '---\n- item\nid: oops\n---\nBad body.\n');
  writeFixture(dir, "99-good.md", articleFixture("art-001", "Good"));

  assert.equal(loadArticleById(dir, "art-001").id, "art-001");
});

test("loadComments returns only annotation-type files", () => {
  const dir = tempDir();
  writeFixture(dir, "article.md", articleFixture("art-001", "Article"));
  writeFixture(dir, "ann-001.md", annotationFixture("ann-001", "art-001"));
  writeFixture(dir, "nested/ann-002.md", annotationFixture("ann-002", "art-001"));

  assert.deepEqual(loadComments(dir), [
    {
      id: "ann-001",
      type: "annotation",
      article: "art-001",
      created: "2026-05-21",
      _file: "comments/ann-001.md",
      content: "Comment body.\n",
    },
    {
      id: "ann-002",
      type: "annotation",
      article: "art-001",
      created: "2026-05-21",
      _file: `comments/${path.join("nested", "ann-002.md")}`,
      content: "Comment body.\n",
    },
  ]);
});

test("loadComments skips bad files and logs warning", () => {
  const dir = tempDir();
  writeFixture(dir, "ann-001.md", annotationFixture("ann-001", "art-001"));
  writeFixture(dir, "bad.md", '---\nid: "also-unterminated\n---\nBad body.\n');

  const errors = [];
  const orig = console.error;
  console.error = (msg) => errors.push(msg);
  try {
    assert.deepEqual(loadComments(dir).map((c) => c.id), ["ann-001"]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /skipping unparseable file/);
  } finally {
    console.error = orig;
  }
});

test("indexArticles builds an id→record map", () => {
  const records = [
    { id: "art-001", relPath: "art-001.md" },
    { id: "art-002", relPath: "art-002.md" },
  ];

  assert.deepEqual(indexArticles(records), {
    "art-001": records[0],
    "art-002": records[1],
  });
});

test("indexArticles warns on duplicate ids (verify second one wins)", () => {
  const first = { id: "art-001", relPath: "first.md" };
  const second = { id: "art-001", relPath: "second.md" };

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  try {
    const map = indexArticles([first, second]);

    assert.equal(map["art-001"], second);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /duplicate article id "art-001"/);
  } finally {
    console.warn = originalWarn;
  }
});

test("nextAnnotationId returns ann-001 for empty dir", () => {
  assert.equal(nextAnnotationId(tempDir()), "ann-001");
});

test("nextAnnotationId finds max across subdirectories (recursive)", () => {
  const dir = tempDir();
  writeFixture(dir, "ann-002.md", annotationFixture("ann-002", "art-001"));
  writeFixture(dir, "nested/ann-017.md", annotationFixture("ann-017", "art-001"));

  assert.equal(nextAnnotationId(dir), "ann-018");
});

test("stripCommentSections removes ECHO_COMMENTS_START/END blocks", () => {
  const text = [
    "# Article",
    "",
    "Keep this.",
    "<!-- ECHO_COMMENTS_START -->",
    "- comment one",
    "<!-- ECHO_COMMENTS_END -->",
    "Keep that.",
  ].join("\n");

  assert.equal(stripCommentSections(text), "# Article\n\nKeep this.\nKeep that.");
});

test("stripCommentSections removes multiple comment blocks without deleting text between them", () => {
  const text = [
    "# Article",
    "",
    "Keep this.",
    "<!-- ECHO_COMMENTS_START -->",
    "- c1",
    "<!-- ECHO_COMMENTS_END -->",
    "Middle text.",
    "<!-- ECHO_COMMENTS_START -->",
    "- c2",
    "<!-- ECHO_COMMENTS_END -->",
    "Keep that.",
  ].join("\n");

  assert.equal(
    stripCommentSections(text),
    "# Article\n\nKeep this.\nMiddle text.\nKeep that."
  );
});

test("stripCommentSections removes legacy ECHO:COMMENT_LIST marker", () => {
  const text = "# Article\n\nBody.\n<!-- ECHO:COMMENT_LIST -->\n";

  assert.equal(stripCommentSections(text), "# Article\n\nBody.\n");
});

test("writeComment produces valid gray-matter frontmatter (article-level)", () => {
  const matter = require("gray-matter");
  const { writeComment } = require("../scripts/lib/usecases/write-comment");
  const td = tempDir();
  const dirs = { articlesDir: td + "/articles", commentsDir: td + "/comments" };
  fs.mkdirSync(dirs.articlesDir, { recursive: true });
  fs.mkdirSync(dirs.commentsDir, { recursive: true });
  fs.writeFileSync(path.join(dirs.articlesDir, "test-art-003.md"), [
    "---",
    "id: test-art-003",
    "title: Test Article Three",
    "type: article",
    "created_at: 2026-05-01",
    "tags: []",
    "---",
    "# Article Three",
    "Some content.",
  ].join("\n"));

  const storeObj = { loadArticleById, loadArticles, nextAnnotationId };
  const result = writeComment({
    articleId: "test-art-003", comment: "Article-level note.", scope: "article",
    dirs, store: storeObj,
  });

  const raw = fs.readFileSync(path.join(dirs.commentsDir, `${result.id}.md`), "utf-8");
  const parsed = matter(raw);
  assert.equal(parsed.data.id, result.id);
  assert.equal(parsed.data.type, "annotation");
  assert.equal(parsed.data.author, "vincent");
  assert.equal(parsed.data.target.article_id, "test-art-003");
  assert.equal(parsed.data.anchor.kind, "article");
  assert.equal(parsed.content.trim(), "Article-level note.");
  fs.rmSync(td, { recursive: true, force: true });
});

test("loadArticleById caches results after loadArticles", () => {
  const td = tempDir();
  clearArticleCache();

  writeFixture(td, "a.md", articleFixture("art-1", "Art 1", "Body 1."));
  writeFixture(td, "b.md", articleFixture("art-2", "Art 2", "Body 2."));

  loadArticles(td);
  const a1 = loadArticleById(td, "art-1");
  assert.equal(a1.id, "art-1");
  // Verify second call hits cache: creating a new file after loadArticles
  // should not affect loadArticleById when cache is populated
  writeFixture(td, "c.md", articleFixture("art-3", "Art 3", "Body 3."));
  const a3 = loadArticleById(td, "art-3");
  assert.equal(a3, null);

  clearArticleCache();
  fs.rmSync(td, { recursive: true, force: true });
});

test("loadArticleById populates cache on first call when loadArticles not called", () => {
  const td = tempDir();
  clearArticleCache();

  writeFixture(td, "a.md", articleFixture("art-1", "Art 1", "Body 1."));
  writeFixture(td, "b.md", articleFixture("art-2", "Art 2", "Body 2."));

  // First call scans and populates cache
  const a1 = loadArticleById(td, "art-1");
  assert.equal(a1.id, "art-1");
  // Second call uses cache — adding new file shouldn't affect
  writeFixture(td, "c.md", articleFixture("art-3", "Art 3", "Body 3."));
  const a3 = loadArticleById(td, "art-3");
  assert.equal(a3, null);

  clearArticleCache();
  fs.rmSync(td, { recursive: true, force: true });
});

test("writeArticleFile clears article cache", () => {
  const td = tempDir();
  clearArticleCache();

  writeFixture(td, "a.md", articleFixture("art-1", "Art 1", "Body 1."));
  loadArticles(td);
  // Cache is populated
  const a1 = loadArticleById(td, "art-1");
  assert.equal(a1.id, "art-1");

  // Write triggers cache clear
  const store = require("../scripts/lib/infra/markdown-store");
  store.writeArticleFile(path.join(td, "new.md"), { id: "new-art", title: "New" }, "New body.");
  // After cache clear, loadArticleById should see new file
  const na = loadArticleById(td, "new-art");
  assert.equal(na.id, "new-art");

  clearArticleCache();
  fs.rmSync(td, { recursive: true, force: true });
});
