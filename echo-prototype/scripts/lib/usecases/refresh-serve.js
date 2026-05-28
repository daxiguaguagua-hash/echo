const fs = require("fs");
const http = require("http");
const path = require("path");
const { resolveEchoHomePath } = require("../infra/workspace");

const HOST = "127.0.0.1";

function serveInfoPath() {
  return path.join(resolveEchoHomePath(), ".serve.json");
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") return false;
    if (err.code === "EPERM") return true;
    throw err;
  }
}

function getRunningServeInfo() {
  let info;
  try {
    info = JSON.parse(fs.readFileSync(serveInfoPath(), "utf-8"));
  } catch (_) {
    return null;
  }
  if (info.identity !== "echo-serve") return null;
  if (!isPidRunning(info.pid)) return null;
  if (!Number.isInteger(info.apiPort) || info.apiPort <= 0) return null;
  return info;
}

function requestRunningServeRefresh(opts = {}) {
  const timeoutMs = opts.timeoutMs || 15000;
  const info = opts.info || getRunningServeInfo();
  if (!info) {
    return Promise.resolve({ attempted: false, ok: false, message: "serve is not running" });
  }

  return new Promise((resolve) => {
    const req = http.request({
      host: HOST,
      port: info.apiPort,
      path: "/api/rebuild-docs",
      method: "POST",
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve({
          attempted: true,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          message: body || res.statusMessage || "",
        });
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("refresh timed out"));
    });
    req.on("error", (err) => {
      resolve({ attempted: true, ok: false, message: err.message });
    });
    req.end();
  });
}

module.exports = {
  getRunningServeInfo,
  requestRunningServeRefresh,
};
