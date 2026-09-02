import { isDirectSurfaceInflection } from "./word-surface-morphology.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function relationWord(value) {
  return text(typeof value === "string" ? value : value?.word || value?.text || value?.form);
}

function expandAlternatives(value) {
  const target = text(value);
  if (!target) return [];
  const alternatives = target.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  return alternatives.length > 1 ? [target, ...alternatives] : [target];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function targetPattern(value) {
  return text(value)
    .split(/\s+/)
    .map((part) => escapeRegExp(part).replace(/['’]/g, "['’]"))
    .join("\\s+");
}

function inferSentenceForms(sentence, targets) {
  const candidates = String(sentence ?? "").match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || [];
  const singleWordTargets = targets.filter((target) => !/\s/.test(target));
  const inferred = new Map();

  candidates.forEach((candidate) => {
    if (!singleWordTargets.some((target) => isDirectSurfaceInflection(target, candidate))) return;
    const key = candidate.toLowerCase().replace(/’/g, "'");
    if (!inferred.has(key)) inferred.set(key, candidate);
  });

  return [...inferred.values()];
}

export function getExampleHighlightTargets(item, forms = item?.forms) {
  const targets = [item?.word, ...(Array.isArray(forms) ? forms.map(relationWord) : [])]
    .flatMap(expandAlternatives);
  const unique = new Map();

  targets.forEach((target) => {
    const key = target.toLowerCase().replace(/’/g, "'");
    if (key && !unique.has(key)) unique.set(key, target);
  });

  return [...unique.values()].sort((left, right) => right.length - left.length);
}

export function splitExampleForHighlight(sentence, targets) {
  const value = String(sentence ?? "");
  const exactTargets = Array.isArray(targets) ? targets : [];
  const patterns = [...exactTargets, ...inferSentenceForms(value, exactTargets)]
    .map(targetPattern)
    .filter(Boolean);

  if (!value || !patterns.length) return [{ text: value, highlighted: false }];

  const matcher = new RegExp(`(^|[^A-Za-z0-9])(${patterns.join("|")})(?=$|[^A-Za-z0-9])`, "gi");
  const segments = [];
  let cursor = 0;
  let match;

  while ((match = matcher.exec(value)) !== null) {
    const start = match.index + match[1].length;
    const highlightedText = match[2];
    if (start > cursor) segments.push({ text: value.slice(cursor, start), highlighted: false });
    segments.push({ text: highlightedText, highlighted: true });
    cursor = start + highlightedText.length;
  }

  if (cursor < value.length) segments.push({ text: value.slice(cursor), highlighted: false });
  return segments.length ? segments : [{ text: value, highlighted: false }];
}
