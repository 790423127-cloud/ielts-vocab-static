export function getStudyKeyboardAction(event = {}) {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return "";

  const target = event.target;
  const tag = String(target?.tagName || "").toLowerCase();
  if (
    tag === "input"
    || tag === "textarea"
    || tag === "select"
    || target?.isContentEditable
  ) return "";

  if (event.key === "Tab") return "word-audio";
  if (event.key === " " || event.code === "Space" || event.key === "Spacebar") {
    return "example-audio";
  }
  if (event.key === "ArrowLeft") return "previous";
  if (event.key === "ArrowRight") return "next";
  if (event.code === "Digit1" || event.code === "Numpad1" || event.key === "1") return "known";
  if (event.code === "Digit2" || event.code === "Numpad2" || event.key === "2") return "blurry";
  if (event.code === "Digit3" || event.code === "Numpad3" || event.key === "3") return "unknown";
  return "";
}

export function shouldHandleStudyDeleteShortcut(event = {}) {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  const tag = String(target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return false;
  const key = String(event.key || "").toLowerCase();
  const code = String(event.code || "");
  return key === "d" || key === "delete" || code === "KeyD" || code === "Delete";
}
