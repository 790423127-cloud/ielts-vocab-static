export function confirmReadingGDelete(message, options = {}) {
  const confirmAction = options.confirmAction || globalThis.confirm;
  return typeof confirmAction === "function" && Boolean(confirmAction(message));
}
