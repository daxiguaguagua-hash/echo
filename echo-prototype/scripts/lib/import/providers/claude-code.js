const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { renderTurnMarker } = require("../../domain/echo-format");

// ---- noise detection ----

const NOISE_PATTERNS = [
  /^Base directory for this skill:/,
  /^<!-- AUTO-GENERATED/,
  /^```bash\n_UPD=/,
  /^<local-command-caveat>/,
  /^<command-name>/,
  /^<command-message>/,
  /^<command-args>/,
  /^<local-command-stdout>/,
];

function isNoise(text) {
  if (!text || !text.trim()) return true;
  const t = text.trim();
  if (t.length > 3000) return true;
  for (const p of NOISE_PATTERNS) {
    if (p.test(t)) return true;
  }
  if (t.startsWith("```bash") && t.includes("_UPD=")) return true;
  return false;
}

// ---- helpers ----

function normalizeSpeaker(turn) {
  const s = (turn.speaker || turn.role || "").toLowerCase();
  if (s === "human" || s === "user") return "human";
  if (s === "ai" || s === "assistant" || s === "model") return "ai";
  return s || "unknown";
}

// ---- session reading ----

function readSessionTurns(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");
  const turns = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const msgType = entry.type;
    const msg = entry.message || {};
    const msgRole = msg.role || (msgType === "user" ? "user" : "assistant");

    let content = "";
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      const parts = [];
      for (const b of msg.content) {
        if (b.type === "text" && b.text) {
          parts.push(b.text);
        } else if (b.type === "tool_use") {
          parts.push(`[调用工具: ${b.name}]`);
        }
      }
      content = parts.join(" ");
    }

    const toolCalls = [];
    if (Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b.type === "tool_use") {
          toolCalls.push({ name: b.name, id: b.id });
        }
      }
    }

    const speaker = msgRole === "user" ? "human" : "ai";

    turns.push({
      speaker,
      content: content.trim(),
      toolCalls,
      timestamp: entry.timestamp || null,
      sessionId: entry.sessionId || null,
      model: msg.model || null,
    });
  }

  return turns;
}

// ---- session classification ----

function classifySession(turns) {
  const humanTurns = turns.filter((t) => normalizeSpeaker(t) === "human" && !isNoise(t.content));
  const meaningfulTurns = turns.filter((t) => !isNoise(t.content));

  if (turns.length === 0) {
    return { isMeaningful: false, reason: "empty session", turnCount: 0, userTurnCount: 0, estimatedQuality: "low" };
  }

  if (humanTurns.length === 0) {
    return { isMeaningful: false, reason: "no user turns", turnCount: turns.length, userTurnCount: 0, estimatedQuality: "low" };
  }

  let quality = "low";
  const avgContentLength = meaningfulTurns.reduce((sum, t) => sum + t.content.length, 0) / Math.max(meaningfulTurns.length, 1);

  if (meaningfulTurns.length >= 6 && humanTurns.length >= 3) {
    quality = "high";
  } else if (meaningfulTurns.length >= 4 && humanTurns.length >= 2 && avgContentLength > 50) {
    quality = "high";
  } else if (meaningfulTurns.length >= 4 && humanTurns.length >= 2 && avgContentLength > 25) {
    quality = "medium";
  }

  return {
    isMeaningful: humanTurns.length >= 2 || meaningfulTurns.length >= 4,
    reason: humanTurns.length < 2 ? `only ${humanTurns.length} user turns` : "ok",
    turnCount: turns.length,
    userTurnCount: humanTurns.length,
    estimatedQuality: quality,
  };
}

// ---- metadata extraction ----

function extractMetadata(turns) {
  const meaningfulTurns = turns.filter((t) => !isNoise(t.content));
  const humanTurns = meaningfulTurns.filter((t) => normalizeSpeaker(t) === "human");

  let title = "";
  if (humanTurns.length > 0) {
    title = humanTurns[0].content.slice(0, 77);
    if (humanTurns[0].content.length > 77) title += "...";
  }

  let date = "";
  for (const t of turns) {
    if (t.timestamp) {
      date = t.timestamp;
      break;
    }
  }

  const seenSpeakers = new Set();
  const participants = [];
  for (const t of meaningfulTurns) {
    const s = normalizeSpeaker(t);
    if (!seenSpeakers.has(s)) {
      seenSpeakers.add(s);
      const p = { role: s };
      if (s === "ai" && t.model) p.model = t.model;
      participants.push(p);
    }
  }

  let model = "";
  for (const t of meaningfulTurns) {
    if (normalizeSpeaker(t) === "ai" && t.model) {
      model = t.model;
      break;
    }
  }

  return { title: title || "Untitled", date, participants, model };
}

// ---- article generation ----

function toEchoArticle(turns, metadata, opts = {}) {
  const { sessionId, alias } = opts;
  const articleId = sessionId
    ? `session-${sessionId.slice(0, 8)}`
    : `session-${crypto.randomUUID().slice(0, 8)}`;

  const meaningfulTurns = turns.filter((t) => !isNoise(t.content));
  const sourceHash = crypto.createHash("sha256").update(JSON.stringify(turns)).digest("hex");

  // Build YAML frontmatter
  const lines = [];
  lines.push("---");
  lines.push(`id: ${articleId}`);
  lines.push(`title: "${(metadata.title || "Untitled").replace(/"/g, '\\"')}"`);
  if (alias) lines.push(`alias: "${alias.replace(/"/g, '\\"')}"`);
  const dateStr = metadata.date ? metadata.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
  lines.push(`created_at: ${dateStr}`);
  lines.push("tags: []");
  lines.push(`summary: "${(metadata.title || "").replace(/"/g, '\\"')}"`);

  if (metadata.participants && metadata.participants.length > 0) {
    lines.push("participants:");
    for (const p of metadata.participants) {
      lines.push(`  - id: ${p.id || p.role}`);
      lines.push(`    role: ${p.role}`);
      if (p.model) lines.push(`    model: ${p.model}`);
    }
  }

  if (metadata.model) lines.push(`ai_model: ${metadata.model}`);

  lines.push("source:");
  lines.push(`  session_id: "${sessionId || ""}"`);
  lines.push(`  source_file_hash: "${sourceHash}"`);
  lines.push(`  imported_at: "${new Date().toISOString()}"`);

  if (opts.project) lines.push(`project: ${opts.project}`);

  lines.push("---");
  lines.push("");

  // Body
  lines.push(`# ${metadata.title || "Untitled"}`);
  lines.push("");

  let turnNum = 0;
  for (const turn of meaningfulTurns) {
    turnNum++;
    const speaker = normalizeSpeaker(turn);
    const speakerLabel = speaker === "human" ? (opts.userSpeaker || "human") : (opts.aiSpeaker || "ai");
    const turnId = `t${String(turnNum).padStart(2, "0")}`;
    lines.push(renderTurnMarker(turnId, speakerLabel));
    lines.push("");
    lines.push(turn.content);
    lines.push("");
  }

  // Comment section markers
  lines.push("<!-- ECHO_COMMENTS_START -->");
  lines.push("<!-- ECHO_COMMENTS_END -->");

  return lines.join("\n") + "\n";
}

// ---- project scanning ----

function scanProjectDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs.readdirSync(dirPath);
  const sessions = [];

  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue;
    const filePath = path.join(dirPath, entry);
    let stat;
    try { stat = fs.statSync(filePath); } catch { continue; }
    if (!stat.isFile()) continue;

    const sessionId = entry.replace(/\.jsonl$/, "");
    const content = fs.readFileSync(filePath, "utf-8");
    const jsonlLines = content.trim().split("\n");
    const firstLine = jsonlLines[0] ? (() => { try { return JSON.parse(jsonlLines[0]); } catch { return null; } })() : null;
    const lastLine = jsonlLines[jsonlLines.length - 1] ? (() => { try { return JSON.parse(jsonlLines[jsonlLines.length - 1]); } catch { return null; } })() : null;

    const turnCount = jsonlLines.length;
    const firstTurn = firstLine ? firstLine.timestamp || "" : "";
    const lastTurn = lastLine ? lastLine.timestamp || "" : "";

    sessions.push({ sessionId, filePath, turnCount, firstTurn, lastTurn });
  }

  return sessions;
}

module.exports = { scanProjectDir, readSessionTurns, classifySession, extractMetadata, toEchoArticle, isNoise };
