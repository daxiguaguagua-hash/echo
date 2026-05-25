function stripInlineFormatting(text) {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1");
}

function findAllPositions(text, quote) {
  const positions = [];
  if (!quote) return positions;

  const source = String(text || "");
  let idx = 0;
  while (true) {
    idx = source.indexOf(quote, idx);
    if (idx === -1) break;
    const line = source.slice(0, idx).split("\n").length;
    positions.push({ index: idx, line });
    idx += quote.length;
  }
  return positions;
}

function resolveAnchor(comment, articleBody) {
  if (comment.anchor?.kind === "article") {
    return { status: "ok", note: "article-level annotation" };
  }

  const { quote, prefix, suffix, line_hint } = comment.anchor || {};
  if (!quote) return { status: "broken", reason: "no quote" };

  const searchBody = stripInlineFormatting(articleBody);
  const searchQuote = stripInlineFormatting(quote);
  const positions = findAllPositions(searchBody, searchQuote);

  if (positions.length === 0) {
    return { status: "broken", reason: `quote not found: "${quote.slice(0, 50)}"` };
  }

  if (positions.length === 1) {
    return { status: "ok", position: positions[0] };
  }

  const candidates = positions.filter((p) => {
    const before = searchBody.slice(Math.max(0, p.index - 200), p.index);
    const after = searchBody.slice(p.index + searchQuote.length, p.index + searchQuote.length + 200);
    const prefixMatch = !prefix || stripInlineFormatting(before).includes(stripInlineFormatting(prefix));
    const suffixMatch = !suffix || stripInlineFormatting(after).includes(stripInlineFormatting(suffix));
    return prefixMatch && suffixMatch;
  });

  if (candidates.length === 1) {
    return { status: "ok", position: candidates[0], note: "disambiguated via prefix+suffix" };
  }

  if (candidates.length > 1 && line_hint) {
    candidates.sort((a, b) => Math.abs(a.line - line_hint) - Math.abs(b.line - line_hint));
    return {
      status: "needs_review",
      position: candidates[0],
      reason: `${candidates.length} candidates after prefix+suffix; line_hint=${line_hint}`,
    };
  }

  return {
    status: "ambiguous",
    reason: `${candidates.length} occurrences, can't disambiguate`,
    candidates,
  };
}

module.exports = {
  stripInlineFormatting,
  findAllPositions,
  resolveAnchor,
};
