function stripCommentSections(text) {
  return text
    .replace(/<!-- ECHO_COMMENTS_START -->[\s\S]*?<!-- ECHO_COMMENTS_END -->\n*/g, "")
    .replace(/<!-- ECHO:COMMENT_LIST -->\n*/g, "");
}

module.exports = { stripCommentSections };
