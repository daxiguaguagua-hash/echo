const path = require("path");
const ef = require("../domain/echo-format");

function parseBuffer(raw) {
  const turns = [];
  let currentTurn = null;

  for (const line of raw.split("\n")) {
    const turnMatch = line.match(/^<!-- turn: (\S+) speaker=(\S+)(?: reply_to=(\S+))? -->/);
    if (turnMatch) {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = {
        id: turnMatch[1],
        speaker: turnMatch[2],
        reply_to: turnMatch[3] || null,
        content: "",
      };
      continue;
    }
    if (currentTurn) currentTurn.content += line + "\n";
  }
  if (currentTurn) turns.push(currentTurn);
  for (const t of turns) t.content = t.content.trimEnd();
  return { raw, turns };
}

function buildArticle(bufferFile, turns, opts = {}) {
  const sessionName = path.basename(bufferFile, ".md");
  const dateStr = ef.extractSessionDate(sessionName);
  const id = `session-${dateStr}`;

  const article = ef.createArticle({
    id,
    created_at: `${dateStr}T00:00:00+08:00`,
    alias: ef.inferTitle(turns),
    turns,
    project: opts.project,
  });

  return { id, article: ef.toMarkdown(article), title: article.title, alias: article.alias, turnCount: article.turns.length };
}

module.exports = { parseBuffer, buildArticle };
