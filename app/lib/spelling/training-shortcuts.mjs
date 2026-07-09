export const SPELLING_SHORTCUT_ACTIONS = Object.freeze({
  PLAY_WORD: "play_word",
  PLAY_EXAMPLE: "play_example",
  SUBMIT: "submit",
  SKIP: "skip",
  CONTINUE: "continue"
});

export function resolveSpellingShortcut(event = {}, context = {}) {
  if (
    event.repeat
    && (event.key === "Tab" || event.key === " " || event.code === "Space" || event.key === "Spacebar")
  ) {
    return "";
  }

  if (event.key === "Tab") return SPELLING_SHORTCUT_ACTIONS.PLAY_WORD;

  if (event.key === " " || event.code === "Space" || event.key === "Spacebar") {
    return context.isPhraseTyping ? "" : SPELLING_SHORTCUT_ACTIONS.PLAY_EXAMPLE;
  }

  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    return SPELLING_SHORTCUT_ACTIONS.SKIP;
  }

  if (event.key === "Enter") {
    return context.awaitingAdvance
      ? SPELLING_SHORTCUT_ACTIONS.CONTINUE
      : SPELLING_SHORTCUT_ACTIONS.SUBMIT;
  }

  return "";
}
