const fs = require("fs");
const path = require("path");

const MANIFEST_VERSION = 1;

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return { version: MANIFEST_VERSION, imports: {} };
  }
  let raw = "";
  try {
    raw = fs.readFileSync(manifestPath, "utf-8");
    if (!raw.trim()) return { version: MANIFEST_VERSION, imports: {} };
    const data = JSON.parse(raw);
    return {
      version: data.version || MANIFEST_VERSION,
      imports: data.imports || {},
    };
  } catch (e) {
    if (raw.trim() && raw.trim()[0] === "{") {
      throw new Error(`corrupt manifest JSON: ${e.message}`);
    }
    return { version: MANIFEST_VERSION, imports: {} };
  }
}

function saveManifest(manifest, manifestPath) {
  const dir = path.dirname(manifestPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function isImported(manifest, sessionId) {
  if (!manifest || !sessionId) return false;
  return !!(manifest.imports && manifest.imports[sessionId]);
}

function isModified(manifest, sessionId, fileHash) {
  if (!manifest || !sessionId) return false;
  const entry = manifest.imports && manifest.imports[sessionId];
  if (!entry) return false;
  return entry.fileHash !== fileHash;
}

function recordImport(manifest, sessionId, articleId, fileHash, metadata) {
  const existing = manifest.imports && manifest.imports[sessionId];
  if (existing && existing.fileHash === fileHash) {
    return { success: false, reason: "duplicate", articleId: existing.articleId };
  }

  if (!manifest.imports) manifest.imports = {};

  manifest.imports[sessionId] = {
    articleId,
    fileHash,
    importedAt: new Date().toISOString(),
    ...(metadata || {}),
  };

  return { success: true, articleId };
}

function validateManifest(data) {
  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["manifest must be an object"] };
  }
  if (data.version !== MANIFEST_VERSION) {
    return { valid: false, errors: [`unsupported version: ${data.version}`] };
  }
  if (!data.imports || typeof data.imports !== "object") {
    return { valid: false, errors: ["imports must be an object"] };
  }
  for (const [sessionId, entry] of Object.entries(data.imports)) {
    if (!entry.articleId) {
      return { valid: false, errors: [`import ${sessionId}: missing articleId`] };
    }
    if (!entry.fileHash) {
      return { valid: false, errors: [`import ${sessionId}: missing fileHash`] };
    }
    if (!entry.importedAt) {
      return { valid: false, errors: [`import ${sessionId}: missing importedAt`] };
    }
  }
  return { valid: true, errors: [] };
}

module.exports = { loadManifest, saveManifest, isImported, isModified, recordImport, validateManifest };
