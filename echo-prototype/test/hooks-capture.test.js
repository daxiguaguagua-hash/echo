const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  extractAuqBlock,
  claudeProjectDirName,
  projectPathFromTranscriptPath,
  resolveBufferRoot,
  handleUserPromptSubmit,
  handleStop,
  handleStopFailure,
} = require("../scripts/lib/hooks/capture");
const { registerProject } = require("../scripts/lib/usecases/project-registry");

// --- helpers ---

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-capture-test-"));
}

function writeFixture(dir, relPath, text) {
  const file = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function jsonl(entries) {
  return entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

test("projectPathFromTranscriptPath decodes Claude project transcript paths", () => {
  const decoded = projectPathFromTranscriptPath(
    "/Users/vincenthuang/.claude/projects/-Users-vincenthuang-myHomeworkHelper/session.jsonl"
  );
  assert.equal(decoded, "/Users/vincenthuang/myHomeworkHelper");
});

test("claudeProjectDirName encodes project roots for exact registry matching", () => {
  assert.equal(
    claudeProjectDirName("/Users/vincenthuang/my-homework-helper"),
    "-Users-vincenthuang-my-homework-helper"
  );
});

test("resolveBufferRoot routes by transcript path when cwd is missing or stale", () => {
  const oldEchoHome = process.env.ECHO_HOME;
  const oldCwd = process.cwd();
  const echoHome = tempDir();
  const projectRoot = path.join(os.tmpdir(), `echoCaptureProject${Date.now()}`, "myHomeworkHelper");

  try {
    process.env.ECHO_HOME = echoHome;
    fs.mkdirSync(projectRoot, { recursive: true });
    const registered = registerProject(projectRoot, { echoHome, projectId: "myhomeworkhelper" });
    process.chdir(echoHome);

    const result = resolveBufferRoot({
      transcript_path: path.join(
        os.homedir(),
        ".claude/projects/-" + projectRoot.slice(1).replace(/\//g, "-") + "/abc.jsonl"
      ),
    });

    assert.equal(result.project.projectId, "myhomeworkhelper");
    assert.equal(result.bufferRoot, registered.dataRoot);
  } finally {
    if (oldEchoHome === undefined) delete process.env.ECHO_HOME;
    else process.env.ECHO_HOME = oldEchoHome;
    process.chdir(oldCwd);
    fs.rmSync(echoHome, { recursive: true, force: true });
    fs.rmSync(path.dirname(projectRoot), { recursive: true, force: true });
  }
});

test("resolveBufferRoot handles registered project paths containing hyphens", () => {
  const oldEchoHome = process.env.ECHO_HOME;
  const oldCwd = process.cwd();
  const echoHome = tempDir();
  const projectRoot = path.join(os.tmpdir(), `echoCaptureProject${Date.now()}`, "my-homework-helper");

  try {
    process.env.ECHO_HOME = echoHome;
    fs.mkdirSync(projectRoot, { recursive: true });
    const registered = registerProject(projectRoot, { echoHome, projectId: "my-homework-helper" });
    process.chdir(echoHome);

    const result = resolveBufferRoot({
      transcript_path: path.join(os.homedir(), ".claude/projects", claudeProjectDirName(projectRoot), "abc.jsonl"),
    });

    assert.equal(result.project.projectId, "my-homework-helper");
    assert.equal(result.bufferRoot, registered.dataRoot);
  } finally {
    if (oldEchoHome === undefined) delete process.env.ECHO_HOME;
    else process.env.ECHO_HOME = oldEchoHome;
    process.chdir(oldCwd);
    fs.rmSync(echoHome, { recursive: true, force: true });
    fs.rmSync(path.dirname(projectRoot), { recursive: true, force: true });
  }
});

// --- transcript fixtures ---

const singleAuqTranscript = jsonl([
  {
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "Before question.\n" },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "AskUserQuestion",
          input: {
            questions: [{
              header: "Scope",
              question: "Ship what?",
              options: [
                { label: "MVP", description: "Smallest useful version" },
                { label: "Full", description: "Everything" },
              ],
            }],
          },
        },
        { type: "text", text: "After question.\n" },
      ],
    },
  },
  {
    type: "user",
    message: {
      content: [{
        type: "tool_result",
        tool_use_id: "toolu_1",
        content: 'Your questions have been answered: "Ship what?"="MVP". You can now continue with these answers in mind.',
      }],
    },
  },
]);

const reversedAnswerTranscript = jsonl([
  {
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use", id: "toolu_A", name: "AskUserQuestion",
          input: { questions: [{ header: "Q1", question: "Question A?", options: [{ label: "A1", description: "..." }] }] },
        },
        {
          type: "tool_use", id: "toolu_B", name: "AskUserQuestion",
          input: { questions: [{ header: "Q2", question: "Question B?", options: [{ label: "B1", description: "..." }] }] },
        },
      ],
    },
  },
  {
    type: "user",
    message: {
      content: [{
        type: "tool_result", tool_use_id: "toolu_B",
        content: 'Your questions have been answered: "Question B?"="B1". You can now continue.',
      }],
    },
  },
  {
    type: "user",
    message: {
      content: [{
        type: "tool_result", tool_use_id: "toolu_A",
        content: 'Your questions have been answered: "Question A?"="A1". You can now continue.',
      }],
    },
  },
]);

const multiQuestionTranscript = jsonl([
  {
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          id: "toolu_multi",
          name: "AskUserQuestion",
          input: {
            questions: [
              { header: "Q1", question: "First?", options: [{ label: "X", description: "x" }] },
              { header: "Q2", question: "Second?", options: [{ label: "Y", description: "y" }] },
            ],
          },
        },
      ],
    },
  },
  {
    type: "user",
    message: {
      content: [{
        type: "tool_result",
        tool_use_id: "toolu_multi",
        content: 'Your questions have been answered: "First?"="X", "Second?"="Y". You can now continue.',
      }],
    },
  },
]);

const noAnswerTranscript = jsonl([
  {
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use", id: "toolu_na", name: "AskUserQuestion",
          input: { questions: [{ header: "H", question: "Q?", options: [{ label: "Opt", description: "desc" }] }] },
        },
      ],
    },
  },
]);

const noTextTranscript = jsonl([
  {
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "Just some text.\n" },
      ],
    },
  },
]);

// Real-world transcript: Claude Code sends each text/AUQ/answer as SEPARATE entries
const separateEntryTranscript = jsonl([
  { type: "assistant", message: { content: [{ type: "text", text: "开场叙述。\n" }] } },
  { type: "assistant", message: { content: [{ type: "tool_use", id: "auq_sep_1", name: "AskUserQuestion", input: { questions: [{ header: "Q1", question: "第一问？", options: [{ label: "A1", description: "..." }] }] } }] } },
  { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "auq_sep_1", content: '"第一问？"="A1"' }] } },
  { type: "assistant", message: { content: [{ type: "text", text: "过渡叙述。\n" }] } },
  { type: "assistant", message: { content: [{ type: "tool_use", id: "auq_sep_2", name: "AskUserQuestion", input: { questions: [{ header: "Q2", question: "第二问？", options: [{ label: "A2", description: "..." }] }] } }] } },
  { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "auq_sep_2", content: '"第二问？"="A2"' }] } },
  { type: "assistant", message: { content: [{ type: "text", text: "最后一个AUQ答案之后的叙述。不应丢失。\n" }] } },
]);

// ============================================================
// extractAuqBlock tests (8)
// ============================================================

test("extractAuqBlock returns empty when transcript missing", () => {
  const result = extractAuqBlock({ transcript_path: "/nonexistent" }, 0);
  assert.deepStrictEqual(result, { block: "", newCount: 0 });
});

test("extractAuqBlock returns empty when no AUQ in transcript", () => {
  const dir = tempDir();
  try {
    const tpath = writeFixture(dir, "transcript.jsonl", noTextTranscript);
    const result = extractAuqBlock({ transcript_path: tpath }, 0);
    assert.deepStrictEqual(result, { block: "", newCount: 0 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("extractAuqBlock preserves interleaved text and AUQ order", () => {
  const dir = tempDir();
  try {
    const tpath = writeFixture(dir, "transcript.jsonl", singleAuqTranscript);
    const { block } = extractAuqBlock({ transcript_path: tpath }, 0);

    const beforeIdx = block.indexOf("Before question");
    const auqIdx = block.indexOf("*[AI 提供了以下选项：]*");
    const afterIdx = block.indexOf("After question");

    assert.ok(beforeIdx >= 0, "contains 'Before question' text");
    assert.ok(auqIdx >= 0, "contains AUQ marker");
    assert.ok(afterIdx >= 0, "contains 'After question' text");
    assert.ok(beforeIdx < auqIdx, "'Before' appears before AUQ block");
    assert.ok(auqIdx < afterIdx, "AUQ block appears before 'After'");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("extractAuqBlock pairs answer by tool_use_id (reversed arrival)", () => {
  const dir = tempDir();
  try {
    const tpath = writeFixture(dir, "transcript.jsonl", reversedAnswerTranscript);
    const { block } = extractAuqBlock({ transcript_path: tpath }, 0);

    assert.ok(block.includes("A1"), "contains answer for toolu_A");
    assert.ok(block.includes("B1"), "contains answer for toolu_B");

    const q1Idx = block.indexOf("**Q1**");
    const q2Idx = block.indexOf("**Q2**");
    const a1Idx = block.indexOf("A1");
    const a2Idx = block.indexOf("B1");

    assert.ok(a1Idx > q1Idx, "A1 appears after Q1 header");
    assert.ok(a2Idx > q2Idx, "B1 appears after Q2 header");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("extractAuqBlock renders single-question answer inline", () => {
  const dir = tempDir();
  try {
    const tpath = writeFixture(dir, "transcript.jsonl", singleAuqTranscript);
    const { block } = extractAuqBlock({ transcript_path: tpath }, 0);

    assert.ok(block.includes("*你的选择：MVP*"), "renders inline answer for single question");
    assert.ok(!block.includes("*你的选择：*\n-"), "does not use multi-question list format");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("extractAuqBlock renders multi-question answers per question", () => {
  const dir = tempDir();
  try {
    const tpath = writeFixture(dir, "transcript.jsonl", multiQuestionTranscript);
    const { block } = extractAuqBlock({ transcript_path: tpath }, 0);

    assert.ok(block.includes("*你的选择：*"), "contains multi-question answer header");
    assert.ok(block.includes("- First?：**X**"), "first question answer on its own line");
    assert.ok(block.includes("- Second?：**Y**"), "second question answer on its own line");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("extractAuqBlock falls back when answer missing", () => {
  const dir = tempDir();
  try {
    const tpath = writeFixture(dir, "transcript.jsonl", noAnswerTranscript);
    const { block } = extractAuqBlock({ transcript_path: tpath }, 0);

    assert.ok(block.includes("*（未收到回答）*"), "shows missing-answer fallback");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("extractAuqBlock only returns new AUQs after lastCount", () => {
  const dir = tempDir();
  try {
    const transcript = jsonl([
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "First round.\n" },
            {
              type: "tool_use", id: "auq_1", name: "AskUserQuestion",
              input: { questions: [{ header: "First", question: "First Q?", options: [{ label: "A", description: "a" }] }] },
            },
          ],
        },
      },
      {
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "auq_1", content: '"First Q?"="A"' }] },
      },
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Second round.\n" },
            {
              type: "tool_use", id: "auq_2", name: "AskUserQuestion",
              input: { questions: [{ header: "Second", question: "Second Q?", options: [{ label: "B", description: "b" }] }] },
            },
          ],
        },
      },
      {
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "auq_2", content: '"Second Q?"="B"' }] },
      },
    ]);

    const tpath = writeFixture(dir, "transcript.jsonl", transcript);
    const { block, newCount } = extractAuqBlock({ transcript_path: tpath }, 1);

    assert.equal(newCount, 2, "newCount reflects total AUQs");
    assert.ok(!block.includes("First Q?"), "does not include first AUQ");
    assert.ok(block.includes("Second Q?"), "includes second AUQ only");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("extractAuqBlock preserves trailing text after last AUQ answer", () => {
  const dir = tempDir();
  try {
    const tpath = writeFixture(dir, "transcript.jsonl", separateEntryTranscript);
    const { block } = extractAuqBlock({ transcript_path: tpath }, 0);

    assert.ok(block.includes("最后一个AUQ答案之后的叙述"), "preserves text after last AUQ answer");
    assert.ok(block.includes("过渡叙述"), "preserves text between AUQs");
    assert.ok(block.includes("开场叙述"), "preserves text before first AUQ");

    // Verify ordering: answer appears before trailing text
    const answerIdx = block.indexOf("*你的选择：A2*");
    const trailingIdx = block.indexOf("最后一个AUQ答案之后的叙述");
    assert.ok(answerIdx >= 0, "contains answer for last AUQ");
    assert.ok(answerIdx < trailingIdx, "answer appears before trailing text");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================
// handleUserPromptSubmit test (1)
// ============================================================

test("handleUserPromptSubmit writes pending prompt JSON", async () => {
  const dir = tempDir();
  try {
    const data = {
      prompt: "hello world",
      session_id: "sess-001",
      transcript_path: "/tmp/transcript.jsonl",
      cwd: "/tmp",
      timestamp: "2026-05-27T10:00:00Z",
    };

    await handleUserPromptSubmit(data, dir);

    const pendingFile = path.join(dir, "session-buffer", "pending", "sess-001.json");
    assert.ok(fs.existsSync(pendingFile), "pending JSON created");

    const pending = JSON.parse(fs.readFileSync(pendingFile, "utf-8"));
    assert.equal(pending.prompt, "hello world");
    assert.equal(pending.session_id, "sess-001");
    assert.equal(pending.transcript_path, "/tmp/transcript.jsonl");
    assert.equal(pending.cwd, "/tmp");
    assert.equal(pending.created_at, "2026-05-27T10:00:00Z");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================
// handleStop tests (5)
// ============================================================

test("handleStop writes markdown turn with user prompt and AI reply", async () => {
  const dir = tempDir();
  try {
    const bufDir = path.join(dir, "session-buffer");
    const pendingDir = path.join(bufDir, "pending");
    fs.mkdirSync(pendingDir, { recursive: true });

    const sid = "sess-md";
    const pendingFile = path.join(pendingDir, `${sid}.json`);
    fs.writeFileSync(pendingFile, JSON.stringify({
      prompt: "my question",
      session_id: sid,
      transcript_path: "",
      cwd: "/tmp",
      created_at: "2026-05-27T10:00:00Z",
    }));

    const data = {
      session_id: sid,
      last_assistant_message: "Here is the answer.",
      transcript_path: "",
    };

    await handleStop(data, dir);

    const sessionFiles = fs.readdirSync(bufDir).filter((f) => f.startsWith("session-") && f.endsWith(".md"));
    assert.equal(sessionFiles.length, 1, "one session markdown file created");

    const content = fs.readFileSync(path.join(bufDir, sessionFiles[0]), "utf-8");
    assert.ok(content.includes("my question"), "contains user prompt");
    assert.ok(content.includes("Here is the answer."), "contains AI reply");
    assert.ok(content.includes("<!-- turn: t001"), "contains turn marker");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("handleStop removes pending after successful write", async () => {
  const dir = tempDir();
  try {
    const bufDir = path.join(dir, "session-buffer");
    const pendingDir = path.join(bufDir, "pending");
    fs.mkdirSync(pendingDir, { recursive: true });

    const sid = "sess-rm";
    const pendingFile = path.join(pendingDir, `${sid}.json`);
    fs.writeFileSync(pendingFile, JSON.stringify({
      prompt: "test",
      session_id: sid,
      transcript_path: "",
      cwd: "/tmp",
      created_at: "",
    }));

    const data = {
      session_id: sid,
      last_assistant_message: "response",
      transcript_path: "",
    };

    await handleStop(data, dir);

    assert.ok(!fs.existsSync(pendingFile), "pending file removed after write");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("handleStop skips when pending prompt missing", async () => {
  const dir = tempDir();
  try {
    const data = {
      session_id: "no-pending",
      last_assistant_message: "response",
      transcript_path: "",
    };

    await handleStop(data, dir);

    const bufDir = path.join(dir, "session-buffer");
    const mdFiles = fs.existsSync(bufDir)
      ? fs.readdirSync(bufDir).filter((f) => f.endsWith(".md"))
      : [];
    assert.equal(mdFiles.length, 0, "no markdown created when pending missing");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("handleStop skips when assistant message empty", async () => {
  const dir = tempDir();
  try {
    const bufDir = path.join(dir, "session-buffer");
    const pendingDir = path.join(bufDir, "pending");
    fs.mkdirSync(pendingDir, { recursive: true });

    const sid = "sess-empty";
    const pendingFile = path.join(pendingDir, `${sid}.json`);
    fs.writeFileSync(pendingFile, JSON.stringify({
      prompt: "test",
      session_id: sid,
      transcript_path: "",
      cwd: "/tmp",
      created_at: "",
    }));

    const data = {
      session_id: sid,
      last_assistant_message: "",
      transcript_path: "",
    };

    await handleStop(data, dir);

    assert.ok(fs.existsSync(pendingFile), "pending preserved when AI message empty");

    const mdFiles = fs.existsSync(bufDir)
      ? fs.readdirSync(bufDir).filter((f) => f.endsWith(".md"))
      : [];
    assert.equal(mdFiles.length, 0, "no markdown created when AI message empty");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("handleStop appends subsequent turns with incremented counter", async () => {
  const dir = tempDir();
  try {
    const bufDir = path.join(dir, "session-buffer");
    const pendingDir = path.join(bufDir, "pending");
    fs.mkdirSync(pendingDir, { recursive: true });

    const sid = "sess-multi";

    // Turn 1
    const pf1 = path.join(pendingDir, `${sid}.json`);
    fs.writeFileSync(pf1, JSON.stringify({
      prompt: "first question",
      session_id: sid,
      transcript_path: "",
      cwd: "/tmp",
      created_at: "",
    }));
    await handleStop({ session_id: sid, last_assistant_message: "first answer", transcript_path: "" }, dir);

    // Turn 2
    const pf2 = path.join(pendingDir, `${sid}.json`);
    fs.writeFileSync(pf2, JSON.stringify({
      prompt: "second question",
      session_id: sid,
      transcript_path: "",
      cwd: "/tmp",
      created_at: "",
    }));
    await handleStop({ session_id: sid, last_assistant_message: "second answer", transcript_path: "" }, dir);

    const sessionFiles = fs.readdirSync(bufDir).filter((f) => f.startsWith("session-") && f.endsWith(".md"));
    assert.equal(sessionFiles.length, 1, "single session file for same sid");

    const content = fs.readFileSync(path.join(bufDir, sessionFiles[0]), "utf-8");
    assert.ok(content.includes("t001"), "first turn marker present");
    assert.ok(content.includes("t003"), "second turn marker incremented");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================
// handleStopFailure test (1)
// ============================================================

test("handleStopFailure appends to failures.jsonl", async () => {
  const dir = tempDir();
  try {
    const data = {
      timestamp: "2026-05-27T10:00:00Z",
      session_id: "sess-fail",
      error: "something went wrong",
    };

    await handleStopFailure(data, dir);

    const failPath = path.join(dir, "session-buffer", "failures.jsonl");
    assert.ok(fs.existsSync(failPath), "failures.jsonl created");

    const lines = fs.readFileSync(failPath, "utf-8").trim().split("\n");
    assert.equal(lines.length, 1, "one failure line appended");

    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.ts, "2026-05-27T10:00:00Z");
    assert.equal(parsed.session_id, "sess-fail");
    assert.equal(parsed.error, "something went wrong");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
