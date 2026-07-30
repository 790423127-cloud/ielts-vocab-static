export function clampWordStudyPosition(value, total) {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  if (!safeTotal) return 0;

  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(safeTotal, Math.max(1, parsed));
}

export function wordStudyPositionPercent(position, total) {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  if (!safeTotal) return 0;
  return (clampWordStudyPosition(position, safeTotal) / safeTotal) * 100;
}

export function wordStudyIndexAtPosition(indices, position) {
  const source = Array.isArray(indices) ? indices : [];
  const safePosition = clampWordStudyPosition(position, source.length);
  if (!safePosition) return null;
  const index = source[safePosition - 1];
  return Number.isInteger(index) ? index : null;
}
