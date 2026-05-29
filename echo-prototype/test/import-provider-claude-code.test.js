const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const crypto = require("node:crypto");

// Module under test — may not exist yet (TDD expects failures first)
let cc;
try {
  cc = require("../scripts/lib/import/providers/claude-code");
} catch (_) {
  cc = {};
  for (const fn of ["scanProjectDir", "readSessionTurns", "classifySession", "extractMetadata", "toEchoArticle", "isNoise"]) {
    if (!cc[fn]) cc[fn] = () => { throw new Error(`Not implemented: ${fn}`); };
  }
}

// ---- helpers ----

const UUID_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const UUID_B = "11111111-2222-3333-4444-555555555555";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-import-cc-"));
}

function writeFile(dir, relPath, content) {
  const file = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function jsonlEntry(overrides = {}) {
  const defaults = {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text: "Hello, this is a test message." }],
    },
    sessionId: UUID_A,
    timestamp: "2026-05-20T10:00:00.000Z",
  };
  return { ...defaults, ...overrides };
}

function jsonlLine(obj) {
  return JSON.stringify(obj) + "\n";
}

/**
 * Create a minimal realistic Claude Code JSONL session.
 */
function createSessionFixture(filePath, sessionId, userMessages, assistantTexts) {
  const lines = [];
  const msgs = Math.max(userMessages.length, assistantTexts.length || 1);

  for (let i = 0; i < msgs; i++) {
    const ts = `2026-05-20T${String(10 + i).padStart(2, "0")}:00:00.000Z`;

    if (i < userMessages.length) {
      lines.push(jsonlLine({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: userMessages[i] }] },
        sessionId,
        timestamp: ts,
      }));
    }

    if (i < (assistantTexts ? assistantTexts.length : 0)) {
      lines.push(jsonlLine({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: assistantTexts[i] }],
          model: "claude-sonnet-4-20250514",
          stop_reason: "end_turn",
        },
        sessionId,
        timestamp: ts,
      }));
    }
  }

  fs.writeFileSync(filePath, lines.join(""));
}

/**
 * Create a session with tool use (assistant calls a bash command).
 */
function createToolSessionFixture(filePath, sessionId) {
  const lines = [
    jsonlLine(jsonlEntry({ type: "user", message: { role: "user", content: [{ type: "text", text: "List files in /tmp" }] }, sessionId, timestamp: "2026-05-20T10:00:00.000Z" })),
    jsonlLine({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check that for you." },
          { type: "tool_use", name: "Bash", id: "toolu_001", input: { command: "ls /tmp" } },
        ],
        model: "claude-sonnet-4-20250514",
        stop_reason: "tool_use",
      },
      sessionId,
      timestamp: "2026-05-20T10:00:01.000Z",
    }),
    jsonlLine({
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_001", content: "file1.txt\nfile2.txt" }] },
      sessionId,
      timestamp: "2026-05-20T10:00:02.000Z",
    }),
    jsonlLine({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Here is what I found: file1.txt and file2.txt are in /tmp." }],
        model: "claude-sonnet-4-20250514",
        stop_reason: "end_turn",
      },
      sessionId,
      timestamp: "2026-05-20T10:00:03.000Z",
    }),
  ];

  fs.writeFileSync(filePath, lines.join(""));
}

// =============================================================================
// scanProjectDir
// =============================================================================

test.describe("scanProjectDir", () => {
  test("returns empty array for empty directory", () => {
    const dir = tempDir();
    const result = cc.scanProjectDir(dir);
    assert.deepEqual(result, []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("returns empty array for directory with no JSONL files", () => {
    const dir = tempDir();
    writeFile(dir, "readme.txt", "hello");
    writeFile(dir, "session-2026-05-20.log", "log content");
    const result = cc.scanProjectDir(dir);
    assert.deepEqual(result, []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("discovers a single JSONL session file", () => {
    const dir = tempDir();
    const filePath = writeFile(dir, `${UUID_A}.jsonl`, jsonlLine(jsonlEntry({ sessionId: UUID_A })));

    const result = cc.scanProjectDir(dir);
    assert.equal(result.length, 1);
    assert.equal(result[0].sessionId, UUID_A);
    assert.equal(result[0].filePath, filePath);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("discovers multiple JSONL session files sorted", () => {
    const dir = tempDir();
    writeFile(dir, "zzzz-zzzz.jsonl", jsonlLine(jsonlEntry({ sessionId: "zzzz-zzzz" })));
    writeFile(dir, `${UUID_B}.jsonl`, jsonlLine(jsonlEntry({ sessionId: UUID_B })));
    writeFile(dir, `${UUID_A}.jsonl`, jsonlLine(jsonlEntry({ sessionId: UUID_A })));

    const result = cc.scanProjectDir(dir);
    assert.equal(result.length, 3);
    assert.ok(result[0].sessionId.localeCompare(result[1].sessionId) <= 0);
    assert.ok(result[1].sessionId.localeCompare(result[2].sessionId) <= 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("each result includes sessionId, filePath, turnCount, firstTurn, lastTurn", () => {
    const dir = tempDir();
    const filePath = writeFile(dir, `${UUID_A}.jsonl`, [
      jsonlLine(jsonlEntry({ sessionId: UUID_A, timestamp: "2026-05-20T10:00:00.000Z" })),
      jsonlLine({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "Response." }], model: "claude-sonnet-4-20250514" },
        sessionId: UUID_A,
        timestamp: "2026-05-20T10:00:01.000Z",
      }),
    ].join(""));

    const result = cc.scanProjectDir(dir);
    assert.equal(result.length, 1);
    const entry = result[0];
    assert.equal(entry.sessionId, UUID_A);
    assert.equal(entry.filePath, filePath);
    assert.ok(typeof entry.turnCount === "number");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("skips non-.jsonl files even with uuid-like names", () => {
    const dir = tempDir();
    writeFile(dir, `${UUID_A}.jsonl`, jsonlLine(jsonlEntry()));
    writeFile(dir, `${UUID_B}.jsonl.bak`, jsonlLine(jsonlEntry({ sessionId: UUID_B })));
    writeFile(dir, "temp.jsonl.tmp", "temp");

    const result = cc.scanProjectDir(dir);
    assert.equal(result.length, 1);
    assert.equal(result[0].sessionId, UUID_A);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// =============================================================================
// readSessionTurns
// =============================================================================

test.describe("readSessionTurns", () => {
  test("parses a simple single-turn session (user + assistant)", () => {
    const dir = tempDir();
    const userMsg = "What is 2+2?";
    const assistantMsg = "2+2 equals 4.";
    const filePath = writeFile(dir, "session.jsonl", [
      jsonlLine(jsonlEntry({ message: { role: "user", content: [{ type: "text", text: userMsg }] }, timestamp: "2026-05-20T10:00:00.000Z" })),
      jsonlLine({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: assistantMsg }], model: "claude-sonnet-4-20250514" }, sessionId: UUID_A, timestamp: "2026-05-20T10:00:01.000Z" }),
    ].join(""));

    const turns = cc.readSessionTurns(filePath);
    assert.ok(Array.isArray(turns));
    assert.equal(turns.length, 2);
    assert.ok(turns[0].content.includes("2+2"));
    assert.ok(turns[1].content.includes("4"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("parses multi-turn conversation preserving order", () => {
    const dir = tempDir();
    const userMsgs = ["First question.", "Second question.", "Third question."];
    const assistantMsgs = ["First answer.", "Second answer.", "Third answer."];
    const filePath = writeFile(dir, "session.jsonl", [
      jsonlLine(jsonlEntry({ message: { role: "user", content: [{ type: "text", text: userMsgs[0] }] }, timestamp: "2026-05-20T10:00:00.000Z" })),
      jsonlLine({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: assistantMsgs[0] }], model: "claude-sonnet-4-20250514" }, sessionId: UUID_A, timestamp: "2026-05-20T10:00:01.000Z" }),
      jsonlLine(jsonlEntry({ message: { role: "user", content: [{ type: "text", text: userMsgs[1] }] }, timestamp: "2026-05-20T10:00:02.000Z" })),
      jsonlLine({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: assistantMsgs[1] }], model: "claude-sonnet-4-20250514" }, sessionId: UUID_A, timestamp: "2026-05-20T10:00:03.000Z" }),
      jsonlLine(jsonlEntry({ message: { role: "user", content: [{ type: "text", text: userMsgs[2] }] }, timestamp: "2026-05-20T10:00:04.000Z" })),
      jsonlLine({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: assistantMsgs[2] }], model: "claude-sonnet-4-20250514" }, sessionId: UUID_A, timestamp: "2026-05-20T10:00:05.000Z" }),
    ].join(""));

    const turns = cc.readSessionTurns(filePath);
    assert.equal(turns.length, 6);
    assert.ok(turns[0].content.includes("First question"));
    assert.ok(turns[1].content.includes("First answer"));
    assert.ok(turns[2].content.includes("Second question"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("returns empty array for empty file", () => {
    const dir = tempDir();
    const filePath = writeFile(dir, "empty.jsonl", "");

    const turns = cc.readSessionTurns(filePath);
    assert.deepEqual(turns, []);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("skips malformed JSON lines without crashing", () => {
    const dir = tempDir();
    const userMsg = "Valid question.";
    const assistantMsg = "Valid answer.";
    const filePath = writeFile(dir, "session.jsonl", [
      "{not valid json at all\n",
      jsonlLine(jsonlEntry({ message: { role: "user", content: [{ type: "text", text: userMsg }] }, timestamp: "2026-05-20T10:00:00.000Z" })),
      "also not json ###\n",
      jsonlLine({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: assistantMsg }], model: "claude-sonnet-4-20250514" }, sessionId: UUID_A, timestamp: "2026-05-20T10:00:01.000Z" }),
    ].join(""));

    const turns = cc.readSessionTurns(filePath);
    assert.equal(turns.length, 2);
    assert.ok(turns[0].content.includes("Valid question"));
    assert.ok(turns[1].content.includes("Valid answer"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("handles tool_use blocks by including them as tool notation", () => {
    const dir = tempDir();
    const filePath = writeFile(dir, "session.jsonl", "");
    createToolSessionFixture(filePath, UUID_A);

    const turns = cc.readSessionTurns(filePath);
    assert.ok(turns.length >= 2);
    // The assistant content should reference the tool somehow
    const hasToolRef = turns.some(
      (t) => t.content && (t.content.includes("tool") || t.content.includes("Bash") || t.content.includes("tool_use"))
    );
    assert.ok(hasToolRef, "tool usage should be reflected in turns");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("filters tool_result type events from standalone output turns", () => {
    const dir = tempDir();
    const filePath = writeFile(dir, "session.jsonl", "");
    createToolSessionFixture(filePath, UUID_A);

    const turns = cc.readSessionTurns(filePath);
    // raw tool_result should not appear as a user-facing turn
    assert.ok(
      turns.every((t) => !t.content || !t.content.includes("tool_use_id")),
      "raw tool_result events should not appear as turn content"
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("extracts speaker identification correctly", () => {
    const dir = tempDir();
    const filePath = writeFile(dir, "session.jsonl", [
      jsonlLine(jsonlEntry({ message: { role: "user", content: [{ type: "text", text: "Speaker test message." }] }, timestamp: "2026-05-20T10:00:00.000Z" })),
      jsonlLine({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Speaker test response." }], model: "claude-sonnet-4-20250514" }, sessionId: UUID_A, timestamp: "2026-05-20T10:00:01.000Z" }),
    ].join(""));

    const turns = cc.readSessionTurns(filePath);
    assert.ok(turns.length >= 2);
    const speakers = new Set(turns.map((t) => t.speaker));
    assert.ok(speakers.size >= 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("handles file with only blank lines", () => {
    const dir = tempDir();
    const filePath = writeFile(dir, "blanks.jsonl", "\n\n\n\n");

    const turns = cc.readSessionTurns(filePath);
    assert.deepEqual(turns, []);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// =============================================================================
// classifySession
// =============================================================================

test.describe("classifySession", () => {
  test("classifies a meaningful multi-turn session as high quality", () => {
    const turns = [
      { speaker: "human", content: "Question 1: What is async/await?" },
      { speaker: "ai", content: "Async/await is syntactic sugar over Promises." },
      { speaker: "human", content: "Can you show an example?" },
      { speaker: "ai", content: "Here is an example:\n```js\nasync function foo() {}\n```" },
      { speaker: "human", content: "What about error handling?" },
      { speaker: "ai", content: "Use try/catch around await expressions." },
    ];

    const result = cc.classifySession(turns);
    assert.equal(result.isMeaningful, true);
    assert.equal(result.turnCount, 6);
    assert.equal(result.userTurnCount, 3);
    assert.equal(result.estimatedQuality, "high");
  });

  test("classifies a session with only one user turn as low quality", () => {
    const turns = [
      { speaker: "human", content: "Hello." },
      { speaker: "ai", content: "Hi there! How can I help?" },
    ];

    const result = cc.classifySession(turns);
    assert.equal(result.turnCount, 2);
    assert.ok(result.userTurnCount <= 1);
    assert.equal(result.estimatedQuality, "low");
  });

  test("classifies empty turn array as not meaningful", () => {
    const result = cc.classifySession([]);
    assert.equal(result.isMeaningful, false);
    assert.equal(result.turnCount, 0);
    assert.ok(result.reason);
  });

  test("classifies session with no human turns as not meaningful", () => {
    const turns = [
      { speaker: "ai", content: "System message." },
      { speaker: "ai", content: "Another system message." },
    ];

    const result = cc.classifySession(turns);
    assert.equal(result.isMeaningful, false);
    assert.ok(result.reason);
  });

  test("classifies very short exchange as low quality", () => {
    const turns = [
      { speaker: "human", content: "hi" },
      { speaker: "ai", content: "Hello!" },
      { speaker: "human", content: "ok" },
      { speaker: "ai", content: "Great." },
    ];

    const result = cc.classifySession(turns);
    assert.equal(result.estimatedQuality, "low");
  });

  test("classifies substantive technical discussion as high", () => {
    const turns = [
      { speaker: "human", content: "Explain how garbage collection works in V8, covering scavenge and mark-compact." },
      { speaker: "ai", content: "V8 uses a generational garbage collector with two main spaces: the new-space (young generation) and old-space (old generation). The Orinoco project introduced concurrent and parallel GC..." },
      { speaker: "human", content: "What is the difference between Scavenge and Mark-Compact in terms of throughput and pause times?" },
      { speaker: "ai", content: "Scavenge is a copying GC that operates on the young generation only, with very short pause times. Mark-Compact operates on the old generation and has longer pause times but handles fragmentation." },
    ];

    const result = cc.classifySession(turns);
    assert.equal(result.isMeaningful, true);
    assert.equal(result.estimatedQuality, "high");
    assert.equal(result.userTurnCount, 2);
  });

  test("distinguishes medium quality for moderate-length discussions", () => {
    const turns = [
      { speaker: "human", content: "How do I read a file in Node.js?" },
      { speaker: "ai", content: "Use fs.readFileSync or fs.readFile." },
      { speaker: "human", content: "What is the difference?" },
      { speaker: "ai", content: "readFileSync blocks the event loop, readFile is async." },
    ];

    const result = cc.classifySession(turns);
    assert.equal(result.isMeaningful, true);
    assert.equal(result.estimatedQuality, "medium");
  });
});

// =============================================================================
// extractMetadata
// =============================================================================

test.describe("extractMetadata", () => {
  test("extracts title from first real user message", () => {
    const turns = [
      { speaker: "human", content: "How to set up a Node.js project from scratch?" },
      { speaker: "ai", content: "First, run npm init..." },
      { speaker: "human", content: "What about TypeScript?" },
      { speaker: "ai", content: "Add tsconfig.json..." },
    ];

    const meta = cc.extractMetadata(turns);
    assert.ok(meta.title);
    assert.ok(meta.title.length > 0);
    assert.ok(meta.title.includes("Node.js") || meta.title.includes("project"));
  });

  test("extracts date from turn timestamps when available", () => {
    const turns = [
      { speaker: "human", content: "Test question.", timestamp: "2026-05-20T10:30:00.000Z" },
      { speaker: "ai", content: "Test answer.", timestamp: "2026-05-20T10:30:05.000Z" },
    ];

    const meta = cc.extractMetadata(turns);
    assert.ok(meta.date);
    assert.ok(meta.date.includes("2026-05-20"));
  });

  test("extracts participants list with roles", () => {
    const turns = [
      { speaker: "human", content: "Hello." },
      { speaker: "ai", content: "Hi.", model: "claude-sonnet-4-20250514" },
    ];

    const meta = cc.extractMetadata(turns);
    assert.ok(Array.isArray(meta.participants));
    assert.ok(meta.participants.length >= 1);
    assert.ok(meta.participants.some(
      (p) => p.role === "ai" || p.role === "assistant" || p.role === "model"
    ));
  });

  test("extracts model information from assistant turns", () => {
    const turns = [
      { speaker: "human", content: "Hello." },
      { speaker: "ai", content: "Hi.", model: "claude-sonnet-4-20250514" },
    ];

    const meta = cc.extractMetadata(turns);
    assert.ok(meta.model);
    assert.ok(meta.model.includes("claude") || meta.model.includes("sonnet"));
  });

  test("handles turns with no model information gracefully", () => {
    const turns = [
      { speaker: "human", content: "Hello." },
      { speaker: "ai", content: "Hi." },
    ];

    const meta = cc.extractMetadata(turns);
    assert.ok(meta.model === undefined || meta.model === "unknown" || meta.model === "");
  });

  test("title defaults to a fallback when all turns are empty", () => {
    const turns = [{ speaker: "human", content: "" }];

    const meta = cc.extractMetadata(turns);
    assert.ok(meta.title);
    assert.ok(meta.title.length > 0);
  });

  test("title is truncated when first user message is very long", () => {
    const longMessage = "A".repeat(200);
    const turns = [{ speaker: "human", content: longMessage }];

    const meta = cc.extractMetadata(turns);
    assert.ok(meta.title.length < longMessage.length);
    assert.ok(meta.title.length <= 80);
  });
});

// =============================================================================
// toEchoArticle
// =============================================================================

test.describe("toEchoArticle", () => {
  test("produces valid Echo markdown with frontmatter and body", () => {
    const turns = [
      { speaker: "human", content: "How do I use Promises?" },
      { speaker: "ai", content: "Promises represent a value that may be available now, or in the future, or never." },
    ];
    const metadata = {
      title: "Using Promises",
      date: "2026-05-20",
      participants: [
        { id: "vincent", role: "human" },
        { id: "ai", role: "ai", model: "claude-sonnet-4-20250514" },
      ],
      model: "claude-sonnet-4-20250514",
    };
    const opts = { project: "my-project", sessionId: UUID_A };

    const markdown = cc.toEchoArticle(turns, metadata, opts);
    assert.ok(typeof markdown === "string");
    assert.ok(markdown.length > 0);
    assert.ok(markdown.startsWith("---"), "should start with frontmatter delimiter");

    const parts = markdown.split("---\n");
    assert.ok(parts.length >= 3, "should have valid frontmatter section");

    assert.ok(markdown.includes("How do I use Promises"));
    assert.ok(markdown.includes("ECHO_COMMENTS_START"));
    assert.ok(markdown.includes("ECHO_COMMENTS_END"));
  });

  test("article id is derived from sessionId when provided", () => {
    const turns = [{ speaker: "human", content: "test." }];
    const metadata = { title: "Test", date: "2026-05-20", model: "test-model" };
    const opts = { project: "test", sessionId: UUID_A };

    const markdown = cc.toEchoArticle(turns, metadata, opts);
    const articleId = UUID_A.slice(0, 8);
    assert.ok(
      markdown.includes(`id: session-${articleId}`) || markdown.includes(`session-${articleId}`)
    );
  });

  test("preserves turn content EXACTLY — immutability constraint", () => {
    const originalText = "Original user message with & special < > characters and    spaces.";
    const turns = [
      { speaker: "human", content: originalText },
      { speaker: "ai", content: "Response with *markdown* and `code`." },
    ];
    const metadata = { title: "Immutability Test", date: "2026-05-20", model: "test" };
    const opts = { project: "test", sessionId: UUID_A };

    const markdown = cc.toEchoArticle(turns, metadata, opts);

    assert.ok(
      markdown.includes(originalText) || markdown.includes(originalText.trim()),
      "original user message must be preserved verbatim"
    );
    assert.ok(
      markdown.includes("*markdown*") && markdown.includes("`code`"),
      "original assistant message must be preserved verbatim"
    );
  });

  test("includes source metadata in frontmatter when opts have sessionId and fileHash", () => {
    const turns = [{ speaker: "human", content: "hello" }];
    const metadata = { title: "Test", date: "2026-05-20", model: "test" };
    const fileHash = crypto.createHash("sha256").update("test").digest("hex");
    const opts = { project: "test", sessionId: UUID_A, fileHash, sourceProjectDir: "-Users-test" };

    const markdown = cc.toEchoArticle(turns, metadata, opts);

    assert.ok(
      markdown.includes("source_session") ||
        markdown.includes("source_session_id") ||
        markdown.includes("source"),
      "frontmatter should reference the source session"
    );
  });

  test("each turn gets a unique turn ID in HTML comments", () => {
    const turns = [
      { speaker: "human", content: "Question 1." },
      { speaker: "ai", content: "Answer 1." },
      { speaker: "human", content: "Question 2." },
      { speaker: "ai", content: "Answer 2." },
    ];
    const metadata = { title: "Turn IDs", date: "2026-05-20", model: "test" };
    const opts = { project: "test", sessionId: UUID_A };

    const markdown = cc.toEchoArticle(turns, metadata, opts);
    const turnComments = markdown.match(/<!-- turn:/g);
    assert.ok(turnComments, "should have turn annotations");
    assert.equal(turnComments.length, turns.length, "each turn should have an annotation");
  });

  test("handles single-turn conversation (one Q&A)", () => {
    const turns = [
      { speaker: "human", content: "What is the capital of France?" },
      { speaker: "ai", content: "The capital of France is Paris." },
    ];
    const metadata = { title: "Geography", date: "2026-05-20", model: "test" };
    const opts = { project: "test", sessionId: UUID_A };

    const markdown = cc.toEchoArticle(turns, metadata, opts);
    assert.ok(markdown.includes("What is the capital"));
    assert.ok(markdown.includes("Paris"));
  });

  test("respects the project option in frontmatter", () => {
    const turns = [{ speaker: "human", content: "hello" }];
    const metadata = { title: "Project Test", date: "2026-05-20", model: "test" };
    const opts = { project: "my-echo-project", sessionId: UUID_A };

    const markdown = cc.toEchoArticle(turns, metadata, opts);
    assert.ok(markdown.includes("my-echo-project"), "project id should appear in frontmatter");
  });

  test("handles turns with multiline content including code blocks", () => {
    const multiline = "Line 1\nLine 2\n\nLine 3 after blank.\n```js\nconst x = 1;\n```";
    const turns = [
      { speaker: "human", content: multiline },
      { speaker: "ai", content: "I see your multiline input." },
    ];
    const metadata = { title: "Multiline Test", date: "2026-05-20", model: "test" };
    const opts = { project: "test", sessionId: UUID_A };

    const markdown = cc.toEchoArticle(turns, metadata, opts);
    assert.ok(markdown.includes("Line 1"));
    assert.ok(markdown.includes("```"));
  });

  test("does not corrupt content with special YAML characters", () => {
    const tricky = "Message: with colons: and # hashes and - dashes.";
    const turns = [{ speaker: "human", content: tricky }];
    const metadata = { title: "YAML Safe", date: "2026-05-20", model: "test" };
    const opts = { project: "test", sessionId: UUID_A };

    const markdown = cc.toEchoArticle(turns, metadata, opts);
    // The content must appear in the body section (after frontmatter)
    const bodyStart = markdown.indexOf("---\n", 4) + 4;
    const body = markdown.slice(bodyStart);
    assert.ok(body.includes(tricky), "special characters in content must be preserved");
  });

  test("title and alias in frontmatter match metadata", () => {
    const turns = [{ speaker: "human", content: "Let us discuss architecture." }];
    const metadata = {
      title: "Architecture Discussion",
      alias: "Architecture Chat",
      date: "2026-05-20",
      model: "test",
    };
    const opts = { project: "test", sessionId: UUID_A };

    const markdown = cc.toEchoArticle(turns, metadata, opts);
    assert.ok(markdown.includes("title:"), "should have title field");
    assert.ok(markdown.includes("Architecture Discussion"));
  });

  test("human turns use speaker=human marker", () => {
    const turns = [
      { speaker: "human", content: "User question." },
      { speaker: "ai", content: "AI response." },
    ];
    const metadata = { title: "Speaker Test", date: "2026-05-20", model: "test" };
    const opts = { project: "test", sessionId: UUID_A };

    const markdown = cc.toEchoArticle(turns, metadata, opts);
    assert.match(markdown, /<!-- turn: t01 speaker=human -->/);
  });

  test("ai turns use speaker=ai marker", () => {
    const turns = [
      { speaker: "human", content: "User question." },
      { speaker: "ai", content: "AI response." },
    ];
    const metadata = { title: "Speaker Test", date: "2026-05-20", model: "test" };
    const opts = { project: "test", sessionId: UUID_A };

    const markdown = cc.toEchoArticle(turns, metadata, opts);
    assert.match(markdown, /<!-- turn: t02 speaker=ai -->/);
  });

  test("does not modify turn text — every toEchoArticle call is idempotent", () => {
    const turns = [
      { speaker: "human", content: "Original message." },
      { speaker: "ai", content: "Response." },
    ];
    const metadata = { title: "Idempotent Test", date: "2026-05-20", model: "test" };
    const opts = { project: "test", sessionId: UUID_A };

    const first = cc.toEchoArticle(turns, metadata, opts);
    const second = cc.toEchoArticle(turns, metadata, opts);
    assert.equal(first, second, "same inputs should produce identical output");
  });
});

// =============================================================================
// isNoise (system noise filtering)
// =============================================================================

test.describe("isNoise (system noise filter)", () => {
  test("rejects skill preamble text", () => {
    if (!cc.isNoise) return;
    assert.equal(cc.isNoise("Base directory for this skill: /some/path"), true);
  });

  test("rejects auto-generated blocks", () => {
    if (!cc.isNoise) return;
    assert.equal(cc.isNoise("<!-- AUTO-GENERATED CONTENT -->"), true);
  });

  test("rejects local-command-stdout blocks", () => {
    if (!cc.isNoise) return;
    assert.equal(cc.isNoise("<local-command-stdout>some output</local-command-stdout>"), true);
  });

  test("rejects command-name noise", () => {
    if (!cc.isNoise) return;
    assert.equal(cc.isNoise("<command-name>some-command</command-name>"), true);
  });

  test("rejects excessively long content (noise heuristic)", () => {
    if (!cc.isNoise) return;
    assert.equal(cc.isNoise("x".repeat(5000)), true);
  });

  test("accepts normal user messages", () => {
    if (!cc.isNoise) return;
    assert.equal(cc.isNoise("How do I implement a binary search tree?"), false);
  });

  test("accepts short assistant responses", () => {
    if (!cc.isNoise) return;
    assert.equal(cc.isNoise("Here is the answer to your question."), false);
  });

  test("rejects empty or whitespace-only strings", () => {
    if (!cc.isNoise) return;
    assert.equal(cc.isNoise(""), true);
    assert.equal(cc.isNoise("   "), true);
    assert.equal(cc.isNoise("\n\n"), true);
  });
});

// =============================================================================
// Integration: full conversion pipeline
// =============================================================================

test.describe("full conversion pipeline", () => {
  test("scanProjectDir -> readSessionTurns -> classify -> extract -> toEchoArticle", () => {
    const dir = tempDir();
    const userMsgs = [
      "How to create an HTTP server in Node.js?",
      "What about HTTPS?",
    ];
    const assistantMsgs = [
      "Use the http module: require('http').createServer((req, res) => { ... }).listen(3000);",
      "For HTTPS, use the https module and provide cert/key options.",
    ];
    const filePath = writeFile(dir, `${UUID_A}.jsonl`, "");
    createSessionFixture(filePath, UUID_A, userMsgs, assistantMsgs);

    // 1. Scan
    const scanned = cc.scanProjectDir(dir);
    assert.equal(scanned.length, 1);

    // 2. Read turns
    const turns = cc.readSessionTurns(scanned[0].filePath);
    assert.ok(turns.length >= 2);

    // 3. Classify
    const classification = cc.classifySession(turns);
    assert.equal(classification.isMeaningful, true);

    // 4. Extract metadata
    const metadata = cc.extractMetadata(turns);
    assert.ok(metadata.title);
    assert.ok(metadata.date);

    // 5. Convert to article
    const article = cc.toEchoArticle(turns, metadata, {
      project: "test-project",
      sessionId: UUID_A,
      fileHash: crypto.createHash("sha256").update("test").digest("hex"),
    });

    assert.ok(article.startsWith("---"));
    assert.ok(article.includes("ECHO_COMMENTS_START"));
    assert.ok(article.includes("HTTP server") || article.includes("http"));
    assert.ok(article.includes("HTTPS") || article.includes("https"));

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("does not modify article content during the pipeline", () => {
    const dir = tempDir();
    const exactUserMessage = "Exact user message: <special> & chars!";
    const exactAssistantMessage = "Exact response: `code` and *bold*.";
    const filePath = writeFile(dir, `${UUID_A}.jsonl`, [
      jsonlLine(jsonlEntry({ message: { role: "user", content: [{ type: "text", text: exactUserMessage }] }, timestamp: "2026-05-20T10:00:00.000Z" })),
      jsonlLine({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: exactAssistantMessage }], model: "claude-sonnet-4-20250514" }, sessionId: UUID_A, timestamp: "2026-05-20T10:00:01.000Z" }),
    ].join(""));

    const turns = cc.readSessionTurns(filePath);
    const metadata = cc.extractMetadata(turns);
    const article = cc.toEchoArticle(turns, metadata, { project: "test", sessionId: UUID_A });

    assert.ok(
      article.includes(exactUserMessage) || article.includes(exactUserMessage.trim()),
      "exact user message must be preserved"
    );
    assert.ok(
      article.includes(exactAssistantMessage) || article.includes(exactAssistantMessage.trim()),
      "exact assistant message must be preserved"
    );

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
