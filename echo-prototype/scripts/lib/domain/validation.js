const VALID_EVOLUTION_KINDS = new Set([
  null, "refines", "contradicts", "expands", "supersedes",
]);

// ---- per-record validation ----

function validateAnnotation(record) {
  const { id, data, file } = record;
  const errs = [];

  if (!id) {
    errs.push(`${file}: missing "id"`);
    return errs;
  }

  if (!data.target?.article_id) errs.push(`${file}: missing "target.article_id"`);
  if (data.anchor?.kind === "article") {
    // Article-level comment: no quote/prefix/suffix/occurrence/line_hint required
  } else {
    if (!data.anchor?.quote) errs.push(`${file}: missing "anchor.quote"`);
    if (data.anchor?.prefix === undefined) errs.push(`${file}: missing "anchor.prefix"`);
    if (data.anchor?.suffix === undefined) errs.push(`${file}: missing "anchor.suffix"`);
    if (data.anchor?.occurrence === undefined) errs.push(`${file}: missing "anchor.occurrence"`);
    if (data.anchor?.line_hint === undefined) errs.push(`${file}: missing "anchor.line_hint"`);
  }
  if (!data.author) errs.push(`${file}: missing "author"`);
  if (!data.created_at) errs.push(`${file}: missing "created_at"`);
  if (!data.status) errs.push(`${file}: missing "status"`);

  if (!data.evolution) {
    errs.push(`${file}: missing "evolution"`);
  } else if (!VALID_EVOLUTION_KINDS.has(data.evolution.kind)) {
    errs.push(`${file}: invalid evolution.kind "${data.evolution.kind}" (allowed: refines, contradicts, expands, supersedes, null)`);
  }

  const expectedName = `${id}.md`;
  if (file.split("/").pop() !== expectedName) {
    errs.push(`${file}: file name should be "${expectedName}" (id is "${id}")`);
  }

  return errs;
}

function validateArticle(record) {
  const { data, file } = record;
  const errs = [];

  if (!data.title) errs.push(`${file}: missing "title"`);
  if (!data.created_at) errs.push(`${file}: missing "created_at"`);
  if (data.alias !== undefined && data.alias !== null && typeof data.alias !== "string") {
    errs.push(`${file}: "alias" must be a string`);
  }

  return errs;
}

// ---- cross-record validation ----

function detectCycle(startId, ofMap, visited) {
  const v = visited || new Set();
  if (v.has(startId)) return [...v, startId];
  v.add(startId);
  for (const next of (ofMap[startId] || [])) {
    const cycle = detectCycle(next, ofMap, new Set(v));
    if (cycle) return cycle;
  }
  return null;
}

function checkAllCycles(commentIds, ofMap, fileMap) {
  const errs = [];
  for (const id of commentIds) {
    const cycle = detectCycle(id, ofMap);
    if (cycle) {
      errs.push(`${fileMap[id]}: evolution cycle detected: ${cycle.join(" → ")}`);
    }
  }
  return errs;
}

function checkEvolutionReferences(comments, commentsMap, fileMap) {
  const errs = [];
  for (const [id, c] of Object.entries(comments)) {
    const ofList = c.evolution?.of || [];
    for (const targetId of ofList) {
      if (!commentsMap[targetId]) {
        errs.push(`${fileMap[id]}: evolution.of references unknown comment "${targetId}"`);
      }
    }
  }
  return errs;
}

function checkArticleReferences(comments, articleIds, fileMap) {
  const errs = [];
  for (const [id, c] of Object.entries(comments)) {
    const aid = c.target?.article_id;
    if (aid && !articleIds.has(aid)) {
      errs.push(`${fileMap[id]}: target.article_id "${aid}" not found`);
    }
  }
  return errs;
}

function checkDuplicateIds(records) {
  const errs = [];
  const seen = new Set();
  for (const { id, file } of records) {
    if (seen.has(id)) {
      errs.push(`${file}: duplicate id "${id}"`);
    }
    seen.add(id);
  }
  return errs;
}

module.exports = {
  VALID_EVOLUTION_KINDS,
  validateAnnotation,
  validateArticle,
  detectCycle,
  checkAllCycles,
  checkEvolutionReferences,
  checkArticleReferences,
  checkDuplicateIds,
};
