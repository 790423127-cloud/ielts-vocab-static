/**
 * Shared example sentence cleanup for flashcard / TTS / spelling display.
 * Fixes: leading bullets, mid-passage fragments, multi-sentence corpus dumps,
 * double spaces, trailing junk.
 */

const BULLET_RE = /^[\s•·●▪◦*‧∙・\-–—]+/;

/**
 * Cheap guard for large runtime lexicons. False positives are acceptable; a
 * false negative would skip the full cleanup pipeline.
 */
export function exampleFieldsNeedCleanup(example = "", exampleCn = "", options = {}) {
  const raw = String(example || "");
  const text = raw.trim();
  const rawCn = String(exampleCn || "");
  const textCn = rawCn.trim();
  const maxWords = Number(options.maxWords) || 36;

  if (!text) return Boolean(options.synthesizeIfEmpty || raw !== text || rawCn !== textCn);
  if (raw !== text || rawCn !== textCn) return true;
  if (BULLET_RE.test(text) || BULLET_RE.test(textCn)) return true;
  if (/\s{2,}|\s+([,.;!?])|([.!?])\2/.test(text) || /\s{2,}/.test(textCn)) return true;
  if (text.length > 120 || !/[.!?]"?$/.test(text) || /^["']?[a-z]/.test(text)) return true;
  if (/[.!?]\s+(?=[A-Z"'])/.test(text)) return true;
  return text.split(/\s+/).length > maxWords;
}

/**
 * Split into sentence-like chunks without destroying abbreviations too aggressively.
 */
export function splitExampleSentences(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return [];
  // Keep common abbreviations glued
  const protectedText = raw
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|e\.g|i\.e|vs|etc|No|Fig|St)\./gi, (m) => m.replace(".", "∯"))
    .replace(/(\d)\.(\d)/g, "$1∯$2");

  const parts = protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z"'])|(?<=[.!?])\s*$/g)
    .map((s) => s.replace(/∯/g, ".").trim())
    .filter(Boolean);

  if (parts.length) return parts;
  return [raw];
}

export function stripExampleBulletsAndNoise(example = "") {
  let t = String(example || "").trim();
  if (!t) return "";
  t = t.replace(/^["'`]+|["'`]+$/g, "").trim();
  t = t.replace(BULLET_RE, "").trim();
  // strip repeated leading bullets after first pass
  t = t.replace(BULLET_RE, "").trim();
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/\s+([,.;!?])/g, "$1");
  t = t.replace(/([.!?]){2,}/g, "$1");
  return t.trim();
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does the sentence contain the target word/phrase (or a light inflection)?
 */
export function exampleMentionsTarget(example = "", target = "") {
  const text = String(example || "");
  const word = String(target || "").trim();
  if (!text || !word) return false;
  if (word.includes(" ")) {
    return new RegExp(escapeRegExp(word), "i").test(text);
  }
  // allow simple inflections: work/works/worked/working
  const base = escapeRegExp(word);
  const re = new RegExp(`\\b${base}(?:s|es|ed|ing|er|ers|est|ies|ied)?\\b`, "i");
  if (re.test(text)) return true;
  // hyphenated compounds: day-to-day
  if (word.includes("-") && new RegExp(escapeRegExp(word), "i").test(text)) return true;
  // British/American s/z and our/or variants
  const variants = new Set([word]);
  if (/z/i.test(word)) variants.add(word.replace(/z/gi, (ch) => (ch === "Z" ? "S" : "s")));
  if (/s/i.test(word) && !/ss$/i.test(word)) {
    variants.add(word.replace(/s(?=[a-z]|$)/gi, (ch) => (ch === "S" ? "Z" : "z")));
  }
  if (/our/i.test(word)) variants.add(word.replace(/our/gi, "or"));
  if (/or/i.test(word)) variants.add(word.replace(/or/gi, "our"));
  for (const v of variants) {
    if (v === word) continue;
    const vre = new RegExp(`\\b${escapeRegExp(v)}(?:s|es|ed|ing)?\\b`, "i");
    if (vre.test(text)) return true;
  }
  return false;
}

function capitalizeSentence(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  // if starts with quote
  if (/^["']/.test(t) && t.length > 1) {
    return t[0] + t[1].toUpperCase() + t.slice(2);
  }
  return t[0].toUpperCase() + t.slice(1);
}

function ensureTerminalPunctuation(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  if (/[.!?]"?$/.test(t) || /[.!?]$/.test(t)) return t;
  return `${t}.`;
}

/**
 * Pick the best single sentence from a possibly long corpus extract.
 */
export function pickBestExampleSentence(example = "", target = "", options = {}) {
  const maxWords = Number(options.maxWords) || 36;
  const cleaned = stripExampleBulletsAndNoise(example);
  if (!cleaned) return "";

  const sentences = splitExampleSentences(cleaned);
  const targetWord = String(target || "").trim();

  let candidates = sentences;
  if (targetWord) {
    const hit = sentences.filter((s) => exampleMentionsTarget(s, targetWord));
    if (hit.length) candidates = hit;
  }

  // Prefer shorter readable sentences that still contain the target
  candidates = [...candidates].sort((a, b) => {
    const wa = a.split(/\s+/).length;
    const wb = b.split(/\s+/).length;
    // prefer 6–28 words
    const score = (w) => {
      if (w < 5) return 100 + w;
      if (w > maxWords) return 50 + (w - maxWords);
      return Math.abs(w - 14);
    };
    return score(wa) - score(wb) || a.length - b.length;
  });

  let best = candidates[0] || cleaned;

  // Prefer a complete sentence ending with .!? when available
  const complete = candidates.find(
    (s) => /[.!?]"?$/.test(s.trim()) && s.split(/\s+/).length <= maxWords + 8
  );
  if (complete) best = complete;

  // If still multi-clause monster, soft-trim at maxWords on word boundary only
  const tokens = best.split(/\s+/);
  if (tokens.length > maxWords) {
    let cut = tokens.slice(0, maxWords).join(" ");
    // avoid mid-hyphen / mid-fragment: drop trailing incomplete token if very short junk
    cut = cut.replace(/[,:;]\s*$/, "").replace(/\s+[a-z]{1,2}$/i, "");
    // if we cut a clearly incomplete clause ("they probably"), fall back to shorter clause with target
    if (/\b(probably|and|or|but|to|for|with|the|a|an)$/i.test(cut)) {
      const withTarget = candidates
        .filter((s) => exampleMentionsTarget(s, targetWord))
        .sort((a, b) => a.split(/\s+/).length - b.split(/\s+/).length)[0];
      if (withTarget && withTarget.split(/\s+/).length <= maxWords + 4) {
        best = withTarget;
      } else {
        best = cut;
      }
    } else {
      best = cut;
    }
  }

  best = capitalizeSentence(best);
  best = ensureTerminalPunctuation(best);
  // never end with dangling mid-word truncation like "trai."
  best = best.replace(/\b([A-Za-z]{1,3})\.$/, ".").replace(/\.\.$/, ".");
  if (best === "." || best.length < 8) {
    best = capitalizeSentence(candidates[0] || cleaned);
    best = ensureTerminalPunctuation(best);
  }
  return best;
}

/**
 * Template example when source has none (phrase or word).
 */
export function synthesizeExample(target = "", meaningZh = "", entryType = "word") {
  const w = String(target || "").trim();
  if (!w) return "";
  if (entryType === "phrase" || /\s/.test(w)) {
    return `You will often see the expression "${w}" in IELTS reading passages.`;
  }
  const gloss = String(meaningZh || "").split(/[；;，,]/)[0].trim();
  if (gloss) {
    return `In the passage, "${w}" relates to ${gloss}.`;
  }
  return `The word "${w}" appears in many IELTS General Training reading texts.`;
}

function looksTruncatedExample(text = "") {
  const t = String(text || "").trim();
  if (!t) return true;
  // clearly incomplete clause endings common in cut corpus dumps
  if (/\b(probably|and|or|but|to|for|with|the|a|an|means|is|are|was|were|have|has|had)$/i.test(t.replace(/[.!?]"?$/, ""))) {
    return true;
  }
  // ends with mid-word fragment like "trai" / "profes"
  if (/\b[a-z]{2,}$/i.test(t) && !/[.!?]"?$/.test(t)) {
    const last = t.split(/\s+/).pop() || "";
    if (last.length >= 3 && last.length <= 5 && !/ly$|ed$|ing$|tion$|ness$|ment$|able$|ible$|ous$/i.test(last)) {
      // short tail without terminal punctuation → likely cut
      return true;
    }
  }
  // ends mid-word without vowels pattern: "trai."
  if (/\b[bcdfghjklmnpqrstvwxyz]{3,}\.?$/i.test(t) && !/[aeiou][bcdfghjklmnpqrstvwxyz]*\.?$/i.test(t.split(/\s+/).pop() || "")) {
    return true;
  }
  if (/\b[a-z]{1,4}\.$/i.test(t) && !/\b(a|an|the|to|of|in|on|at|is|it|as|or|if|so|no|yes|ok|us|me|my|we|he|she|they|this|that|from|with|for|and|but)\.$/i.test(t)) {
    const last = (t.match(/\b([A-Za-z]+)\.$/) || [])[1] || "";
    if (last.length <= 4 && !/^(a|an|the|to|of|in|on|at|is|it|as|or|if|so|us|me|my|we|he|she|this|that|from|with|for|and|but|not|all|any|one|two)$/i.test(last)) {
      return true;
    }
  }
  return false;
}

/**
 * Full clean pipeline for one example field.
 * @returns {{ example: string, repaired: boolean, reason: string }}
 */
export function cleanExampleField(example = "", target = "", options = {}) {
  const original = String(example || "").trim();
  const entryType = options.entryType || (/\s/.test(String(target || "")) ? "phrase" : "word");
  const meaningZh = options.meaningZh || "";
  const allowSynthTruncated = options.synthesizeIfTruncated === true;

  if (!original) {
    if (options.synthesizeIfEmpty) {
      return {
        example: synthesizeExample(target, meaningZh, entryType),
        repaired: true,
        reason: "synthesized_empty"
      };
    }
    return { example: "", repaired: false, reason: "empty" };
  }

  const stripped = stripExampleBulletsAndNoise(original);
  let next = pickBestExampleSentence(stripped, target, options);
  let reason = "";

  if (stripped !== original) reason = "strip_noise";
  if (next !== stripped && next !== original) reason = reason ? `${reason}+pick_sentence` : "pick_sentence";

  // Mid-fragment that never capitalized properly already handled; ensure not empty
  if (!next) {
    if (options.synthesizeIfEmpty) {
      return {
        example: synthesizeExample(target, meaningZh, entryType),
        repaired: true,
        reason: "synthesized_after_clean"
      };
    }
    return { example: "", repaired: true, reason: "cleaned_to_empty" };
  }

  // Corpus dumps often end mid-sentence ("... they probably" / "... professional trai")
  if (looksTruncatedExample(next)) {
    // Prefer any complete sentence that still mentions the target
    const completeHit = splitExampleSentences(stripped).find(
      (s) =>
        exampleMentionsTarget(s, target) &&
        /[.!?]"?$/.test(s.trim()) &&
        !looksTruncatedExample(s)
    );
    if (completeHit) {
      next = ensureTerminalPunctuation(capitalizeSentence(completeHit));
      reason = reason ? `${reason}+complete_hit` : "complete_hit";
    } else if (allowSynthTruncated) {
      return {
        example: synthesizeExample(target, meaningZh, entryType),
        repaired: true,
        reason: "synthesized_truncated"
      };
    }
  }

  // If cleaned example no longer mentions target and original did a long dump,
  // prefer a short synthetic that keeps the form visible for learning.
  if (
    target &&
    !exampleMentionsTarget(next, target) &&
    options.preferTargetMention !== false &&
    original.length > 120
  ) {
    const synth = synthesizeExample(target, meaningZh, entryType);
    return { example: synth, repaired: true, reason: "synthesize_lost_target" };
  }

  const repaired = next !== original;
  return { example: next, repaired, reason: repaired ? reason || "normalized" : "ok" };
}

/**
 * Clean exampleCn lightly (trim, drop bullets).
 */
export function cleanExampleCnField(exampleCn = "") {
  let t = String(exampleCn || "").trim();
  if (!t) return "";
  t = t.replace(BULLET_RE, "").trim();
  t = t.replace(/\s{2,}/g, " ");
  return t;
}
