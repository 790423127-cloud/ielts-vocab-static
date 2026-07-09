// collision-check.mjs — browser-compatible. No node:* imports.

import { COLLISION_MAP_ENTRIES, COLLISION_PAIRS } from "./collision-blacklist.generated.mjs";

let COLLISION_MAP = null;
let _COLLISION_PAIRS = COLLISION_PAIRS;

function loadCollisionData() {
  if (COLLISION_MAP) return;
  COLLISION_MAP = new Map();
  for (const [key, vals] of COLLISION_MAP_ENTRIES) {
    COLLISION_MAP.set(key, new Set(vals));
  }
  _COLLISION_PAIRS = COLLISION_PAIRS || [];
}

function normGloss(g) {
  return (g || "").trim().replace(/[；;，,、\s]/g, "");
}

export function glossesCollide(glossA, glossB) {
  loadCollisionData();
  const na = normGloss(glossA);
  const nb = normGloss(glossB);
  if (na === nb) return true;
  if (!COLLISION_MAP || _COLLISION_PAIRS.length === 0) return false;
  const collides = COLLISION_MAP.get(na);
  if (collides && collides.has(nb)) return true;
  for (const entry of _COLLISION_PAIRS) {
    for (const g1 of entry.pair) {
      const ng1 = normGloss(g1);
      if (na.includes(ng1) || ng1.includes(na)) {
        for (const g2 of entry.pair) {
          if (g1 === g2) continue;
          const ng2 = normGloss(g2);
          if (nb.includes(ng2) || ng2.includes(nb)) return true;
        }
      }
    }
  }
  return false;
}

export function getQuizMeaning(wordEntry) {
  if (wordEntry.quizSenses && Array.isArray(wordEntry.quizSenses) && wordEntry.quizSenses.length > 0) {
    return wordEntry.quizSenses[0].quizMeaningZh || wordEntry.meaningZh;
  }
  return wordEntry.meaningZh || (wordEntry._raw ? wordEntry._raw.meaning : "") || "";
}

export function getMeaningDetailed(wordEntry) {
  if (wordEntry.quizSenses && Array.isArray(wordEntry.quizSenses) && wordEntry.quizSenses.length > 0) {
    return wordEntry.quizSenses[0].meaningDetailedZh || wordEntry.meaningZh;
  }
  return wordEntry.meaningDetailedZh || wordEntry.meaningZh || "";
}

export function getPosLabel(wordEntry) {
  return wordEntry._posFamily || wordEntry.posFamily || "unknown";
}

export function checkCollision(targetQuizMeaning, candidateQuizMeaning) {
  loadCollisionData();
  if (glossesCollide(targetQuizMeaning, candidateQuizMeaning)) {
    return { allowed: false, reason: "gloss-collision" };
  }
  return { allowed: true, reason: null };
}

export function getCollisionPairs() {
  loadCollisionData();
  return _COLLISION_PAIRS;
}

export { loadCollisionData, normGloss };
