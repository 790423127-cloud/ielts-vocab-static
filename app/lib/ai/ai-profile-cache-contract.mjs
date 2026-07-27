export const AI_RELATION_REVIEW_FIELDS = Object.freeze([
  "forms",
  "wordFamily",
  "synonyms"
]);

export function hasExplicitAiRelationReview(profile = {}) {
  return AI_RELATION_REVIEW_FIELDS.every((field) => Array.isArray(profile?.[field]));
}

export function shouldReuseAiProfileCache(profile, { force = false, usable = false } = {}) {
  return !force && usable === true && hasExplicitAiRelationReview(profile);
}
