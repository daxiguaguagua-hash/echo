const yaml = require("js-yaml");

// ---- configurable defaults ----

const DEFAULT_SPEAKERS = {
  human: { id: process.env.ECHO_USER_SPEAKER || "vincent", role: "human" },
  ai: { id: process.env.ECHO_AI_SPEAKER || "ai", role: "ai", model: "unknown" },
};

// ---- turn normalization ----

// Strip a prefix once (idempotent — won't double-strip).
function stripPrefix(text, prefix) {
  if (text.startsWith(prefix)) return text.slice(prefix.length);
  // Also handle multiline AI heading "## ai 的回复\n\n"
  const lines = text.split("\n");
  if (lines[0].trim() === prefix.trim() && lines[0].startsWith("##")) {
    let i = 1;
    while (i < lines.length && lines[i].trim() === "") i++;
    return lines.slice(i).join("\n");
  }
  return text;
}

function resolveSpeakerRole(speaker, speakers) {
  const s = speakers || DEFAULT_SPEAKERS;
  if (speaker === s.human.id) return s.human.role;
  return s.ai.role;
}

function resolveSpeakerModel(speaker, speakers, hint) {
  const s = speakers || DEFAULT_SPEAKERS;
  if (speaker === s.human.id) return undefined;
  return hint || s.ai.model;
}

/**
 * createTurn(input, opts)
 * Returns a canonical turn object. Idempotent — safe to call on already-normalized turns.
 */
function createTurn(input, opts = {}) {
  const speakers = opts.speakers || DEFAULT_SPEAKERS;
  let content = input.content || "";

  if (input.speaker === speakers.human.id) {
    content = stripPrefix(content, "我：");
  } else {
    content = stripPrefix(content, "## ai 的回复\n\n");
    content = stripPrefix(content, "## ai 的回复\n");
  }
  content = content.trim();

  return {
    id: input.id || null,
    speaker: input.speaker,
    role: resolveSpeakerRole(input.speaker, speakers),
    content,
    reply_to: input.reply_to || null,
    model: resolveSpeakerModel(input.speaker, speakers, input.model),
  };
}

// ---- participant ----

function createParticipant(input) {
  const p = { id: input.id, role: input.role };
  if (input.model) p.model = input.model;
  return p;
}

// ---- article JSON template ----

/**
 * createArticle(input)
 * Returns the canonical article JSON object.
 * Each turn in input.turns can be raw or already canonical — createTurn is called on each.
 */
function createArticle(input) {
  const speakers = input.speakers || DEFAULT_SPEAKERS;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "+08:00");

  const turns = [];
  let turnNum = 0;
  let lastUserTurnId = null;

  for (const raw of input.turns) {
    turnNum++;
    const turnId = raw.id || `t${String(turnNum).padStart(3, "0")}`;
    const t = createTurn(raw, { speakers });
    t.id = turnId;

    if (t.role === "ai" && !t.reply_to && lastUserTurnId) {
      t.reply_to = lastUserTurnId;
    }
    if (t.role === "human") {
      lastUserTurnId = turnId;
    }

    if (t.role === "human") delete t.model;

    turns.push(t);
  }

  let participants;
  if (input.participants) {
    participants = input.participants.map((p) => createParticipant(p));
  } else {
    const seen = new Map();
    for (const t of turns) {
      if (!seen.has(t.speaker)) {
        seen.set(t.speaker, createParticipant({
          id: t.speaker,
          role: t.role,
          model: t.model,
        }));
      }
    }
    participants = [...seen.values()];
  }

  const title = input.title || inferTitle(turns);
  const summary = input.summary || inferSummary(turns);

  return {
    id: input.id,
    title,
    created_at: input.created_at,
    updated_at: input.updated_at || now,
    tags: input.tags || [],
    summary,
    participants,
    source_session: input.source_session || undefined,
    turns,
  };
}

// ---- Markdown serializer (single exit point) ----

function toMarkdown(article) {
  const fm = {
    id: article.id,
    title: article.title,
    created_at: article.created_at,
    updated_at: article.updated_at,
    tags: article.tags,
    summary: article.summary,
    participants: article.participants.map((p) => {
      const entry = { id: p.id, role: p.role };
      if (p.model) entry.model = p.model;
      return entry;
    }),
  };
  if (article.source_session) fm.source_session = article.source_session;

  const frontmatter = yaml.dump(fm, {
    lineWidth: -1,
    noCompatMode: true,
    quotingType: '"',
    forceQuotes: false,
  });

  const turnBlocks = [];
  for (const t of article.turns) {
    const meta = [`<!-- turn: ${t.id} speaker=${t.speaker}`];
    if (t.reply_to) meta.push(`reply_to=${t.reply_to}`);
    meta.push("-->");

    let contentLine;
    if (t.role === "human") {
      contentLine = `我：${t.content}`;
    } else {
      const modelNote = t.model && t.model !== "unknown" ? `（${t.model}）` : "";
      contentLine = `## ai 的回复${modelNote}\n\n${t.content}`;
    }

    turnBlocks.push(`${meta.join(" ")}\n${contentLine}`);
  }

  const body = turnBlocks.join("\n\n");

  return [
    "---",
    frontmatter.trimEnd(),
    "---",
    "",
    body,
    "",
    "<!-- ECHO_COMMENTS_START -->",
    "",
    "<!-- ECHO_COMMENTS_END -->",
    "",
  ].join("\n");
}

// ---- inference helpers ----

function firstUserTurn(turns) {
  return turns.find((t) => {
    const role = t.role || (t.speaker === DEFAULT_SPEAKERS.human.id ? "human" : "ai");
    return role === "human";
  });
}

function cleanText(text, maxLen) {
  if (!text) return "未命名对话";
  const cleaned = text.replace(/[""]/g, "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length <= maxLen ? cleaned : cleaned.slice(0, maxLen - 3) + "...";
}

function inferTitle(turns) {
  const first = firstUserTurn(turns);
  const text = first ? first.content : "";
  const raw = text.startsWith("我：") ? text.slice(2) : text;
  return cleanText(raw, 60);
}

function inferSummary(turns) {
  const first = firstUserTurn(turns);
  const text = first ? first.content : "";
  const raw = text.startsWith("我：") ? text.slice(2) : text;
  return cleanText(raw, 80);
}

function extractSessionDate(sessionName) {
  const m = sessionName.match(/^session-(\d{4}-\d{2}-\d{2})(?:-v\d+)?$/);
  return m ? m[1] : sessionName.replace(/^session-/, "").replace(/-v\d+$/, "");
}

// ---- exports ----

module.exports = {
  DEFAULT_SPEAKERS,
  createTurn,
  createParticipant,
  createArticle,
  toMarkdown,
  inferTitle,
  inferSummary,
  extractSessionDate,
};
