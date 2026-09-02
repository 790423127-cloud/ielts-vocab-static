/**
 * Full-system read-only audit (per IELTS-词汇网站-系统审计.md).
 * Does not modify formal lexicon / IndexedDB / production.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(ROOT, "docs");
const stamp = "2026-08-09";

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return {
    bytes: buf.length,
    sha256: crypto.createHash("sha256").update(buf).digest("hex")
  };
}

function readJson(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { missing: true, path: rel };
  try {
    return { path: rel, data: JSON.parse(fs.readFileSync(p, "utf8")), ...sha256File(p) };
  } catch (error) {
    return { path: rel, parseError: String(error?.message || error), ...sha256File(p) };
  }
}

function nk(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function listPages() {
  const app = path.join(ROOT, "app");
  const pages = [];
  function walk(dir, base = "") {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.join(base, name);
      if (fs.statSync(full).isDirectory()) {
        if (name === "api" || name === "components" || name === "hooks" || name === "lib") continue;
        walk(full, rel);
      } else if (name === "page.jsx" || name === "page.js" || name === "page.tsx") {
        pages.push(`/${base.replaceAll("\\", "/") || ""}`.replace(/\/$/, "") || "/");
      }
    }
  }
  walk(app);
  return pages.sort();
}

function listApiRoutes() {
  const apiRoot = path.join(ROOT, "app", "api");
  const routes = [];
  function walk(dir, base = "") {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.join(base, name);
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else if (name === "route.js" || name === "route.ts") {
        routes.push(`/api/${base.replaceAll("\\", "/")}`);
      }
    }
  }
  walk(apiRoot);
  return routes.sort();
}

function auditMasterLexicon(wordsJson) {
  const words = asArray(wordsJson?.words || wordsJson?.items);
  const ids = new Map();
  const wordIds = new Map();
  const heads = new Map();
  const issues = {
    missingId: [],
    dupId: [],
    dupWordId: [],
    dupHead: [],
    emptyWord: [],
    missingMeaning: [],
    missingPos: [],
    missingDifficulty: [],
    missingExample: [],
    phraseLikeInWord: [],
    suspiciousTruncation: []
  };

  for (let i = 0; i < words.length; i += 1) {
    const w = words[i] || {};
    const id = String(w.id || "").trim();
    const wordId = String(w.wordId || "").trim();
    const word = String(w.word || "").trim();
    const head = nk(word);
    const meaning = String(w.meaning || w.primaryMeaningZh || "").trim();
    const pos = String(w.pos || w.primaryPos || "").trim();
    const difficulty = String(w.difficulty || "").trim();
    const example = String(w.example || "").trim();

    if (!word) issues.emptyWord.push({ index: i, id });
    if (!id) issues.missingId.push({ index: i, word });
    else if (ids.has(id)) issues.dupId.push({ id, a: ids.get(id), b: word });
    else ids.set(id, word);

    if (wordId) {
      if (wordIds.has(wordId) && wordIds.get(wordId) !== word) {
        issues.dupWordId.push({ wordId, a: wordIds.get(wordId), b: word });
      } else wordIds.set(wordId, word);
    }

    if (head) {
      if (heads.has(head)) issues.dupHead.push({ head, a: heads.get(head), b: word, id });
      else heads.set(head, word);
    }

    if (!meaning) issues.missingMeaning.push({ word, id });
    if (!pos) issues.missingPos.push({ word, id });
    if (!difficulty) issues.missingDifficulty.push({ word, id });
    if (!example) issues.missingExample.push({ word, id });
    if (/\s/.test(word) && !w.lexicalizedCompound) {
      issues.phraseLikeInWord.push({ word, id });
    }
    // short junk / truncation-ish single letter or "suggests t" style
    if (/^[a-z]$/i.test(word) || /\s[a-z]$/i.test(word) || word.length <= 1) {
      issues.suspiciousTruncation.push({ word, id, meaning: meaning.slice(0, 40) });
    }
  }

  // brushable estimate: non-space headwords
  const brushable = words.filter((w) => {
    const word = String(w.word || "").trim();
    if (!word || /\s/.test(word)) return false;
    if (w.studyMode === "reference") return false;
    if (w.entryType === "phrase") return false;
    return true;
  }).length;

  return {
    physicalCount: words.length,
    uniqueIds: ids.size,
    uniqueHeads: heads.size,
    brushableApprox: brushable,
    issueCounts: Object.fromEntries(
      Object.entries(issues).map(([k, v]) => [k, v.length])
    ),
    samples: Object.fromEntries(
      Object.entries(issues).map(([k, v]) => [k, v.slice(0, 8)])
    )
  };
}

function auditReadingG(vocab) {
  const items = asArray(vocab?.items);
  const isPhrase = (i) =>
    (i?.entryType || "word") === "phrase" || /\s/.test(String(i?.word || ""));
  const words = items.filter((i) => !isPhrase(i));
  const phrases = items.filter(isPhrase);
  const activeWords = words.filter((i) => i.studyMode !== "reference");
  const refWords = words.filter((i) => i.studyMode === "reference");
  const ids = new Map();
  const heads = new Map();
  const dups = [];
  const missingId = [];
  let formRows = 0;
  let familyRows = 0;
  let missingMeaning = 0;
  let missingExample = 0;

  for (const it of items) {
    const id = String(it.id || "").trim();
    const head = nk(it.normalizedKey || it.word);
    if (!id) missingId.push(it.word);
    else if (ids.has(id)) dups.push({ id, a: ids.get(id), b: it.word });
    else ids.set(id, it.word);
    if (head) {
      if (heads.has(head) && heads.get(head) !== it.word) {
        /* allow type collision handled by entryType */
      } else heads.set(head, it.word);
    }
    formRows += asArray(it.forms).length;
    familyRows += asArray(it.wordFamily).length;
    if (!String(it.meaning || it.primaryMeaningZh || "").trim()) missingMeaning += 1;
    if (!String(it.example || "").trim()) missingExample += 1;
  }

  // form surfaces that also standalone
  const formOwners = new Map();
  for (const w of words) {
    const owner = nk(w.normalizedKey || w.word);
    for (const row of asArray(w.forms)) {
      const fk = nk(typeof row === "string" ? row : row?.word);
      if (!fk || fk === owner) continue;
      if (!formOwners.has(fk)) formOwners.set(fk, new Set());
      formOwners.get(fk).add(owner);
    }
  }
  let standaloneAlsoForm = 0;
  for (const w of words) {
    const k = nk(w.normalizedKey || w.word);
    if (formOwners.has(k)) standaloneAlsoForm += 1;
  }

  return {
    meta: {
      count: vocab?.count,
      wordCount: vocab?.wordCount,
      phraseCount: vocab?.phraseCount,
      activeCount: vocab?.activeCount,
      referenceCount: vocab?.referenceCount
    },
    items: items.length,
    words: words.length,
    phrases: phrases.length,
    activeWords: activeWords.length,
    refWords: refWords.length,
    uniqueIds: ids.size,
    dupIds: dups.length,
    missingId: missingId.length,
    formRows,
    familyRows,
    missingMeaning,
    missingExample,
    standaloneAlsoForm,
    sampleDupIds: dups.slice(0, 5)
  };
}

function auditMeaning6000(m6000, masterIds) {
  const rows = asArray(m6000?.words || m6000?.items || m6000);
  const dangling = [];
  for (const row of rows) {
    const id = String(row.id || row.wordId || "").trim();
    const word = String(row.word || "").trim();
    if (id && masterIds && !masterIds.has(id)) {
      dangling.push({ id, word });
    }
  }
  return {
    count: rows.length || m6000?.count || null,
    danglingFromMaster: dangling.length,
    sampleDangling: dangling.slice(0, 10)
  };
}

function scanApiAdminGuards() {
  const apiRoot = path.join(ROOT, "app", "api");
  const routes = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name === "route.js") routes.push(full);
    }
  }
  walk(apiRoot);
  const writeish = [];
  const missingGuard = [];
  for (const file of routes) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replaceAll("\\", "/");
    const hasPost = /export\s+async\s+function\s+POST|export\s+function\s+POST/.test(src);
    const hasPut = /function\s+PUT/.test(src);
    const hasDelete = /function\s+DELETE/.test(src);
    const hasWrite = hasPost || hasPut || hasDelete || /writeFile|fs\.write|atomicWrite/.test(src);
    const hasGuard =
      /requireLocalAdmin|local-admin-guard|assertLocalAdmin|isLocalAdmin/.test(src);
    if (hasWrite) {
      writeish.push(rel);
      if (!hasGuard) missingGuard.push(rel);
    }
  }
  return { routeFiles: routes.length, writeishCount: writeish.length, missingGuard, writeish };
}

function scanKeyboardHandlers() {
  const files = [
    "app/page.jsx",
    "app/reading-g/page.jsx",
    "app/basic/page.jsx",
    "app/hooks/useWordFlashNavigation.js",
    "app/lib/vocab/study-keyboard-shortcuts.mjs",
    "public/assets/reading-g.js",
    "public/assets/spelling.js"
  ];
  const findings = [];
  for (const rel of files) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, "utf8");
    findings.push({
      file: rel,
      hasKeydown: /keydown|onKeyDown|addEventListener\(\s*["']keydown/.test(src),
      hasDeleteShortcut: /shouldHandleStudyDeleteShortcut|KeyD|Delete|deleteCurrent/.test(src),
      guardsInput:
        /tagName|input|textarea|contentEditable|isContentEditable|select/.test(src),
      ignoresRepeat: /event\.repeat|e\.repeat/.test(src)
    });
  }
  return findings;
}

function scanStaticAssets() {
  const publicDir = path.join(ROOT, "public");
  const html = fs
    .readdirSync(publicDir)
    .filter((n) => n.endsWith(".html"))
    .sort();
  const assets = fs.existsSync(path.join(publicDir, "assets"))
    ? fs.readdirSync(path.join(publicDir, "assets")).filter((n) => n.endsWith(".js") || n.endsWith(".css"))
    : [];
  const cacheWords = path.join(ROOT, ".static-export-cache", "words.json");
  const publicWords = path.join(ROOT, "public", "data", "words.json");
  let wordsParity = null;
  if (fs.existsSync(cacheWords) && fs.existsSync(publicWords)) {
    const a = sha256File(publicWords);
    const b = sha256File(cacheWords);
    wordsParity = {
      publicBytes: a.bytes,
      cacheBytes: b.bytes,
      sameHash: a.sha256 === b.sha256,
      publicSha: a.sha256,
      cacheSha: b.sha256
    };
  }
  return { html, assetsCount: assets.length, wordsParity };
}

function scanTmpArtifacts() {
  const dataDir = path.join(ROOT, "public", "data");
  const tmps = fs
    .readdirSync(dataDir)
    .filter((n) => n.includes(".tmp") || n.endsWith(".tmp"))
    .map((n) => {
      const st = fs.statSync(path.join(dataDir, n));
      return { name: n, bytes: st.size, mtime: st.mtime.toISOString() };
    });
  return tmps;
}

function main() {
  const pages = listPages();
  const apis = listApiRoutes();
  const masterFile = readJson("public/data/words.json");
  const cacheMaster = readJson(".static-export-cache/words.json");
  const phrases = readJson("public/data/phrases.json");
  const basic = readJson("public/data/basic-words.json");
  const readingG = readJson("public/data/reading-g-vocab.json");
  const meaning6k = readJson("public/data/meaning-6000.json");
  const ielts538 = readJson("public/data/ielts-538-words.json");
  const paraphrases = readJson("public/data/reading-g-paraphrases.json");

  const masterWords = asArray(masterFile.data?.words || masterFile.data?.items);
  const masterIds = new Set(
    masterWords.map((w) => String(w.id || "").trim()).filter(Boolean)
  );

  const masterAudit = masterFile.data ? auditMasterLexicon(masterFile.data) : null;
  const gAudit = readingG.data ? auditReadingG(readingG.data) : null;
  const m6 = meaning6k.data ? auditMeaning6000(meaning6k.data, masterIds) : null;
  const apiGuards = scanApiAdminGuards();
  const keys = scanKeyboardHandlers();
  const staticAssets = scanStaticAssets();
  const tmpArtifacts = scanTmpArtifacts();

  // known quality suspects from prior audit
  const suspects = ["suggests t", "excluding", "immune system", "e", "n"];
  const suspectHits = [];
  for (const s of suspects) {
    const hit = masterWords.find((w) => nk(w.word) === nk(s));
    if (hit) {
      suspectHits.push({
        word: hit.word,
        id: hit.id,
        pos: hit.pos || hit.primaryPos || "",
        meaning: String(hit.meaning || "").slice(0, 60),
        difficulty: hit.difficulty || "",
        example: Boolean(hit.example)
      });
    } else {
      suspectHits.push({ word: s, missingFromMaster: true });
    }
  }

  const report = {
    auditPlan: "IELTS-词汇网站-系统审计.md",
    mode: "read-only",
    generatedAt: new Date().toISOString(),
    gitHeadHint: "see workspace",
    structure: {
      nextPages: pages,
      pageCount: pages.length,
      apiRoutes: apis,
      apiCount: apis.length
    },
    datasets: {
      master: masterFile.missing
        ? masterFile
        : {
            path: masterFile.path,
            bytes: masterFile.bytes,
            sha256: masterFile.sha256,
            countField: masterFile.data?.count || masterFile.data?.words?.length,
            audit: masterAudit
          },
      staticCacheMaster: cacheMaster.missing
        ? cacheMaster
        : {
            path: cacheMaster.path,
            bytes: cacheMaster.bytes,
            sha256: cacheMaster.sha256,
            parity: staticAssets.wordsParity
          },
      phrases: phrases.missing
        ? phrases
        : { path: phrases.path, bytes: phrases.bytes, count: asArray(phrases.data?.phrases || phrases.data?.items || phrases.data).length },
      basic: basic.missing
        ? basic
        : { path: basic.path, bytes: basic.bytes, count: asArray(basic.data?.words || basic.data?.items || basic.data).length },
      readingG: readingG.missing
        ? readingG
        : { path: readingG.path, bytes: readingG.bytes, sha256: readingG.sha256, audit: gAudit },
      meaning6000: meaning6k.missing
        ? meaning6k
        : { path: meaning6k.path, bytes: meaning6k.bytes, audit: m6 },
      ielts538: ielts538.missing
        ? ielts538
        : {
            path: ielts538.path,
            bytes: ielts538.bytes,
            count: asArray(ielts538.data?.words || ielts538.data?.items || ielts538.data).length
          },
      readingGParaphrases: paraphrases.missing
        ? paraphrases
        : {
            path: paraphrases.path,
            bytes: paraphrases.bytes,
            groups: asArray(paraphrases.data?.groups).length
          }
    },
    qualitySuspects: suspectHits,
    apiWriteGuards: apiGuards,
    keyboard: keys,
    staticSurface: staticAssets,
    tmpArtifacts,
    openWorkingTreeNote:
      "Workspace has many uncommitted changes (reading-g expansion, fonts, static assets). Audit is snapshot of current files, not a clean main."
  };

  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `full-system-audit-${stamp}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, jsonPath, summary: {
    pages: pages.length,
    apis: apis.length,
    masterWords: masterAudit?.physicalCount,
    masterMissingMeaning: masterAudit?.issueCounts?.missingMeaning,
    masterDupId: masterAudit?.issueCounts?.dupId,
    gItems: gAudit?.items,
    gActiveWords: gAudit?.activeWords,
    meaningDangling: m6?.danglingFromMaster,
    apiMissingGuard: apiGuards.missingGuard,
    tmpArtifacts: tmpArtifacts.length,
    wordsParity: staticAssets.wordsParity?.sameHash
  } }, null, 2));
}

main();
