const fs = require("fs");
const path = require("path");
const {
  resolveEchoHomePath,
  ensureDir,
} = require("../infra/workspace");
const { isCaptureEnabled, getSpeakers } = require("../infra/config");
const { findProjectForPath } = require("../usecases/project-registry");
const { readStdin } = require("../infra/read-stdin");

function getLocalDate() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: process.env.TZ || "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).replace(/\//g, "-");
}

function resolveBufferRoot(data) {
  const echoHome = resolveEchoHomePath();
  const cwd = data.cwd || process.cwd();

  const project = findProjectForPath(cwd, { echoHome });
  if (project) {
    return { bufferRoot: project.dataRoot, project };
  }
  return { bufferRoot: echoHome, project: null };
}

function getSessionFile(sid, bufferRoot) {
  const mapPath = path.join(bufferRoot, "session-map.txt");
  ensureDir(bufferRoot);

  if (fs.existsSync(mapPath)) {
    const map = fs.readFileSync(mapPath, "utf-8");
    for (const line of map.split("\n")) {
      const [k, v] = line.split("=");
      if (k === sid && v) return v;
    }
  }

  const base = `session-${getLocalDate()}`;
  let v = 1;
  while (fs.existsSync(path.join(bufferRoot, `${base}-v${v}.md`))) v++;
  const file = path.join(bufferRoot, `${base}-v${v}.md`);
  fs.appendFileSync(mapPath, `${sid}=${file}\n`);
  return file;
}

function extractAuqBlock(hookData, lastCount) {
  const transcriptPath = hookData.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return { block: "", newCount: lastCount };

  const entries = fs.readFileSync(transcriptPath, "utf-8")
    .split("\n").filter(Boolean)
    .map((line) => JSON.parse(line));

  const allAuqs = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "assistant") continue;
    const content = entry.message?.content || [];
    for (const block of content) {
      if (block?.type !== "tool_use" || block?.name !== "AskUserQuestion") continue;
      const inp = block.input || {};
      let answer = "";
      for (let j = i + 1; j < Math.min(i + 5, entries.length); j++) {
        const nxt = entries[j];
        if (nxt.type !== "user") continue;
        for (const cb of (nxt.message?.content || [])) {
          if (cb?.type === "tool_result") {
            const rc = cb.content;
            if (typeof rc === "string") answer = rc;
            else if (Array.isArray(rc)) answer = rc.map((r) => (typeof r === "object" ? r.text || "" : String(r))).join("");
          }
        }
        if (answer) break;
      }
      allAuqs.push({ input: inp, answer });
    }
  }

  const newCount = allAuqs.length;
  if (newCount <= lastCount) return { block: "", newCount: lastCount };

  let block = "";
  for (const { input, answer } of allAuqs.slice(lastCount)) {
    block += "\n*[AI 提供了以下选项：]*\n\n";
    for (const q of (input.questions || [])) {
      block += `> **${q.header || ""}**\n`;
      block += `> ${q.question || ""}\n>\n`;
      for (const opt of (q.options || [])) {
        block += `> - **${opt.label || ""}** — ${opt.description || ""}\n`;
      }
      block += "\n";
    }
    if (answer) block += `*你的选择：${answer}*\n\n`;
  }
  return { block, newCount };
}

async function handleUserPromptSubmit(data, bufferRoot) {
  const pendingDir = path.join(bufferRoot, "session-buffer", "pending");
  ensureDir(pendingDir);
  const pendingFile = path.join(pendingDir, `${data.session_id || "unknown"}.json`);
  fs.writeFileSync(pendingFile, JSON.stringify({
    prompt: data.prompt || "",
    session_id: data.session_id || "",
    transcript_path: data.transcript_path || "",
    cwd: data.cwd || "",
    created_at: data.timestamp || "",
  }, null, 2));
  console.log("pending saved");
}

async function handleStop(data, bufferRoot) {
  const bufDir = path.join(bufferRoot, "session-buffer");
  const pendingDir = path.join(bufDir, "pending");
  const sid = data.session_id || "unknown";
  const pendingFile = path.join(pendingDir, `${sid}.json`);

  if (!fs.existsSync(pendingFile)) {
    console.log("(no pending prompt — skipping)");
    return;
  }

  const pending = JSON.parse(fs.readFileSync(pendingFile, "utf-8"));
  const aiText = data.last_assistant_message || "";
  if (!aiText) {
    console.log("no assistant message — skipping");
    return;
  }

  const sessionFile = getSessionFile(sid, bufDir);

  let turnNum = 1;
  if (fs.existsSync(sessionFile)) {
    turnNum = (fs.readFileSync(sessionFile, "utf-8").match(/<!-- turn:/g) || []).length + 1;
  }

  const auqCounterPath = path.join(bufDir, "auq-counter.txt");
  let lastCount = 0;
  if (fs.existsSync(auqCounterPath)) {
    lastCount = parseInt(fs.readFileSync(auqCounterPath, "utf-8").trim() || "0", 10);
  }
  const { block: auqBlock, newCount } = extractAuqBlock(data, lastCount);
  if (newCount > lastCount) {
    fs.writeFileSync(auqCounterPath, String(newCount));
  }

  const speakers = getSpeakers();

  const entry = `
<!-- turn: t${String(turnNum).padStart(3, "0")} speaker=${speakers.user} -->
${speakers.user}：${pending.prompt}

<!-- turn: t${String(turnNum + 1).padStart(3, "0")} speaker=${speakers.ai} reply_to=t${String(turnNum).padStart(3, "0")} -->
## ${speakers.ai} 的回复
${auqBlock}
${aiText}

`;

  fs.appendFileSync(sessionFile, entry);
  fs.unlinkSync(pendingFile);
  console.log(`turn t${String(turnNum).padStart(3, "0")}-t${String(turnNum + 1).padStart(3, "0")} saved`);
}

async function handleStopFailure(data, bufferRoot) {
  const bufDir = path.join(bufferRoot, "session-buffer");
  ensureDir(bufDir);
  fs.appendFileSync(path.join(bufDir, "failures.jsonl"), JSON.stringify({
    ts: data.timestamp || "",
    session_id: data.session_id || "",
    error: data.error || "",
  }) + "\n");
}

async function main() {
  if (!isCaptureEnabled()) {
    process.exit(0);
  }

  const raw = await readStdin();

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    process.exit(0);
  }

  const { bufferRoot } = resolveBufferRoot(data);
  ensureDir(path.join(bufferRoot, "session-buffer"));

  const event = data.hook_event_name || "";
  if (event === "UserPromptSubmit") await handleUserPromptSubmit(data, bufferRoot);
  else if (event === "Stop") await handleStop(data, bufferRoot);
  else if (event === "StopFailure") await handleStopFailure(data, bufferRoot);

  process.exit(0);
}

main().catch(() => process.exit(0));
