const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createTurn,
  createArticle,
  toMarkdown,
  inferTitle,
  inferSummary,
  extractSessionDate,
} = require("../scripts/lib/domain/echo-format");

const speakers = {
  human: { id: "vincent", role: "human" },
  ai: { id: "ai", role: "ai", model: "gpt-test" },
};

test("createTurn strips the human prefix once", () => {
  assert.deepEqual(
    createTurn({ speaker: "vincent", content: "我：hello" }, { speakers }),
    {
      id: null,
      speaker: "vincent",
      role: "human",
      content: "hello",
      reply_to: null,
      model: undefined,
    }
  );
});

test("createTurn strips the AI heading and preserves model hint", () => {
  const turn = createTurn(
    { speaker: "ai", content: "## ai 的回复\n\nanswer", model: "gpt-5" },
    { speakers }
  );

  assert.equal(turn.role, "ai");
  assert.equal(turn.content, "answer");
  assert.equal(turn.model, "gpt-5");
});

test("createTurn defaults unknown AI model from speakers", () => {
  const turn = createTurn({ speaker: "ai", content: "answer" }, { speakers });

  assert.equal(turn.model, "gpt-test");
});

test("createArticle assigns turn ids and AI reply_to from previous human turn", () => {
  const article = createArticle({
    id: "session-test",
    created_at: "2026-05-21T00:00:00+08:00",
    speakers,
    turns: [
      { speaker: "vincent", content: "我：question" },
      { speaker: "ai", content: "answer" },
    ],
  });

  assert.equal(article.turns[0].id, "t001");
  assert.equal(article.turns[1].id, "t002");
  assert.equal(article.turns[1].reply_to, "t001");
  assert.equal(article.participants.length, 2);
  assert.deepEqual(article.participants[0], { id: "vincent", role: "human" });
  assert.deepEqual(article.participants[1], { id: "ai", role: "ai", model: "gpt-test" });
});

test("inferTitle and inferSummary fall back for empty conversations", () => {
  assert.equal(inferTitle([]), "未命名对话");
  assert.equal(inferSummary([]), "未命名对话");
});

test("inferTitle and inferSummary normalize whitespace and truncate long text", () => {
  const long = "我：" + "知识 ".repeat(40);
  const turns = [{ speaker: "vincent", role: "human", content: long }];

  assert.equal(inferTitle(turns).length, 60);
  assert.equal(inferSummary(turns).length, 80);
  assert.match(inferTitle(turns), /\.\.\.$/);
  assert.match(inferSummary(turns), /\.\.\.$/);
});

test("toMarkdown serializes canonical frontmatter and turn markers", () => {
  const article = createArticle({
    id: "session-test",
    title: "A title",
    created_at: "2026-05-21T00:00:00+08:00",
    updated_at: "2026-05-21T01:00:00+08:00",
    tags: ["AI"],
    speakers,
    turns: [
      { speaker: "vincent", content: "hello" },
      { speaker: "ai", content: "world" },
    ],
  });

  const md = toMarkdown(article);

  assert.match(md, /^---\n/);
  assert.match(md, /id: session-test/);
  assert.match(md, /<!-- turn: t001 speaker=vincent -->/);
  assert.match(md, /<!-- turn: t002 speaker=ai reply_to=t001 -->/);
  assert.match(md, /<!-- ECHO_COMMENTS_START -->/);
  assert.match(md, /<!-- ECHO_COMMENTS_END -->/);
});

test("extractSessionDate handles versioned session names and fallback names", () => {
  assert.equal(extractSessionDate("session-2026-05-21-v3"), "2026-05-21");
  assert.equal(extractSessionDate("session-custom-v3"), "custom");
});
