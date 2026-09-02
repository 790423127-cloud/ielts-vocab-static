import { normalizeReadingGKey } from "./normalize.mjs";
import { READING_G_BASIC_ZERO_KEYS } from "./basic-zero-keys.generated.mjs";

export const PART12_ONLY_HF_FILTER_TYPE = "part12OnlyHighFrequency";
export const PART12_ONLY_HF_MIN_ARTICLES = 2;
export const PART12_ARTICLE_HF_LAYER = "part12ArticleHighFrequency";
export const PART12_ONLY_HF_LABEL = "剑雅5–21文章高频（Part 1–2）";
export const PART12_ONLY_HF_DESC =
  "只统计 Part 1+2 的224篇短文，出现2篇及以上，并去掉零基础单词；默认按出现篇数从高到低";

function nonNegativeFrequency(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function getRgPart12OnlyArticleCount(item) {
  return nonNegativeFrequency(item?.part12ArticleFrequency?.articleCount);
}

export function getRgPart12OnlyOccurrenceCount(item) {
  return nonNegativeFrequency(item?.part12ArticleFrequency?.occurrenceCount);
}

export function isReadingGBasicZeroHeadword(word) {
  const key = normalizeReadingGKey(word);
  return Boolean(key) && READING_G_BASIC_ZERO_KEYS.has(key);
}

export function isReadingGPart12OnlyHighFrequency(item) {
  if (!item) return false;
  const layers = Array.isArray(item.layers) ? item.layers : [];
  if (!layers.includes(PART12_ARTICLE_HF_LAYER)) return false;
  if (getRgPart12OnlyArticleCount(item) < PART12_ONLY_HF_MIN_ARTICLES) return false;
  const word = String(item.word || "");
  if ((item.entryType || "word") === "phrase" || /\s/.test(word)) return false;
  return !isReadingGBasicZeroHeadword(item.normalizedKey || word);
}

export function compareRgPart12OnlyFrequency(left, right) {
  const leftEntry = left?.entry || left;
  const rightEntry = right?.entry || right;
  return (
    getRgPart12OnlyArticleCount(rightEntry) - getRgPart12OnlyArticleCount(leftEntry)
    || getRgPart12OnlyOccurrenceCount(rightEntry) - getRgPart12OnlyOccurrenceCount(leftEntry)
    || (Number(left?.originalIndex) || 0) - (Number(right?.originalIndex) || 0)
  );
}
