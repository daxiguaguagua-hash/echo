const assert = require("node:assert/strict");
const test = require("node:test");

const { buildArticle, parseBuffer } = require("../scripts/lib/usecases/convert-buffer");

test("buildArticle preserves versioned buffer names as unique article ids", () => {
  const { turns } = parseBuffer([
    "<!-- turn: t001 speaker=vincent -->",
    "我：first session",
    "",
    "<!-- turn: t002 speaker=ai reply_to=t001 -->",
    "## ai 的回复",
    "",
    "answer",
  ].join("\n"));

  const result = buildArticle("session-2026-05-27-v3.md", turns, { project: "myhomeworkhelper" });

  assert.equal(result.id, "session-2026-05-27-v3");
  assert.match(result.article, /id: session-2026-05-27-v3/);
  assert.match(result.article, /created_at: '?2026-05-27T00:00:00\+08:00'?/);
  assert.match(result.article, /project: myhomeworkhelper/);
});
