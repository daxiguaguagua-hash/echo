const fs = require("fs");
const path = require("path");

function logPath(dirs) {
  return path.join(dirs.indexDir, "mcp-query-log.jsonl");
}

function appendQueryLog(dirs, entry) {
  const file = logPath(dirs);
  if (!fs.existsSync(dirs.indexDir)) {
    fs.mkdirSync(dirs.indexDir, { recursive: true });
  }
  fs.appendFileSync(file, JSON.stringify(entry) + "\n");
}

function readRecentQueryLog(dirs, limit) {
  const file = logPath(dirs);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);
  const start = Math.max(0, lines.length - (limit || 50));
  return lines.slice(start).map((line) => {
    try { return JSON.parse(line); } catch (_) { return null; }
  }).filter(Boolean);
}

module.exports = { appendQueryLog, readRecentQueryLog };
