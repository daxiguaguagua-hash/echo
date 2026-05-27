const fs = require("fs");
const path = require("path");
const { resolveEchoHomePath } = require("../infra/workspace");
const { isCaptureEnabled } = require("../infra/config");
const { findProjectForPath } = require("../usecases/project-registry");
const { commandFor } = require("../cli/names");
const { readStdin } = require("../infra/read-stdin");

function parseStatusFile(content) {
  const done = (content.match(/^- \[x\]/gim) || []).length;
  const sections = { "进行中": [], "待做": [] };
  let currentSection = null;

  for (const line of content.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("## 进行中")) { currentSection = "进行中"; continue; }
    if (stripped.startsWith("## 待做")) { currentSection = "待做"; continue; }
    if (stripped.startsWith("## ") && !stripped.startsWith("### ")) { currentSection = null; continue; }
    if (currentSection && stripped.startsWith("- [ ]")) {
      sections[currentSection].push(stripped.slice(5).trim());
    }
  }

  return { done, inProgress: sections["进行中"], todos: sections["待做"] };
}

async function main() {
  const raw = await readStdin();
  let data;
  try { data = JSON.parse(raw); } catch (_) { process.exit(0); }

  if (data.hook_event_name !== "SessionStart") process.exit(0);

  const cwd = data.cwd || "";
  const statusFile = path.join(cwd, "ECHO_STATUS.md");
  if (!fs.existsSync(statusFile)) process.exit(0);

  const content = fs.readFileSync(statusFile, "utf-8");
  const { done, inProgress, todos } = parseStatusFile(content);

  const captureActive = isCaptureEnabled();
  const captureStatus = captureActive ? "开启中" : "已暂停";
  const captureHint = captureActive ? `${commandFor(["capture", "off"])} 暂停` : `${commandFor(["capture", "on"])} 开启`;

  const echoHome = resolveEchoHomePath();
  const project = findProjectForPath(cwd, { echoHome });
  const projectLabel = project ? ` (${project.projectId})` : "";

  let systemMsg = `Echo${projectLabel}: ${done} done | 自动记录 ${captureStatus} | ${captureHint}`;
  if (inProgress.length > 0) {
    systemMsg += " | In progress: " + inProgress.slice(0, 2).join(", ");
  }

  const ctx = [`Echo 项目状态：${done} 项已完成`];
  if (project) ctx.push(`当前项目：${project.projectId} (${project.dataRoot})`);
  ctx.push("请使用 Skill 工具调用 gstack 了解项目全貌。");
  if (inProgress.length > 0) {
    ctx.push("");
    ctx.push("**进行中：**");
    for (const item of inProgress) ctx.push(`  - ${item}`);
  }
  if (todos.length > 0) {
    ctx.push("");
    ctx.push("**下一步：**");
    for (const item of todos.slice(0, 3)) ctx.push(`  - ${item}`);
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: ctx.join("\n"),
      systemMessage: systemMsg,
    },
  }));
  process.exit(0);
}

main().catch(() => process.exit(0));
