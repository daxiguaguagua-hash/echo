const { commandFor } = require("../../lib/cli/names");

function run(args) {
    const { resolveDataDirs } = require("../../lib/infra/echo-paths");
    const store = require("../../lib/infra/markdown-store");
    const { listTags, addTags, removeTags, renameTag, purgeTag } = require("../../lib/usecases/query-articles");
    const dirs = resolveDataDirs();
    const deps = { dirs, store };
    const sub = args[1];

    if (sub === "list") {
      const tags = listTags({}, deps);
      if (tags.length === 0) {
        console.log("No tags found.");
      } else {
        console.log(`${"Tag".padEnd(30)} Usage`);
        console.log("-".repeat(42));
        for (const { tag, count } of tags) {
          console.log(`${tag.padEnd(30)} ${count}`);
        }
      }
    } else if (sub === "add") {
      const articleId = args[2];
      const tags = args.slice(3);
      if (!articleId || tags.length === 0) {
        console.error(`Usage: ${commandFor(["tag", "add", "<article-id>", "<tag1>", "[tag2...]"])}`);
        process.exit(1);
      }
      try {
        const result = addTags({ id: articleId, tags }, deps);
        console.log(`Article: ${result.id}`);
        console.log(`Tags:   ${result.tags.join(", ")}`);
        console.log(`Added:  ${result.added.join(", ")}`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    } else if (sub === "remove") {
      const articleId = args[2];
      const tags = args.slice(3);
      if (!articleId || tags.length === 0) {
        console.error(`Usage: ${commandFor(["tag", "remove", "<article-id>", "<tag1>", "[tag2...]"])}`);
        process.exit(1);
      }
      try {
        const result = removeTags({ id: articleId, tags }, deps);
        console.log(`Article: ${result.id}`);
        console.log(`Tags:    ${result.tags.join(", ") || "(none)"}`);
        console.log(`Removed: ${result.removed.join(", ")}`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    } else if (sub === "rename") {
      const oldTag = args[2];
      const newTag = args[3];
      if (!oldTag || !newTag) {
        console.error(`Usage: ${commandFor(["tag", "rename", "<old-tag>", "<new-tag>"])}`);
        process.exit(1);
      }
      try {
        const result = renameTag({ oldTag, newTag }, deps);
        console.log(`Renamed: ${result.oldTag} → ${result.newTag}`);
        console.log(`Updated: ${result.renamed} article(s)`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    } else if (sub === "purge") {
      const tag = args[2];
      if (!tag) {
        console.error(`Usage: ${commandFor(["tag", "purge", "<tag>"])}`);
        process.exit(1);
      }
      try {
        const result = purgeTag({ tag }, deps);
        console.log(`Purged:  ${result.tag}`);
        console.log(`Removed: from ${result.purged} article(s)`);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    } else {
      console.error(`Usage: ${commandFor(["tag", "list|add|remove|rename|purge"])}`);
      process.exit(1);
    }
}

module.exports = run;
