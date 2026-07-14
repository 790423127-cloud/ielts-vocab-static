/**
 * Incremental metadata enrich for reading-g-vocab.json
 * - phraseStudyStage 1|2 from gt-reading-phrases-400.json source order
 * - fill missing WORD phonetics from trusted sources only
 * Does NOT add/remove items or change word surfaces / layers / studyMode.
 *
 * Usage: node scripts/enrich-reading-g-v3-metadata.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const vocabPath = path.join(root, "public/data/reading-g-vocab.json");
const masterPath = path.join(root, "public/data/words.json");
const phrasesSrc = path.join(
  "C:/Users/Administrator/Desktop/阅读核心/gt-reading-phrases-400.json"
);
const enhancedSrc = path.join(
  "C:/Users/Administrator/Desktop/阅读核心/gt-reading-main-enhanced-3592.json"
);

function nk(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function extractList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.words)) return data.words;
  if (Array.isArray(data.phrases)) return data.phrases;
  return [];
}

function phoneticOf(entry) {
  if (!entry || typeof entry !== "object") return "";
  return String(
    entry.phonetic || entry.ipa || entry.phonetics || entry.symbol || ""
  ).trim();
}

function main() {
  const vocab = loadJson(vocabPath);
  if (!vocab?.items?.length) {
    console.error("missing vocab");
    process.exit(1);
  }
  const beforeCount = vocab.items.length;
  const beforeWords = vocab.items.map((i) => i.word).join("\n");

  // —— phraseStudyStage ——
  const phraseFile = loadJson(phrasesSrc);
  const phraseOrder = extractList(phraseFile)
    .map((x) => nk(x.word || x.phrase || x.headword || x.text))
    .filter(Boolean);
  // unique preserve order
  const seenPh = new Set();
  const orderedUnique = [];
  for (const k of phraseOrder) {
    if (seenPh.has(k)) continue;
    seenPh.add(k);
    orderedUnique.push(k);
  }
  const stage1Set = new Set(orderedUnique.slice(0, 200));
  const stage2Set = new Set(orderedUnique.slice(200, 400));

  // fallback: if source missing, order by appearance in vocab among phrases400
  let usedFallbackOrder = false;
  if (orderedUnique.length < 400) {
    usedFallbackOrder = true;
    const p400 = vocab.items.filter((i) => (i.layers || []).includes("phrases400"));
    // stable sort by primaryLayer phrases first then word
    p400.sort((a, b) => {
      const ra = Number(a.layerRank) || 99;
      const rb = Number(b.layerRank) || 99;
      if (ra !== rb) return ra - rb;
      return String(a.word).localeCompare(String(b.word));
    });
    stage1Set.clear();
    stage2Set.clear();
    p400.forEach((it, idx) => {
      const k = nk(it.normalizedKey || it.word);
      if (idx < 200) stage1Set.add(k);
      else stage2Set.add(k);
    });
  }

  let s1 = 0;
  let s2 = 0;
  for (const it of vocab.items) {
    const layers = it.layers || [];
    if (!layers.includes("phrases400")) {
      // clear stray
      if (it.phraseStudyStage != null && it.phraseStudyStage !== 0) {
        // only clear if not phrases400
        delete it.phraseStudyStage;
      }
      continue;
    }
    const k = nk(it.normalizedKey || it.word);
    if (stage1Set.has(k)) {
      it.phraseStudyStage = 1;
      s1 += 1;
    } else if (stage2Set.has(k)) {
      it.phraseStudyStage = 2;
      s2 += 1;
    } else {
      // phrases400 tag but not in source file order: assign by remaining
      // put leftovers into stage2 if stage1 full else stage1
      if (s1 < 200) {
        it.phraseStudyStage = 1;
        s1 += 1;
      } else {
        it.phraseStudyStage = 2;
        s2 += 1;
      }
    }
  }

  // —— phonetics ——
  const master = loadJson(masterPath);
  const enhanced = loadJson(enhancedSrc);
  const phMap = new Map(); // key -> { phonetic, source }

  function addPh(word, phonetic, source) {
    const k = nk(word);
    const p = String(phonetic || "").trim();
    if (!k || !p) return;
    if (phMap.has(k)) return;
    phMap.set(k, { phonetic: p, source });
  }

  for (const w of extractList(enhanced)) {
    addPh(w.word || w.headword, phoneticOf(w), "gt-reading-main-enhanced-3592");
  }
  for (const w of master?.words || []) {
    addPh(w.word, phoneticOf(w), "words.json");
  }
  // self: existing phonetics as cache
  for (const it of vocab.items) {
    if (phoneticOf(it)) addPh(it.word, phoneticOf(it), "reading-g-vocab-existing");
  }

  let filled = 0;
  let stillMissingWord = 0;
  let missingPhrase = 0;
  const unresolved = [];

  for (const it of vocab.items) {
    const isPhrase = it.entryType === "phrase" || /\s/.test(it.word || "");
    const has = Boolean(String(it.phonetic || "").trim());
    if (isPhrase) {
      if (!has) missingPhrase += 1;
      continue;
    }
    if (has) continue;
    const hit = phMap.get(nk(it.normalizedKey || it.word));
    if (hit && hit.source !== "reading-g-vocab-existing") {
      it.phonetic = hit.phonetic;
      it.phoneticSource = hit.source;
      filled += 1;
    } else {
      stillMissingWord += 1;
      unresolved.push(it.word);
    }
  }

  if (vocab.items.length !== beforeCount) {
    console.error("COUNT CHANGED — abort");
    process.exit(1);
  }
  const afterWords = vocab.items.map((i) => i.word).join("\n");
  if (afterWords !== beforeWords) {
    console.error("WORD SURFACES CHANGED — abort");
    process.exit(1);
  }

  vocab.enrichedAt = new Date().toISOString();
  vocab.enrichment = {
    phraseStudyStage: {
      stage1: s1,
      stage2: s2,
      usedFallbackOrder,
      source: usedFallbackOrder ? "vocab-phrases400-order" : "gt-reading-phrases-400.json"
    },
    phonetics: {
      filled,
      stillMissingWord,
      missingPhrase,
      unresolvedSample: unresolved.slice(0, 40)
    }
  };

  fs.writeFileSync(vocabPath, JSON.stringify(vocab, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        ok: true,
        count: vocab.items.length,
        phraseStage1: s1,
        phraseStage2: s2,
        usedFallbackOrder,
        phoneticFilled: filled,
        missingWordPhonetics: stillMissingWord,
        missingPhrasePhonetics: missingPhrase
      },
      null,
      2
    )
  );
}

main();
