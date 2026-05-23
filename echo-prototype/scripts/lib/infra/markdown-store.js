const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

function listMarkdownFiles(dir) {
  const files = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      if (name.startsWith(".") || name === "node_modules") continue;
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".md")) files.push(full);
    }
  }
  walk(dir);
  return files;
}

function readMarkdownFile(file) {
  const raw = fs.readFileSync(file, "utf-8");
  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    throw new Error(`${file}: YAML frontmatter parse error — ${e.message}`);
  }
  return { data: parsed.data, content: parsed.content, raw };
}

function loadArticles(dir, opts) {
  const records = [];
  const strict = opts?.strict === true;
  if (!fs.existsSync(dir)) return records;
  const files = listMarkdownFiles(dir);
  for (const file of files) {
    let result;
    try {
      result = readMarkdownFile(file);
    } catch (e) {
      if (strict) throw e;
      console.error(`[markdown-store] skipping unparseable file: ${e.message}`);
      continue;
    }
    if (!result.data.id || result.data.type === "annotation") continue;
    records.push({
      id: result.data.id,
      data: result.data,
      content: result.content,
      raw: result.raw,
      absPath: file,
      relPath: path.relative(dir, file),
    });
  }
  return records;
}

function loadArticleById(dir, id) {
  if (!fs.existsSync(dir)) return null;
  for (const file of listMarkdownFiles(dir)) {
    let result;
    try {
      result = readMarkdownFile(file);
    } catch (_) {
      continue;
    }
    if (result.data.id === id && result.data.type !== "annotation") {
      return {
        id: result.data.id,
        data: result.data,
        content: result.content,
        raw: result.raw,
        absPath: file,
        relPath: path.relative(dir, file),
      };
    }
  }
  return null;
}

function loadComments(dir) {
  const comments = [];
  if (!fs.existsSync(dir)) return comments;
  for (const file of listMarkdownFiles(dir)) {
    let result;
    try {
      result = readMarkdownFile(file);
    } catch (e) {
      console.error(`[markdown-store] skipping unparseable file: ${e.message}`);
      continue;
    }
    if (result.data.type === "annotation") {
      comments.push({
        ...result.data,
        _file: `comments/${path.relative(dir, file)}`,
        content: result.content,
      });
    }
  }
  return comments;
}

function indexArticles(records) {
  const map = {};
  for (const r of records) {
    if (map[r.id]) {
      console.warn(`[markdown-store] duplicate article id "${r.id}": ${r.relPath} and ${map[r.id].relPath}`);
    }
    map[r.id] = r;
  }
  return map;
}

function nextAnnotationId(dir) {
  let max = 0;
  for (const file of listMarkdownFiles(dir)) {
    const name = path.basename(file);
    const m = name.match(/^ann-(\d+)\.md$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `ann-${String(max + 1).padStart(3, "0")}`;
}

module.exports = {
  listMarkdownFiles,
  readMarkdownFile,
  loadArticles,
  loadArticleById,
  loadComments,
  indexArticles,
  nextAnnotationId,
};
