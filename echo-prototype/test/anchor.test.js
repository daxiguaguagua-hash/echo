const assert = require("node:assert/strict");
const test = require("node:test");

const {
  stripInlineFormatting,
  findAllPositions,
  resolveAnchor,
} = require("../scripts/lib/anchor");

test("stripInlineFormatting keeps text while removing common markdown markers", () => {
  assert.equal(
    stripInlineFormatting("A **bold** __strong__ *em* _italic_ ~~gone~~"),
    "A bold strong em italic gone"
  );
});

test("findAllPositions returns line numbers for repeated quotes", () => {
  assert.deepEqual(findAllPositions("alpha\nbeta\nalpha", "alpha"), [
    { index: 0, line: 1 },
    { index: 11, line: 3 },
  ]);
});

test("findAllPositions returns empty list for an empty quote", () => {
  assert.deepEqual(findAllPositions("alpha", ""), []);
});

test("resolveAnchor reports missing quote metadata as broken", () => {
  assert.deepEqual(resolveAnchor({}, "body"), {
    status: "broken",
    reason: "no quote",
  });
});

test("resolveAnchor reports a missing quote as broken", () => {
  const result = resolveAnchor({ anchor: { quote: "missing" } }, "body");

  assert.equal(result.status, "broken");
  assert.match(result.reason, /quote not found/);
});

test("resolveAnchor matches text despite inline markdown formatting", () => {
  const result = resolveAnchor(
    { anchor: { quote: "important idea" } },
    "This is an **important idea**."
  );

  assert.equal(result.status, "ok");
  assert.equal(result.position.index, 11);
});

test("resolveAnchor also strips formatting from quote metadata", () => {
  const result = resolveAnchor(
    {
      anchor: {
        quote: "**important idea**",
        suffix: "lands",
      },
    },
    "This important idea lands."
  );

  assert.equal(result.status, "ok");
});

test("resolveAnchor disambiguates repeated quotes with prefix and suffix", () => {
  const body = [
    "First context: same quote closes here.",
    "Second context: same quote closes there.",
  ].join("\n");

  const result = resolveAnchor(
    {
      anchor: {
        quote: "same quote",
        prefix: "Second context:",
        suffix: "closes there",
      },
    },
    body
  );

  assert.equal(result.status, "ok");
  assert.equal(result.note, "disambiguated via prefix+suffix");
  assert.equal(result.position.line, 2);
});

test("resolveAnchor returns needs_review when line_hint is needed after multiple candidates", () => {
  const body = ["same quote", "middle", "same quote"].join("\n");

  const result = resolveAnchor(
    {
      anchor: {
        quote: "same quote",
        line_hint: 3,
      },
    },
    body
  );

  assert.equal(result.status, "needs_review");
  assert.equal(result.position.line, 3);
});

test("resolveAnchor returns ambiguous when repeated quote cannot be disambiguated", () => {
  const result = resolveAnchor(
    { anchor: { quote: "same" } },
    "same\nsame"
  );

  assert.equal(result.status, "ambiguous");
  assert.equal(result.candidates.length, 2);
});
