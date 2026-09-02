export function getStudyKeyboardAction(event = {}, options = {}) {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return "";

  const target = event.target;
  const tag = String(target?.tagName || "").toLowerCase();
  const inputType = tag === "input"
    ? String(target?.type || target?.getAttribute?.("type") || "text").toLowerCase()
    : "";
  const isTextEditor = tag === "textarea"
    || target?.isContentEditable
    || (tag === "input" && ![
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit"
    ].includes(inputType));
  // Tab and Space are dedicated study shortcuts even when a toolbar select or
  // progress slider still owns focus.  Real text editors keep their native
  // typing behaviour, so Space can still be entered in search/add forms.
  if (event.key === "Tab") return event.shiftKey ? "" : "word-audio";
  if (event.key === " " || event.code === "Space" || event.key === "Spacebar") {
    return isTextEditor ? "" : "example-audio";
  }

  if (isTextEditor) return "";

  if (event.key === "ArrowLeft") return "previous";
  if (event.key === "ArrowRight") return "next";
  if (options.verticalNavigation && event.key === "ArrowUp") return "previous";
  if (options.verticalNavigation && event.key === "ArrowDown") return "next";
  if (event.code === "Digit1" || event.code === "Numpad1" || event.key === "1") return "known";
  if (event.code === "Digit2" || event.code === "Numpad2" || event.key === "2") return "blurry";
  if (event.code === "Digit3" || event.code === "Numpad3" || event.key === "3") return "unknown";
  return "";
}

export function isStudyAudioKeyboardAction(action) {
  return action === "word-audio" || action === "example-audio";
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
