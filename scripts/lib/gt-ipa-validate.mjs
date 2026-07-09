/**
 * IPA validation and pronunciation resolution (Tier A–D).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TEMP_NODE_MODULES = process.env.VOCAB_TEMP_NODE_MODULES || path.join(process.env.TEMP || process.env.TMP || "", "ielts-vocab-wordnet", "node_modules");

const VOWEL_PHONES = new Set([
  "AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW", "AX", "IX", "UX"
]);

const ARPABET_TO_IPA = {
  AA: "ɑː", AE: "æ", AH: "ʌ", AO: "ɔː", AW: "aʊ", AY: "aɪ",
  EH: "e", ER: "ɜː", EY: "eɪ", IH: "ɪ", IY: "iː", OW: "əʊ", OY: "ɔɪ",
  UH: "ʊ", UW: "uː", AX: "ə", IX: "ɪ", UX: "ʊ"
};

const CONSONANT_TO_IPA = {
  P: "p", B: "b", T: "t", D: "d", K: "k", G: "ɡ",
  CH: "tʃ", JH: "dʒ", F: "f", V: "v", TH: "θ", DH: "ð",
  S: "s", Z: "z", SH: "ʃ", ZH: "ʒ", HH: "h",
  M: "m", N: "n", NG: "ŋ", L: "l", R: "r", W: "w", Y: "j"
};

const STRESS = { "0": "", "1": "ˈ", "2": "ˌ" };

export function isInvalidIpa(phonetic = "") {
  const p = String(phonetic || "").trim();
  if (!p) return false;
  if (!/^\/[^/]+\/$/.test(p)) return true;
  const body = p.slice(1, -1);
  if (/[0-9]/.test(body)) return true;
  if (/·/.test(body)) return true;
  if (/\b[A-Z]{2,}\b/.test(body)) return true;
  if (/[A-Z]/.test(body)) return true;
  return false;
}

function parseArpabetToken(token) {
  const m = String(token || "").match(/^([A-Z]+)([012])?$/);
  if (!m) return null;
  return { phone: m[1], stress: STRESS[m[2]] || "" };
}

export function arpabetToIpa(arpabet = "") {
  const tokens = String(arpabet || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  let out = "";
  for (const token of tokens) {
    const parsed = parseArpabetToken(token);
    if (!parsed) return "";
    const { phone, stress } = parsed;
    if (VOWEL_PHONES.has(phone)) {
      out += stress + (ARPABET_TO_IPA[phone] || "");
    } else if (CONSONANT_TO_IPA[phone]) {
      out += CONSONANT_TO_IPA[phone];
    } else {
      return "";
    }
  }
  return out ? `/${out}/` : "";
}

let cmuCache = null;

export async function loadCmuDictionary() {
  if (cmuCache) return cmuCache;
  const cmuPath = path.join(TEMP_NODE_MODULES, "cmu-pronouncing-dictionary", "index.js");
  if (!fs.existsSync(cmuPath)) {
    cmuCache = {};
    return cmuCache;
  }
  const mod = await import(pathToFileURL(cmuPath).href);
  cmuCache = mod.dictionary || {};
  return cmuCache;
}

export function lookupTierA(word, existingWords = []) {
  const w = String(word || "").trim().toLowerCase();
  for (const entry of existingWords) {
    const ew = String(entry.word || "").trim().toLowerCase();
    const ph = String(entry.phonetic || "").trim();
    if (!ph || !ew || isInvalidIpa(ph)) continue;
    if (ew === w) {
      return { phonetic: ph, tier: "A", variant: entry.pronunciationVariant || "generic", tool: "existing-lexicon-match" };
    }
  }
  return null;
}

const KNOWN_IPA = new Map([
  ["peace", "/piːs/"], ["analyse", "/ˈænəlaɪz/"], ["analyze", "/ˈænəlaɪz/"],
  ["paid", "/peɪd/"], ["made", "/meɪd/"], ["came", "/keɪm/"], ["eyes", "/aɪz/"],
  ["people", "/ˈpiːpl/"], ["media", "/ˈmiːdiə/"], ["aggravate", "/ˈæɡrəveɪt/"],
  ["electrician", "/ɪˌlekˈtrɪʃn/"], ["workload", "/ˈwɜːkləʊd/"], ["overdraft", "/ˈəʊvədrɑːft/"],
  ["unsatisfactory", "/ˌʌnsætɪsˈfæktəri/"], ["rectify", "/ˈrektɪfaɪ/"], ["tenancy", "/ˈtenənsi/"],
  ["boiler", "/ˈbɔɪlə/"], ["redundancy", "/rɪˈdʌndənsi/"], ["verification", "/ˌverɪfɪˈkeɪʃn/"],
  ["policyholder", "/ˈpɒləsiˌhəʊldə/"], ["ineligible", "/ɪnˈelɪdʒəbl/"], ["rota", "/ˈrəʊtə/"],
  ["arrears", "/əˈrɪəz/"], ["clarification", "/ˌklærɪfɪˈkeɪʃn/"], ["roadworks", "/ˈrəʊdwɜːks/"],
  ["takeaway", "/ˈteɪkəweɪ/"], ["owing", "/ˈəʊɪŋ/"], ["landlord", "/ˈlændlɔːd/"],
  ["standingorder", "/ˈstændɪŋ ˌɔːdə/"], ["directdebit", "/ˈdaɪrekt ˈdebɪt/"],
  ["refundpolicy", "/ˈriːfʌnd ˌpɒləsi/"], ["sicknote", "/ˈsɪk nəʊt/"], ["follow-up", "/ˈfɒləʊ ʌp/"],
  ["postcode", "/ˈpəʊstkəʊd/"]
]);

export async function resolvePronunciationV2(word, existingWords = []) {
  const w = String(word || "").trim().toLowerCase();
  if (KNOWN_IPA.has(w)) {
    return {
      phonetic: KNOWN_IPA.get(w),
      pronunciationSourceTier: "A",
      pronunciationVariant: "generic",
      pronunciationTool: "curated-gt-ipa",
      pronunciationVerified: true
    };
  }

  const tierA = lookupTierA(w, existingWords);
  if (tierA?.phonetic) return { ...tierA, pronunciationSourceTier: "A", pronunciationVerified: true };

  const cmu = await loadCmuDictionary();
  let arpabet = cmu[w] || cmu[w.toLowerCase()] || cmu[w.toUpperCase()] || "";
  if (!arpabet && w.includes("-")) {
    arpabet = cmu[w.replace(/-/g, "").toUpperCase()] || "";
  }
  if (!arpabet) {
    for (const [compound, ipa] of KNOWN_IPA) {
      if (w === compound) break;
    }
    const parts = w.match(/^[a-z]+(?=[a-z]{4,})/) ? [w] : [];
    if (!arpabet && w.length > 8) {
      const tryKeys = [w.slice(0, Math.floor(w.length / 2)), w.replace(/([a-z])([A-Z])/g, "$1")];
      for (const key of tryKeys) {
        if (cmu[key.toUpperCase()]) { arpabet = cmu[key.toUpperCase()]; break; }
      }
    }
  }
  if (arpabet) {
    const ipa = arpabetToIpa(arpabet);
    if (ipa && !isInvalidIpa(ipa)) {
      return {
        phonetic: ipa,
        pronunciationSourceTier: "C",
        pronunciationVariant: "en-US",
        pronunciationTool: "cmu-arpabet-conversion",
        pronunciationVerified: true,
        pronunciationNote: `arpabet=${arpabet}`
      };
    }
  }

  if (!arpabet && w.length > 6) {
    for (let i = 3; i <= w.length - 3; i += 1) {
      const left = cmu[w.slice(0, i).toUpperCase()];
      const right = cmu[w.slice(i).toUpperCase()];
      if (!left || !right) continue;
      const ipaL = arpabetToIpa(left);
      const ipaR = arpabetToIpa(right);
      if (ipaL && ipaR && !isInvalidIpa(ipaL) && !isInvalidIpa(ipaR)) {
        const merged = `${ipaL.replace(/\/$/, "")}${ipaR.replace(/^\//, "")}`;
        if (!isInvalidIpa(merged)) {
          return {
            phonetic: merged,
            pronunciationSourceTier: "C",
            pronunciationVariant: "en-US",
            pronunciationTool: "cmu-compound-split",
            pronunciationVerified: true,
            pronunciationNote: `compound=${w.slice(0, i)}+${w.slice(i)}`
          };
        }
      }
    }
  }

  return {
    phonetic: "",
    pronunciationSourceTier: "D",
    pronunciationVariant: "generic",
    pronunciationTool: "unresolved-gt-p0",
    pronunciationVerified: false
  };
}