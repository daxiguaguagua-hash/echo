const fs = require("fs");
const path = require("path");
const { bufferDir, ensureDir } = require("../infra/workspace");
const { isCaptureEnabled, getSpeakers } = require("../infra/config");

const PENDING_DIR = path.join(bufferDir, "pending");
const SESSION_MAP = path.join(bufferDir, "session-map.txt");
const AUQ_COUNTER = path.join(bufferDir, "auq-counter.txt");
const FAILURES_LOG = path.join(bufferDir, "failures.jsonl");

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => { resolve(data); });
    process.stdin.resume();
  });
}

function getLocalDate() {
  const d = new Date();
  const offset = 8 * 60;
  const local = new Date(d.getTime() + offset * 60000);
  return local.toISOString().slice(0, 10);
}

function getSessionFile(sid) {
  ensureDir(bufferDir);
  if (fs.existsSync(SESSION_MAP)) {
    const map = fs.readFileSync(SESSION_MAP, "utf-8");
    for (const line of map.split("\n")) {
      const [k, v] = line.split("=");
      if (k === sid && v) return v;
    }
  }
  const base = `session-${getLocalDate()}`;
  let v = 1;
  while (fs.existsSync(path.join(bufferDir, `${base}-v${v}.md`))) v++;
  const file = path.join(bufferDir, `${base}-v${v}.md`);
  fs.appendFileSync(SESSION_MAP, `${sid}=${file}\n`);
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

async function handleUserPromptSubmit(data) {
  ensureDir(PENDING_DIR);
  const pendingFile = path.join(PENDING_DIR, `${data.session_id || "unknown"}.json`);
  fs.writeFileSync(pendingFile, JSON.stringify({
    prompt: data.prompt || "",
    session_id: data.session_id || "",
    transcript_path: data.transcript_path || "",
    cwd: data.cwd || "",
    created_at: data.timestamp || "",
  }, null, 2));
  console.log("pending saved");
}

async function handleStop(data) {
  const sid = data.session_id || "unknown";
  const pendingFile = path.join(PENDING_DIR, `${sid}.json`);

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

  const sessionFile = getSessionFile(sid);

  let turnNum = 1;
  if (fs.existsSync(sessionFile)) {
    turnNum = (fs.readFileSync(sessionFile, "utf-8").match(/<!-- turn:/g) || []).length + 1;
  }

  let lastCount = 0;
  if (fs.existsSync(AUQ_COUNTER)) {
    lastCount = parseInt(fs.readFileSync(AUQ_COUNTER, "utf-8").trim() || "0", 10);
  }
  const { block: auqBlock, newCount } = extractAuqBlock(data, lastCount);
  if (newCount > lastCount) {
    fs.writeFileSync(AUQ_COUNTER, String(newCount));
  }

  const speakers = getSpeakers();

  const entry = `
<!-- turn: t${String(turnNum).padStart(3, "0")} speaker=${speakers.user} -->
我：${pending.prompt}

<!-- turn: t${String(turnNum + 1).padStart(3, "0")} speaker=${speakers.ai} reply_to=t${String(turnNum).padStart(3, "0")} -->
## ${speakers.ai} 的回复
${auqBlock}
${aiText}

`;

  fs.appendFileSync(sessionFile, entry);
  fs.unlinkSync(pendingFile);
  console.log(`turn t${String(turnNum).padStart(3, "0")}-t${String(turnNum + 1).padStart(3, "0")} saved`);
}

async function handleStopFailure(data) {
  ensureDir(bufferDir);
  fs.appendFileSync(FAILURES_LOG, JSON.stringify({
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
  ensureDir(bufferDir);
  fs.writeFileSync(path.join(bufferDir, "debug-last-input.json"), raw);

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    process.exit(0);
  }

  const event = data.hook_event_name || "";
  if (event === "UserPromptSubmit") await handleUserPromptSubmit(data);
  else if (event === "Stop") await handleStop(data);
  else if (event === "StopFailure") await handleStopFailure(data);

  process.exit(0);
}

main().catch(() => process.exit(0));
